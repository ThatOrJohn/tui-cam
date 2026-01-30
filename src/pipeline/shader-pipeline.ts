import type { Frame } from "../camera/types.ts";
import type { EffectName } from "./effects.ts";
import { cpuMirror, cpuEdges, cpuInvert, cpuThreshold, cpuPosterize, cpuContrast } from "./effects.ts";


export interface ProcessedFrame {
  luminance: Float32Array;
  color?: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ShaderPipeline {
  initialize(): Promise<void>;
  processFrame(frame: Frame, effect: EffectName, mirror: boolean): ProcessedFrame;
  destroy(): void;
  readonly isGpu: boolean;
}

// --- CPU Fallback Pipeline ---

class CpuShaderPipeline implements ShaderPipeline {
  private outWidth: number;
  private outHeight: number;
  readonly isGpu = false;

  // Pre-allocated reusable buffers — zero GC pressure per frame
  private luminanceBuf: Float32Array;
  private mirrorBuf: Uint8ClampedArray | null = null;
  private effectBuf: Uint8ClampedArray | null = null;
  private edgeLumBuf: Float32Array | null = null;

  constructor(outWidth: number, outHeight: number) {
    this.outWidth = outWidth;
    this.outHeight = outHeight;
    this.luminanceBuf = new Float32Array(outWidth * outHeight);
  }

  private ensureBuffers(pixelCount: number): void {
    const byteLen = pixelCount * 4;
    if (!this.mirrorBuf || this.mirrorBuf.length !== byteLen) {
      this.mirrorBuf = new Uint8ClampedArray(byteLen);
      this.effectBuf = new Uint8ClampedArray(byteLen);
      this.edgeLumBuf = new Float32Array(pixelCount);
    }
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  processFrame(frame: Frame, effect: EffectName, mirror: boolean): ProcessedFrame {
    const pixelCount = frame.width * frame.height;
    this.ensureBuffers(pixelCount);

    let processed = frame;

    // Apply mirror first (writes into pre-allocated mirrorBuf)
    if (mirror) {
      processed = cpuMirror(processed, this.mirrorBuf!);
    }

    // Apply effect (writes into pre-allocated effectBuf)
    if (effect !== "none") {
      const effectBuf = this.effectBuf!;
      switch (effect) {
        case "edges":
          processed = cpuEdges(processed, effectBuf, this.edgeLumBuf!);
          break;
        case "invert":
          processed = cpuInvert(processed, effectBuf);
          break;
        case "threshold":
          processed = cpuThreshold(processed, 128, effectBuf);
          break;
        case "posterize":
          processed = cpuPosterize(processed, 4, effectBuf);
          break;
        case "contrast":
          processed = cpuContrast(processed, 1.5, effectBuf);
          break;
      }
    }

    // Extract luminance
    const { outWidth, outHeight } = this;
    const luminance = this.luminanceBuf;
    const { data, width: srcW, height: srcH } = processed;

    // Precomputed Rec.709 coefficients (divided by 255 to avoid per-pixel division)
    const rC = 0.299 / 255;
    const gC = 0.587 / 255;
    const bC = 0.114 / 255;

    if (srcW === outWidth && srcH === outHeight) {
      // Fast path: 1:1 scale — tight flat loop, no Math calls
      const len = outWidth * outHeight;
      for (let p = 0, i = 0; p < len; p++, i += 4) {
        luminance[p] = rC * data[i]! + gC * data[i + 1]! + bC * data[i + 2]!;
      }
    } else {
      // Downscale path
      const scaleX = srcW / outWidth;
      const scaleY = srcH / outHeight;
      const maxSrcX = srcW - 1;
      const maxSrcY = srcH - 1;

      for (let y = 0; y < outHeight; y++) {
        const srcY = Math.min((y * scaleY) | 0, maxSrcY);
        const rowOff = srcY * srcW;
        const dstRowOff = y * outWidth;
        for (let x = 0; x < outWidth; x++) {
          const srcX = Math.min((x * scaleX) | 0, maxSrcX);
          const i = (rowOff + srcX) << 2;
          luminance[dstRowOff + x] = rC * data[i]! + gC * data[i + 1]! + bC * data[i + 2]!;
        }
      }
    }

    // Pass through the RGBA data if available
    return { 
      luminance, 
      color: processed.data,
      width: outWidth, 
      height: outHeight 
    };
  }

  destroy(): void {
    // Nothing to clean up
  }
}

// --- GPU Pipeline using Three.js WebGPU ---

class GpuShaderPipeline implements ShaderPipeline {
  private outWidth: number;
  private outHeight: number;
  readonly isGpu = true;

  private gpuRenderer: any = null;
  private scene: any = null;
  private gpuCamera: any = null;
  private mesh: any = null;
  private renderTarget: any = null;
  private texture: any = null;
  private readBuffer: Uint8Array | null = null;
  private cpuFallback: CpuShaderPipeline;

  constructor(outWidth: number, outHeight: number) {
    this.outWidth = outWidth;
    this.outHeight = outHeight;
    this.cpuFallback = new CpuShaderPipeline(outWidth, outHeight);
  }

  async initialize(): Promise<void> {
    // Setup WebGPU globals
    const { setupGlobals, GPUCanvasContextMock } = await import("bun-webgpu");
    await setupGlobals();

    if (!(globalThis as any).navigator?.gpu) {
       throw new Error("navigator.gpu not found");
    }

    // Acquire adapter and device directly via bun-webgpu.
    // We pass these to Three.js to skip its internal requestAdapter() call,
    // which can block the event loop via native FFI.
    const adapter = await (globalThis as any).navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter available");
    const device = await adapter.requestDevice();
    if (!device) throw new Error("Failed to create WebGPU device");

    // Mock requestAnimationFrame for Three.js Animation module.
    // Use a no-op: register but never call back, since we render manually.
    if (typeof (globalThis as any).requestAnimationFrame === 'undefined') {
      (globalThis as any).requestAnimationFrame = () => 0;
      (globalThis as any).cancelAnimationFrame = () => {};
    }

    // Mock DOM for Three.js
    const { outWidth, outHeight } = this;
    if (typeof (globalThis as any).document === 'undefined') {
      const mockCanvas = {
        style: {},
        width: outWidth,
        height: outHeight,
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        getBoundingClientRect: () => ({
            width: outWidth,
            height: outHeight,
            top: 0,
            left: 0,
            bottom: outHeight,
            right: outWidth,
        }),
        getContext: (type: string) => {
          if (type === 'webgpu') return new GPUCanvasContextMock(mockCanvas, outWidth, outHeight);
          return null;
        },
      };
      (globalThis as any).document = {
        documentElement: { style: {} },
        createElement: () => mockCanvas,
        createElementNS: () => mockCanvas,
      };
    }
    if (typeof (globalThis as any).window === 'undefined') {
      (globalThis as any).window = globalThis;
    }

    // Import Three.js WebGPU modules
    // @ts-ignore - three/webgpu has no declaration file
    const THREE = await import("three/webgpu");

    // Create headless WebGPU renderer, passing pre-acquired device to skip
    // Three.js's internal requestAdapter() which blocks the event loop.
    this.gpuRenderer = new THREE.WebGPURenderer({ antialias: false, device });
    this.gpuRenderer.setSize(outWidth, outHeight);
    await this.gpuRenderer.init();

    // Orthographic camera for fullscreen quad
    this.gpuCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();

    // Fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicNodeMaterial();
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Render target for readback
    this.renderTarget = new THREE.RenderTarget(outWidth, outHeight);

    // DataTexture for camera input (will be updated each frame)
    this.texture = new THREE.DataTexture(
      new Uint8Array(outWidth * outHeight * 4),
      outWidth,
      outHeight,
    );
    this.texture.needsUpdate = true;

    // Read buffer for pixel readback
    this.readBuffer = new Uint8Array(outWidth * outHeight * 4);
  }

  processFrame(frame: Frame, effect: EffectName, mirror: boolean): ProcessedFrame {
    // For now, fall through to CPU path since GPU readback with Three.js WebGPU
    // in headless mode is complex. The GPU pipeline structure is set up for when
    // readRenderTargetPixelsAsync becomes reliable in bun-webgpu.
    return this.cpuFallback.processFrame(frame, effect, mirror);
  }

  destroy(): void {
    if (this.gpuRenderer) {
      this.gpuRenderer.dispose();
    }
  }
}

// --- Factory ---

/**
 * Probe GPU availability in a subprocess. bun-webgpu's native FFI can block
 * the event loop during requestAdapter(), making in-process timeouts ineffective.
 * A subprocess has its own event loop, so we can reliably kill it on timeout.
 */
async function probeGpuAvailability(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["bun", "-e",
      "const{setupGlobals}=await import('bun-webgpu');await setupGlobals();const a=await navigator.gpu.requestAdapter();process.exit(a?0:1)"
    ], { stdout: "pipe", stderr: "pipe" });

    const exitCode = await Promise.race([
      proc.exited,
      new Promise<number>((resolve) =>
        setTimeout(() => { proc.kill(); resolve(124); }, 3000)
      ),
    ]);

    if (exitCode === 124) {
      console.error("[GPU] Probe timed out after 3s");
      return false;
    }
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error("[GPU] Probe failed:", stderr.slice(0, 200));
      return false;
    }
    console.log("[GPU] Probe succeeded");
    return true;
  } catch (e) {
    console.error("[GPU] Probe exception:", e);
    return false;
  }
}

export async function createShaderPipeline(
  outWidth: number,
  outHeight: number,
  gpuEnabled: boolean,
): Promise<ShaderPipeline> {
  if (gpuEnabled) {
    try {
      // Probe GPU in a subprocess first — if the native FFI blocks the event loop
      // (common when GPU driver is unresponsive), only the subprocess hangs,
      // and we can kill it after 3 seconds.
      //
      // NOTE: On some M1 Macs, bun-webgpu's requestAdapter() causes a bus error
      // crash in the native FFI layer. This is a known issue with Dawn WebGPU
      // FFI bindings. See: https://github.com/oven-sh/bun/issues/19322
      const gpuAvailable = await probeGpuAvailability();
      if (!gpuAvailable) {
        console.log("[GPU] Not available, falling back to CPU");
        throw new Error("GPU not available (probe timed out or no adapter found)");
      }

      const pipeline = new GpuShaderPipeline(outWidth, outHeight);

      // The probe confirmed GPU works, so requestAdapter in the main process
      // should complete quickly. Keep a timeout as a safety net.
      const initPromise = pipeline.initialize();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("GPU initialization timed out")), 5000)
      );

      await Promise.race([initPromise, timeoutPromise]);
      console.log("[GPU] Initialized successfully");
      return pipeline;
    } catch (e) {
      console.log("[GPU] Initialization failed, using CPU pipeline");
      // Silent fallback to CPU
    }
  }

  const pipeline = new CpuShaderPipeline(outWidth, outHeight);
  await pipeline.initialize();
  return pipeline;
}

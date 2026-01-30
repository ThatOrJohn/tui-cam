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
    const { setupGlobals } = await import("bun-webgpu");
    await setupGlobals();

    if (!(globalThis as any).navigator?.gpu) {
       throw new Error("navigator.gpu not found");
    }

    // Mock DOM for Three.js
    if (typeof (globalThis as any).document === 'undefined') {
      const mockElement = {
        style: {},
        width: this.outWidth,
        height: this.outHeight,
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        getBoundingClientRect: () => ({
            width: this.outWidth,
            height: this.outHeight,
            top: 0,
            left: 0,
            bottom: this.outHeight,
            right: this.outWidth
        }),
        getContext: () => null,
      };
      (globalThis as any).document = {
        documentElement: { style: {} },
        createElement: () => mockElement,
        createElementNS: () => mockElement,
      };
    }
    if (typeof (globalThis as any).window === 'undefined') {
      (globalThis as any).window = globalThis;
    }

    // Import Three.js WebGPU modules
    // @ts-ignore - three/webgpu has no declaration file
    const THREE = await import("three/webgpu");

    const { outWidth, outHeight } = this;

    // Create headless WebGPU renderer
    this.gpuRenderer = new THREE.WebGPURenderer({ antialias: false });
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

export async function createShaderPipeline(
  outWidth: number,
  outHeight: number,
  gpuEnabled: boolean,
): Promise<ShaderPipeline> {
  if (gpuEnabled) {
    try {
      const pipeline = new GpuShaderPipeline(outWidth, outHeight);
      
      // Add a timeout to prevent absolute freeze if WebGPU hangs
      const initPromise = pipeline.initialize();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("GPU initialization timed out")), 2000)
      );

      await Promise.race([initPromise, timeoutPromise]);
      return pipeline;
    } catch (e) {
      // Silent fallback to CPU
    }
  }

  const pipeline = new CpuShaderPipeline(outWidth, outHeight);
  await pipeline.initialize();
  return pipeline;
}

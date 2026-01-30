import type { Frame } from "../camera/types.ts";
import type { EffectName } from "./effects.ts";
import { cpuMirror, cpuEdges, cpuInvert, cpuThreshold, cpuPosterize, cpuContrast } from "./effects.ts";

export interface ProcessedFrame {
  luminance: Float32Array;
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

    // Downscale to output resolution if needed
    const { outWidth, outHeight } = this;
    const luminance = this.luminanceBuf;

    const { data, width: srcW, height: srcH } = processed;
    const scaleX = srcW / outWidth;
    const scaleY = srcH / outHeight;

    for (let y = 0; y < outHeight; y++) {
      const srcY = Math.min(Math.floor(y * scaleY), srcH - 1);
      for (let x = 0; x < outWidth; x++) {
        const srcX = Math.min(Math.floor(x * scaleX), srcW - 1);
        const i = (srcY * srcW + srcX) * 4;
        // Rec.709 luminance
        luminance[y * outWidth + x] = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255;
      }
    }

    return { luminance, width: outWidth, height: outHeight };
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
      await pipeline.initialize();
      return pipeline;
    } catch (e) {
      console.error("GPU pipeline init failed, falling back to CPU:", (e as Error).message);
    }
  }

  const pipeline = new CpuShaderPipeline(outWidth, outHeight);
  await pipeline.initialize();
  return pipeline;
}

import type { Frame, CameraSource } from "./types.ts";

export class FfmpegCamera implements CameraSource {
  private width: number;
  private height: number;
  private fps: number;
  private cameraIndex: string;
  private running = false;
  private frame: Frame | null = null;
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private readerDone = false;

  // Double-buffered frame data to avoid per-frame allocation
  private frameBufA: Uint8ClampedArray;
  private frameBufB: Uint8ClampedArray;
  private useA = true;

  constructor(width: number, height: number, fps: number, cameraIndex = "0") {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.cameraIndex = cameraIndex;
    const frameSize = width * height * 4;
    this.frameBufA = new Uint8ClampedArray(frameSize);
    this.frameBufB = new Uint8ClampedArray(frameSize);
  }

  async start(): Promise<void> {
    const { width, height, fps, cameraIndex } = this;

    // Scale to exact output dimensions via ffmpeg's scale filter.
    // This lets the webcam capture at its native resolution and avfoundation
    // won't reject an unsupported video_size.
    const args = [
      "ffmpeg",
      "-f", "avfoundation",
      "-framerate", String(fps),
      "-i", cameraIndex,
      "-vf", `scale=${width}:${height}`,
      "-pix_fmt", "rgba",
      "-f", "rawvideo",
      "-v", "error",
      "pipe:1",
    ];

    this.proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    this.running = true;
    this.readerDone = false;

    this.readFrames();
    this.readStderr();
  }

  private async readFrames(): Promise<void> {
    const proc = this.proc;
    if (!proc?.stdout || typeof proc.stdout === "number") return;

    const frameSize = this.width * this.height * 4;
    let buffer = new Uint8Array(frameSize * 2);
    let offset = 0;

    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();

    try {
      while (this.running) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        // Grow buffer if needed
        if (offset + value.length > buffer.length) {
          const newBuf = new Uint8Array(Math.max(buffer.length * 2, offset + value.length));
          newBuf.set(buffer.subarray(0, offset));
          buffer = newBuf;
        }

        buffer.set(value, offset);
        offset += value.length;

        // Extract complete frames
        while (offset >= frameSize) {
          // Swap double buffer: write into the inactive buffer
          const frameData = this.useA ? this.frameBufA : this.frameBufB;
          this.useA = !this.useA;
          frameData.set(buffer.subarray(0, frameSize));
          this.frame = {
            width: this.width,
            height: this.height,
            data: frameData,
            timestamp: performance.now(),
          };

          // Shift remaining data
          buffer.copyWithin(0, frameSize, offset);
          offset -= frameSize;
        }
      }
    } catch {
      // Stream closed
    } finally {
      this.readerDone = true;
    }
  }

  private async readStderr(): Promise<void> {
    const proc = this.proc;
    if (!proc?.stderr || typeof proc.stderr === "number") return;

    const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();

    try {
      while (this.running) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const text = decoder.decode(value);
          if (text.trim()) {
            // Log ffmpeg errors but don't crash
            console.error("[ffmpeg]", text.trim());
          }
        }
      }
    } catch {
      // Stream closed
    }
  }

  stop(): void {
    this.running = false;
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  getFrame(): Frame | null {
    return this.frame;
  }

  isRunning(): boolean {
    return this.running && !this.readerDone;
  }
}

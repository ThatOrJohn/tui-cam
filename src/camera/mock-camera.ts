import type { Frame, CameraSource } from "./types.ts";

export type PatternName = "gradient" | "checkerboard" | "sinewave" | "noise" | "bars" | "circle";

const PATTERNS: PatternName[] = ["gradient", "checkerboard", "sinewave", "noise", "bars", "circle"];

export function getNextPattern(current: PatternName): PatternName {
  const idx = PATTERNS.indexOf(current);
  return PATTERNS[(idx + 1) % PATTERNS.length]!;
}

export class MockCamera implements CameraSource {
  private width: number;
  private height: number;
  private fps: number;
  private running = false;
  private frame: Frame | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private t = 0;
  pattern: PatternName;

  constructor(width: number, height: number, fps: number, pattern: PatternName = "gradient") {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.pattern = pattern;
  }

  async start(): Promise<void> {
    this.running = true;
    this.t = 0;
    this.timer = setInterval(() => {
      this.generateFrame();
    }, 1000 / this.fps);
    this.generateFrame();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getFrame(): Frame | null {
    return this.frame;
  }

  isRunning(): boolean {
    return this.running;
  }

  private generateFrame(): void {
    const { width, height } = this;
    const data = new Uint8ClampedArray(width * height * 4);
    const t = this.t++;

    switch (this.pattern) {
      case "gradient":
        this.drawGradient(data, width, height, t);
        break;
      case "checkerboard":
        this.drawCheckerboard(data, width, height, t);
        break;
      case "sinewave":
        this.drawSinewave(data, width, height, t);
        break;
      case "noise":
        this.drawNoise(data, width, height);
        break;
      case "bars":
        this.drawBars(data, width, height, t);
        break;
      case "circle":
        this.drawCircle(data, width, height, t);
        break;
    }

    this.frame = { width, height, data, timestamp: performance.now() };
  }

  private drawGradient(data: Uint8ClampedArray, w: number, h: number, t: number): void {
    const speed = t * 0.02;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const nx = x / w;
        const ny = y / h;
        const v = (Math.sin(nx * Math.PI + speed) + Math.sin(ny * Math.PI + speed * 0.7)) * 0.5;
        const bright = Math.floor(((v + 1) / 2) * 255);
        data[i] = bright;
        data[i + 1] = bright;
        data[i + 2] = bright;
        data[i + 3] = 255;
      }
    }
  }

  private drawCheckerboard(data: Uint8ClampedArray, w: number, h: number, t: number): void {
    const size = 4 + Math.floor(Math.sin(t * 0.05) * 2);
    const offset = Math.floor(t * 0.3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const cx = Math.floor((x + offset) / size);
        const cy = Math.floor((y + offset) / size);
        const bright = (cx + cy) % 2 === 0 ? 240 : 15;
        data[i] = bright;
        data[i + 1] = bright;
        data[i + 2] = bright;
        data[i + 3] = 255;
      }
    }
  }

  private drawSinewave(data: Uint8ClampedArray, w: number, h: number, t: number): void {
    const speed = t * 0.08;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const nx = x / w;
        const ny = y / h;
        const v1 = Math.sin(nx * 6 + speed);
        const v2 = Math.sin(ny * 6 + speed * 1.3);
        const v3 = Math.sin((nx + ny) * 4 + speed * 0.7);
        const bright = Math.floor(((v1 + v2 + v3) / 3 + 1) / 2 * 255);
        data[i] = bright;
        data[i + 1] = bright;
        data[i + 2] = bright;
        data[i + 3] = 255;
      }
    }
  }

  private drawNoise(data: Uint8ClampedArray, w: number, h: number): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const bright = Math.floor(Math.random() * 256);
        data[i] = bright;
        data[i + 1] = bright;
        data[i + 2] = bright;
        data[i + 3] = 255;
      }
    }
  }

  private drawBars(data: Uint8ClampedArray, w: number, h: number, t: number): void {
    const barCount = 8;
    const barWidth = Math.floor(w / barCount);
    const offset = Math.floor(t * 0.5) % w;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const bx = (x + offset) % w;
        const barIndex = Math.floor(bx / barWidth);
        const bright = Math.floor((barIndex / (barCount - 1)) * 255);
        data[i] = bright;
        data[i + 1] = bright;
        data[i + 2] = bright;
        data[i + 3] = 255;
      }
    }
  }

  private drawCircle(data: Uint8ClampedArray, w: number, h: number, t: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2;
    const pulse = Math.sin(t * 0.05) * 0.3 + 0.7;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxR;
        const v = Math.max(0, 1 - dist / pulse);
        const bright = Math.floor(v * 255);
        data[i] = bright;
        data[i + 1] = bright;
        data[i + 2] = bright;
        data[i + 3] = 255;
      }
    }
  }
}

import type { Frame } from "../camera/types.ts";

export type EffectName = "none" | "edges" | "posterize" | "contrast" | "invert" | "threshold";

const EFFECTS: EffectName[] = ["none", "edges", "posterize", "contrast", "invert", "threshold"];

export function getEffectNames(): EffectName[] {
  return [...EFFECTS];
}

export function getNextEffect(current: EffectName): EffectName {
  const idx = EFFECTS.indexOf(current);
  return EFFECTS[(idx + 1) % EFFECTS.length]!;
}

// --- CPU Effects ---

export function cpuNone(frame: Frame): Frame {
  return frame;
}

export function cpuInvert(frame: Frame, out?: Uint8ClampedArray): Frame {
  const { width, height, data } = frame;
  const buf = out ?? new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    buf[i] = 255 - data[i]!;
    buf[i + 1] = 255 - data[i + 1]!;
    buf[i + 2] = 255 - data[i + 2]!;
    buf[i + 3] = data[i + 3]!;
  }
  return { width, height, data: buf, timestamp: frame.timestamp };
}

export function cpuThreshold(frame: Frame, cutoff = 128, out?: Uint8ClampedArray): Frame {
  const { width, height, data } = frame;
  const buf = out ?? new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    const v = lum >= cutoff ? 255 : 0;
    buf[i] = v;
    buf[i + 1] = v;
    buf[i + 2] = v;
    buf[i + 3] = data[i + 3]!;
  }
  return { width, height, data: buf, timestamp: frame.timestamp };
}

export function cpuPosterize(frame: Frame, levels = 4, out?: Uint8ClampedArray): Frame {
  const { width, height, data } = frame;
  const buf = out ?? new Uint8ClampedArray(data.length);
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    buf[i] = Math.round(Math.round(data[i]! / step) * step);
    buf[i + 1] = Math.round(Math.round(data[i + 1]! / step) * step);
    buf[i + 2] = Math.round(Math.round(data[i + 2]! / step) * step);
    buf[i + 3] = data[i + 3]!;
  }
  return { width, height, data: buf, timestamp: frame.timestamp };
}

export function cpuContrast(frame: Frame, amount = 1.5, out?: Uint8ClampedArray): Frame {
  const { width, height, data } = frame;
  const buf = out ?? new Uint8ClampedArray(data.length);
  // Precompute: ((v/255 - 0.5) * amount + 0.5) * 255 = v * amount + (0.5 - 0.5*amount) * 255
  const offset = (0.5 - 0.5 * amount) * 255;
  for (let i = 0; i < data.length; i += 4) {
    buf[i] = Math.min(255, Math.max(0, data[i] * amount + offset));
    buf[i + 1] = Math.min(255, Math.max(0, data[i + 1] * amount + offset));
    buf[i + 2] = Math.min(255, Math.max(0, data[i + 2] * amount + offset));
    buf[i + 3] = data[i + 3]!;
  }
  return { width, height, data: buf, timestamp: frame.timestamp };
}

export function cpuEdges(frame: Frame, out?: Uint8ClampedArray, lumScratch?: Float32Array): Frame {
  const { width, height, data } = frame;
  const buf = out ?? new Uint8ClampedArray(data.length);
  buf.fill(0);

  // Convert to luminance first
  const lum = lumScratch ?? new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    lum[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  }

  // Sobel 3x3
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = lum[(y - 1) * width + (x - 1)]!;
      const tc = lum[(y - 1) * width + x]!;
      const tr = lum[(y - 1) * width + (x + 1)]!;
      const ml = lum[y * width + (x - 1)]!;
      const mr = lum[y * width + (x + 1)]!;
      const bl = lum[(y + 1) * width + (x - 1)]!;
      const bc = lum[(y + 1) * width + x]!;
      const br = lum[(y + 1) * width + (x + 1)]!;

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));

      const i = (y * width + x) * 4;
      buf[i] = mag;
      buf[i + 1] = mag;
      buf[i + 2] = mag;
      buf[i + 3] = 255;
    }
  }

  return { width, height, data: buf, timestamp: frame.timestamp };
}

export function cpuMirror(frame: Frame, out?: Uint8ClampedArray): Frame {
  const { width, height, data } = frame;
  const buf = out ?? new Uint8ClampedArray(data.length);
  // Use 32-bit views for 4x fewer copy operations (one u32 = one RGBA pixel)
  const src32 = new Uint32Array(data.buffer, data.byteOffset, width * height);
  const dst32 = new Uint32Array(buf.buffer, buf.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width; x++) {
      dst32[rowStart + x] = src32[rowStart + (width - 1 - x)]!;
    }
  }
  return { width, height, data: buf, timestamp: frame.timestamp };
}

export const CPU_EFFECTS: Record<EffectName, (frame: Frame) => Frame> = {
  none: cpuNone,
  edges: cpuEdges,
  posterize: cpuPosterize,
  contrast: cpuContrast,
  invert: cpuInvert,
  threshold: cpuThreshold,
};

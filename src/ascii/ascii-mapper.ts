import type { ProcessedFrame } from "../pipeline/shader-pipeline.ts";
import { getRamp, getNextRamp, type RampName } from "./ramps.ts";

export class AsciiMapper {
  private rampName: RampName;
  private ramp: string;

  constructor(rampName: RampName = "standard") {
    this.rampName = rampName;
    this.ramp = getRamp(rampName);
  }

  setRamp(name: RampName): void {
    this.rampName = name;
    this.ramp = getRamp(name);
  }

  cycleRamp(): RampName {
    const next = getNextRamp(this.rampName);
    this.setRamp(next);
    return next;
  }

  getRampName(): RampName {
    return this.rampName;
  }

  /** Returns the luminance Float32Array directly for drawGrayscaleBuffer */
  mapToIntensities(processed: ProcessedFrame): Float32Array {
    return processed.luminance;
  }

  /** Maps to character strings for debug/text output */
  mapToStrings(processed: ProcessedFrame): string[] {
    const { luminance, width, height } = processed;
    const lines: string[] = [];
    const ramp = this.ramp;
    const maxIdx = ramp.length - 1;

    for (let y = 0; y < height; y++) {
      let line = "";
      for (let x = 0; x < width; x++) {
        const v = luminance[y * width + x]!;
        const idx = Math.min(maxIdx, Math.max(0, Math.floor(v * maxIdx)));
        line += ramp[idx];
      }
      lines.push(line);
    }

    return lines;
  }
}

import { Renderable, type RenderableOptions } from "@opentui/core";
import { RGBA } from "@opentui/core";
import type { OptimizedBuffer } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import { ptr } from "bun:ffi";
import type { ProcessedFrame } from "../pipeline/shader-pipeline.ts";

export interface AsciiViewportOptions extends RenderableOptions {
  fg?: RGBA;
  bg?: RGBA;
  supersample?: boolean;
  color?: boolean;
}

export class AsciiViewport extends Renderable {
  private currentFrame: ProcessedFrame | null = null;
  private fg: RGBA;
  private bg: RGBA;
  private _supersample = false;
  private color = false;
  private _ramp = " .:-=+*#%@"; // Default ramp

  constructor(ctx: RenderContext, options: AsciiViewportOptions = {}) {
    super(ctx, { ...options, live: true });
    this.fg = options.fg ?? RGBA.fromHex("#ffffff");
    this.bg = options.bg ?? RGBA.fromHex("#000000");
    this._supersample = options.supersample ?? false;
    this.color = options.color ?? false;
  }

  set ramp(value: string) {
    this._ramp = value;
  }

  get supersample(): boolean {
    return this._supersample;
  }

  set supersample(value: boolean) {
    this._supersample = value;
  }

  updateFrame(frame: ProcessedFrame): void {
    this.currentFrame = frame;
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const frame = this.currentFrame;
    if (!frame) return;

    const { luminance, color, width: srcWidth, height: srcHeight } = frame;

    if (this.color && color) {
      const { char, fg } = buffer.buffers;
      const ramp = this._ramp;
      const maxRampIdx = ramp.length - 1;
      
      const targetWidth = Math.min(this.width, srcWidth);
      const targetHeight = Math.min(this.height, srcHeight);

      for (let y = 0; y < targetHeight; y++) {
        const rowOff = y * srcWidth;
        const destRowOff = (this._y + y) * buffer.width + this._x;
        
        for (let x = 0; x < targetWidth; x++) {
          const idx = rowOff + x;
          const destIdx = destRowOff + x;
          
          if (destIdx >= char.length) continue;

          // Char mapping
          const l = luminance[idx]!;
          const rampIdx = Math.floor(l * maxRampIdx);
          char[destIdx] = ramp.charCodeAt(Math.min(maxRampIdx, Math.max(0, rampIdx)));

          // Color mapping (RGBA floats)
          const cIdx = idx * 4;
          const fgOff = destIdx * 4;
          fg[fgOff] = color[cIdx]! / 255;     // R
          fg[fgOff + 1] = color[cIdx + 1]! / 255; // G
          fg[fgOff + 2] = color[cIdx + 2]! / 255; // B
          fg[fgOff + 3] = 1.0;               // A
        }
      }
      return;
    }

    if (this._supersample) {
      buffer.drawGrayscaleBufferSupersampled(
        this._x,
        this._y,
        luminance,
        srcWidth,
        srcHeight,
        this.fg,
        this.bg,
      );
    } else {
      buffer.drawGrayscaleBuffer(
        this._x,
        this._y,
        luminance,
        srcWidth,
        srcHeight,
        this.fg,
        this.bg,
      );
    }
  }
}

import { Renderable, type RenderableOptions } from "@opentui/core";
import { RGBA } from "@opentui/core";
import type { OptimizedBuffer } from "@opentui/core";
import type { RenderContext } from "@opentui/core";
import type { ProcessedFrame } from "../pipeline/shader-pipeline.ts";

export interface AsciiViewportOptions extends RenderableOptions {
  fg?: RGBA;
  bg?: RGBA;
  supersample?: boolean;
}

export class AsciiViewport extends Renderable {
  private currentFrame: ProcessedFrame | null = null;
  private fg: RGBA;
  private bg: RGBA;
  private _supersample = false;

  constructor(ctx: RenderContext, options: AsciiViewportOptions = {}) {
    super(ctx, { ...options, live: true });
    this.fg = options.fg ?? RGBA.fromHex("#ffffff");
    this.bg = options.bg ?? RGBA.fromHex("#000000");
    this._supersample = options.supersample ?? false;
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

    const { luminance, width: srcWidth, height: srcHeight } = frame;

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

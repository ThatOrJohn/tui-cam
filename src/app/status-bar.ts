import { Renderable, type RenderableOptions } from "@opentui/core";
import { RGBA } from "@opentui/core";
import type { OptimizedBuffer } from "@opentui/core";
import type { RenderContext } from "@opentui/core";

export interface StatusInfo {
  fps: number;
  targetFps: number;
  width: number;
  height: number;
  source: string;
  effect: string;
  ramp: string;
  isGpu: boolean;
  frameTimeMs: number;
  paused: boolean;
  mirror: boolean;
  supersample: boolean;
}

export class StatusBar extends Renderable {
  private info: StatusInfo;
  private bgColor: RGBA;
  private fgColor: RGBA;
  private accentColor: RGBA;

  constructor(ctx: RenderContext, options: RenderableOptions = {}) {
    super(ctx, { ...options, live: true });
    this.bgColor = RGBA.fromHex("#1a1a2e");
    this.fgColor = RGBA.fromHex("#aaaaaa");
    this.accentColor = RGBA.fromHex("#00ff88");
    this.info = {
      fps: 0,
      targetFps: 24,
      width: 0,
      height: 0,
      source: "mock",
      effect: "none",
      ramp: "standard",
      isGpu: false,
      frameTimeMs: 0,
      paused: false,
      mirror: false,
      supersample: false,
    };
  }

  update(info: Partial<StatusInfo>): void {
    Object.assign(this.info, info);
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const { info, bgColor } = this;
    const w = this._widthValue || this.width;

    // Fill background
    buffer.fillRect(this._x, this._y, w, 1, bgColor);

    // Build status text
    const parts: string[] = [];

    if (info.paused) {
      parts.push("PAUSED");
    } else {
      parts.push(`FPS:${info.fps}/${info.targetFps}`);
    }

    parts.push(`${info.width}x${info.height}`);
    parts.push(info.source);
    parts.push(info.effect);
    parts.push(info.ramp);
    parts.push(info.isGpu ? "GPU" : "CPU");

    if (info.mirror) parts.push("MIR");
    if (info.supersample) parts.push("SS");

    parts.push(`${info.frameTimeMs.toFixed(1)}ms`);

    const text = ` ${parts.join(" | ")} `;

    // Draw text
    buffer.drawText(text, this._x, this._y, this.fgColor, bgColor);

    // Draw keybind hint on the right
    const hint = " [h]elp [q]uit ";
    const hintX = this._x + w - hint.length;
    if (hintX > this._x + text.length) {
      buffer.drawText(hint, hintX, this._y, this.accentColor, bgColor);
    }
  }
}

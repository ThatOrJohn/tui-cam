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
  debugInfo?: string;
}

export class StatusBar extends Renderable {
  private info: StatusInfo;
  private bgColor: RGBA;
  private fgColor: RGBA;
  private accentColor: RGBA;
  private cachedText = "";
  private dirty = true;

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
    this.dirty = true;
  }

  private buildText(): string {
    const info = this.info;
    const parts: string[] = [];

    parts.push("TUI-CAM");
    parts.push(info.isGpu ? "[GPU]" : "[CPU]");
    parts.push(info.paused ? "⏸" : "▶");
    parts.push(`${info.width}x${info.height}`);
    parts.push(`${info.fps}fps`);
    parts.push(info.effect);
    parts.push(info.ramp);

    if (info.debugInfo) {
      parts.push(`{${info.debugInfo}}`);
    }

    return " " + parts.join(" | ") + " ";
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const { bgColor } = this;
    const w = this._widthValue || this.width;

    // Fill background
    buffer.fillRect(this._x, this._y, w, 1, bgColor);

    // Rebuild text only when status changed
    if (this.dirty) {
      this.cachedText = this.buildText();
      this.dirty = false;
    }

    // Draw text
    buffer.drawText(this.cachedText, this._x, this._y, this.fgColor, bgColor);

    // Draw keybind hint on the right
    const hint = " [h]elp [q]uit ";
    const hintX = this._x + w - hint.length;
    if (hintX > this._x + this.cachedText.length) {
      buffer.drawText(hint, hintX, this._y, this.accentColor, bgColor);
    }
  }
}

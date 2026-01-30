import {
  createCliRenderer,
  type CliRenderer,
  BoxRenderable,
  RGBA,
} from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { AsciiViewport } from "./viewport.ts";
import { StatusBar, type StatusInfo } from "./status-bar.ts";
import { getAction, KEY_BINDINGS, type Action } from "./controls.ts";
import type { ProcessedFrame } from "../pipeline/shader-pipeline.ts";

export interface TuiCamAppOptions {
  targetFps: number;
  onAction: (action: Action) => void;
  color?: boolean;
}

export class TuiCamApp {
  renderer!: CliRenderer;
  viewport!: AsciiViewport;
  statusBar!: StatusBar;
  private helpVisible = false;
  private helpOverlay: BoxRenderable | null = null;
  private onAction: (action: Action) => void;
  private targetFps: number;
  private color: boolean;

  constructor(options: TuiCamAppOptions) {
    this.onAction = options.onAction;
    this.targetFps = options.targetFps;
    this.color = options.color ?? false;
  }

  async initialize(): Promise<void> {
    this.renderer = await createCliRenderer({
      targetFps: this.targetFps,
      exitOnCtrlC: true,
      useMouse: false,
    });

    const ctx = this.renderer.root.ctx;

    // Root container - column layout
    const root = new BoxRenderable(ctx, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: RGBA.fromHex("#000000"),
    });

    // Viewport takes all space except status bar
    this.viewport = new AsciiViewport(ctx, {
      flexGrow: 1,
      color: this.color,
    });

    // Status bar at bottom, 1 row tall
    this.statusBar = new StatusBar(ctx, {
      height: 1,
    });

    root.add(this.viewport);
    root.add(this.statusBar);
    this.renderer.root.add(root);

    // Wire up keyboard input
    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      this.handleKey(key);
    });
  }

  private handleKey(key: KeyEvent): void {
    // Help overlay toggle
    if (this.helpVisible && key.name !== "h") {
      this.toggleHelp();
      return;
    }

    const action = getAction(key.name);
    if (action) {
      if (action === "toggle-help") {
        this.toggleHelp();
      } else {
        this.onAction(action);
      }
    }
  }

  private toggleHelp(): void {
    this.helpVisible = !this.helpVisible;

    if (this.helpVisible && !this.helpOverlay) {
      const ctx = this.renderer.root.ctx;
      this.helpOverlay = new BoxRenderable(ctx, {
        position: "absolute",
        top: 2,
        left: 2,
        width: 40,
        height: KEY_BINDINGS.length + 4,
        backgroundColor: RGBA.fromHex("#1a1a2e"),
        border: true,
        borderColor: RGBA.fromHex("#00ff88"),
        borderStyle: "rounded",
        title: "Controls",
        titleAlignment: "center",
        zIndex: 100,
      });
      this.helpOverlay.renderAfter = (buffer) => {
        const x = this.helpOverlay!.x + 2;
        let y = this.helpOverlay!.y + 1;
        const fg = RGBA.fromHex("#ffffff");
        const accent = RGBA.fromHex("#00ff88");
        const bg = RGBA.fromHex("#1a1a2e");

        for (const binding of KEY_BINDINGS) {
          const keyLabel = binding.key === "space" ? "SPACE" : binding.key.toUpperCase();
          buffer.drawText(`  ${keyLabel.padEnd(8)} ${binding.label}`, x, y, fg, bg);
          y++;
        }
      };
      this.renderer.root.add(this.helpOverlay);
    }

    if (this.helpOverlay) {
      this.helpOverlay.visible = this.helpVisible;
      this.renderer.requestRender();
    }
  }

  updateFrame(frame: ProcessedFrame): void {
    this.viewport.updateFrame(frame);
  }

  updateStatus(info: Partial<StatusInfo>): void {
    this.statusBar.update(info);
  }

  setRamp(ramp: string): void {
    this.viewport.ramp = ramp;
  }

  getViewportSize(): { width: number; height: number } {
    return {
      width: this.viewport.width,
      height: this.viewport.height,
    };
  }

  start(): void {
    this.renderer.start();
  }

  destroy(): void {
    this.renderer.destroy();
  }
}

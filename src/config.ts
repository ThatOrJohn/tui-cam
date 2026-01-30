import type { RampName } from "./ascii/ramps.ts";

export interface AppConfig {
  mock: boolean;
  mockPattern: string;
  fps: number;
  width: number;
  height: number;
  effect: string;
  noGpu: boolean;
  mirror: boolean;
  color: boolean;
  ramp: RampName;
  cameraIndex: string;
}

export function parseConfig(): AppConfig {
  const args = Bun.argv.slice(2);

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return undefined;
    return args[idx + 1];
  }

  function hasFlag(name: string): boolean {
    return args.includes(`--${name}`);
  }

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // Terminal chars are ~2x tall as wide, and drawGrayscaleBuffer uses half-blocks
  // so effective pixel height = rows * 2
  const termWidth = cols;
  const termHeight = (rows - 1) * 2; // -1 for status bar

  const resolution = getArg("resolution");
  let width = termWidth;
  let height = termHeight;
  if (resolution) {
    const parts = resolution.split("x");
    if (parts.length === 2) {
      width = parseInt(parts[0]!, 10) || termWidth;
      height = parseInt(parts[1]!, 10) || termHeight;
    }
  }

  return {
    mock: hasFlag("mock"),
    mockPattern: getArg("pattern") || "gradient",
    fps: parseInt(getArg("fps") || "24", 10),
    width,
    height,
    effect: getArg("effect") || "none",
    noGpu: hasFlag("no-gpu"),
    mirror: hasFlag("mirror"),
    color: hasFlag("color"),
    ramp: (getArg("ramp") as RampName) || "standard",
    cameraIndex: getArg("camera") || "0",
  };
}

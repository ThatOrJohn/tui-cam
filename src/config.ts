import type { RampName } from "./ascii/ramps.ts";

export interface AppConfig {
  mock: boolean;
  mockPattern: string;
  fps: number;
  width?: number;
  height?: number;
  effect: string;
  gpu: boolean;
  mirror: boolean;
  color: boolean;
  ramp: RampName;
  cameraIndex: string;
  debug: boolean;
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

  const resolution = getArg("resolution");
  let width: number | undefined;
  let height: number | undefined;
  if (resolution) {
    const parts = resolution.split("x");
    if (parts.length === 2) {
      width = parseInt(parts[0]!, 10);
      height = parseInt(parts[1]!, 10);
    }
  }

  return {
    mock: hasFlag("mock"),
    mockPattern: getArg("pattern") || "gradient",
    fps: parseInt(getArg("fps") || "24", 10),
    width,
    height,
    effect: getArg("effect") || "none",
    gpu: hasFlag("gpu"),
    mirror: hasFlag("mirror"),
    color: hasFlag("color"),
    ramp: (getArg("ramp") as RampName) || "standard",
    cameraIndex: getArg("camera") || "0",
    debug: hasFlag("debug"),
  };
}

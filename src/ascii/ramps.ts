export const RAMPS = {
  standard: " .:-=+*#%@",
  blocks: " ░▒▓█",
  simple: " .oO@",
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  dots: " ⠁⠃⠇⠏⠟⠿⡿⣿",
} as const;

export type RampName = keyof typeof RAMPS;

const rampNames = Object.keys(RAMPS) as RampName[];

export function getRamp(name: RampName): string {
  return RAMPS[name];
}

export function getNextRamp(current: RampName): RampName {
  const idx = rampNames.indexOf(current);
  return rampNames[(idx + 1) % rampNames.length]!;
}

export function getRampNames(): RampName[] {
  return [...rampNames];
}

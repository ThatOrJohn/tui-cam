export type Action =
  | "toggle-pause"
  | "cycle-effect"
  | "cycle-ramp"
  | "toggle-mirror"
  | "toggle-supersample"
  | "toggle-help"
  | "quit"
  | "cycle-pattern";

export interface KeyBinding {
  key: string;
  action: Action;
  label: string;
}

export const KEY_BINDINGS: KeyBinding[] = [
  { key: "space", action: "toggle-pause", label: "Pause/Resume" },
  { key: "e", action: "cycle-effect", label: "Cycle effect" },
  { key: "r", action: "cycle-ramp", label: "Cycle ramp" },
  { key: "m", action: "toggle-mirror", label: "Toggle mirror" },
  { key: "s", action: "toggle-supersample", label: "Toggle supersample" },
  { key: "p", action: "cycle-pattern", label: "Cycle pattern (mock)" },
  { key: "h", action: "toggle-help", label: "Toggle help" },
  { key: "q", action: "quit", label: "Quit" },
];

const keyToAction = new Map<string, Action>();
for (const binding of KEY_BINDINGS) {
  keyToAction.set(binding.key, binding.action);
}

export function getAction(keyName: string): Action | undefined {
  return keyToAction.get(keyName);
}

export interface WindowArea { x: number; y: number; width: number; height: number }
export interface WindowLayout { xRatio: number; yRatio: number; widthRatio: number; heightRatio: number }
export interface SmartPlacementState { enabled: boolean; busy: boolean; error: string; reason: string; shortcut: string; shortcutRegistered: boolean }
export const AUTO_DETECT_SHORTCUT = typeof process !== 'undefined' && process.platform === 'darwin' ? 'Command+Option+Shift+Space' : 'Control+Alt+Shift+Space';

export function windowLayoutBounds(area: WindowArea, input: unknown): WindowArea {
  const value = input as WindowLayout | null;
  if (!value || !['xRatio', 'yRatio', 'widthRatio', 'heightRatio'].every(key => {
    const number = value[key as keyof WindowLayout];
    return Number.isFinite(number) && number >= 0 && number <= 1;
  }) || value.xRatio + value.widthRatio > 1.001 || value.yRatio + value.heightRatio > 1.001) throw new Error('Choose a window rectangle within the screen.');
  const width = Math.min(area.width, Math.max(213, Math.round(area.width * value.widthRatio)));
  const height = Math.min(area.height, Math.max(150, Math.round(area.height * value.heightRatio)));
  return { x: Math.round(area.x + Math.min(value.xRatio * area.width, area.width - width)), y: Math.round(area.y + Math.min(value.yRatio * area.height, area.height - height)), width, height };
}

/** Ignore cursor movement and small animations; compare RGB pixels on a tiny local sample. */
export function changedScreenFraction(before: Uint8Array, after: Uint8Array): number {
  if (before.length !== after.length || !before.length) return 1;
  let changed = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2])) > 32) changed++;
  }
  return changed / (before.length / 4);
}

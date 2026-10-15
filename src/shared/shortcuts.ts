// Turns a key press into an Electron accelerator such as "Control+Shift+T".
// Physical key codes are used, so Shift+3 records "3" and Option+T on a Mac records "T", not "#" or "†".

/** Keys a recorded shortcut may end with. Shared with settings validation in the main process. */
export const SHORTCUT_KEY = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Backspace|Delete|Insert|Return|Esc|Up|Down|Left|Right|Home|End|PageUp|PageDown|NumLock)$/;
export const SHORTCUT_MODIFIERS = ['Control', 'Alt', 'Option', 'Shift', 'Super', 'Command'];

export interface KeyPress { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }
/** A finished shortcut, the modifiers held so far, or why the press cannot be used. */
export type RecordedShortcut = { shortcut: string } | { partial: string } | { error: string };

const CODES: Record<string, string> = {
  Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Enter: 'Return', NumpadEnter: 'Return',
  Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', NumLock: 'NumLock',
};
const MODIFIER_KEYS = ['Control', 'Alt', 'AltGraph', 'Shift', 'Meta', 'OS', 'Super', 'Hyper'];

function keyName(press: KeyPress): string | null {
  const letter = press.code.match(/^Key([A-Z])$/), digit = press.code.match(/^(?:Digit|Numpad)([0-9])$/);
  if (letter) return letter[1];
  if (digit) return digit[1];
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(press.code)) return press.code;
  if (CODES[press.code]) return CODES[press.code];
  // Some virtual keyboards report no code; fall back to the character.
  if (!press.code && /^[a-z0-9]$/i.test(press.key)) return press.key.toUpperCase();
  return null;
}

export function recordShortcut(press: KeyPress, mac: boolean): RecordedShortcut {
  const modifiers = [press.ctrlKey && 'Control', press.altKey && (mac ? 'Option' : 'Alt'), press.shiftKey && 'Shift', press.metaKey && (mac ? 'Command' : 'Super')]
    .filter((part): part is string => Boolean(part));
  if (MODIFIER_KEYS.includes(press.key)) return { partial: modifiers.join('+') };
  const key = keyName(press);
  if (!key) return { error: 'That key is not supported. Use a letter, number, function key, or arrow key.' };
  if (!modifiers.length) return { error: `Hold Ctrl, ${mac ? 'Option' : 'Alt'}, or Shift together with ${key}.` };
  return { shortcut: [...modifiers, key].join('+') };
}

/** Whether a saved value is a shortcut the recorder could have produced. */
export function isShortcut(value: string): boolean {
  const parts = value.split('+'), modifiers = parts.slice(0, -1);
  return modifiers.length > 0 && new Set(modifiers).size === modifiers.length
    && modifiers.every((part) => SHORTCUT_MODIFIERS.includes(part)) && SHORTCUT_KEY.test(parts.at(-1) || '');
}

/** Compares shortcuts regardless of modifier order and of Electron's aliases for the same key. */
export function sameShortcut(a: string, b: string): boolean {
  const alias: Record<string, string> = { CommandOrControl: 'Control', CmdOrCtrl: 'Control', Ctrl: 'Control', Option: 'Alt', Cmd: 'Command', Meta: 'Super' };
  const normal = (value: string) => value.split('+').map((part) => alias[part] ?? part).map((part, index, parts) => index === parts.length - 1 ? part.toUpperCase() : part).sort().join('+');
  return normal(a) === normal(b);
}

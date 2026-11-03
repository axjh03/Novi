/**
 * The letter or digit an Alt/Option shortcut was pressed with. On macOS, Option composes characters
 * (Option+C is "ç", Option+3 is "£"), so `key` alone never matches there; the physical key is used
 * only when `key` is not a plain letter or digit, so other keyboard layouts still match by letter.
 */
export function shortcutKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code);
  return physical ? (physical[1] || physical[2]).toLowerCase() : key;
}

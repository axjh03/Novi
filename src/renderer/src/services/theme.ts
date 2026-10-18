/**
 * Light / dark theme helpers.
 *
 * Each account stores its theme in its settings, but those settings only load after sign-in. To
 * avoid the sign-in screen flashing the wrong theme, the last theme used on this device is also kept
 * in the browser's localStorage under `novi_theme` and applied before the first render (see main.tsx).
 */
import type { AppSettings } from '../../../shared/types';

/** A theme setting: 'light', 'dark', or 'system' (follow the operating system). */
type Theme = AppSettings['theme'];
/** localStorage key that holds the last theme used on this device. */
const KEY = 'novi_theme';

/**
 * Returns the theme that should actually be shown.
 * 'system' becomes 'dark' or 'light' depending on the operating system; 'light' and 'dark' are returned as they are.
 */
export const themeFor = (theme: Theme, prefersDark: boolean): 'light' | 'dark' => theme === 'system' ? prefersDark ? 'dark' : 'light' : theme;

/**
 * Returns the last theme an account chose on this device, so startup and sign-in look the same
 * before any account loads. Returns 'system' when nothing is saved, the value is unknown, or
 * localStorage is unavailable (for example in a private window).
 */
export function savedTheme(): Theme {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch { return 'system'; }
}

/**
 * Remembers the current account's theme on this device. Called whenever settings change (App.tsx).
 * Failure is ignored on purpose: this is only a convenience, and the account setting stays the source of truth.
 */
export function rememberTheme(theme: Theme) {
  try { globalThis.localStorage?.setItem(KEY, theme); } catch { /* convenience only */ }
}

/**
 * Shows a theme by setting `data-theme="light"` or `data-theme="dark"` on the <html> element,
 * which the CSS colour tokens in app.css follow.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = themeFor(theme, matchMedia('(prefers-color-scheme: dark)').matches);
}

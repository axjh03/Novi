import type { AppSettings } from '../../../shared/types';

type Theme = AppSettings['theme'];
const KEY = 'novi_theme';

/** The theme actually shown: "system" follows the OS. */
export const themeFor = (theme: Theme, prefersDark: boolean): 'light' | 'dark' => theme === 'system' ? prefersDark ? 'dark' : 'light' : theme;

/** The last theme an account chose on this device, so startup and sign-in look the same before any account loads. */
export function savedTheme(): Theme {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch { return 'system'; }
}

export function rememberTheme(theme: Theme) {
  try { globalThis.localStorage?.setItem(KEY, theme); } catch { /* convenience only */ }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = themeFor(theme, matchMedia('(prefers-color-scheme: dark)').matches);
}

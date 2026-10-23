import { luminance, normalizeAppearance, PALETTES, type Appearance } from '../../../shared/appearance';

const KEY = 'novi_appearance';
const CHANGE = 'novi-appearance-changed';

// Text size lasts for one app launch: a size saved during an earlier launch falls back to the default.
const currentLaunch = () => (typeof window !== 'undefined' && window.novi?.launchId) || '';

export function readAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(KEY);
    const value = saved ? JSON.parse(saved) ?? {} : { opacity: Number(localStorage.getItem('novi_transparent_opacity') || 35) };
    if (value.readingLaunch !== currentLaunch()) delete value.readingSize;
    return normalizeAppearance(value);
  } catch { return normalizeAppearance(); }
}

export function updateAppearance(patch: Partial<Appearance>) {
  localStorage.setItem(KEY, JSON.stringify({ ...normalizeAppearance({ ...readAppearance(), ...patch }), readingLaunch: currentLaunch() }));
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeAppearance(update: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) update(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE, update);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(CHANGE, update); };
}

/** Shared by main, code viewer and answer overlay; the tray copies the main document's variables. */
export function syncAppearance() {
  const settings = readAppearance();
  const palette = settings.smart
    ? settings.smartPalette ?? { background: '#09090b', text: '#ffffff', opacity: 85 }
    : PALETTES.find((item) => item.id === settings.paletteId)!;
  const style = document.documentElement.style;
  const textColor = [1, 3, 5].map((start) => parseInt(palette.text.slice(start, start + 2), 16)) as [number, number, number];
  style.setProperty('--transparent-color-scheme', luminance(textColor) > 0.5 ? 'dark' : 'light');
  style.setProperty('--transparent-bg', palette.background);
  style.setProperty('--transparent-text', palette.text);
  style.setProperty('--transparent-opacity', `${settings.smart && 'opacity' in palette ? palette.opacity : settings.opacity}%`);
  style.setProperty('--ui-scale', String(settings.readingSize / 100));
  style.setProperty('--reading-scale', '1');
}

export interface PaletteColors { background: string; text: string }
export interface SmartPalette extends PaletteColors { opacity: number }

export const PALETTES = [
  { id: 'midnight', name: 'Midnight', background: '#09090b', text: '#ffffff' },
  { id: 'paper', name: 'Paper', background: '#ffffff', text: '#141414' },
  { id: 'ocean', name: 'Ocean', background: '#0b1933', text: '#d9f3ff' },
  { id: 'forest', name: 'Forest', background: '#0b261b', text: '#d9ffe7' },
  { id: 'plum', name: 'Plum', background: '#29152f', text: '#ffe8fa' },
  { id: 'sand', name: 'Sand', background: '#fff0ce', text: '#30210d' },
] as const;

export const MIN_READING_SIZE = 70;
export const MAX_READING_SIZE = 200;
export type InterfaceStyle = 'classic' | 'modern';
export interface Appearance {
  interfaceStyle: InterfaceStyle;
  paletteId: string;
  smart: boolean;
  opacity: number;
  readingSize: number;
  smartPalette: SmartPalette | null;
}

const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function normalizeAppearance(value: Partial<Appearance> = {}): Appearance {
  const colors = value.smartPalette;
  return {
    interfaceStyle: value.interfaceStyle === 'modern' ? 'modern' : 'classic',
    paletteId: PALETTES.some((palette) => palette.id === value.paletteId) ? value.paletteId! : 'midnight',
    smart: value.smart === true,
    opacity: bounded(value.opacity, 35, 20, 100),
    readingSize: bounded(value.readingSize, 100, MIN_READING_SIZE, MAX_READING_SIZE),
    smartPalette: colors && /^#[\da-f]{6}$/i.test(colors.background) && /^#[\da-f]{6}$/i.test(colors.text)
      ? { ...colors, opacity: bounded(colors.opacity, 85, 20, 100) } : null,
  };
}

type RGB = readonly [number, number, number];
export function luminance(rgb: RGB): number {
  const linear = rgb.map((channel) => { const s = channel / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Derive a tinted palette and enough opacity for contrast across the sampled background. */
export function paletteForBackground(pixels: RGB[], requestedOpacity: number): SmartPalette {
  if (!pixels.length) throw new Error('No background pixels available.');
  const mean = [0, 1, 2].map((channel) => pixels.reduce((sum, pixel) => sum + pixel[channel], 0) / pixels.length) as [number, number, number];
  const dark = luminance(mean) < 0.35;
  const background = mean.map((channel) => Math.round(dark ? channel * 0.15 : 230 + channel * 0.098)) as [number, number, number];
  let opacity = bounded(requestedOpacity, 35, 20, 100);
  const contrast = (pixel: RGB) => {
    const composite = pixel.map((channel, i) => channel * (1 - opacity / 100) + background[i] * opacity / 100) as [number, number, number];
    const light = luminance(composite);
    return dark ? 1.05 / (light + 0.05) : (light + 0.05) / 0.05;
  };
  // Cover both extremes so moving a window or changing the desktop between samples stays readable.
  const backgrounds: RGB[] = [...pixels, [0, 0, 0], [255, 255, 255]];
  while (opacity < 100 && backgrounds.some((pixel) => contrast(pixel) < 4.5)) opacity = Math.min(100, opacity + 5);
  return { background: '#' + background.map((channel) => channel.toString(16).padStart(2, '0')).join(''), text: dark ? '#ffffff' : '#000000', opacity };
}

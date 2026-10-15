import assert from 'node:assert/strict';
import { test } from 'node:test';
import { luminance, normalizeAppearance, paletteForBackground, PALETTES } from '../src/shared/appearance';

const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

test('all six manual palettes have readable foreground/background contrast', () => {
  assert.equal(PALETTES.length, 6);
  assert.equal(new Set(PALETTES.map((palette) => palette.id)).size, 6);
  for (const palette of PALETTES) assert(ratio(luminance(rgb(palette.text)), luminance(rgb(palette.background))) >= 7, palette.name);
});

test('Smart adapts to dark, light and mixed backgrounds and stays readable between samples', () => {
  const dark = paletteForBackground([[10, 20, 30]], 20);
  const light = paletteForBackground([[250, 240, 230]], 20);
  assert.equal(dark.text, '#ffffff');
  assert.equal(light.text, '#000000');
  assert.notEqual(dark.background, light.background);
  for (const pixels of [[[10, 20, 30]], [[250, 240, 230]], [[0, 0, 0], [255, 255, 255], [160, 40, 80]]] as [number, number, number][][]) {
    for (const opacity of [20, 35, 70, 100]) {
      const palette = paletteForBackground(pixels, opacity);
      assert(palette.opacity >= opacity && palette.opacity <= 100);
      const background = rgb(palette.background);
      for (const pixel of [...pixels, [0, 0, 0], [255, 255, 255]]) {
        const composite = pixel.map((channel, i) => channel * (1 - palette.opacity / 100) + background[i] * palette.opacity / 100) as [number, number, number];
        assert(ratio(luminance(rgb(palette.text)), luminance(composite)) >= 4.5);
      }
    }
  }
  assert.throws(() => paletteForBackground([], 35), /No background/);
});

test('appearance settings clamp text size and reject corrupt persisted values', () => {
  assert.equal(normalizeAppearance({ readingSize: 400 }).readingSize, 200);
  assert.equal(normalizeAppearance({ readingSize: -20 }).readingSize, 70);
  assert.equal(normalizeAppearance({ readingSize: NaN }).readingSize, 100);
  assert.equal(normalizeAppearance({ opacity: Infinity }).opacity, 35);
  assert.equal(normalizeAppearance({ paletteId: 'missing' }).paletteId, 'midnight');
  const selected = normalizeAppearance({ paletteId: 'forest', smart: true });
  assert.equal(normalizeAppearance({ ...selected, smart: false }).paletteId, 'forest');
  assert.equal(normalizeAppearance({ smartPalette: { background: 'red; color: transparent', text: '#ffffff', opacity: 80 } }).smartPalette, null);
});

test('appearance updates persist, reach other windows, and restore the manual palette when Smart is off', async () => {
  const { readAppearance, updateAppearance, subscribeAppearance, syncAppearance } = await import('../src/renderer/src/services/appearance');
  const saved = new Map<string, string>();
  const styles = new Map<string, string>();
  const originals = Object.fromEntries(['localStorage', 'window', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) } },
    window: { configurable: true, value: Object.assign(new EventTarget(), { novi: { launchId: 'launch-1' } }) },
    document: { configurable: true, value: { documentElement: { style: { setProperty: (key: string, value: string) => styles.set(key, value) } } } },
  });
  const stop = subscribeAppearance(syncAppearance);
  try {
    saved.set('novi_transparent_opacity', '60');
    assert.equal(readAppearance().opacity, 60);
    updateAppearance({ paletteId: 'paper', readingSize: 150 });
    assert.equal(styles.get('--transparent-bg'), '#ffffff');
    assert.equal(styles.get('--transparent-text'), '#141414');
    assert.equal(styles.get('--reading-scale'), '1.5');
    updateAppearance({ smart: true, smartPalette: { background: '#102030', text: '#ffffff', opacity: 80 } });
    assert.equal(styles.get('--transparent-bg'), '#102030');
    assert.equal(styles.get('--transparent-opacity'), '80%');
    updateAppearance({ smart: false });
    assert.equal(styles.get('--transparent-bg'), '#ffffff');
    assert.equal(styles.get('--transparent-opacity'), '60%');
    saved.set('novi_appearance', JSON.stringify({ paletteId: 'forest', readingSize: 120, readingLaunch: 'launch-1' }));
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'novi_appearance' }));
    assert.equal(styles.get('--transparent-bg'), '#0b261b');
    assert.equal(styles.get('--reading-scale'), '1.2');
    stop();
    updateAppearance({ readingSize: 100 });
    assert.equal(styles.get('--reading-scale'), '1.2', 'unsubscribed windows stop receiving updates');
    // Text size lasts for one app launch; colors and opacity are remembered.
    updateAppearance({ readingSize: 160 });
    assert.equal(readAppearance().readingSize, 160);
    (window as any).novi.launchId = 'launch-2';
    assert.deepEqual([readAppearance().readingSize, readAppearance().paletteId], [100, 'forest']);
    updateAppearance({ opacity: 45 });
    assert.equal(JSON.parse(saved.get('novi_appearance')!).readingLaunch, 'launch-2');
    assert.deepEqual([readAppearance().readingSize, readAppearance().opacity], [100, 45]);
    saved.set('novi_appearance', JSON.stringify({ paletteId: 'ocean', readingSize: 180 }));
    assert.equal(readAppearance().readingSize, 100, 'sizes saved before this change also reset');
  } finally {
    stop();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('background sampling crops the display, serializes captures, and restores windows after failure', async () => {
  const electronPath = require.resolve('electron');
  require(electronPath);
  const original = require.cache[electronPath]!.exports;
  const area = { x: 1920, y: 0, width: 1920, height: 1080 };
  const display = { id: 2, bounds: area, scaleFactor: 1 };
  let opacity = 0.8, visible = true, protection = true, focused = true, fail = false, inFlight = 0, peak = 0, inactiveShows = 0;
  const cropped: unknown[] = [];
  const win = {
    isDestroyed: () => false, isVisible: () => visible, isFocused: () => focused,
    isContentProtected: () => protection, getOpacity: () => opacity,
    setContentProtection(value: boolean) { protection = value; },
    setOpacity(value: number) { opacity = value; },
    hide() { visible = false; focused = false; }, show() { visible = true; }, focus() { focused = true; },
    showInactive() { visible = true; inactiveShows++; },
    getBounds: () => area,
  };
  const thumbnail: any = {
    isEmpty: () => false, getSize: () => ({ width: 320, height: 180 }),
    crop(bounds: unknown) { cropped.push(bounds); return thumbnail; },
    resize: () => thumbnail, toPNG: () => Buffer.from('sample'),
  };
  require.cache[electronPath]!.exports = {
    BrowserWindow: { getAllWindows: () => [win] },
    screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display, getDisplayMatching: () => display },
    systemPreferences: { getMediaAccessStatus: () => 'granted' },
    desktopCapturer: { async getSources() {
      inFlight++; peak = Math.max(peak, inFlight);
      try { await new Promise((resolve) => setTimeout(resolve, 5)); if (fail) throw new Error('Capture denied');
        return [{ display_id: '2', thumbnail }];
      } finally { inFlight--; }
    } },
  };
  try {
    const { captureScreenBuffer } = await import('../src/main/services/screenCapture');
    const sample = () => captureScreenBuffer(() => win as any, 2, { x: 1920, y: 0, width: 960, height: 540 });
    await Promise.all([sample(), sample()]);
    assert.equal(peak, 1, 'samplers must not capture or restore over each other');
    assert.deepEqual(cropped, [{ x: 0, y: 0, width: 160, height: 90 }, { x: 0, y: 0, width: 160, height: 90 }]);
    assert.deepEqual([opacity, visible, focused, protection], [0.8, true, true, true]);
    fail = true;
    await assert.rejects(sample, /Capture denied/);
    assert.deepEqual([opacity, visible, focused, protection], [0.8, true, true, true]);
    fail = false;
    assert.equal((await sample()).toString(), 'sample', 'a failed sample does not block later screenshots');
    focused = false;
    await captureScreenBuffer(() => win as any, 2, undefined, false);
    assert.equal(inactiveShows, 1, 'automatic placement restores the window without activating it');
    assert.equal(focused, false, 'automatic screenshots leave focus with the user’s work');
    focused = true;
    await captureScreenBuffer(() => win as any, 2, undefined, false);
    assert.equal(focused, true, 'typing in Novi keeps its original focus after the screenshot');
  } finally { require.cache[electronPath]!.exports = original; }
});

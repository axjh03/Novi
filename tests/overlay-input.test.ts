import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOverlayInput } from '../src/renderer/src/eye-tracking/overlayInput.ts';

test('overlay releases native input when HUD/calibration disappears without mouseleave', () => {
  let interactive = true;
  const calls: boolean[] = [];
  const input = createOverlayInput((x) => interactive && x < 100, (ignore) => calls.push(ignore));
  input.reset();
  input.move(50, 50); // Hover HUD: clicks work.
  assert.deepEqual(calls, [true, false]);
  interactive = false; // Dismiss HUD while mouse stays over its close button.
  input.refresh();
  assert.equal(calls.at(-1), true); // Reticle alone cannot block other applications.
  input.refresh();
  assert.equal(calls.length, 3); // Gaze frames do not flood IPC.
  interactive = true;
  input.refresh(); // HUD reappears under stationary mouse.
  assert.equal(calls.at(-1), false);
  input.move(200, 50, true); // Drag outside card retains input until released.
  assert.equal(calls.at(-1), false);
  input.refresh();
  assert.equal(calls.at(-1), true);
  input.move(50, 50);
  input.reset(); // Blur/unmount/navigation releases input too.
  input.refresh();
  assert.equal(calls.at(-1), true);
});

test('closing the native HUD notifies tracking after asynchronous window destruction', async t => {
  const { createRequire } = await import('node:module');
  const { EventEmitter } = await import('node:events');
  const require = createRequire(import.meta.url);
  const electronPath = require.resolve('electron');
  const saved = require.cache[electronPath];
  const events: unknown[] = [];
  const windows: FakeWindow[] = [];
  class FakeWindow extends EventEmitter {
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), { send() {} });
    constructor() { super(); windows.push(this); }
    isDestroyed() { return this.destroyed; }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents() {}
    showInactive() {}
    async loadURL() {}
    close() { setImmediate(() => { this.destroyed = true; this.emit('closed'); }); }
    static getAllWindows() {
      return [...windows, { isDestroyed: () => false, webContents: { send: (_channel: string, event: unknown) => events.push(event) } }];
    }
  }
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 } };
  require.cache[electronPath] = { exports: { BrowserWindow: FakeWindow, screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display } } } as NodeJS.Module;
  t.after(() => { if (saved) require.cache[electronPath] = saved; else delete require.cache[electronPath]; });
  const { OverlayService } = require('../src/main/services/overlay.ts') as typeof import('../src/main/services/overlay');
  const overlay = new OverlayService();
  overlay.openOverlay(1, 'file:///novi/index.html', '/preload.js');
  overlay.closeOverlay();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(overlay.activeDisplayId, null);
  assert.deepEqual(events, [{ type: 'close' }]);
  overlay.closeOverlay();
  assert.equal(events.length, 1, 'tracking shutdown must not create a close loop');
});

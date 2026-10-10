import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StealthService } from '../src/main/services/stealth.ts';

test('StealthService manages transparent mode, content protection, and NumLock click-through', () => {
  let contentProtected = false;
  let alwaysOnTop = false;
  let ignoredMouse: boolean | undefined = undefined;
  let sentEvents: any[] = [];

  const mockWindow: any = {
    isDestroyed: () => false,
    setContentProtection: (val: boolean) => { contentProtected = val; },
    setAlwaysOnTop: (val: boolean) => { alwaysOnTop = val; },
    setIgnoreMouseEvents: (ignore: boolean) => { ignoredMouse = ignore; },
    webContents: {
      send: (channel: string, data: any) => sentEvents.push({ channel, data }),
    },
  };

  let overlayProtected = false;
  const mockOverlay: any = {
    setContentProtection: (val: boolean) => { overlayProtected = val; },
  };

  const stealth = new StealthService(() => mockWindow, mockOverlay);

  // 1. Initial state
  const initial = stealth.getState();
  assert.equal(initial.transparent, false);
  assert.equal(contentProtected, false);
  assert.equal(alwaysOnTop, false);

  // 2. Enable transparent mode
  const activeState = stealth.setTransparent(true);
  assert.equal(activeState.transparent, true);
  assert.equal(contentProtected, true, 'Window must have contentProtection=true (invisible in screen capture)');
  assert.equal(overlayProtected, true, 'Overlay window must have contentProtection=true');
  assert.equal(alwaysOnTop, true, 'Window must be always on top when transparent');

  // Verify mouse mode according to NumLock state:
  // If NumLock is off, window must be click-through (ignoreMouseEvents = true)
  if (!activeState.numLock) {
    assert.equal(ignoredMouse, true, 'When NumLock is OFF, window must be click-through');
  } else {
    assert.equal(ignoredMouse, false, 'When NumLock is ON, window must be interactive');
  }

  // 3. Disable transparent mode (Opaque mode)
  const opaqueState = stealth.setTransparent(false);
  assert.equal(opaqueState.transparent, false);
  assert.equal(contentProtected, false, 'Window contentProtection must be false in opaque mode');
  assert.equal(overlayProtected, false, 'Overlay contentProtection must be false in opaque mode');
  assert.equal(alwaysOnTop, false, 'alwaysOnTop must be false in opaque mode');
  assert.equal(ignoredMouse, false, 'Window must be interactive in opaque mode regardless of NumLock');

  // 4. Toggle transparent mode
  const toggledOn = stealth.toggleTransparent();
  assert.equal(toggledOn.transparent, true);
  assert.equal(contentProtected, true);

  const toggledOff = stealth.toggleTransparent();
  assert.equal(toggledOff.transparent, false);
  assert.equal(contentProtected, false);

  stealth.cleanup();
});

test('detached viewers accept scrolling while the main window is click-through', () => {
  let ignoredMouse = true;
  const viewer: any = {
    isDestroyed: () => false, setContentProtection() {}, setAlwaysOnTop() {},
    setIgnoreMouseEvents: (ignore: boolean) => { ignoredMouse = ignore; },
    webContents: { getURL: () => 'file:///app/index.html#/code-viewer', send() {} },
  };
  const stealth = new StealthService(() => viewer);
  try { stealth.setTransparent(true); assert.equal(ignoredMouse, false); }
  finally { stealth.cleanup(); }
});

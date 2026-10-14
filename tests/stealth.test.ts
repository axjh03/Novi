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
    owns: () => false,
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
  assert.equal(alwaysOnTop, true, 'Window stays on top in opaque mode');
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

function fakeWindow(url = 'file:///app/index.html', raised: string[] = [], name = url) {
  const state = { protected: false, onTop: false, level: '' as string | undefined, ignored: false, visible: true };
  const window: any = {
    state,
    isDestroyed: () => false,
    isVisible: () => state.visible,
    moveTop: () => { raised.push(name); },
    setContentProtection: (value: boolean) => { state.protected = value; },
    setAlwaysOnTop: (value: boolean, level?: string) => { state.onTop = value; state.level = value ? level : undefined; },
    setIgnoreMouseEvents: (ignore: boolean) => { state.ignored = ignore; },
    webContents: { getURL: () => url, send() {} },
  };
  return window;
}

test('transparent mode leaves the eye-tracking overlay in charge of its own clicks and stacking', () => {
  const main = fakeWindow(), overlay = fakeWindow('file:///app/index.html#/overlay');
  overlay.state.ignored = true; overlay.state.onTop = true; overlay.state.level = 'screen-saver';
  const overlayService: any = { setContentProtection() {}, owns: (window: unknown) => window === overlay };
  const stealth = new StealthService(() => main, overlayService, () => [main, overlay]);
  try {
    stealth.setTransparent(true);
    assert.equal(overlay.state.protected, true, 'the overlay is still hidden from screen capture');
    stealth.toggleClickThrough();
    stealth.toggleClickThrough();
    stealth.setTransparent(false);
    assert.equal(overlay.state.ignored, true, 'the overlay never becomes an invisible click blocker');
    assert.deepEqual([overlay.state.onTop, overlay.state.level], [true, 'screen-saver']);
    assert.equal(overlay.state.protected, false);
  } finally { stealth.cleanup(); }
});

test('the floating tray follows click-through and stays on top after transparency is disabled', () => {
  const main = fakeWindow(), tray = fakeWindow('about:blank');
  const stealth = new StealthService(() => main, undefined, () => [main, tray]);
  try {
    assert.equal(tray.state.onTop, false, 'outside transparent mode other apps may cover the tray');
    const on = stealth.setTransparent(true);
    assert.deepEqual([tray.state.protected, tray.state.onTop, tray.state.level], [true, true, 'screen-saver']);
    assert.equal(tray.state.ignored, on.clickThrough);
    const toggled = stealth.toggleClickThrough();
    assert.equal(toggled.clickThrough, !on.clickThrough);
    assert.equal(tray.state.ignored, toggled.clickThrough, 'click-through applies to the tray as well as the main window');
    assert.equal(main.state.ignored, toggled.clickThrough);
    stealth.setTransparent(false);
    assert.deepEqual([tray.state.onTop, tray.state.ignored, tray.state.protected], [true, false, false]);
    assert.deepEqual([main.state.onTop, main.state.ignored], [true, false]);
  } finally { stealth.cleanup(); }
});

test('in transparent mode Novi pushes its windows back above an app that took focus, with the eye-tracking HUD on top', () => {
  const raised: string[] = [];
  const main = fakeWindow('file:///app/index.html', raised, 'main');
  const tray = fakeWindow('about:blank', raised, 'tray');
  const viewer = fakeWindow('file:///app/index.html#/code-viewer', raised, 'viewer');
  const overlay = fakeWindow('file:///app/index.html#/overlay', raised, 'overlay-window');
  viewer.state.visible = false;
  const overlayService: any = { setContentProtection() {}, owns: (window: unknown) => window === overlay, raise: () => raised.push('overlay') };
  const stealth = new StealthService(() => main, overlayService, () => [main, tray, viewer, overlay]);
  try {
    stealth.keepAbove();
    assert.deepEqual(raised, [], 'outside transparent mode nothing is raised');
    stealth.setTransparent(true);
    tray.state.onTop = false;
    stealth.keepAbove();
    assert.deepEqual(raised, ['main', 'tray', 'overlay'], 'visible panels first, hidden viewer skipped, overlay raised by its own service last');
    assert.deepEqual([tray.state.onTop, tray.state.level], [true, 'screen-saver'], 'the top-most level is restored too');
  } finally { stealth.cleanup(); }
});

test('a window opened while transparent mode is on joins the current state', () => {
  const main = fakeWindow(), late = fakeWindow('about:blank');
  const stealth = new StealthService(() => main, undefined, () => [main]);
  try {
    stealth.applyWindowState(late);
    assert.deepEqual([late.state.protected, late.state.onTop, late.state.level], [false, true, 'floating'], 'new windows stay on top outside transparent mode');
    const on = stealth.setTransparent(true);
    stealth.applyWindowState(late);
    assert.deepEqual([late.state.protected, late.state.onTop, late.state.level, late.state.ignored], [true, true, 'screen-saver', on.clickThrough]);
  } finally { stealth.cleanup(); }
});

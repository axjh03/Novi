import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampTrayHeight, dockedBounds, TRAY_NAME, trayBounds } from '../src/main/services/workspace.ts';

const full = { x: 0, y: 0, width: 1920, height: 1040 };

test('the output panel docks full height on the right at 28% of the screen, between 400 and 600 px', () => {
  assert.deepEqual(dockedBounds(full), { x: 1382, y: 0, width: 538, height: 1040 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 1366, height: 728 }), { x: 966, y: 0, width: 400, height: 728 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 2560, height: 1400 }), { x: 1960, y: 0, width: 600, height: 1400 });
  assert.deepEqual(dockedBounds({ x: 1920, y: 40, width: 1920, height: 1040 }), { x: 3302, y: 40, width: 538, height: 1040 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 360, height: 600 }), { x: 0, y: 0, width: 360, height: 600 });
});

test('the tray sits top-center and moves left only as far as needed to clear the panel', () => {
  assert.deepEqual(trayBounds(full, null, 180), { x: 530, y: 12, width: 860, height: 180 });
  const docked = trayBounds(full, 1382, 200);
  assert.deepEqual(docked, { x: 510, y: 12, width: 860, height: 200 });
  assert(docked.x + docked.width <= 1382 - 12, 'clears the docked panel');
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 2560, height: 1400 }, 1960, 200), { x: 850, y: 12, width: 860, height: 200 }, 'stays truly centered when there is room');
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1366, height: 728 }, 966, 200), { x: 94, y: 12, width: 860, height: 200 });
  assert.deepEqual(trayBounds({ x: 1920, y: 40, width: 1920, height: 1040 }, 3302, 200), { x: 2430, y: 52, width: 860, height: 200 }, 'works on an offset second monitor');
});

test('on a small screen the tray uses the whole width instead of squeezing beside the panel', () => {
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 800, height: 600 }, 400, 200), { x: 12, y: 12, width: 776, height: 200 });
  assert.deepEqual(trayBounds(full, 5000, 200), trayBounds(full, null, 200), 'a panel on another screen is ignored');
});

test('tray height stays on screen', () => {
  assert.equal(clampTrayHeight(full, 5000), 1016);
  assert.equal(clampTrayHeight(full, 10), 48);
  assert.equal(clampTrayHeight(full, 211.4), 211);
  assert.equal(trayBounds(full, null, 5000).height, 1016);
});

test('only the tray window name is allowed', () => {
  assert(TRAY_NAME.test('novi-tray-ff72774b-0c3b-44cc-a57f-e74345ee346c'));
  for (const name of ['', 'novi-tray-', 'novi-tray-x', '_blank', 'novi-tray-ff72774b-0c3b-44cc-a57f-e74345ee346c-extra']) assert(!TRAY_NAME.test(name), name);
});

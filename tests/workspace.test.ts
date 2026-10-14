import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampTrayHeight, dockedBounds, MAIN_WINDOW_MIN, resizedTrayBounds, TRAY_NAME, trayBounds } from '../src/main/services/workspace.ts';

const full = { x: 0, y: 0, width: 1920, height: 1040 };

test('the output panel follows 35% of the display and allows the smaller window minimum', () => {
  assert.deepEqual(MAIN_WINDOW_MIN, { width: 213, height: 150 });
  assert.deepEqual(dockedBounds(full), { x: 1248, y: 0, width: 672, height: 1040 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 1536, height: 824 }), { x: 998, y: 0, width: 538, height: 824 }, 'laptop at 125% scaling');
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 1366, height: 728 }), { x: 888, y: 0, width: 478, height: 728 });
  assert.deepEqual(dockedBounds({ x: 66, y: 32, width: 2494, height: 1408 }), { x: 1687, y: 32, width: 873, height: 1408 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 3840, height: 2120 }), { x: 2840, y: 0, width: 1000, height: 2120 });
  assert.deepEqual(dockedBounds({ x: 1920, y: 40, width: 1920, height: 1040 }), { x: 3168, y: 40, width: 672, height: 1040 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 800, height: 600 }), { x: 520, y: 0, width: 280, height: 600 }, 'smaller screens remain usable');
});

test('the tray sits top-center and moves left only as far as needed to clear the panel', () => {
  assert.deepEqual(trayBounds(full, null, 180), { x: 530, y: 12, width: 860, height: 180 });
  const docked = trayBounds(full, 1070, 200);
  assert.deepEqual(docked, { x: 198, y: 12, width: 860, height: 200 });
  assert(docked.x + docked.width <= 1070 - 12, 'clears the docked panel');
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 3840, height: 2120 }, 2840, 200), { x: 1490, y: 12, width: 860, height: 200 }, 'stays truly centered when there is room');
  assert.deepEqual(trayBounds({ x: 1920, y: 40, width: 1920, height: 1040 }, 2990, 200), { x: 2118, y: 52, width: 860, height: 200 }, 'works on an offset second monitor');
});

test('on a laptop the tray narrows to fit beside the panel', () => {
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1536, height: 824 }, 686, 200), { x: 12, y: 12, width: 662, height: 200 });
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1366, height: 728 }, 516, 200), { x: 12, y: 12, width: 492, height: 200 });
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1280, height: 680 }, 430, 200), { x: 12, y: 12, width: 406, height: 200 });
});

test('when there is no usable room beside the panel the tray uses the screen width instead', () => {
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1200, height: 700 }, 350, 200), { x: 170, y: 12, width: 860, height: 200 });
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 800, height: 600 }, 0, 200), { x: 12, y: 12, width: 776, height: 200 });
  assert.deepEqual(trayBounds(full, 5000, 200), trayBounds(full, null, 200), 'a panel on another screen is ignored');
});

test('manually resized tray width survives placement', () => {
  assert.equal(trayBounds(full, null, 240, 1200).width, 1200);
  assert.equal(trayBounds(full, null, 240, 320).width, 320);
  assert.equal(trayBounds(full, 1070, 240, 1400).width, 1046);
});

test('tray height stays on screen', () => {
  assert.equal(clampTrayHeight(full, 5000), 1016);
  assert.equal(clampTrayHeight(full, 10), 48);
  assert.equal(clampTrayHeight(full, 211.4), 211);
  assert.equal(trayBounds(full, null, 5000).height, 1016);
});

test('side resizing anchors the opposite edge, enforces minimum width, and stops at monitor edges', () => {
  const bounds = { x: 300, y: 50, width: 600, height: 180 };
  assert.deepEqual(resizedTrayBounds(full, bounds, 800, 'left'), { ...bounds, x: 100, width: 800 });
  assert.deepEqual(resizedTrayBounds(full, bounds, 800, 'right'), { ...bounds, width: 800 });
  assert.deepEqual(resizedTrayBounds(full, bounds, -10, 'left'), { ...bounds, x: 580, width: 320 });
  assert.deepEqual(resizedTrayBounds(full, bounds, 5000, 'left'), { ...bounds, x: 0, width: 900 });
  assert.deepEqual(resizedTrayBounds(full, bounds, 5000, 'right'), { ...bounds, width: 1620 });
  const area = { x: -1920, y: 30, width: 1920, height: 1040 };
  const secondary = { ...bounds, x: -1200 };
  assert.deepEqual(resizedTrayBounds(area, secondary, 800, 'left'), { ...secondary, x: -1400, width: 800 });
  for (const edge of ['left', 'right'] as const) {
    const small = resizedTrayBounds({ x: 10, y: 0, width: 240, height: 400 }, bounds, 800, edge);
    assert.equal(small.x, 10); assert.equal(small.width, 240);
  }
});

test('only the tray window name is allowed', () => {
  assert(TRAY_NAME.test('novi-tray-ff72774b-0c3b-44cc-a57f-e74345ee346c'));
  for (const name of ['', 'novi-tray-', 'novi-tray-x', '_blank', 'novi-tray-ff72774b-0c3b-44cc-a57f-e74345ee346c-extra']) assert(!TRAY_NAME.test(name), name);
});

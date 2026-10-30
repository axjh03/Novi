import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampTrayHeight, dockedBounds, MAIN_WINDOW_MIN, modernBounds, normalBounds, readingBoundsBelowControls, resizedTrayBounds, TRAY_NAME, trayBounds, viewerBounds } from '../src/main/services/workspace.ts';

const full = { x: 0, y: 0, width: 1920, height: 1040 };

test('Modern places a centered reading window below its top bar and respects native minimums', () => {
  assert.deepEqual(modernBounds(full), { x: 550, y: 96, width: 820, height: 720 });
  assert.equal(modernBounds(full, 200).y, 224, 'initial layout also clears enlarged controls reported before docking');
  assert.equal(trayBounds(full, null, 64, 680).x, 620, 'the Modern capsule stays centered above the reader');
  for (const area of [full, { x: -1080, y: 40, width: 1080, height: 1880 }, { x: 1920, y: 20, width: 800, height: 600 }, { x: 0, y: 0, width: 220, height: 160 }, { x: 10, y: -120, width: 96, height: 96 }]) {
    const bounds = modernBounds(area);
    assert(bounds.width >= Math.min(MAIN_WINDOW_MIN.width, area.width));
    assert(bounds.height >= Math.min(MAIN_WINDOW_MIN.height, area.height));
    assert(bounds.x >= area.x && bounds.y >= area.y);
    assert(bounds.x + bounds.width <= area.x + area.width);
    assert(bounds.y + bounds.height <= area.y + area.height);
  }
});

test('the output panel follows the display width with a readable default and a smaller manual minimum', () => {
  assert.deepEqual(MAIN_WINDOW_MIN, { width: 213, height: 150 });
  assert.deepEqual(dockedBounds(full), { x: 1248, y: 0, width: 672, height: 1040 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 1536, height: 824 }), { x: 998, y: 0, width: 538, height: 824 }, 'laptop at 125% scaling');
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 1366, height: 728 }), { x: 888, y: 0, width: 478, height: 728 });
  assert.deepEqual(dockedBounds({ x: 66, y: 32, width: 2494, height: 1408 }), { x: 1687, y: 32, width: 873, height: 1408 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 3840, height: 2120 }), { x: 2840, y: 0, width: 1000, height: 2120 });
  assert.deepEqual(dockedBounds({ x: 1920, y: 40, width: 1920, height: 1040 }), { x: 3168, y: 40, width: 672, height: 1040 });
  assert.deepEqual(dockedBounds({ x: 0, y: 0, width: 800, height: 600 }), { x: 380, y: 0, width: 420, height: 600 }, 'smaller screens keep a readable conversation');
  assert.equal(dockedBounds({ x: 0, y: 0, width: 320, height: 600 }).width, 320);
});

test('startup and viewer bounds fit scaled, portrait, tiny and offset displays', () => {
  for (const area of [full, { x: 0, y: 0, width: 1366, height: 728 }, { x: 0, y: 0, width: 800, height: 600 }, { x: -1080, y: 40, width: 1080, height: 1880 }, { x: 40, y: -600, width: 320, height: 480 }]) {
    const panel = dockedBounds(area);
    for (const bounds of [normalBounds(area), viewerBounds(area, panel)]) {
      assert(bounds.width > 0 && bounds.height > 0);
      assert(bounds.x >= area.x && bounds.y >= area.y);
      assert(bounds.x + bounds.width <= area.x + area.width);
      assert(bounds.y + bounds.height <= area.y + area.height);
    }
    if (panel.x - area.x >= 332) assert(viewerBounds(area, panel).x + viewerBounds(area, panel).width < panel.x, 'viewer clears the output panel');
  }
  assert.deepEqual(normalBounds({ x: 0, y: 0, width: 800, height: 600 }), { x: 40, y: 30, width: 720, height: 540 });
  assert(viewerBounds(full, dockedBounds(full)).width > 430, 'code uses the space on a larger display');
});

test('enlarged Modern controls move the reader below them without moving separated windows', () => {
  const reader = modernBounds(full);
  const controls = { x: 620, y: 12, width: 680, height: 220 };
  assert.deepEqual(readingBoundsBelowControls(full, reader, controls), { ...reader, y: 244 });
  assert.deepEqual(readingBoundsBelowControls(full, reader, { ...controls, height: 600 }), { ...reader, y: 624, height: 404 });
  assert.equal(readingBoundsBelowControls(full, reader, { ...controls, height: 50 }), reader);
  assert.equal(readingBoundsBelowControls(full, reader, { ...controls, x: -1000 }), reader);
  const small = { x: -800, y: 20, width: 800, height: 600 };
  const resized = readingBoundsBelowControls(small, modernBounds(small), { x: -740, y: 32, width: 680, height: 360 });
  assert(resized.y >= 404);
  assert(resized.height >= MAIN_WINDOW_MIN.height);
  assert(resized.y + resized.height <= small.y + small.height);
});

test('the tray sits top-center and moves left only as far as needed to clear the panel', () => {
  assert.deepEqual(trayBounds(full, null, 180), { x: 660, y: 12, width: 600, height: 180 });
  const docked = trayBounds(full, 1070, 200);
  assert.deepEqual(docked, { x: 458, y: 12, width: 600, height: 200 });
  assert(docked.x + docked.width <= 1070 - 12, 'clears the docked panel');
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 3840, height: 2120 }, 2840, 200), { x: 1620, y: 12, width: 600, height: 200 }, 'stays truly centered when there is room');
  assert.deepEqual(trayBounds({ x: 1920, y: 40, width: 1920, height: 1040 }, 2990, 200), { x: 2378, y: 52, width: 600, height: 200 }, 'works on an offset second monitor');
});

test('on a laptop the tray narrows to fit beside the panel', () => {
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1536, height: 824 }, 686, 200), { x: 74, y: 12, width: 600, height: 200 });
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1366, height: 728 }, 516, 200), { x: 12, y: 12, width: 492, height: 200 });
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1280, height: 680 }, 430, 200), { x: 12, y: 12, width: 406, height: 200 });
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 800, height: 600 }, 380, 200), { x: 12, y: 12, width: 356, height: 200 }, 'compact displays fit beside the readable output panel');
});

test('when there is no usable room beside the panel the tray uses the screen width instead', () => {
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 1200, height: 700 }, 300, 200), { x: 300, y: 12, width: 600, height: 200 });
  assert.deepEqual(trayBounds({ x: 0, y: 0, width: 800, height: 600 }, 0, 200), { x: 100, y: 12, width: 600, height: 200 });
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

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

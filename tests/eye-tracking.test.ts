import assert from 'node:assert/strict';
import { test } from 'node:test';
import { require as tsxRequire } from 'tsx/cjs/api';

test('camera selection stays off; stopping closes HUD and cancels pending startup', async (t) => {
  const { EyeTrackingService } = tsxRequire('../src/renderer/src/eye-tracking/EyeTrackingService.ts', import.meta.url);
  const { GazeEstimator } = tsxRequire('../src/renderer/src/eye-tracking/GazeEstimator.ts', import.meta.url);
  let opens = 0, closes = 0, cameraStarts = 0, cameraStops = 0;
  const contents: string[] = [];
  let resolveCamera: (() => void) | undefined;
  let waitForCamera = false;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  };
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  replace('window', { novi: {
    openOverlay: async () => { opens++; return { ok: true }; },
    closeOverlay: async () => { closes++; return { ok: true }; },
    getMonitors: async () => ({ ok: true, value: [{ id: 1, isPrimary: true }] }),
    sendOverlayEvent: async (event: { type: string; text?: string }) => { if (event.type === 'set-content') contents.push(event.text!); return { ok: true }; },
  } });
  replace('document', {
    createElement: () => ({ style: {}, play: async () => {}, remove() {} }),
    body: { appendChild() {} },
  });
  replace('navigator', { mediaDevices: { getUserMedia: async () => {
    cameraStarts++;
    if (waitForCamera) await new Promise<void>((resolve) => { resolveCamera = resolve; });
    return { getTracks: () => [{ stop: () => { cameraStops++; } }] };
  } } });
  replace('requestAnimationFrame', () => 1);
  replace('cancelAnimationFrame', () => {});
  t.mock.method(GazeEstimator.prototype, 'init', async () => {});

  const service = new EyeTrackingService();
  await service.switchCamera('chosen-webcam');
  assert.equal(service.selectedCameraId, 'chosen-webcam');
  assert.equal(service.state, 'idle');
  assert.equal(cameraStarts, 0);
  await service.openOverlay(1);
  assert.equal(opens, 0, 'HUD cannot open while tracking is off');

  service.sendStickyToOverlay('The latest Novi response');
  await service.start();
  assert.equal(service.state, 'running', service.error);
  assert.equal(service.sensitivity, 3.0, 'default sensitivity is 3.0');
  service.setSensitivity(4.5);
  assert.equal(service.sensitivity, 4.5);
  service.setSensitivity(3.0);
  assert.equal(service.overlayActive, true);
  assert.equal(opens, 1);
  assert.equal(contents.at(-1), 'The latest Novi response', 'startup must not overwrite the answer');
  await service.closeOverlay();
  assert.equal(service.state, 'idle');
  assert.equal(service.overlayActive, false);
  assert.equal(closes, 1);
  assert.equal(cameraStops, 1, 'closing HUD releases the camera');

  waitForCamera = true;
  const starting = service.start();
  service.stop();
  resolveCamera!();
  await starting;
  assert.equal(service.state, 'idle');
  assert.equal(service.overlayActive, false);
  assert.equal(opens, 1, 'late camera startup cannot reopen HUD');
  assert.equal(cameraStops, 2, 'late camera stream is released');
});

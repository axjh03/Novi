import assert from 'node:assert/strict';
import { test } from 'node:test';
import { require as tsxRequire } from 'tsx/cjs/api';

test('camera selection stays off; stopping closes HUD and cancels pending startup', async (t) => {
  const { EyeTrackingService } = tsxRequire('../src/renderer/src/eye-tracking/EyeTrackingService.ts', import.meta.url);
  const { GazeEstimator } = tsxRequire('../src/renderer/src/eye-tracking/GazeEstimator.ts', import.meta.url);
  let opens = 0, closes = 0, cameraStarts = 0, cameraStops = 0;
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
    sendOverlayEvent: async () => ({ ok: true }),
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

  await service.start();
  assert.equal(service.state, 'calibrating', service.error);
  assert.throws(() => service.finishCalibration(), /Complete all 25 targets/);
  assert.equal(service.overlayActive, true);
  assert.equal(opens, 1);
  const { CALIBRATION_POINTS, CALIBRATION_SAMPLES_PER_POINT } = tsxRequire('../src/renderer/src/eye-tracking/calibrationPlan.ts', import.meta.url);
  let features = [0, 0];
  t.mock.method(GazeEstimator.prototype, 'extractFeatures', () => features);
  for (const [x, y] of CALIBRATION_POINTS) {
    features = [x, y];
    for (let sample = 0; sample < CALIBRATION_SAMPLES_PER_POINT; sample++) {
      assert.equal(service.addCalibrationSample(x, y), true);
    }
  }
  service.finishCalibration();
  assert.equal(service.state, 'running');
  assert.equal(service.isCalibrated, true);
  service.stop();
  assert.equal(service.state, 'idle');
  assert.equal(service.overlayActive, false);
  assert.equal(closes, 1);
  assert.equal(cameraStops, 1);

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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { require as tsxRequire } from 'tsx/cjs/api';
import { CALIBRATION_POINTS, CALIBRATION_SAMPLES_PER_POINT } from '../src/renderer/src/eye-tracking/calibrationPlan.ts';

test('extreme plan spans 25 targets, fits 1,000 samples and generalizes on synthetic holdout points', () => {
  const { GazeCalibrationModel } = tsxRequire('../src/renderer/src/eye-tracking/GazeCalibrationModel.ts', import.meta.url);
  const model = new GazeCalibrationModel();
  assert.equal(new Set(CALIBRATION_POINTS.map(String)).size, 25);
  for (const [x, y] of CALIBRATION_POINTS) {
    for (let i = 0; i < CALIBRATION_SAMPLES_PER_POINT; i++) {
      const noise = (i % 5 - 2) * 0.001;
      model.addSample({ features: [x + noise, y - noise, x, y, 0, 0, x, y, x, y], screenX: x, screenY: y });
    }
  }
  assert.equal(model.sampleCount, 1000);
  model.train();
  for (const [x, y] of [[0.17, 0.71], [0.8, 0.2], [0.5, 0.5]]) {
    const prediction = model.predict([x, y, x, y, 0, 0, x, y, x, y]);
    assert(Math.abs(prediction.x - x) < 0.01);
    assert(Math.abs(prediction.y - y) < 0.01);
  }
});

test('calibration samples each detected frame once and rejects blinks and missing faces', () => {
  const { GazeEstimator } = tsxRequire('../src/renderer/src/eye-tracking/GazeEstimator.ts', import.meta.url);
  const estimator = new GazeEstimator();
  // Same cached features used by prediction: never run inference twice on one frame.
  estimator.lastVideoTime = 1;
  estimator.frameFeatures = [0.5, 0.5];
  const video = { readyState: 2 };
  assert.deepEqual(estimator.extractFeatures(video), [0.5, 0.5]);
  assert.equal(estimator.extractFeatures(video), null);
  estimator.lastVideoTime = 2;
  estimator.frameFeatures = null;
  assert.equal(estimator.extractFeatures(video), null);
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [outer, inner, top, bottom] of [[33, 133, 159, 145], [263, 362, 386, 374]]) {
    landmarks[outer] = { x: 0.4, y: 0.5 };
    landmarks[inner] = { x: 0.6, y: 0.5 };
    landmarks[top] = { x: 0.5, y: 0.46 };
    landmarks[bottom] = { x: 0.5, y: 0.54 };
  }
  assert(estimator.computeFeatures(landmarks));
  landmarks[145].y = 0.461;
  assert.equal(estimator.computeFeatures(landmarks), null);
});

// Roughly two minutes at 20 accepted frames/sec; poor visibility pauses collection.
export const CALIBRATION_SAMPLES_PER_POINT = 40;
export const CALIBRATION_SETTLE_MS = 1200;
export const CALIBRATION_SAMPLE_INTERVAL_MS = 50;
export const CALIBRATION_POINTS: Array<[number, number]> = Array.from({ length: 25 }, (_, i) => {
  const row = Math.floor(i / 5);
  const column = row % 2 === 0 ? i % 5 : 4 - i % 5;
  return [0.08 + column * 0.21, 0.08 + row * 0.21];
});

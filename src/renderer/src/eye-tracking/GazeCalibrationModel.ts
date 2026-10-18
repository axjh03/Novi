import type { CalibrationModel, CalibrationSample } from './GazeTypes';

/**
 * GazeCalibrationModel: in-memory ridge regression gaze calibration.
 *
 * Input feature vector (6 dims):
 *   [leftIrisX, leftIrisY, rightIrisX, rightIrisY, headYaw, headPitch]
 *   where iris coords are normalised 0..1 within the video frame.
 *
 * Outputs: screenFractionX, screenFractionY  (both 0..1).
 *
 * Uses a simple closed-form ridge regression: (X'X + λI)^-1 X'y.
 * For 6 features and ~27 calibration points this is fast and accurate enough.
 */
export class GazeCalibrationModel {
  private model: CalibrationModel | null = null;
  private samples: CalibrationSample[] = [];

  addSample(sample: CalibrationSample): void {
    this.samples.push(sample);
  }

  clearSamples(): void {
    this.samples = [];
    this.model = null;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  get isCalibrated(): boolean {
    return this.model !== null;
  }

  /** Train ridge regression on the accumulated samples. */
  train(lambda = 0.001): void {
    const n = this.samples.length;
    if (n < 6) throw new Error('Need at least 6 calibration samples.');

    const d = this.samples[0].features.length;

    // 1. Compute feature mean & std for normalisation
    const mean = new Array<number>(d).fill(0);
    for (const s of this.samples) s.features.forEach((v, i) => (mean[i] += v / n));

    const std = new Array<number>(d).fill(0);
    for (const s of this.samples) s.features.forEach((v, i) => (std[i] += (v - mean[i]) ** 2 / n));
    std.forEach((v, i) => (std[i] = Math.sqrt(v) || 1));

    // 2. Build normalised design matrix X (n × d) and target vectors y
    const X: number[][] = this.samples.map((s) => s.features.map((v, i) => (v - mean[i]) / std[i]));
    const yX = this.samples.map((s) => s.screenX);
    const yY = this.samples.map((s) => s.screenY);

    const [coefX, biasX] = ridgeRegression(X, yX, lambda);
    const [coefY, biasY] = ridgeRegression(X, yY, lambda);

    this.model = { coefX, biasX, coefY, biasY, featureMean: mean, featureStd: std };
  }

  /** Map a raw feature vector to [screenFractionX, screenFractionY]. */
  predict(features: number[]): { x: number; y: number } | null {
    if (!this.model) return null;
    const { coefX, biasX, coefY, biasY, featureMean, featureStd } = this.model;
    const norm = features.map((v, i) => (v - featureMean[i]) / featureStd[i]);
    const x = clamp01(dot(coefX, norm) + biasX);
    const y = clamp01(dot(coefY, norm) + biasY);
    return { x, y };
  }

  toJSON(): CalibrationModel | null {
    return this.model;
  }

  loadJSON(model: CalibrationModel): void {
    this.model = model;
  }
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Closed-form ridge regression with a bias term.
 * Returns [coefficients (d-dim), bias].
 */
function ridgeRegression(X: number[][], y: number[], lambda: number): [number[], number] {
  const n = X.length;
  const d = X[0].length;
  // Augment X with a bias column of 1s → n × (d+1)
  const Xa = X.map((row) => [...row, 1]);
  const da = d + 1;

  // Compute X'X  (da × da)
  const XtX: number[][] = Array.from({ length: da }, () => new Array<number>(da).fill(0));
  for (let i = 0; i < da; i++) {
    for (let j = 0; j < da; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += Xa[k][i] * Xa[k][j];
      // Add ridge penalty on feature weights but NOT the bias
      XtX[i][j] = s + (i === j && i < d ? lambda * n : 0);
    }
  }

  // Compute X'y  (da-dim)
  const Xty = new Array<number>(da).fill(0);
  for (let i = 0; i < da; i++) {
    for (let k = 0; k < n; k++) Xty[i] += Xa[k][i] * y[k];
  }

  // Solve (X'X) w = X'y via Gaussian elimination
  const w = solveLinear(XtX, Xty);
  return [w.slice(0, d), w[d]];
}

/** Solve Ax = b via Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
    }
  }

  // Back-substitution
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = M[row][n];
    for (let col = row + 1; col < n; col++) x[row] -= M[row][col] * x[col];
    x[row] /= M[row][row] || 1;
  }
  return x;
}

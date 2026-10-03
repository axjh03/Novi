/** A single estimated gaze position on the screen. */
export interface GazePoint {
  /** Estimated X coordinate in CSS pixels from the left of the viewport. */
  x: number;
  /** Estimated Y coordinate in CSS pixels from the top of the viewport. */
  y: number;
  /** 0–1 confidence score from the iris landmarker. */
  confidence: number;
  /** Performance.now() timestamp. */
  timestamp: number;
  /** Normalized fraction [0, 1] relative to screen/viewport width */
  fractionX?: number;
  /** Normalized fraction [0, 1] relative to screen/viewport height */
  fractionY?: number;
}

/** A calibration sample collected during the 9-point flow. */
export interface CalibrationSample {
  /** Iris feature vector [leftIrisX, leftIrisY, rightIrisX, rightIrisY, headYaw, headPitch] */
  features: number[];
  /** Ground-truth screen fraction [0,1] x [0,1] */
  screenX: number;
  screenY: number;
}

/** Minimal ridge regression model stored after calibration. */
export interface CalibrationModel {
  /** Coefficients for screen-X as a linear combination of features + bias */
  coefX: number[];
  biasX: number;
  /** Coefficients for screen-Y */
  coefY: number[];
  biasY: number;
  /** Feature mean used for normalization */
  featureMean: number[];
  /** Feature std used for normalization */
  featureStd: number[];
}

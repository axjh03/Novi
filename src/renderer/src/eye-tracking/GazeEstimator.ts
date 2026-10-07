import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { GazePoint } from './GazeTypes';
import { GazeCalibrationModel } from './GazeCalibrationModel';

// Face mesh connection indices for drawing live visual wireframe
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109, 10
];

const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 61];

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

export class GazeEstimator {
  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private sampledVideoTime = -1;
  private frameFeatures: number[] | null = null;
  private _lastLandmarks: LandmarkPoint[] | null = null;
  private _faceDetected = false;
  private _headYaw = 0;
  private _headPitch = 0;
  readonly calibration = new GazeCalibrationModel();

  get lastLandmarks(): LandmarkPoint[] | null { return this._lastLandmarks; }
  get faceDetected(): boolean { return this._faceDetected; }
  get headYaw(): number { return this._headYaw; }
  get headPitch(): number { return this._headPitch; }

  async init(modelUrl: string): Promise<void> {
    const baseUrl = typeof window !== 'undefined' && window.location ? window.location.href : 'http://localhost/';
    const cleanModel = modelUrl.replace(/^\//, '');
    const resolvedModelUrl = new URL(cleanModel, baseUrl).href;
    const wasmPath = new URL('mediapipe-wasm', baseUrl).href;
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: resolvedModelUrl,
          delegate: 'GPU',
        },
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    } catch (gpuError) {
      console.warn('FaceLandmarker GPU delegate failed, falling back to CPU:', gpuError);
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: resolvedModelUrl,
          delegate: 'CPU',
        },
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    }
  }

  /** Extract normalized feature vector from landmarks for calibration and prediction */
  private computeFeatures(landmarks: LandmarkPoint[]): number[] | null {
    const lIris = landmarks[468];
    const rIris = landmarks[473];
    if (!lIris || !rIris) return null;

    // Eye corners and eyelids for relative normalization
    const lInner = landmarks[133], lOuter = landmarks[33], lTop = landmarks[159], lBottom = landmarks[145];
    const rInner = landmarks[362], rOuter = landmarks[263], rTop = landmarks[386], rBottom = landmarks[374];

    if (!lInner || !lOuter || !lTop || !lBottom || !rInner || !rOuter || !rTop || !rBottom) return null;

    // Calculate relative iris offsets inside eye sockets (independent of head position in frame)
    const lWidth = Math.max(0.001, Math.abs(lInner.x - lOuter.x));
    const lHeight = Math.max(0.001, Math.abs(lBottom.y - lTop.y));
    const lRelX = (lIris.x - Math.min(lInner.x, lOuter.x)) / lWidth;
    const lRelY = (lIris.y - lTop.y) / lHeight;

    const rWidth = Math.max(0.001, Math.abs(rOuter.x - rInner.x));
    const rHeight = Math.max(0.001, Math.abs(rBottom.y - rTop.y));
    // Reject closed/near-closed eyes instead of fitting blink-induced iris offsets.
    if (lHeight / lWidth < 0.15 || rHeight / rWidth < 0.15) return null;
    const rRelX = (rIris.x - Math.min(rInner.x, rOuter.x)) / rWidth;
    const rRelY = (rIris.y - rTop.y) / rHeight;

    return [
      lRelX, lRelY,
      rRelX, rRelY,
      this._headYaw, this._headPitch,
      lIris.x, lIris.y,
      rIris.x, rIris.y,
    ];
  }

  processFrame(video: HTMLVideoElement): GazePoint | null {
    if (!this.landmarker) return null;
    const now = performance.now();
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    this.frameFeatures = null;

    const result = this.landmarker.detectForVideo(video, now);
    if (!result.faceLandmarks?.length) {
      this._faceDetected = false;
      this._lastLandmarks = null;
      return null;
    }

    this._faceDetected = true;
    const landmarks = result.faceLandmarks[0] as LandmarkPoint[];
    this._lastLandmarks = landmarks;

    // Head orientation
    if (result.facialTransformationMatrixes?.length) {
      const m = result.facialTransformationMatrixes[0].data;
      this._headYaw = Math.atan2(m[2], m[10]);
      this._headPitch = Math.atan2(-m[6], Math.sqrt(m[5] * m[5] + m[7] * m[7]));
    }

    const features = this.computeFeatures(landmarks);
    if (!features || !features.every(Number.isFinite)) return null;
    this.frameFeatures = features;

    const pred = this.calibration.predict(features);

    let screenX: number;
    let screenY: number;
    let fx: number;
    let fy: number;
    let confidence: number;

    if (pred) {
      fx = pred.x;
      fy = pred.y;
      screenX = fx * window.innerWidth;
      screenY = fy * window.innerHeight;
      confidence = 0.90;
    } else {
      // Relative iris fallback mapped across [0, 1] screen coordinates
      const avgRelX = (features[0] + features[2]) / 2;
      const avgRelY = (features[1] + features[3]) / 2;
      
      // Amplify movement so it reaches edges (since uncalibrated range is small)
      const sensitivityX = 3.0;
      const rawFx = (avgRelX - 0.5) * sensitivityX + 0.5;
      
      // Capture baseline on first few frames assuming user is looking roughly at the screen
      if ((this as any).baselineY === undefined) {
        (this as any).baselineY = avgRelY;
      }
      
      // Adapt baseline faster so it doesn't get stuck if posture changes
      (this as any).baselineY = (this as any).baselineY * 0.995 + avgRelY * 0.005;

      const sensitivityY = 3.0; // Lowered to prevent clamping and sticking to top
      // Normal Y calculation (not inverted)
      const rawFy = 0.5 + ((avgRelY - (this as any).baselineY) * sensitivityY);

      // Mirror X because camera is flipped selfie mode
      fx = Math.max(0, Math.min(1, 1 - rawFx));
      fy = Math.max(0, Math.min(1, rawFy));
      screenX = fx * window.innerWidth;
      screenY = fy * window.innerHeight;
      confidence = 0.40;
    }

    return { x: screenX, y: screenY, fractionX: fx, fractionY: fy, confidence, timestamp: now };
  }

  extractFeatures(video: HTMLVideoElement): number[] | null {
    if (video.readyState < 2 || !this.frameFeatures || this.sampledVideoTime === this.lastVideoTime) return null;
    this.sampledVideoTime = this.lastVideoTime;
    return [...this.frameFeatures];
  }

  /**
   * Render real-time face mesh wireframe + iris reticles on any canvas
   */
  drawFaceMeshPreview(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw video feed (mirrored selfie mode)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    // Subtle dark tint for high-contrast glowing mesh
    ctx.fillStyle = 'rgba(10, 16, 12, 0.4)';
    ctx.fillRect(0, 0, w, h);

    const landmarks = this._lastLandmarks;
    if (!landmarks || !this._faceDetected) {
      ctx.fillStyle = '#f6ad55';
      ctx.font = '12px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Searching for face…', w / 2, h / 2);
      return;
    }

    // Helper to mirror coordinate onto canvas
    const toCanvas = (p: LandmarkPoint) => ({
      x: (1 - p.x) * w,
      y: p.y * h,
    });

    const drawLoop = (indices: number[], color: string, lineWidth = 1) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      for (let i = 0; i < indices.length; i++) {
        const pt = toCanvas(landmarks[indices[i]]);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    };

    // 2. Draw Face Oval Wireframe (translucent cyan)
    drawLoop(FACE_OVAL, 'rgba(104, 211, 145, 0.35)', 1);

    // 3. Draw Lips (subtle green)
    drawLoop(LIPS, 'rgba(104, 211, 145, 0.45)', 1);

    // 4. Draw Eye Outlines (bright cyan)
    drawLoop(LEFT_EYE, '#63b3ed', 1.5);
    drawLoop(RIGHT_EYE, '#63b3ed', 1.5);

    // 5. Draw Irises and Pupil Crosshairs (neon green)
    const leftIris = toCanvas(landmarks[468]);
    const rightIris = toCanvas(landmarks[473]);

    [leftIris, rightIris].forEach((iris) => {
      // Glow ring
      ctx.beginPath();
      ctx.arc(iris.x, iris.y, 8, 0, 2 * Math.PI);
      ctx.strokeStyle = '#68d391';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#68d391';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Center pupil dot
      ctx.beginPath();
      ctx.arc(iris.x, iris.y, 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Crosshair
      ctx.strokeStyle = 'rgba(104, 211, 145, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(iris.x - 12, iris.y);
      ctx.lineTo(iris.x + 12, iris.y);
      ctx.moveTo(iris.x, iris.y - 12);
      ctx.lineTo(iris.x, iris.y + 12);
      ctx.stroke();
    });

    // 6. Status overlay badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(8, h - 26, w - 16, 20);
    ctx.fillStyle = '#68d391';
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('✓ 478 Mesh Points • Both Irises Locked', 14, h - 12);
  }

  destroy(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this._lastLandmarks = null;
  }
}

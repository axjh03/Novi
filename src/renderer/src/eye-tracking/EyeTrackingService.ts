import type { GazePoint, CalibrationSample } from './GazeTypes';
import { CameraService, type CameraDevice } from './CameraService';
import { GazeSmoother } from './GazeSmoother';
import { DwellDetector } from './DwellDetector';
import { GazeEstimator } from './GazeEstimator';
import type { MonitorDisplay } from '../../../shared/types';
import { CALIBRATION_POINTS, CALIBRATION_SAMPLES_PER_POINT } from './calibrationPlan';

type GazeListener = (point: GazePoint) => void;
type DwellListener = (point: { x: number; y: number }) => void;

export type EyeTrackingState =
  | 'idle'
  | 'initializing'
  | 'calibrating'
  | 'running'
  | 'error';

/**
 * EyeTrackingService — the public façade for the entire eye-tracking pipeline.
 */
export class EyeTrackingService {
  private camera: CameraService | null = null;
  private estimator: GazeEstimator | null = null;
  private smoother = new GazeSmoother(0.12);
  private dwell = new DwellDetector(80, 450);
  private rafId: number | null = null;
  private gazeListeners = new Set<GazeListener>();
  private dwellListeners = new Set<DwellListener>();
  private _state: EyeTrackingState = 'idle';
  private _error = '';
  private _cameras: CameraDevice[] = [];
  private _selectedCameraId: string | undefined = undefined;
  private _monitors: MonitorDisplay[] = [];
  private _selectedDisplayId: number | null = null;
  private _overlayActive = false;
  private session = 0;

  get state(): EyeTrackingState { return this._state; }
  get error(): string { return this._error; }
  get isCalibrated(): boolean { return this.estimator?.calibration.isCalibrated ?? false; }
  get calibrationSamples(): number { return this.estimator?.calibration.sampleCount ?? 0; }
  get cameras(): CameraDevice[] { return this._cameras; }
  get selectedCameraId(): string | undefined { return this._selectedCameraId; }
  get monitors(): MonitorDisplay[] { return this._monitors; }
  get selectedDisplayId(): number | null { return this._selectedDisplayId; }
  get overlayActive(): boolean { return this._overlayActive; }
  get faceDetected(): boolean { return this.estimator?.faceDetected ?? false; }

  /** Draw live mirrored webcam feed with full 478-point FaceMesh and iris reticles onto canvas. */
  drawFaceMeshPreview(canvas: HTMLCanvasElement): void {
    if (this.estimator && this.camera && this.camera.active) {
      this.estimator.drawFaceMeshPreview(canvas, this.camera.video);
    }
  }

  /** Enumerate all monitors. */
  async listMonitors(): Promise<MonitorDisplay[]> {
    try {
      const res = await window.novi.getMonitors();
      if (res.ok) {
        this._monitors = res.value;
        if (!this._selectedDisplayId && res.value.length > 0) {
          const primary = res.value.find((m) => m.isPrimary) || res.value[0];
          this._selectedDisplayId = primary.id;
        }
      }
    } catch {
      this._monitors = [];
    }
    return this._monitors;
  }

  /** Open the transparent sticky overlay window on the selected monitor. */
  async openOverlay(displayId?: number): Promise<void> {
    if (this._state !== 'running' && this._state !== 'calibrating') return;
    const session = this.session;
    const id = displayId ?? this._selectedDisplayId;
    if (id === null || id === undefined) return;
    this._selectedDisplayId = id;
    const res = await window.novi.openOverlay(id);
    if (res.ok && session === this.session) {
      this._overlayActive = true;
    }
  }

  /** Close the overlay window. */
  async closeOverlay(): Promise<void> {
    this._overlayActive = false;
    await window.novi.closeOverlay();
  }

  /** Select a monitor without opening the overlay. */
  setMonitor(displayId: number): void {
    const changed = this._selectedDisplayId !== displayId;
    this._selectedDisplayId = displayId;
    if (changed && this.estimator) this.recalibrate();
  }

  /** Send a sticky note or response message to the screen overlay. */
  sendStickyToOverlay(text: string, title?: string): void {
    if (this._overlayActive) {
      void window.novi.sendOverlayEvent({
        type: 'set-content',
        text,
        title: title || 'Astra Sticky Note',
      });
    }
  }

  /** Enumerate all connected video cameras. Safe to call before start(). */
  async listCameras(): Promise<CameraDevice[]> {
    try {
      this._cameras = await CameraService.listCameras();
    } catch {
      this._cameras = [];
    }
    return this._cameras;
  }

  /** Select a specific camera by deviceId before or after starting. */
  async switchCamera(deviceId: string): Promise<void> {
    this._selectedCameraId = deviceId;
    // If already running, hot-swap the camera stream
    if (this.camera?.active) {
      try {
        await this.camera.start(deviceId);
        this.recalibrate();
      } catch (err) {
        this._error = err instanceof Error ? err.message : String(err);
        this._state = 'error';
        this.stopLoop();
        this.cleanup();
      }
    }
  }

  /** Start the camera + MediaPipe only after the user explicitly enables tracking. */
  async start(deviceId?: string): Promise<void> {
    if (this._state !== 'idle') return;
    const session = ++this.session;
    if (deviceId) this._selectedCameraId = deviceId;
    this._state = 'initializing';
    this._error = '';
    try {
      const camera = this.camera = new CameraService();
      await camera.start(this._selectedCameraId);
      if (session !== this.session) { camera.stop(); return; }

      const estimator = this.estimator = new GazeEstimator();
      // The model is served from the renderer's public folder
      await estimator.init('/eye-tracking/face_landmarker.task');
      if (session !== this.session) { estimator.destroy(); return; }

      this._state = 'calibrating';

      if (!this._overlayActive) {
        if (this._monitors.length === 0) await this.listMonitors();
        if (session !== this.session) return;
        await this.openOverlay();
      }

      if (session !== this.session) return;
      this.startLoop();
    } catch (err) {
      if (session !== this.session) return;
      this._error = err instanceof Error ? err.message : String(err);
      this._state = 'error';
      this.cleanup();
    }
  }

  /** Tell the overlay to show a calibration dot */
  setCalibrationStep(index: number, x: number, y: number): void {
    if (this._overlayActive) {
      void window.novi.sendOverlayEvent({
        type: 'calibration-step',
        index,
        x,
        y
      });
    }
  }

  /** Hide the calibration dot in the overlay */
  stopCalibrationStep(): void {
    if (this._overlayActive) {
      void window.novi.sendOverlayEvent({
        type: 'calibration-stop'
      });
    }
  }

  /** Add a calibration sample for the given screen position (0..1 fractions). */
  addCalibrationSample(screenFractionX: number, screenFractionY: number): boolean {
    if (this._state !== 'calibrating' || !this.estimator || !this.camera) return false;
    const features = this.estimator.extractFeatures(this.camera.video);
    if (!features) return false;
    const sample: CalibrationSample = { features, screenX: screenFractionX, screenY: screenFractionY };
    this.estimator.calibration.addSample(sample);
    return true;
  }

  /** Train the model and transition to 'running'. */
  finishCalibration(): void {
    if (!this.estimator || this._state !== 'calibrating') return;
    if (this.calibrationSamples < CALIBRATION_POINTS.length * CALIBRATION_SAMPLES_PER_POINT) {
      throw new Error('Complete all 25 targets before starting calibrated tracking.');
    }
    this.estimator.calibration.train();
    this.stopCalibrationStep();
    this.smoother.reset();
    this.dwell.reset();
    this._state = 'running';
    this.sendStickyToOverlay('Extreme calibration complete. Look around to position your response.');
    this.startLoop();
  }

  /** Restart calibration without stopping the camera. */
  recalibrate(): void {
    if (!this.estimator || !this.camera) return;
    this.estimator?.calibration.clearSamples();
    this.smoother.reset();
    this.dwell.reset();
    this._state = 'calibrating';
    this.startLoop();
  }

  /** Subscribe to raw (smoothed) gaze points emitted every frame. */
  onGaze(listener: GazeListener): () => void {
    this.gazeListeners.add(listener);
    return () => this.gazeListeners.delete(listener);
  }

  /** Subscribe to stable dwell events (user held gaze ~450ms). */
  onDwell(listener: DwellListener): () => void {
    this.dwellListeners.add(listener);
    return () => this.dwellListeners.delete(listener);
  }

  stop(): void {
    ++this.session;
    this._state = 'idle';
    this.stopLoop();
    this.cleanup();
    this.smoother.reset();
    this.dwell.reset();
  }

  setDwellMs(ms: number): void { this.dwell.setDwellMs(ms); }
  setSmoothingAlpha(alpha: number): void { this.smoother.setAlpha(alpha); }

  // -------------------------------------------------------------------------
  private startLoop(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      if ((this._state !== 'running' && this._state !== 'calibrating') || !this.camera || !this.estimator) {
        this.rafId = null;
        return;
      }
      const raw = this.estimator.processFrame(this.camera.video);
      if (raw) {
        const { x, y } = this.smoother.update(raw.x, raw.y);
        const point: GazePoint = { ...raw, x, y };
        this.gazeListeners.forEach((l) => l(point));

        const fractionX = raw.fractionX ?? (x / window.innerWidth);
        const fractionY = raw.fractionY ?? (y / window.innerHeight);

        if (this._overlayActive && this._state === 'running') {
          void window.novi.sendOverlayEvent({
            type: 'gaze',
            x: fractionX,
            y: fractionY,
            confidence: raw.confidence,
          });
        }

        const dwell = this.dwell.update(x, y, raw.timestamp);
        if (dwell) {
          this.dwellListeners.forEach((l) => l(dwell));
          if (this._overlayActive && this._state === 'running') {
            void window.novi.sendOverlayEvent({
              type: 'dwell',
              x: fractionX,
              y: fractionY,
            });
          }
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  private cleanup(): void {
    void this.closeOverlay().catch((err: unknown) => {
      this._error = err instanceof Error ? err.message : String(err);
    });
    this.estimator?.destroy();
    this.estimator = null;
    this.camera?.stop();
    this.camera = null;
  }
}

/** Singleton for the renderer process. */
export const eyeTracking = new EyeTrackingService();

import { useCallback, useEffect, useRef, useState } from 'react';
import { eyeTracking, type EyeTrackingState } from '../eye-tracking/EyeTrackingService';
import type { CameraDevice } from '../eye-tracking/CameraService';
import type { GazePoint } from '../eye-tracking/GazeTypes';
import type { MonitorDisplay } from '../../../shared/types';

export interface UseEyeTrackingReturn {
  state: EyeTrackingState;
  error: string;
  gaze: GazePoint | null;
  dwellPoint: { x: number; y: number } | null;
  isCalibrated: boolean;
  calibrationSamples: number;
  sensitivity: number;
  setSensitivity: (val: number) => void;
  cameras: CameraDevice[];
  selectedCameraId: string | undefined;
  monitors: MonitorDisplay[];
  selectedDisplayId: number | null;
  overlayActive: boolean;
  start: (deviceId?: string) => Promise<void>;
  stop: () => void;
  listCameras: () => Promise<CameraDevice[]>;
  switchCamera: (deviceId: string) => Promise<void>;
  listMonitors: () => Promise<MonitorDisplay[]>;
  openOverlay: (displayId?: number) => Promise<void>;
  closeOverlay: () => Promise<void>;
  sendStickyToOverlay: (text: string, title?: string) => void;
  addCalibrationSample: (fx: number, fy: number) => boolean;
  finishCalibration: () => void;
  recalibrate: () => void;
  startUncalibrated: () => void;
  setMonitor: (displayId: number) => void;
}

export function useEyeTracking(): UseEyeTrackingReturn {
  const [state, setState] = useState<EyeTrackingState>(eyeTracking.state);
  const [error, setError] = useState(eyeTracking.error);
  const [gaze, setGaze] = useState<GazePoint | null>(null);
  const [dwellPoint, setDwellPoint] = useState<{ x: number; y: number } | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(eyeTracking.isCalibrated);
  const [calibrationSamples, setCalibrationSamples] = useState(eyeTracking.calibrationSamples);
  const [sensitivity, setSensitivityState] = useState<number>(eyeTracking.sensitivity);
  const [cameras, setCameras] = useState<CameraDevice[]>(eyeTracking.cameras);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(eyeTracking.selectedCameraId);
  const [monitors, setMonitors] = useState<MonitorDisplay[]>(eyeTracking.monitors);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | null>(eyeTracking.selectedDisplayId);
  const [overlayActive, setOverlayActive] = useState(eyeTracking.overlayActive);

  // Sync state from service to React
  const syncState = useCallback(() => {
    setState(eyeTracking.state);
    setError(eyeTracking.error);
    setIsCalibrated(eyeTracking.isCalibrated);
    setCalibrationSamples(eyeTracking.calibrationSamples);
    setSensitivityState(eyeTracking.sensitivity);
    setSelectedCameraId(eyeTracking.selectedCameraId);
    setOverlayActive(eyeTracking.overlayActive);
    setSelectedDisplayId(eyeTracking.selectedDisplayId);
  }, []);

  useEffect(() => {
    // Throttle gaze re-renders to ~30fps to avoid hammering React reconciler
    let lastRender = 0;
    const THROTTLE_MS = 33;

    const unsubGaze = eyeTracking.onGaze((point) => {
      const now = performance.now();
      if (now - lastRender > THROTTLE_MS) {
        lastRender = now;
        setGaze(point);
      }
    });

    const unsubDwell = eyeTracking.onDwell((point) => {
      setDwellPoint(point);
    });

    return () => {
      unsubGaze();
      unsubDwell();
      eyeTracking.stop();
    };
  }, []);

  const listCameras = useCallback(async () => {
    const list = await eyeTracking.listCameras();
    setCameras(list);
    return list;
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    const pending = eyeTracking.start(deviceId);
    syncState();
    await pending;
    syncState();
  }, [syncState]);

  const stop = useCallback(() => {
    eyeTracking.stop();
    setGaze(null);
    setDwellPoint(null);
    syncState();
  }, [syncState]);

  const switchCamera = useCallback(async (deviceId: string) => {
    await eyeTracking.switchCamera(deviceId);
    setSelectedCameraId(deviceId);
    syncState();
  }, [syncState]);

  const addCalibrationSample = useCallback((fx: number, fy: number) => {
    const ok = eyeTracking.addCalibrationSample(fx, fy);
    setCalibrationSamples(eyeTracking.calibrationSamples);
    return ok;
  }, []);

  const finishCalibration = useCallback(() => {
    eyeTracking.finishCalibration();
    syncState();
  }, [syncState]);

  const listMonitors = useCallback(async () => {
    const list = await eyeTracking.listMonitors();
    setMonitors(list);
    setSelectedDisplayId(eyeTracking.selectedDisplayId);
    return list;
  }, []);

  const openOverlay = useCallback(async (displayId?: number) => {
    await eyeTracking.openOverlay(displayId);
    setOverlayActive(eyeTracking.overlayActive);
    setSelectedDisplayId(eyeTracking.selectedDisplayId);
  }, []);

  const closeOverlay = useCallback(async () => {
    await eyeTracking.closeOverlay();
    setOverlayActive(false);
  }, []);

  const sendStickyToOverlay = useCallback((text: string, title?: string) => {
    eyeTracking.sendStickyToOverlay(text, title);
  }, []);

  const recalibrate = useCallback(() => {
    eyeTracking.recalibrate();
    syncState();
  }, [syncState]);

  const startUncalibrated = useCallback(() => {
    eyeTracking.startUncalibrated();
    syncState();
  }, [syncState]);

  const setMonitor = useCallback((displayId: number) => {
    eyeTracking.setMonitor(displayId);
    setSelectedDisplayId(displayId);
    syncState();
  }, [syncState]);

  const setSensitivity = useCallback((val: number) => {
    eyeTracking.setSensitivity(val);
    setSensitivityState(eyeTracking.sensitivity);
  }, []);

  return {
    state, error, gaze, dwellPoint, isCalibrated, calibrationSamples,
    sensitivity, setSensitivity,
    cameras, selectedCameraId,
    monitors, selectedDisplayId, overlayActive,
    start, stop, listCameras, switchCamera,
    listMonitors, openOverlay, closeOverlay, sendStickyToOverlay,
    addCalibrationSample, finishCalibration, recalibrate, startUncalibrated, setMonitor
  };
}

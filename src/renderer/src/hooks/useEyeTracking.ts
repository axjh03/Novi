import { useCallback, useEffect, useRef, useState } from 'react';
import { eyeTracking, type EyeTrackingState } from '../eye-tracking/EyeTrackingService';
import type { CameraDevice } from '../eye-tracking/CameraService';
import type { MonitorDisplay } from '../../../shared/types';

export interface UseEyeTrackingReturn {
  state: EyeTrackingState;
  error: string;
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

  // The live gaze point is drawn by the overlay window, not here: keeping it in this hook's state
  // re-rendered the whole chat page about 30 times a second.
  useEffect(() => () => { eyeTracking.stop(); }, []);

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
    syncState();
  }, [syncState]);

  useEffect(() => window.novi.onOverlayEvent(event => {
    if (event.type === 'close' && (eyeTracking.state !== 'idle' || eyeTracking.overlayActive)) stop();
  }), [stop]);

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
    syncState();
  }, [syncState]);

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
    state, error, isCalibrated, calibrationSamples,
    sensitivity, setSensitivity,
    cameras, selectedCameraId,
    monitors, selectedDisplayId, overlayActive,
    start, stop, listCameras, switchCamera,
    listMonitors, openOverlay, closeOverlay, sendStickyToOverlay,
    addCalibrationSample, finishCalibration, recalibrate, startUncalibrated, setMonitor
  };
}

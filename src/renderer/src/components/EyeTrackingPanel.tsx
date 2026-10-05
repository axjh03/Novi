import { useEffect, useRef, useState } from 'react';
import {
  Eye, EyeOff, RefreshCw, Loader, Camera, ChevronDown,
  AlertCircle, Monitor, Send, Check
} from 'lucide-react';
import type { EyeTrackingState } from '../eye-tracking/EyeTrackingService';
import type { CameraDevice } from '../eye-tracking/CameraService';
import type { MonitorDisplay } from '../../../shared/types';

interface Props {
  state: EyeTrackingState;
  error: string;
  isCalibrated: boolean;
  showDebugDot: boolean;
  cameras: CameraDevice[];
  selectedCameraId: string | undefined;
  monitors: MonitorDisplay[];
  selectedDisplayId: number | null;
  overlayActive: boolean;
  onToggle: () => void;
  onToggleDebug: () => void;
  onListCameras: () => Promise<CameraDevice[]>;
  onSwitchCamera: (deviceId: string) => Promise<void>;
  onListMonitors: () => Promise<MonitorDisplay[]>;
  onOpenOverlay: (displayId?: number) => Promise<void>;
  onCloseOverlay: () => Promise<void>;
  onSetMonitor: (displayId: number) => void;
  onSendSticky: (text: string, title?: string) => void;
}

const STATE_LABELS: Record<EyeTrackingState, string> = {
  idle: 'Eye Track',
  initializing: 'Loading…',
  calibrating: 'Calibrating…',
  running: 'Active',
  error: 'Error',
};

export function EyeTrackingPanel({
  state, error, isCalibrated, showDebugDot,
  cameras, selectedCameraId,
  monitors, selectedDisplayId, overlayActive,
  onToggle, onToggleDebug,
  onListCameras, onSwitchCamera,
  onListMonitors, onOpenOverlay, onCloseOverlay, onSetMonitor, onSendSticky,
}: Props) {
  const isOn = state !== 'idle' && state !== 'error';
  const isLoading = state === 'initializing';

  const [cameraPickerOpen, setCameraPickerOpen] = useState(false);
  const [monitorPickerOpen, setMonitorPickerOpen] = useState(false);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [loadingMonitors, setLoadingMonitors] = useState(false);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [stickyInput, setStickyInput] = useState('');
  const [stickySent, setStickySent] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const cameraPickerRef = useRef<HTMLDivElement>(null);
  const monitorPickerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  // Manage live camera preview inside dropdown
  useEffect(() => {
    if (!showPreview || !cameraPickerOpen) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      return;
    }
    let active = true;
    async function loadPreview() {
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedCameraId ? { deviceId: { ideal: selectedCameraId } } : true,
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          previewVideoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn('Camera dropdown preview error:', err);
      }
    }
    void loadPreview();
    return () => {
      active = false;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, [showPreview, cameraPickerOpen, selectedCameraId]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cameraPickerRef.current && !cameraPickerRef.current.contains(e.target as Node)) {
        setCameraPickerOpen(false);
      }
      if (monitorPickerRef.current && !monitorPickerRef.current.contains(e.target as Node)) {
        setMonitorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpenCameras = async () => {
    if (cameraPickerOpen) { setCameraPickerOpen(false); return; }
    setMonitorPickerOpen(false);
    setLoadingCameras(true);
    setCameraPickerOpen(true);
    try {
      await onListCameras();
    } finally {
      setLoadingCameras(false);
    }
  };

  const handleOpenMonitors = async () => {
    if (monitorPickerOpen) { setMonitorPickerOpen(false); return; }
    setCameraPickerOpen(false);
    setLoadingMonitors(true);
    setMonitorPickerOpen(true);
    try {
      await onListMonitors();
    } finally {
      setLoadingMonitors(false);
    }
  };

  const handleSelectCamera = async (deviceId: string) => {
    await onSwitchCamera(deviceId);
  };

  const handleSelectMonitor = async (displayId: number) => {
    onSetMonitor(displayId);
    if (overlayActive) {
      await onOpenOverlay(displayId);
    }
  };

  const handleToggleOverlay = async () => {
    if (overlayActive) {
      await onCloseOverlay();
    } else {
      await onOpenOverlay(selectedDisplayId ?? undefined);
    }
  };

  const handleSendCustomSticky = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = stickyInput.trim() || 'Look anywhere to summon this sticky box with your gaze.';
    onSendSticky(textToSend, 'Novi Screen Sticky');
    setStickySent(true);
    setTimeout(() => setStickySent(false), 2000);
  };

  const selectedCamera = cameras.find((c) => c.deviceId === selectedCameraId);
  const selectedMonitor = monitors.find((m) => m.id === selectedDisplayId) || monitors[0];

  return (
    <div className="eye-tracking-panel">
      {/* 1. Main Eye Tracking Toggle */}
      <button
        className={`eye-tracking-toggle ${isOn ? 'eye-tracking-toggle--on' : ''}`}
        onClick={state === 'error' ? undefined : onToggle}
        aria-pressed={isOn}
        title={isOn ? 'Disable eye tracking' : 'Enable eye tracking'}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader size={14} className="spin" />
        ) : isOn ? (
          <Eye size={14} />
        ) : (
          <EyeOff size={14} />
        )}
        <span>{STATE_LABELS[state]}</span>
        {state === 'running' && (
          <span className="eye-tracking-status-dot" aria-hidden="true" />
        )}
      </button>

      {/* 2. Camera Picker Dropdown */}
      <div className="et-camera-picker" ref={cameraPickerRef}>
        <button
          className={`et-camera-btn ${cameraPickerOpen ? 'et-camera-btn--open' : ''}`}
          onClick={() => void handleOpenCameras()}
          title={selectedCamera ? selectedCamera.label : 'Select camera'}
          disabled={isLoading}
        >
          <Camera size={13} />
          <span className="et-camera-label">
            {selectedCamera
              ? selectedCamera.label.replace(/\(.*?\)/, '').trim().slice(0, 16) || 'Camera'
              : 'Camera'}
          </span>
          <ChevronDown size={11} />
        </button>

        {cameraPickerOpen && (
          <div className="et-camera-dropdown">
            <div className="et-camera-dropdown-header">Select Camera</div>
            {loadingCameras ? (
              <div className="et-camera-loading">
                <Loader size={13} className="spin" /> Detecting cameras…
              </div>
            ) : cameras.length === 0 ? (
              <div className="et-camera-empty">
                No cameras found.<br />Check Windows permissions.
              </div>
            ) : (
              cameras.map((cam) => (
                <button
                  key={cam.deviceId}
                  className={`et-camera-option ${cam.deviceId === selectedCameraId ? 'et-camera-option--active' : ''}`}
                  onClick={() => void handleSelectCamera(cam.deviceId)}
                >
                  <Camera size={11} />
                  <span>{cam.label}</span>
                  {cam.deviceId === selectedCameraId && (
                    <span className="et-camera-check">✓</span>
                  )}
                </button>
              ))
            )}

            <div className="et-dropdown-divider" />
            <button
              type="button"
              className="et-preview-toggle-btn"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye size={11} /> {showPreview ? 'Hide Camera Preview' : 'Show Live Camera Preview'}
            </button>
            {showPreview && (
              <div className="et-camera-preview-box">
                <video ref={previewVideoRef} autoPlay playsInline muted className="et-camera-preview-video" />
                <div className="et-camera-preview-tag">LIVE PREVIEW</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Multi-Monitor Overlay Picker & Controls */}
      <div className="et-camera-picker" ref={monitorPickerRef}>
        <button
          className={`et-camera-btn ${overlayActive ? 'et-camera-btn--active' : ''} ${monitorPickerOpen ? 'et-camera-btn--open' : ''}`}
          onClick={() => void handleOpenMonitors()}
          title="Choose monitor for transparent screen overlay"
        >
          <Monitor size={13} />
          <span className="et-camera-label">
            {overlayActive
              ? `HUD (${selectedMonitor ? selectedMonitor.label.slice(0, 10) : 'Active'})`
              : selectedMonitor
              ? selectedMonitor.label.slice(0, 12)
              : 'Monitor'}
          </span>
          <ChevronDown size={11} />
        </button>

        {monitorPickerOpen && (
          <div className="et-camera-dropdown et-monitor-dropdown">
            <div className="et-camera-dropdown-header">
              <span>Monitor Screen Overlay</span>
              <span className="overlay-desc-tag">Sticky HUD</span>
            </div>

            {/* Overlay toggle switch inside dropdown */}
            <div className="et-overlay-switch-row">
              <div className="et-overlay-switch-info">
                <strong>Floating Screen HUD</strong>
                <small>Transparent sticky note anywhere on your monitor</small>
              </div>
              <button
                className={`et-overlay-toggle-btn ${overlayActive ? 'et-overlay-toggle-btn--on' : ''}`}
                onClick={() => void handleToggleOverlay()}
                disabled={!isOn || isLoading}
                title={!isOn ? 'Enable eye tracking to show the HUD' : 'Toggle screen HUD'}
              >
                {overlayActive ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div className="et-dropdown-divider" />
            <div className="et-dropdown-section-title">Select Target Monitor:</div>

            {loadingMonitors ? (
              <div className="et-camera-loading">
                <Loader size={13} className="spin" /> Detecting monitors…
              </div>
            ) : monitors.length === 0 ? (
              <div className="et-camera-empty">
                Detecting monitors… click to refresh.
              </div>
            ) : (
              monitors.map((m) => (
                <button
                  key={m.id}
                  className={`et-camera-option ${m.id === selectedDisplayId ? 'et-camera-option--active' : ''}`}
                  onClick={() => void handleSelectMonitor(m.id)}
                >
                  <Monitor size={12} />
                  <span>
                    {m.label} {m.isPrimary ? '(Primary)' : ''}
                  </span>
                  {m.id === selectedDisplayId && (
                    <span className="et-camera-check">✓</span>
                  )}
                </button>
              ))
            )}

            {/* Quick Sticky Sender */}
            {overlayActive && (
              <>
                <div className="et-dropdown-divider" />
                <div className="et-dropdown-section-title">Send Sticky to Screen:</div>
                <form className="et-sticky-quick-form" onSubmit={handleSendCustomSticky}>
                  <input
                    type="text"
                    placeholder="Type sticky note or quick prompt…"
                    value={stickyInput}
                    onChange={(e) => setStickyInput(e.target.value)}
                    className="et-sticky-input"
                  />
                  <button type="submit" className="et-sticky-send-btn" title="Send to screen overlay">
                    {stickySent ? <Check size={12} /> : <Send size={12} />}
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      {/* 4. Running Controls */}
      {state === 'running' && (
        <>
          <button
            className={`icon-button ${showDebugDot ? 'eye-tracking-debug--on' : ''}`}
            onClick={onToggleDebug}
            title={showDebugDot ? 'Hide gaze dot' : 'Show gaze dot'}
          >
            <Eye size={14} />
          </button>
        </>
      )}

      {/* 5. Error state */}
      {state === 'error' && (
        <div className="et-error-wrap">
          <button
            className="et-error-btn"
            onClick={() => setErrorExpanded((v) => !v)}
            title={error}
          >
            <AlertCircle size={13} />
            <span>Camera error</span>
            <ChevronDown
              size={11}
              style={{
                transform: errorExpanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 140ms',
              }}
            />
          </button>
          {errorExpanded && (
            <div className="et-error-detail">
              <p>{error || 'Could not access camera.'}</p>
              <div className="et-error-tips">
                <strong>Try:</strong>
                <ul>
                  <li>Select a different camera above</li>
                  <li>Close other apps using the camera</li>
                  <li>Check Windows camera privacy settings</li>
                </ul>
              </div>
              <button className="et-retry-btn" onClick={onToggle}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { eyeTracking } from '../eye-tracking/EyeTrackingService';
import {
  CALIBRATION_POINTS, CALIBRATION_SAMPLES_PER_POINT,
  CALIBRATION_SETTLE_MS, CALIBRATION_SAMPLE_INTERVAL_MS,
} from '../eye-tracking/calibrationPlan';

interface Props {
  onAddSample: (fx: number, fy: number) => boolean;
  onFinish: () => void;
  onCancel: () => void;
  onSkip?: () => void;
}

export function GazeCalibration({ onAddSample, onFinish, onCancel, onSkip }: Props) {
  const [pointIndex, setPointIndex] = useState(0);
  const [samples, setSamples] = useState(0);
  const [status, setStatus] = useState('Preparing target on your selected monitor…');
  const [error, setError] = useState('');
  const done = pointIndex === CALIBRATION_POINTS.length;
  const progress = ((pointIndex + samples / CALIBRATION_SAMPLES_PER_POINT) / CALIBRATION_POINTS.length) * 100;

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [onCancel]);

  useEffect(() => {
    if (done) return;
    const [x, y] = CALIBRATION_POINTS[pointIndex];
    let shownAt: number | null = null;
    let lastSample = 0;
    let accepted = 0;
    let raf = 0;
    setSamples(0);
    setStatus('Preparing target on your selected monitor…');
    const unsubscribe = window.novi.onOverlayEvent((event) => {
      if (event.type === 'calibration-target-shown' && event.index === pointIndex && shownAt === null) {
        shownAt = performance.now();
      }
    });
    const showTarget = () => eyeTracking.setCalibrationStep(pointIndex, x, y);
    showTarget();
    // The overlay may still be loading when the first event is sent, or user may be on a single monitor.
    const retry = window.setInterval(() => { if (shownAt === null) showTarget(); }, 300);
    const fallbackTimer = window.setTimeout(() => {
      if (shownAt === null) shownAt = performance.now();
    }, 400);

    const collect = (now: number) => {
      if (shownAt !== null && now - shownAt >= CALIBRATION_SETTLE_MS) {
        if (now - lastSample >= CALIBRATION_SAMPLE_INTERVAL_MS) {
          lastSample = now;
          if (onAddSample(x, y)) {
            accepted++;
            setSamples(accepted);
            setStatus('Keep looking at the dot. Hold your head comfortably still.');
          } else {
            setStatus('Waiting for a fresh, visible-eye frame. Keep your face lit and eyes open.');
          }
        }
        if (accepted === CALIBRATION_SAMPLES_PER_POINT) {
          setSamples(0);
          setPointIndex((index) => index + 1);
          return;
        }
      } else if (shownAt !== null) {
        setStatus('Look at the dot. Settling before collection…');
      }
      raf = requestAnimationFrame(collect);
    };
    raf = requestAnimationFrame(collect);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(retry);
      clearTimeout(fallbackTimer);
      unsubscribe();
      eyeTracking.stopCalibrationStep();
    };
  }, [pointIndex, done, onAddSample]);

  return (
    <div className="calibration-overlay" role="dialog" aria-modal="true" aria-label="Extreme eye tracking calibration">
      <div className="calibration-backdrop" />
      {!done && CALIBRATION_POINTS[pointIndex] && (
        <div
          className="calibration-screen-target"
          style={{
            position: 'fixed',
            left: `${CALIBRATION_POINTS[pointIndex][0] * 100}vw`,
            top: `${CALIBRATION_POINTS[pointIndex][1] * 100}vh`,
            transform: 'translate(-50%, -50%)',
            zIndex: 99999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            position: 'absolute',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.25)',
            border: '2px solid rgba(239, 68, 68, 0.75)',
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.5)',
          }} />
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 8px #ef4444',
          }} />
        </div>
      )}
      <section className="calibration-done-panel">
        <Eye size={28} />
        <h2>{done ? 'All 1,000 samples collected' : 'Extreme calibration'}</h2>
        <p>25 targets · 40 distinct frames each · about 2–3 minutes. Look at each dot on your selected monitor, not this panel. Collection pauses when eyes are not visible.</p>
        <progress aria-label="Calibration progress" max={100} value={progress} style={{ width: '100%' }} />
        <p>{done ? 'Ready to fit your personal gaze model.' : `Target ${pointIndex + 1}/25 · ${samples}/40 frames`}</p>
        {!done && <p role="status">{status}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <p>Stay in the same position afterward. Calibration is session-only; changing camera or monitor requires a new pass.</p>
        <div className="calibration-done-actions" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="text-button" onClick={onCancel}>Cancel & turn off</button>
          {onSkip && !done && (
            <button type="button" className="secondary" onClick={onSkip} title="Start using eye tracking immediately with direct relative iris tracking">
              Quick start (Skip calibration)
            </button>
          )}
          {done && <button className="primary" onClick={() => {
            try { onFinish(); } catch (err) { setError(err instanceof Error ? err.message : 'Calibration could not be fitted. Please retry.'); }
          }}>Use calibrated tracking</button>}
        </div>
      </section>
    </div>
  );
}

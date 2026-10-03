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
}

export function GazeCalibration({ onAddSample, onFinish, onCancel }: Props) {
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
    // The overlay may still be loading when the first event is sent.
    const retry = window.setInterval(() => { if (shownAt === null) showTarget(); }, 300);
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
      unsubscribe();
      eyeTracking.stopCalibrationStep();
    };
  }, [pointIndex, done, onAddSample]);

  return (
    <div className="calibration-overlay" role="dialog" aria-modal="true" aria-label="Extreme eye tracking calibration">
      <div className="calibration-backdrop" />
      <section className="calibration-done-panel">
        <Eye size={28} />
        <h2>{done ? 'All 1,000 samples collected' : 'Extreme calibration'}</h2>
        <p>25 targets · 40 distinct frames each · about 2–3 minutes. Look at each dot on your selected monitor, not this panel. Collection pauses when eyes are not visible.</p>
        <progress aria-label="Calibration progress" max={100} value={progress} style={{ width: '100%' }} />
        <p>{done ? 'Ready to fit your personal gaze model.' : `Target ${pointIndex + 1}/25 · ${samples}/40 frames`}</p>
        {!done && <p role="status">{status}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        <p>Stay in the same position afterward. Calibration is session-only; changing camera or monitor requires a new pass.</p>
        <div className="calibration-done-actions">
          <button className="text-button" onClick={onCancel}>Cancel & turn off</button>
          {done && <button className="primary" onClick={() => {
            try { onFinish(); } catch (err) { setError(err instanceof Error ? err.message : 'Calibration could not be fitted. Please retry.'); }
          }}>Use calibrated tracking</button>}
        </div>
      </section>
    </div>
  );
}

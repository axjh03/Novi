import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import type { GazePoint } from '../eye-tracking/GazeTypes';

interface Props {
  /** The latest stable dwell position where the box should anchor. */
  dwellPoint: { x: number; y: number } | null;
  /** Raw smoothed gaze for the "debug dot" display. */
  gaze: GazePoint | null;
  /** Whether to show the small debug gaze dot. */
  showDebugDot: boolean;
  onClose: () => void;
}

const VIEWPORT_MARGIN = 16; // px from edge

/** Clamp the box so it stays fully within the viewport */
function clampBox(x: number, y: number, boxW: number, boxH: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(vw - boxW - VIEWPORT_MARGIN, x + 28));
  const top = Math.max(VIEWPORT_MARGIN, Math.min(vh - boxH - VIEWPORT_MARGIN, y + 28));
  return { left, top };
}

export function GazeOverlay({ dwellPoint, gaze, showDebugDot, onClose }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // When a new dwell arrives, anchor the box
  useEffect(() => {
    if (!dwellPoint) return;
    setDismissed(false);
    const boxW = 340;
    const boxH = 180;
    setPos(clampBox(dwellPoint.x, dwellPoint.y, boxW, boxH));
    setVisible(true);
  }, [dwellPoint]);

  if (!pos || dismissed) {
    return showDebugDot && gaze ? <GazeDot x={gaze.x} y={gaze.y} confidence={gaze.confidence} /> : null;
  }

  return (
    <>
      {/* Debug dot */}
      {showDebugDot && gaze && <GazeDot x={gaze.x} y={gaze.y} confidence={gaze.confidence} />}

      {/* Floating response box */}
      <div
        ref={boxRef}
        className={`gaze-response-box ${visible ? 'gaze-response-box--visible' : ''}`}
        style={{ left: pos.left, top: pos.top }}
        role="status"
        aria-live="polite"
      >
        {/* Header bar */}
        <div className="gaze-response-header">
          <span className="gaze-response-eyebrow">
            <Eye size={11} />
            GAZE RESPONSE
          </span>
          <div className="gaze-response-actions">
            <button
              className="icon-button gaze-response-close"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss gaze response"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Sample response content */}
        <div className="gaze-response-body">
          <p className="gaze-response-text">
            I noticed your gaze. This is where Novi would place a contextual response—
            right where you're looking, so you never lose your train of thought.
          </p>
          <div className="gaze-response-meta">
            <span className="gaze-response-coords">
              ⊕ {Math.round(dwellPoint?.x ?? 0)}, {Math.round(dwellPoint?.y ?? 0)}
            </span>
            <button
              className="gaze-response-pin"
              onClick={() => setDismissed(true)}
            >
              <EyeOff size={12} /> Dismiss
            </button>
          </div>
        </div>

        {/* Animated border */}
        <div className="gaze-response-glow" />
      </div>
    </>
  );
}

/** Small coloured debug dot that follows raw gaze */
function GazeDot({ x, y, confidence }: { x: number; y: number; confidence: number }) {
  const hue = Math.round(confidence * 120); // red=0, green=120
  return (
    <div
      className="gaze-debug-dot"
      style={{
        left: x,
        top: y,
        '--gaze-hue': `${hue}`,
      } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

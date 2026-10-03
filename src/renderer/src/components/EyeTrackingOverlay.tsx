import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OverlayEvent } from '../../../shared/types';
import { createOverlayInput } from '../eye-tracking/overlayInput';

interface StickyState {
  x: number;
  y: number;
  visible: boolean;
  pinned: boolean;
  title: string;
  text: string;
  source: string;
}

export function EyeTrackingOverlay() {
  const [gaze, setGaze] = useState<{ x: number; y: number; confidence: number; visible: boolean }>({
    x: -100,
    y: -100,
    confidence: 0,
    visible: false,
  });

  const [sticky, setSticky] = useState<StickyState>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    visible: true,
    pinned: false,
    title: 'Astra Screen HUD',
    text: 'Look anywhere on this monitor to summon the AI sticky response box.',
    source: 'Eye Tracking Active',
  });

  const [calibrationPoint, setCalibrationPoint] = useState<{ x: number; y: number; index: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const endDrag = useRef<(() => void) | null>(null);
  const input = useRef<ReturnType<typeof createOverlayInput> | null>(null);

  useEffect(() => {
    if (calibrationPoint) {
      void window.novi.sendOverlayEvent({ type: 'calibration-target-shown', index: calibrationPoint.index });
    }
  }, [calibrationPoint?.index]);

  useLayoutEffect(() => {
    const controller = createOverlayInput(
      (x, y) => Boolean(document.elementFromPoint(x, y)?.closest('[data-overlay-interactive]')),
      (ignore) => { void window.novi.setOverlayIgnoreMouse(ignore); },
    );
    input.current = controller;
    controller.reset();
    const move = (event: MouseEvent) => controller.move(event.clientX, event.clientY, isDragging.current);
    const release = () => {
      endDrag.current?.();
      controller.reset();
    };
    const leave = (event: MouseEvent) => {
      if (!event.relatedTarget && !isDragging.current) controller.reset();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseout', leave);
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseout', leave);
      window.removeEventListener('blur', release);
      window.removeEventListener('pagehide', release);
      release();
      input.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (!sticky.visible) endDrag.current?.();
    input.current?.refresh(isDragging.current);
  });

  useEffect(() => {
    // Add class for 100% transparent root/body
    document.documentElement.classList.add('overlay-window');
    document.body.classList.add('overlay-window');

    // Subscribe to overlay events coming from main window / eye-tracking service
    const unsubscribe = window.novi.onOverlayEvent((event: OverlayEvent) => {
      if (event.type === 'gaze') {
        const targetX = event.x * window.innerWidth;
        const targetY = event.y * window.innerHeight;
        setGaze((prev) => {
          const smoothFactor = 0.15;
          const newX = prev.x < 0 ? targetX : prev.x + (targetX - prev.x) * smoothFactor;
          const newY = prev.y < 0 ? targetY : prev.y + (targetY - prev.y) * smoothFactor;
          return {
            x: newX,
            y: newY,
            confidence: event.confidence,
            visible: true,
          };
        });

        // Make sticky box follow gaze!
        setSticky((prev) => {
          if (prev.pinned) return prev; 
          const boxTargetX = targetX - 180;
          const boxTargetY = targetY - 90;
          const clampedX = Math.max(16, Math.min(window.innerWidth - 376, boxTargetX));
          const clampedY = Math.max(16, Math.min(window.innerHeight - 220, boxTargetY));
          
          // Extremely heavy smoothing (low-pass filter) for the sticky note so it glides lazily
          // and doesn't aggressively react to tiny eye twitches.
          const smoothFactor = 0.05; // 5% new target, 95% old position
          
          const newX = prev.x + (clampedX - prev.x) * smoothFactor;
          const newY = prev.y + (clampedY - prev.y) * smoothFactor;
          
          return { ...prev, x: newX, y: newY };
        });

      } else if (event.type === 'dwell') {
        // Dwell just updates the text if content was sent, but doesn't move it since gaze already moves it.
        setSticky((prev) => {
          if (event.content) {
            return {
              ...prev,
              visible: true,
              text: event.content,
            };
          }
          return prev;
        });
      } else if (event.type === 'set-content') {
        setSticky((prev) => ({
          ...prev,
          title: event.title || prev.title,
          text: event.text,
          visible: true,
        }));
      } else if (event.type === 'set-indicator') {
        setGaze((prev) => ({ ...prev, visible: event.show }));
      } else if (event.type === 'calibration-step') {
        const x = (event.x ?? 0.5) * window.innerWidth;
        const y = (event.y ?? 0.5) * window.innerHeight;
        setCalibrationPoint({ x, y, index: event.index });
      } else if (event.type === 'calibration-stop') {
        setCalibrationPoint(null);
      } else if (event.type === 'close') {
        setSticky((prev) => ({ ...prev, visible: false }));
      }
    });

    return () => {
      unsubscribe();
      document.documentElement.classList.remove('overlay-window');
      document.body.classList.remove('overlay-window');
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sticky.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    endDrag.current?.();
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - sticky.x,
      y: e.clientY - sticky.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setSticky((prev) => ({
        ...prev,
        x: Math.max(10, Math.min(window.innerWidth - 380, ev.clientX - dragOffset.current.x)),
        y: Math.max(10, Math.min(window.innerHeight - 200, ev.clientY - dragOffset.current.y)),
      }));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      endDrag.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      input.current?.refresh();
    };

    endDrag.current = handleMouseUp;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="overlay-root">
      {/* 1. Real-time Gaze Target Reticle */}
      {!calibrationPoint && gaze.visible && gaze.x >= 0 && (
        <div
          className="overlay-gaze-reticle"
          style={{
            transform: `translate3d(${gaze.x}px, ${gaze.y}px, 0)`,
            borderColor: gaze.confidence > 0.6 ? '#68d391' : '#f6ad55',
          }}
        >
          <div
            className="overlay-gaze-core"
            style={{
              backgroundColor: gaze.confidence > 0.6 ? '#68d391' : '#f6ad55',
            }}
          />
        </div>
      )}

      {/* 2. Full-Screen Calibration Target Dot (if calibrating on this monitor) */}
      {calibrationPoint && (
        <div
          className="overlay-calibration-target"
          style={{
            pointerEvents: 'none',
            left: `${calibrationPoint.x}px`,
            top: `${calibrationPoint.y}px`,
          }}
        >
          <div className="calibration-pulse-ring" />
          <div className="calibration-inner-dot">
            <span>{calibrationPoint.index + 1}</span>
          </div>
          <div className="calibration-tip">Keep looking here · {calibrationPoint.index + 1}/25</div>
        </div>
      )}

      {/* 3. Floating Sticky Response Box */}
      {!calibrationPoint && sticky.visible && (
        <div
          className={`overlay-sticky-card ${sticky.pinned ? 'is-pinned' : ''}`}
          style={{
            transform: `translate3d(${sticky.x}px, ${sticky.y}px, 0)`,
          }}
          data-overlay-interactive
        >
          {/* Card Header & Drag Handle */}
          <div className="overlay-card-header" onMouseDown={handleMouseDownDrag}>
            <div className="overlay-card-title">
              <span className="overlay-sparkle">✦</span>
              <strong>{sticky.title}</strong>
              {sticky.pinned && <span className="overlay-pin-badge">Pinned</span>}
            </div>

            <div className="overlay-header-actions" onMouseDown={(e) => e.stopPropagation()}>
              <button
                className="overlay-action-btn"
                title={sticky.pinned ? 'Unpin (follows gaze)' : 'Pin on monitor'}
                onClick={() => setSticky((p) => ({ ...p, pinned: !p.pinned }))}
              >
                {sticky.pinned ? '📌' : '📍'}
              </button>
              <button
                className="overlay-action-btn close"
                title="Dismiss sticky"
                onClick={() => setSticky((p) => ({ ...p, visible: false }))}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Card Body */}
          <div className="overlay-card-body">
            <p className="overlay-card-text">{sticky.text}</p>
          </div>

          {/* Card Footer */}
          <div className="overlay-card-footer">
            <span className="overlay-status-tag">{sticky.source}</span>
            <div className="overlay-footer-buttons">
              <button className="overlay-copy-btn" onClick={handleCopy}>
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Minus, Square, Copy, X, Lock, Unlock, ShieldAlert, Sparkles } from 'lucide-react';
import { useStealth } from '../hooks/useStealth';
import { unwrap } from '../services/api';

export function TitleBar() {
  const { transparent, clickThrough, clickThroughShortcut, toggleTransparent } = useStealth();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void unwrap(window.novi.isWindowMaximized())
      .then((max) => { if (typeof max === 'boolean') setIsMaximized(max); })
      .catch(() => {});
  }, []);

  const handleMinimize = async () => {
    try {
      await unwrap(window.novi.minimizeWindow());
    } catch (err) {
      console.error(err);
    }
  };

  const handleMaximize = async () => {
    try {
      const maximized = await unwrap(window.novi.maximizeWindow());
      setIsMaximized(Boolean(maximized));
    } catch (err) {
      console.error(err);
    }
  };

  const handleClose = async () => {
    try {
      await unwrap(window.novi.closeWindow());
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <header className={`app-titlebar ${transparent ? 'transparent-titlebar' : ''}`}>
        <div className="titlebar-drag-region">
          <div className="titlebar-brand">
            <span className="titlebar-logo">✦</span>
            <span className="titlebar-name">Novi</span>
          </div>
        </div>

        <div className="titlebar-center">
          {/* Transparent / Opaque Mode Toggle Button */}
          <button
            type="button"
            className={`stealth-toggle-btn ${transparent ? 'active' : ''}`}
            onClick={() => void toggleTransparent()}
            title={
              transparent
                ? `Transparent Mode is ON: ${clickThroughShortcut} or Num Lock toggles click-through.`
                : `Enable Transparent Mode. ${clickThroughShortcut} or Num Lock toggles click-through.`
            }
          >
            {transparent ? <Eye size={14} className="stealth-icon-on" /> : <EyeOff size={14} />}
            <span>{transparent ? 'Transparent Mode: ON' : 'Opaque Mode'}</span>
            {transparent && <span className="stealth-pulse-dot" />}
          </button>

          {/* Click-through status (only relevant in transparent mode) */}
          {transparent && (
            <div
              className={`stealth-numlock-pill ${clickThrough ? 'clickthrough' : 'interactive'}`}
              title={`Num Lock or ${clickThroughShortcut} toggles click-through mode.`}
            >
              {clickThrough ? <Lock size={12} /> : <Unlock size={12} />}
              <span>{clickThrough ? 'Click-Through' : 'Interactive'}: {clickThroughShortcut}</span>
            </div>
          )}
        </div>

        <div className="titlebar-controls">
          <button
            type="button"
            className="titlebar-btn minimize"
            onClick={() => void handleMinimize()}
            aria-label="Minimize"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="titlebar-btn maximize"
            onClick={() => void handleMaximize()}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button
            type="button"
            className="titlebar-btn close"
            onClick={() => void handleClose()}
            aria-label="Close"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* Floating HUD banner when in Transparent Mode */}
      {transparent && (
        <div className={`stealth-hud-banner ${clickThrough ? 'clickthrough' : 'interactive'}`}>
          <div className="stealth-hud-content">
            {clickThrough ? (
              <>
                <ShieldAlert size={13} className="hud-icon" />
                <span>
                  <strong>Click-Through Active:</strong> Clicks pass through to background apps. Press <strong>[{clickThroughShortcut}]</strong> or Num Lock to interact with Novi.
                </span>
              </>
            ) : (
              <>
                <Sparkles size={13} className="hud-icon" />
                <span>
                  <strong>Interactive Mode:</strong> Novi is interactive. Press <strong>[{clickThroughShortcut}]</strong> to enable click-through. Invisible in screen shares & recordings.
                </span>
              </>
            )}
            <span className="stealth-hud-shortcut">Transparent: Ctrl+Shift+T</span>
          </div>
        </div>
      )}
    </>
  );
}

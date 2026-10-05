import { useEffect, useState } from 'react';
import { Eye, EyeOff, Minus, Square, Copy, X, Lock, Unlock, ShieldAlert, Sparkles, Sliders } from 'lucide-react';
import { useStealth } from '../hooks/useStealth';
import { unwrap } from '../services/api';
import logoImg from '../assets/logo.svg';

const isMac = typeof process !== 'undefined' && process.platform ? process.platform === 'darwin' : (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform));

export function TitleBar() {
  const { transparent, clickThrough, clickThroughShortcut, toggleTransparent } = useStealth();
  const [isMaximized, setIsMaximized] = useState(false);

  // Transparency customization states
  const [opacity, setOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('novi_transparent_opacity');
    return saved ? Math.max(20, Math.min(100, Number(saved))) : 85;
  });

  const [bgColor, setBgColor] = useState<string>(() => {
    return localStorage.getItem('novi_transparent_bg') || '#0f172a';
  });

  const [showPopover, setShowPopover] = useState(false);

  // Sync transparent mode opacity and background color to CSS root variables
  useEffect(() => {
    document.documentElement.style.setProperty('--transparent-opacity', `${opacity}%`);
    document.documentElement.style.setProperty('--transparent-bg', bgColor);
    localStorage.setItem('novi_transparent_opacity', String(opacity));
    localStorage.setItem('novi_transparent_bg', bgColor);
  }, [opacity, bgColor]);

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

  const transparentShortcutHint = isMac
    ? 'Transparent Toggle: Option+Control+T'
    : 'Transparent: Home+PageUp | Opaque: Shift+PageDown';

  return (
    <>
      <header className={`app-titlebar ${transparent ? 'transparent-titlebar' : ''}`}>
        <div className="titlebar-drag-region">
          <div className="titlebar-brand">
            <img src={logoImg} alt="Logo" style={{ width: 16, height: 16, borderRadius: 4, marginRight: 6, objectFit: 'contain' }} />
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
                ? `Transparent Mode is ON. Shortcut: ${clickThroughShortcut} or Num Lock toggles click-through.`
                : `Enable Transparent Mode (${isMac ? 'Option+Control+T' : 'Home+PageUp'}).`
            }
          >
            {transparent ? <Eye size={14} className="stealth-icon-on" /> : <EyeOff size={14} />}
            <span>{transparent ? 'Transparent Mode: ON' : 'Opaque Mode'}</span>
            {transparent && <span className="stealth-pulse-dot" />}
          </button>

          {/* Click-through status */}
          {transparent && (
            <div
              className={`stealth-numlock-pill ${clickThrough ? 'clickthrough' : 'interactive'}`}
              title={`Num Lock or ${clickThroughShortcut} toggles click-through mode.`}
            >
              {clickThrough ? <Lock size={12} /> : <Unlock size={12} />}
              <span>{clickThrough ? 'Click-Through' : 'Interactive'}: {clickThroughShortcut}</span>
            </div>
          )}

          {/* Opacity & Color Controls (in Transparent Mode) */}
          {transparent && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="stealth-popover-trigger"
                onClick={() => setShowPopover(!showPopover)}
                title="Customize transparency opacity (20%-100%) and background color"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                <Sliders size={13} />
                <span>{opacity}%</span>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: bgColor, border: '1px solid rgba(255,255,255,0.4)', marginLeft: 2 }} />
              </button>

              {showPopover && (
                <div className="stealth-popover-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong style={{ fontSize: 13 }}>Opacity & Background Color</strong>
                    <button type="button" className="icon-button" style={{ width: 22, height: 22 }} onClick={() => setShowPopover(false)}>
                      <X size={13} />
                    </button>
                  </div>

                  {/* Opacity Slider */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--muted)' }}>Window Opacity:</span>
                      <strong>{opacity}%</strong>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="5"
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between', marginTop: 2 }}>
                      {[20, 40, 60, 80, 100].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className={`duration-pill-btn ${opacity === val ? 'active' : ''}`}
                          onClick={() => setOpacity(val)}
                          style={{ padding: '2px 6px', fontSize: 10 }}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background Color Presets & Picker */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Background Theme:</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {[
                        { label: 'Slate', hex: '#0f172a' },
                        { label: 'Obsidian', hex: '#0d1117' },
                        { label: 'Violet', hex: '#1a0b2e' },
                        { label: 'Emerald', hex: '#042f2e' },
                        { label: 'Crimson', hex: '#2e0612' },
                        { label: 'Mocha', hex: '#1c1614' },
                        { label: 'Black', hex: '#000000' },
                      ].map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.label}
                          onClick={() => setBgColor(c.hex)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: c.hex,
                            border: bgColor === c.hex ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.25)',
                            cursor: 'pointer',
                            boxShadow: bgColor === c.hex ? '0 0 0 2px var(--surface)' : 'none'
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Custom HEX:</span>
                      <input
                        type="color"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        style={{ width: 28, height: 24, border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        style={{
                          flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                          background: 'var(--panel)', color: 'var(--text)', fontSize: 11, fontFamily: 'monospace'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
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
            <span className="stealth-hud-shortcut">{transparentShortcutHint}</span>
          </div>
        </div>
      )}
    </>
  );
}


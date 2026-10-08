import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Minus, QrCode, Square, X } from 'lucide-react';
import { useStealth } from '../hooks/useStealth';
import { useAppMode } from '../context/AppModeContext';
import { unwrap } from '../services/api';
import { RemoteCompanionModal } from './RemoteCompanionModal';
import logo from '../assets/logo.svg';

export function TitleBar({ sessionActive = false }: { sessionActive?: boolean }) {
  const { transparent, clickThrough, clickThroughShortcut, toggleTransparent } = useStealth();
  const { transparentOpacity, setTransparentOpacity, transparentBg, setTransparentBg } = useAppMode();
  const [maximized, setMaximized] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  useEffect(() => {
    void unwrap(window.novi.isWindowMaximized()).then(setMaximized).catch(() => {});
  }, []);

  return (
    <>
      <header className={`app-titlebar ${transparent ? 'transparent-titlebar' : ''}`}>
        <div className="titlebar-drag-region">
          <div className="titlebar-brand"><img src={logo} alt="" className="titlebar-logo-img" /><span>Novi</span></div>
        </div>

        {sessionActive && (
          <div className="titlebar-center">
            {transparent && <span className={`stealth-numlock-pill ${clickThrough ? 'clickthrough' : 'interactive'}`}>{clickThrough ? 'Click-through' : 'Interactive'}</span>}
            <button type="button" className={`stealth-toggle-btn ${transparent ? 'active' : ''}`}
              onClick={() => void toggleTransparent()} aria-pressed={transparent}
              title={transparent ? 'Turn off transparent window' : 'Turn on transparent window'}>
              {transparent ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{transparent ? 'Transparent' : 'Transparency'}</span>
            </button>
          {transparent && (
            <details className="titlebar-appearance">
              <summary className="titlebar-quick-btn" aria-label="Transparency settings" title="Transparency settings">{transparentOpacity}%</summary>
              <div className="stealth-popover-panel">
                <strong>Window appearance</strong>
                <label>Opacity <span>{transparentOpacity}%</span>
                  <input type="range" min="20" max="100" step="5" value={transparentOpacity}
                    onChange={(event) => setTransparentOpacity(Number(event.target.value))} />
                </label>
                <label>Background color
                  <input type="color" value={transparentBg} onChange={(event) => setTransparentBg(event.target.value)} />
                </label>
                <small>{clickThrough ? 'Clicks pass through Novi.' : 'Novi accepts clicks.'} Press {clickThroughShortcut} to switch.</small>
              </div>
            </details>
          )}
        </div>
      )}

      <button type="button" className="stealth-toggle-btn titlebar-qr-btn"
        onClick={() => setShowQRModal(true)} title="Open phone companion">
        <QrCode size={14} /><span>Phone Remote</span>
      </button>

      <div className="titlebar-controls">
        <button type="button" className="titlebar-btn minimize" aria-label="Minimize" title="Minimize"
          onClick={() => void unwrap(window.novi.minimizeWindow()).catch(console.error)}><Minus size={14} /></button>
        <button type="button" className="titlebar-btn maximize" aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => void unwrap(window.novi.maximizeWindow()).then((value) => setMaximized(Boolean(value))).catch(console.error)}>
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button type="button" className="titlebar-btn close" aria-label="Close" title="Close"
          onClick={() => void unwrap(window.novi.closeWindow()).catch(console.error)}><X size={14} /></button>
      </div>
    </header>
    {showQRModal && <RemoteCompanionModal onClose={() => setShowQRModal(false)} />}
  </>
  );
}

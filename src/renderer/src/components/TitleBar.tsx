import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Minus, QrCode, Square, X } from 'lucide-react';
import { SmartPlacementControls } from './SmartPlacementControls';
import { useStealth } from '../hooks/useStealth';
import { useAppMode } from '../context/AppModeContext';
import { unwrap } from '../services/api';
import { RemoteCompanionModal } from './RemoteCompanionModal';
import logo from '../assets/logo.svg';
import { PALETTES, MIN_READING_SIZE, MAX_READING_SIZE } from '../../../shared/appearance';
import type { CloseRequest } from '../../../shared/types';

/**
 * What closing, quitting or signing out loses, shown in each of their confirmations.
 *
 * @param session true while a session is running: ending it stops a streaming answer and
 *   listening, and the unsent draft is not kept.
 * @returns one or two sentences for the confirmation text.
 */
export function endingWarning(session: boolean): string {
  return session
    ? 'This ends your session. Any answer still being written stops, listening turns off, and text you haven’t sent is lost. Your conversations stay saved.'
    : 'Anything you haven’t sent or saved is lost. Your conversations stay saved.';
}

export function TitleBar({ sessionActive = false }: { sessionActive?: boolean }) {
  const { transparent, clickThrough, clickThroughShortcut, transparentShortcut, toggleTransparent } = useStealth();
  // While its hotkey works, transparent mode is left only with that hotkey; the button shows which one.
  const transparencyLocked = transparent && Boolean(transparentShortcut);
  const { transparentOpacity, setTransparentOpacity, paletteId, setPalette, smartPaletteEnabled, setSmartPaletteEnabled, smartPaletteStatus, readingSize, changeReadingSize } = useAppMode();
  const [maximized, setMaximized] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  // Set when the main process asks before closing (X, Alt+F4, Ctrl+W or Cmd+W, the taskbar); null when no question is open.
  const [closeRequest, setCloseRequest] = useState<CloseRequest | null>(null);
  const [closing, setClosing] = useState(false);

  // The title bar is on every screen (including the error screen), so it is where closing is confirmed.
  useEffect(() => window.novi.onCloseRequested(setCloseRequest), []);

  /** The user chose Close: the main process closes the window, so this page usually never sees a reply. */
  async function confirmClose() {
    setClosing(true);
    try { await unwrap(window.novi.confirmClose()); }
    catch (error) { console.error(error); setClosing(false); }
  }

  useEffect(() => {
    // Docking for a session unmaximizes the window, so re-check whenever the window changes size.
    let timer = 0;
    const update = () => { void unwrap(window.novi.isWindowMaximized()).then(setMaximized).catch(() => {}); };
    const onResize = () => { window.clearTimeout(timer); timer = window.setTimeout(update, 150); };
    update();
    window.addEventListener('resize', onResize);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <>
      <header className={`app-titlebar ${transparent ? 'transparent-titlebar' : ''}`}>
        <div className="titlebar-drag-region">
          <div className="titlebar-brand"><img src={logo} alt="" className="titlebar-logo-img" /><span>Novi</span></div>
        </div>

        {/* Also shown outside a session while transparent, so it can always be turned off. */}
        {(sessionActive || transparent) && (
          <div className="titlebar-center">
            {transparent && <span className={`stealth-numlock-pill ${clickThrough ? 'clickthrough' : 'interactive'}`}>{clickThrough ? 'Click-through' : 'Interactive'}</span>}
            <div className="reading-size-controls" role="group" aria-label={`Interface size: ${readingSize}%`}>
              <button type="button" className="titlebar-quick-btn" title={`Smaller interface (${readingSize}%)`} aria-label="Decrease interface size" disabled={readingSize <= MIN_READING_SIZE} onClick={() => changeReadingSize(-1)}>A−</button>
              <button type="button" className="titlebar-quick-btn" title={`Larger interface (${readingSize}%)`} aria-label="Increase interface size" disabled={readingSize >= MAX_READING_SIZE} onClick={() => changeReadingSize(1)}>A+</button>
            </div>
            <SmartPlacementControls compact />
            <button type="button" className={`stealth-toggle-btn ${transparent ? 'active' : ''} ${transparencyLocked ? 'locked' : ''}`}
              onClick={() => { if (!transparencyLocked) void toggleTransparent(); }} aria-pressed={transparent} aria-disabled={transparencyLocked || undefined}
              aria-label={transparencyLocked ? `Transparency locked; press ${transparentShortcut} to turn off` : transparent ? 'Turn off transparency' : 'Turn on transparency'}
              title={transparencyLocked ? `Press ${transparentShortcut} to turn off transparent mode` : transparent ? 'Turn off transparent window' : 'Turn on transparent window'}>
              {transparent ? <Eye size={14} /> : <EyeOff size={14} />}
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
                <label className="smart-palette-toggle">
                  <input type="checkbox" checked={smartPaletteEnabled} onChange={(event) => setSmartPaletteEnabled(event.target.checked)} />Smart palette
                </label>
                <small>{smartPaletteEnabled ? smartPaletteStatus || 'Detecting background…' : 'Choose a text and background combination.'}</small>
                <div className="appearance-palettes" role="group" aria-label="Text and background palette">
                  {PALETTES.map((palette) => <button key={palette.id} type="button" disabled={smartPaletteEnabled}
                    aria-pressed={!smartPaletteEnabled && paletteId === palette.id} onClick={() => setPalette(palette.id)}
                    style={{ background: palette.background, color: palette.text }} title={`${palette.name}: text ${palette.text}, background ${palette.background}`}>
                    <strong>Aa</strong>{palette.name}
                  </button>)}
                </div>
                <small>Smart adapts to the screen behind Novi and raises opacity when needed for contrast. Turn it off to use your selected palette.</small>
                <small>{clickThrough ? 'Clicks pass through Novi.' : 'Novi accepts clicks.'} Press {clickThroughShortcut} to switch.</small>
              </div>
            </details>
          )}
        </div>
      )}

      <button type="button" className="stealth-toggle-btn titlebar-qr-btn"
        onClick={() => setShowQRModal(true)} title="Open phone companion" aria-label="Open phone companion">
        <QrCode size={14} />
      </button>

      <div className="titlebar-controls">
        <button type="button" className="titlebar-btn minimize" aria-label="Minimize" disabled={transparent}
          title={transparent ? 'Turn off transparent mode to minimize' : 'Minimize'}
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
    {closeRequest && <div className="session-confirm" role="alertdialog" aria-modal="true" aria-labelledby="close-confirm-title" aria-describedby="close-confirm-text"
      onKeyDown={(event) => { if (event.key === 'Escape' && !closing) setCloseRequest(null); }}>
      <div>
        <h2 id="close-confirm-title">Close Novi?</h2>
        <p id="close-confirm-text">{endingWarning(closeRequest.session)}</p>
        <button type="button" className="text-button" autoFocus disabled={closing} onClick={() => setCloseRequest(null)}>Keep Novi open</button>
        <button type="button" className="danger-button" disabled={closing} onClick={() => void confirmClose()}>{closing ? 'Closing…' : 'Close Novi'}</button>
      </div>
    </div>}
  </>
  );
}

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, Eye, EyeOff, Lock, Maximize2, MousePointer2, Palette, QrCode, ScanLine, Smartphone, SquareDashed, Undo2 } from 'lucide-react';
import { MAX_READING_SIZE, MIN_READING_SIZE, PALETTES } from '../../../../shared/appearance';
import { lockedMessage } from '../../../../shared/plans';
import { useAppMode } from '../../context/AppModeContext';
import { useStealthState } from '../../hooks/useStealth';
import { unwrap } from '../../services/api';
import { RemoteCompanionModal } from '../RemoteCompanionModal';
import { MenuItem, MenuTitle, ModernBar, ModernButton, ModernMenu, closeMenu } from './ModernKit';

/**
 * The appearance bar (top right): how Novi shows on screen. Transparent mode, whether clicks pass
 * through, opacity and colours, text size, the phone companion and the main window. Everything the
 * Classic title bar offers, as its own controls.
 */
export function AppearanceBar({ onSwitchToClassic, onError }: { onSwitchToClassic: () => void; onError: (message: string) => void }) {
  const [stealth, setStealth] = useStealthState();
  const { overlayHost, transparentOpacity, setTransparentOpacity, paletteId, setPalette, smartPaletteEnabled, setSmartPaletteEnabled, smartPaletteStatus, readingSize, changeReadingSize, allows } = useAppMode();
  const [companion, setCompanion] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const { transparent, clickThrough, clickThroughShortcut, transparentShortcut } = stealth;
  // While its hotkey works, transparent mode is left only with that hotkey; the button says which one.
  const locked = transparent && Boolean(transparentShortcut);
  const companionLocked = !allows('phone-companion');
  const toggleTransparent = async () => {
    if (locked) return;
    try { const next = await unwrap(window.novi.toggleTransparent()); if (next) setStealth(next); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not change transparent mode.'); }
  };
  const detect = async () => {
    setDetecting(true);
    try { await unwrap(window.novi.autoDetectPlacement()); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not detect a window layout.'); }
    finally { setDetecting(false); }
  };
  return <>
    <ModernBar label="Appearance controls" className="mod-appearance-bar">
      <ModernButton icon={transparent ? <Eye /> : <EyeOff />} label={locked ? `Transparent mode is on. Press ${transparentShortcut} to turn it off` : transparent ? 'Turn off transparent mode' : 'Turn on transparent mode'} pressed={transparent}
        title={locked ? `Transparent · press ${transparentShortcut} to turn off` : transparent ? 'Transparent on · hidden from screen sharing' : 'Transparent off · visible to screen sharing'} onClick={() => void toggleTransparent()} status={transparent ? 'live' : undefined} />
      {transparent && <span className={`mod-chip-status ${clickThrough ? 'is-through' : 'is-live'}`} role="status" title={clickThrough ? `Clicks pass through Novi. Press ${clickThroughShortcut} to interact.` : `Novi accepts clicks. Press ${clickThroughShortcut} to let clicks pass through.`}>
        {clickThrough ? <SquareDashed size={13} aria-hidden="true" /> : <MousePointer2 size={13} aria-hidden="true" />}{clickThrough ? 'Click-through' : 'Interactive'}
      </span>}
      {transparent && <ModernMenu label="Opacity and colours" icon={<Palette />} align="end" width={280}>
        <MenuTitle>Window appearance</MenuTitle>
        <label className="mod-field"><span className="mod-field-row" style={{ padding: 0 }}>Opacity<small>{transparentOpacity}%</small></span>
          <input type="range" min="20" max="100" step="5" value={transparentOpacity} onChange={event => setTransparentOpacity(Number(event.target.value))} aria-label="Window opacity" /></label>
        <label className="mod-check"><input type="checkbox" checked={smartPaletteEnabled} onChange={event => setSmartPaletteEnabled(event.target.checked)} />Smart colours from the screen behind</label>
        <div className="mod-menu-foot">{smartPaletteEnabled ? smartPaletteStatus || 'Detecting background…' : 'Choose a text and background pair.'}</div>
        <div className="mod-palettes" role="group" aria-label="Text and background palette">
          {PALETTES.map(palette => <button key={palette.id} type="button" disabled={smartPaletteEnabled} aria-pressed={!smartPaletteEnabled && paletteId === palette.id} onClick={() => setPalette(palette.id)}
            style={{ background: palette.background, color: palette.text }} title={`${palette.name}: text ${palette.text}, background ${palette.background}`}><strong>Aa</strong>{palette.name}</button>)}
        </div>
        <div className="mod-menu-foot">{clickThrough ? 'Clicks pass through Novi.' : 'Novi accepts clicks.'} <kbd>{clickThroughShortcut}</kbd> switches.</div>
      </ModernMenu>}
      <span className="mod-sep" aria-hidden="true" />
      <ModernButton label={`Smaller text (${readingSize}%)`} title={`Smaller text · ${readingSize}%`} disabled={readingSize <= MIN_READING_SIZE} onClick={() => changeReadingSize(-1)} icon={<span className="mod-text-size" aria-hidden="true">A−</span>} />
      <ModernButton label={`Larger text (${readingSize}%)`} title={`Larger text · ${readingSize}%`} disabled={readingSize >= MAX_READING_SIZE} onClick={() => changeReadingSize(1)} icon={<span className="mod-text-size" aria-hidden="true">A+</span>} />
      <span className="mod-sep" aria-hidden="true" />
      <ModernButton icon={<QrCode />} label={companionLocked ? 'Phone companion (locked)' : 'Phone companion'} title={companionLocked ? lockedMessage('phone-companion') : 'Phone companion · control Novi from your phone'} onClick={() => setCompanion(true)}
        badge={companionLocked ? <Lock size={9} className="mod-badge-lock" aria-hidden="true" /> : undefined} />
      <ModernButton icon={<AppWindow />} label="Show or hide the main window" title="Main window · conversations and settings" onClick={() => void unwrap(window.novi.workspaceAction('dashboard')).catch(() => {})} />
      <ModernMenu label="Window options" icon={<Maximize2 />} align="end" width={260}>
        <MenuTitle>Window</MenuTitle>
        <div className="mod-menu-group">
          <MenuItem icon={<ScanLine />} label={detecting ? 'Finding free space…' : 'Find free space on screen'} description="Sends one screenshot to your AI model to place Novi out of the way." disabled={detecting} onClick={event => { closeMenu(event.currentTarget); void detect(); }} />
          <MenuItem icon={<Undo2 />} label="Reset window sizes" description="Put the bars and the main window back where they started." onClick={event => { closeMenu(event.currentTarget); void unwrap(window.novi.resetWorkspaceSizes()).catch(() => {}); }} />
          <MenuItem icon={<Smartphone />} label="Phone companion" description={companionLocked ? lockedMessage('phone-companion') : 'Scan a code to use your phone as a remote.'} onClick={event => { closeMenu(event.currentTarget); setCompanion(true); }} />
        </div>
        <div className="mod-menu-group">
          <MenuItem icon={<AppWindow />} label="Switch to Classic" description="One window with everything in it. Change back under Settings › Appearance." onClick={event => { closeMenu(event.currentTarget); onSwitchToClassic(); }} />
        </div>
      </ModernMenu>
    </ModernBar>
    {companion && createPortal(<RemoteCompanionModal locked={companionLocked} onClose={() => setCompanion(false)} />, overlayHost || document.body)}
  </>;
}

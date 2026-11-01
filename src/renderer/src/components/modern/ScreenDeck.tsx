import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, Eye, EyeOff, Lock, Maximize2, MousePointer2, Palette, QrCode, ScanLine, SquareDashed, Undo2 } from 'lucide-react';
import { MAX_READING_SIZE, MIN_READING_SIZE, PALETTES } from '../../../../shared/appearance';
import { lockedMessage } from '../../../../shared/plans';
import { useAppMode } from '../../context/AppModeContext';
import { useStealthState } from '../../hooks/useStealth';
import { unwrap } from '../../services/api';
import { RemoteCompanionModal } from '../RemoteCompanionModal';
import { Cluster, Deck, MenuFoot, MenuGroup, MenuItem, MenuTitle, Stepper, Tool, ToolMenu, closeMenu } from './DeckKit';

/**
 * The screen deck (top right): how Novi sits on your screen. Transparent mode with its
 * click-through state and look on one plate, the text size as a stepper, then the phone companion,
 * the main window and the window menu, which is the one place that offers Classic.
 */
export function ScreenDeck({ onSwitchToClassic, onError }: { onSwitchToClassic: () => void; onError: (message: string) => void }) {
  const [stealth, setStealth] = useStealthState();
  const { overlayHost, transparentOpacity, setTransparentOpacity, paletteId, setPalette, smartPaletteEnabled, setSmartPaletteEnabled, smartPaletteStatus, readingSize, changeReadingSize, allows } = useAppMode();
  const [companion, setCompanion] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const { transparent, clickThrough, clickThroughShortcut, transparentShortcut } = stealth;
  // While its hotkey works, transparent mode is left only with that hotkey; the control says which one.
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
    <Deck label="Screen" className="deck-screen">
      <Cluster label="Transparent mode">
        <Tool icon={transparent ? <Eye /> : <EyeOff />} label={locked ? `Transparent mode is on. Press ${transparentShortcut} to turn it off` : transparent ? 'Turn off transparent mode' : 'Turn on transparent mode'} pressed={transparent}
          title={locked ? `Transparent · press ${transparentShortcut} to turn off` : transparent ? 'Transparent on · hidden from screen sharing' : 'Transparent off · visible to screen sharing'} onClick={() => void toggleTransparent()} status={transparent ? 'live' : undefined} />
        {transparent && <span className={`deck-state ${clickThrough ? 'is-through' : 'is-live'}`} role="status" title={clickThrough ? `Clicks pass through Novi. Press ${clickThroughShortcut} to interact.` : `Novi accepts clicks. Press ${clickThroughShortcut} to let clicks pass through.`}>
          {clickThrough ? <SquareDashed size={12} aria-hidden="true" /> : <MousePointer2 size={12} aria-hidden="true" />}<span className="deck-state-text">{clickThrough ? 'Click-through' : 'Interactive'}</span>
        </span>}
        {transparent && <ToolMenu label="Opacity and colours" icon={<Palette />} align="start" width={252} chevron={false}>
          <MenuTitle>Window look</MenuTitle>
          <label className="deck-field"><span className="deck-field-row">Opacity<small>{transparentOpacity}%</small></span>
            <input type="range" min="20" max="100" step="5" value={transparentOpacity} onChange={event => setTransparentOpacity(Number(event.target.value))} aria-label="Window opacity" /></label>
          <label className="deck-check"><input type="checkbox" checked={smartPaletteEnabled} onChange={event => setSmartPaletteEnabled(event.target.checked)} />Smart colours from the screen behind</label>
          <MenuFoot>{smartPaletteEnabled ? smartPaletteStatus || 'Detecting background…' : 'Or choose a text and background pair.'}</MenuFoot>
          <div className="deck-palettes" role="group" aria-label="Text and background palette">
            {PALETTES.map(palette => <button key={palette.id} type="button" disabled={smartPaletteEnabled} aria-pressed={!smartPaletteEnabled && paletteId === palette.id} onClick={() => setPalette(palette.id)}
              style={{ background: palette.background, color: palette.text }} title={`${palette.name}: text ${palette.text}, background ${palette.background}`}><strong>Aa</strong>{palette.name}</button>)}
          </div>
          <MenuFoot>{clickThrough ? 'Clicks pass through Novi.' : 'Novi accepts clicks.'} <kbd>{clickThroughShortcut}</kbd> switches.</MenuFoot>
        </ToolMenu>}
      </Cluster>
      <Stepper label="Text size" value={`${readingSize}%`} downLabel={`Smaller text (${readingSize}%)`} upLabel={`Larger text (${readingSize}%)`} downDisabled={readingSize <= MIN_READING_SIZE} upDisabled={readingSize >= MAX_READING_SIZE} onDown={() => changeReadingSize(-1)} onUp={() => changeReadingSize(1)} />
      <Cluster label="Around Novi">
        <Tool icon={<QrCode />} label={companionLocked ? 'Phone companion (locked)' : 'Phone companion'} title={companionLocked ? lockedMessage('phone-companion') : 'Phone companion · control Novi from your phone'} onClick={() => setCompanion(true)}
          badge={companionLocked ? <Lock size={9} className="deck-badge-lock" aria-hidden="true" /> : undefined} />
        <Tool icon={<AppWindow />} label="Show or hide the main window" title="Main window · conversations and settings" onClick={() => void unwrap(window.novi.workspaceAction('dashboard')).catch(() => {})} />
        <ToolMenu label="Window options" icon={<Maximize2 />} align="end" width={270} chevron={false}>
          <MenuTitle>Window</MenuTitle>
          <MenuGroup>
            <MenuItem icon={<ScanLine />} label={detecting ? 'Finding free space…' : 'Find free space on screen'} description="Sends one screenshot to your AI model to place Novi out of the way." disabled={detecting} onClick={event => { closeMenu(event.currentTarget); void detect(); }} />
            <MenuItem icon={<Undo2 />} label="Reset window sizes" description="Put the decks and the main window back where they started." onClick={event => { closeMenu(event.currentTarget); void unwrap(window.novi.resetWorkspaceSizes()).catch(() => {}); }} />
          </MenuGroup>
          <MenuGroup>
            <MenuItem icon={<AppWindow />} label="Switch to Classic" description="One window with everything in it. Change back under Settings › Appearance." onClick={event => { closeMenu(event.currentTarget); onSwitchToClassic(); }} />
          </MenuGroup>
        </ToolMenu>
      </Cluster>
    </Deck>
    {companion && createPortal(<RemoteCompanionModal locked={companionLocked} onClose={() => setCompanion(false)} />, overlayHost || document.body)}
  </>;
}

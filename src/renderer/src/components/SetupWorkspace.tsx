import { useEffect, useState } from 'react';
import { ArrowLeft, Settings, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { useAppMode } from '../context/AppModeContext';
import { ContextPage } from '../pages/ContextPage';
import { SettingsPage } from '../pages/SettingsPage';
import { unwrap } from '../services/api';
import { Brand } from './Brand';
import { Deck, Tool } from './modern/DeckKit';
import { ScreenDeck } from './modern/ScreenDeck';
import { ModernSetup } from './modern/ModernSetup';
import { SurfacePortal } from './SurfacePortal';
import { TrayPortal } from './TrayPortal';

/**
 * Before a session. Classic shows the setup page in the main window. Modern floats the same three
 * windows as a session: a slim deck with Settings and System check on the left, the setup card in
 * the middle, the screen deck on the right; the main window waits behind them.
 */
export function SetupWorkspace({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const { interfaceStyle, setInterfaceStyle } = useAppMode();
  const modern = interfaceStyle === 'modern';
  const [desktopHost, setDesktopHost] = useState<HTMLDivElement | null>(null);
  const [settings, setSettings] = useState(false);
  const [systemCheck, setSystemCheck] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!modern) return;
    void unwrap(window.novi.setWorkspaceDocked(true, 'modern')).catch(console.error);
    return () => { void unwrap(window.novi.setWorkspaceDocked(false)).catch(console.error); };
  }, [modern]);
  const leaveModern = () => setInterfaceStyle('classic');
  return <>
    <div className="setup-surface" ref={setDesktopHost} hidden={modern} />
    {modern && <>
      <div className="modern-idle"><Brand compact /><p>Novi floats above your screen now. Set up the session in the card at the top.</p></div>
      <TrayPortal detached modern role="left" onClosed={leaveModern}>
        <Deck label="Setup" className="deck-session">
          <Tool icon={settings ? <ArrowLeft /> : <Settings />} label={settings ? 'Back to setup' : 'Settings'} showLabel pressed={settings} onClick={() => setSettings(value => !value)} />
          <Tool icon={<ShieldCheck />} label="System check" showLabel onClick={() => { setSettings(false); setSystemCheck(value => value + 1); }} />
        </Deck>
      </TrayPortal>
      <TrayPortal detached modern role="center" onClosed={leaveModern} panel={settings
        ? <div className="deck-settings-host"><SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={() => {}} /></div>
        : <ModernSetup key={systemCheck} state={state} onSaved={onSaved} onOpenSettings={() => setSettings(true)} />}>
        {error && <div className="deck-error" role="alert"><span>{error}</span><button type="button" className="deck-tool" aria-label="Dismiss" onClick={() => setError('')}>×</button></div>}
      </TrayPortal>
      <TrayPortal detached modern role="right" onClosed={leaveModern}>
        <ScreenDeck onSwitchToClassic={leaveModern} onError={setError} />
      </TrayPortal>
    </>}
    {!modern && <SurfacePortal target={desktopHost}><ContextPage state={state} onSaved={onSaved} onSignOut={onSignOut} /></SurfacePortal>}
  </>;
}

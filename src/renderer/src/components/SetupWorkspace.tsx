import { useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare, Settings, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { useAppMode } from '../context/AppModeContext';
import { ContextPage } from '../pages/ContextPage';
import { SettingsPage } from '../pages/SettingsPage';
import { unwrap } from '../services/api';
import { Brand } from './Brand';
import { AppearanceBar } from './modern/AppearanceBar';
import { ModernBar, ModernButton } from './modern/ModernKit';
import { ModernSetup } from './modern/ModernSetup';
import { SurfacePortal } from './SurfacePortal';
import { TrayPortal } from './TrayPortal';

/**
 * Before a session. Classic shows the setup page in the main window. Modern floats the same three
 * windows as a session: a slim bar with Settings and System check on the left, the setup card in
 * the middle, the appearance bar on the right; the main window waits behind them.
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
        <ModernBar label="Setup controls">
          <ModernButton icon={settings ? <ArrowLeft /> : <Settings />} label={settings ? 'Back to setup' : 'Settings'} showLabel pressed={settings} onClick={() => setSettings(value => !value)} />
          <ModernButton icon={<ShieldCheck />} label="System check" showLabel onClick={() => { setSettings(false); setSystemCheck(value => value + 1); }} />
          <span className="mod-spacer" />
          <ModernButton icon={<MessageSquare />} label="Switch to Classic" title="One window with everything in it" onClick={leaveModern} />
        </ModernBar>
      </TrayPortal>
      <TrayPortal detached modern role="center" onClosed={leaveModern} panel={settings
        ? <div className="mod-settings-host"><SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={() => {}} /></div>
        : <ModernSetup key={systemCheck} state={state} onSaved={onSaved} onOpenSettings={() => setSettings(true)} />}>
        {error && <div className="mod-error" role="alert"><span>{error}</span><button type="button" className="mod-btn" aria-label="Dismiss" onClick={() => setError('')}>×</button></div>}
      </TrayPortal>
      <TrayPortal detached modern role="right" onClosed={leaveModern}>
        <AppearanceBar onSwitchToClassic={leaveModern} onError={setError} />
      </TrayPortal>
    </>}
    {!modern && <SurfacePortal target={desktopHost}><ContextPage state={state} onSaved={onSaved} onSignOut={onSignOut} /></SurfacePortal>}
  </>;
}

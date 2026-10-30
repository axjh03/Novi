import { useEffect, useState } from 'react';
import { ChevronDown, FolderOpen, Settings } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { useAppMode } from '../context/AppModeContext';
import { ContextPage } from '../pages/ContextPage';
import { unwrap } from '../services/api';
import { Brand } from './Brand';
import { ModernWindowMenu } from './ModernWindowMenu';
import { SurfacePortal } from './SurfacePortal';
import { TrayPortal } from './TrayPortal';

export function SetupWorkspace({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const { interfaceStyle, setInterfaceStyle } = useAppMode();
  const modern = interfaceStyle === 'modern';
  const [desktopHost, setDesktopHost] = useState<HTMLDivElement | null>(null);
  const [floatingHost, setFloatingHost] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true), [settingsRequest, setSettingsRequest] = useState(0);
  useEffect(() => {
    if (!modern) return;
    void unwrap(window.novi.setWorkspaceDocked(true, 'modern')).catch(console.error);
    return () => { void unwrap(window.novi.setWorkspaceDocked(false)).catch(console.error); };
  }, [modern]);
  return <>
    <div className="setup-surface" ref={setDesktopHost} hidden={modern} />
    {modern && <>
      <div className="modern-idle"><Brand compact /><p>Your responses will appear here.</p></div>
      <TrayPortal detached modern panel={<div className="modern-setup-panel" ref={setFloatingHost} hidden={!open} />} onPanelClose={() => setOpen(false)} onClosed={() => setInterfaceStyle('classic')}>
        <div className="modern-launcher"><Brand compact /><button type="button" className="modern-setup-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}><FolderOpen size={16} /><span>Prepare your session</span><ChevronDown size={14} /></button><button type="button" className="composer-quick-btn" title="Settings" aria-label="Settings" onClick={() => { setSettingsRequest(value => value + 1); setOpen(true); }}><Settings size={16} /></button><ModernWindowMenu /></div>
      </TrayPortal>
    </>}
    <SurfacePortal target={modern ? floatingHost : desktopHost}><ContextPage state={state} onSaved={onSaved} onSignOut={onSignOut} settingsRequest={settingsRequest} /></SurfacePortal>
  </>;
}

import { SlidersHorizontal } from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { TrayMenu } from './TrayMenu';

export function ModernWindowMenu() {
  const { setTitleBarHost } = useAppMode();
  return <TrayMenu label="Window & appearance" title={<SlidersHorizontal size={16} />} className="modern-window-menu" keepMounted>
    <div className="tray-menu-heading">Window & appearance</div>
    <div className="modern-titlebar-host" ref={setTitleBarHost} />
  </TrayMenu>;
}

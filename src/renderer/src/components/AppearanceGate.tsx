import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { InterfaceStyle } from '../../../shared/appearance';
import { Brand } from './Brand';

/**
 * Asked once after sign-in: Classic (everything in one window) or Modern (floating bars over your
 * screen). The two previews move the way each mode does, so the choice is made by seeing, not reading.
 * "Remember" stores the choice on this device; Settings › Appearance can ask again.
 *
 * @param initial  the style currently saved on this device, shown selected.
 * @param onChoose called with the style and whether to stop asking.
 */
export function AppearanceGate({ initial, onChoose }: { initial: InterfaceStyle; onChoose: (style: InterfaceStyle, remember: boolean) => void }) {
  const [style, setStyle] = useState<InterfaceStyle>(initial);
  const [remember, setRemember] = useState(true);
  // Arrow keys move between the two cards, Enter continues.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft') setStyle('classic');
      else if (event.key === 'ArrowRight') setStyle('modern');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <main className="gate" aria-labelledby="gate-title">
    <header className="gate-head"><Brand compact /><span>Appearance</span></header>
    <h1 id="gate-title">How should Novi sit on your screen?</h1>
    <p className="gate-lead">Both do everything. You can switch any time in Settings › Appearance.</p>
    <div className="gate-cards" role="radiogroup" aria-label="Appearance">
      <button type="button" role="radio" aria-checked={style === 'classic'} className={`gate-card ${style === 'classic' ? 'is-selected' : ''}`} onClick={() => setStyle('classic')} onDoubleClick={() => onChoose('classic', remember)}>
        <span className="gate-preview gate-classic" aria-hidden="true">
          <span className="gp-window"><span className="gp-side"><i /><i /><i /><i /></span><span className="gp-main"><span className="gp-msg them" /><span className="gp-msg me" /><span className="gp-msg them long" /><span className="gp-box" /></span></span>
        </span>
        <span className="gate-card-text"><strong>Classic</strong><span>One window with your conversations, the message box and every control in it.</span></span>
      </button>
      <button type="button" role="radio" aria-checked={style === 'modern'} className={`gate-card ${style === 'modern' ? 'is-selected' : ''}`} onClick={() => setStyle('modern')} onDoubleClick={() => onChoose('modern', remember)}>
        <span className="gate-preview gate-modern" aria-hidden="true">
          <span className="gp-desk"><span className="gp-app" /><span className="gp-app two" /></span>
          <span className="gp-bar left"><i /><i /><i /></span>
          <span className="gp-bar center"><i className="wide" /><i className="red" /></span>
          <span className="gp-bar right"><i /><i /></span>
          <span className="gp-panel"><span /><span className="short" /><span /></span>
        </span>
        <span className="gate-card-text"><strong>Modern</strong><span>Three small floating bars over whatever you are doing, with answers in a panel under the middle one.</span></span>
      </button>
    </div>
    <div className="gate-actions">
      <label className="gate-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span>Remember this and don’t ask again</span></label>
      <button type="button" className="gate-continue" onClick={() => onChoose(style, remember)}>Use {style === 'classic' ? 'Classic' : 'Modern'}<ArrowRight size={16} /></button>
    </div>
  </main>;
}

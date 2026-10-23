import { useEffect, useState } from 'react';
import { Loader2, ScanLine, TriangleAlert } from 'lucide-react';
import type { SmartPlacementState } from '../../../shared/windowLayout';
import { errorText, unwrap } from '../services/api';

export function SmartPlacementControls({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<SmartPlacementState | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void unwrap(window.novi.getSmartPlacement()).then(next => { if (alive) setState(next); }).catch(cause => { if (alive) setError(errorText(cause)); });
    const stop = window.novi.onSmartPlacement(setState);
    return () => { alive = false; stop(); };
  }, []);
  const problem = error || state?.error;
  const detect = () => { setError(''); void unwrap(window.novi.autoDetectPlacement()).then(setState).catch(cause => setError(errorText(cause))); };
  const button = <button type="button" className={compact ? `stealth-toggle-btn ${problem ? 'has-error' : ''}` : 'secondary'} disabled={state?.busy} onClick={detect}
    aria-label="AutoDetect window layout" title={problem || (state?.shortcutRegistered ? `AutoDetect layout · ${state.shortcut}` : 'AutoDetect layout · Sends a screenshot to your selected AI model')}>
    {state?.busy ? <Loader2 size={14} className="spin" /> : problem ? <TriangleAlert size={14} /> : <ScanLine size={14} />}{!compact && 'AutoDetect'}
  </button>;
  if (compact) return button;
  return <div className="smart-placement-controls">{button}
    <label className="settings-toggle"><input type="checkbox" checked={state?.enabled ?? false} onChange={event => {
      setError(''); void unwrap(window.novi.setAutoSmart(event.target.checked)).then(setState).catch(cause => setError(errorText(cause)));
    }} />Auto Smart</label>
    <small>AutoDetect sends a screenshot to your selected AI model to find unused space. Auto Smart checks for substantial, stable screen changes locally and may send a new screenshot. It is off at launch; screenshots are not saved to chat or disk.</small>
    <small>{state?.shortcutRegistered ? `Hotkey: ${state.shortcut}` : 'Hotkey unavailable. Use AutoDetect here or in the phone companion.'}</small>
    {problem ? <p className="error" role="alert">{problem}</p> : state?.reason && <p className="muted" role="status">{state.reason}</p>}
  </div>;
}

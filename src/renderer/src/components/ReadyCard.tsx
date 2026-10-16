import { Check, Circle, Play, ShieldCheck, X } from 'lucide-react';
import { READINESS_CHECKS, readReadiness } from '../services/readiness';

/** A short checklist at the start of a session: what Get ready found, the keys that matter, and a practice run. */
export function ReadyCard({ transparent, listenKey, snapshotKey, practiceDisabled, onPractice, onDismiss }: {
  transparent: boolean; listenKey: string; snapshotKey: string; practiceDisabled: boolean;
  onPractice: () => void; onDismiss: () => void;
}) {
  const results = readReadiness()?.results;
  // Storage is only needed to get this far; the rest matter during the interview.
  const checks = READINESS_CHECKS.filter(({ id }) => id !== 'storage');
  const allOk = checks.every(({ id }) => results?.[id]?.ok);
  return <section className="ready-card" aria-label="Ready check">
    <div className="ready-card-head">
      <strong>{allOk ? 'You’re set' : 'Before you start'}</strong>
      <button type="button" className="icon-button" aria-label="Dismiss ready check" title="Dismiss" onClick={onDismiss}><X size={14} /></button>
    </div>
    <ul className="ready-chips">
      {checks.map(({ id, name }) => {
        const result = results?.[id];
        const status = result ? result.ok ? 'ready' : 'needs attention' : 'not checked';
        return <li key={id} className={result ? result.ok ? 'ok' : 'failed' : ''} title={result?.detail || 'Not checked. End the session and run Get ready to check it.'}>
          {result?.ok ? <Check size={13} aria-hidden="true" /> : result ? <X size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
          {name}<span className="ready-chip-status">: {status}</span>
        </li>;
      })}
      <li className={transparent ? 'ok' : ''} title="Novi asks the operating system to exclude its window from capture; behavior varies by OS and sharing app.">
        <ShieldCheck size={13} aria-hidden="true" />OS capture exclusion<span className="ready-chip-status">: {transparent ? 'on' : 'off'}</span>
      </li>
    </ul>
    <p className="ready-keys"><kbd>{listenKey}</kbd> listen and stop · <kbd>Enter</kbd> send · <kbd>{snapshotKey}</kbd> snapshot</p>
    <div className="ready-practice">
      <button type="button" className="secondary" disabled={practiceDisabled} onClick={onPractice}><Play size={14} />Practice run · 1 min</button>
      <small>Try the whole loop once with a sample interviewer question. Sends one question to your AI model.</small>
    </div>
  </section>;
}

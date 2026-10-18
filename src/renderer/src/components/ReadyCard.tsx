import { Check, Circle, Play, ShieldCheck, X } from 'lucide-react';
import { READINESS_CHECKS, readReadiness } from '../services/readiness';

/**
 * A short checklist at the start of a session: what Get ready found, the keys that matter, and a practice run.
 *
 * Each Get ready check is a chip: a tick when it passed, a cross when it failed, a circle when it
 * wasn't checked. The words "ready", "needs attention" and "not checked" are read out to screen
 * readers but hidden on screen to keep the chips small, so when anything isn't passing a visible
 * note names those checks and says how to test them: Get ready can't be reached during a session,
 * but session setup has a "Run Get ready" button. The note replaces an older tooltip that told
 * people to do something impossible, and that keyboard and touch users never saw anyway.
 *
 * @param transparent       whether Transparent mode is on (shown as its own chip).
 * @param listenKey         the listen/stop shortcut, shown in the key hints.
 * @param snapshotKey       the screenshot shortcut, shown in the key hints.
 * @param practiceDisabled  disables the practice button while something else is running.
 * @param onPractice        starts the one-minute practice run.
 * @param onDismiss         hides the card for this session.
 */
export function ReadyCard({ transparent, listenKey, snapshotKey, practiceDisabled, onPractice, onDismiss }: {
  transparent: boolean; listenKey: string; snapshotKey: string; practiceDisabled: boolean;
  onPractice: () => void; onDismiss: () => void;
}) {
  const results = readReadiness()?.results;
  // Storage is only needed to get this far; the rest matter during the interview.
  const checks = READINESS_CHECKS.filter(({ id }) => id !== 'storage');
  // The names of checks that failed or weren't run, in the order the chips show them.
  const pending = checks.filter(({ id }) => !results?.[id]?.ok).map(({ name }) => name);
  return <section className="ready-card" aria-label="Ready check">
    <div className="ready-card-head">
      <strong>{pending.length ? 'Before you start' : 'You’re set'}</strong>
      <button type="button" className="icon-button" aria-label="Dismiss ready check" title="Dismiss" onClick={onDismiss}><X size={14} /></button>
    </div>
    <ul className="ready-chips">
      {checks.map(({ id, name }) => {
        const result = results?.[id];
        const status = result ? result.ok ? 'ready' : 'needs attention' : 'not checked';
        return <li key={id} className={result ? result.ok ? 'ok' : 'failed' : ''} title={result?.detail}>
          {result?.ok ? <Check size={13} aria-hidden="true" /> : result ? <X size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
          {name}<span className="ready-chip-status">: {status}</span>
        </li>;
      })}
      <li className={transparent ? 'ok' : ''} title="Transparent mode hides Novi from screen sharing and recording.">
        <ShieldCheck size={13} aria-hidden="true" />Hidden from screen share<span className="ready-chip-status">: {transparent ? 'on' : 'off'}</span>
      </li>
    </ul>
    {pending.length > 0 && <p className="ready-note">Not ready yet: {pending.join(', ')}. After this session, choose Run Get ready on session setup to test {pending.length === 1 ? 'it' : 'them'}.</p>}
    <p className="ready-keys"><kbd>{listenKey}</kbd> listen and stop · <kbd>Enter</kbd> send · <kbd>{snapshotKey}</kbd> snapshot</p>
    <div className="ready-practice">
      <button type="button" className="secondary" disabled={practiceDisabled} onClick={onPractice}><Play size={14} />Practice run · 1 min</button>
      <small>Try the whole loop once with a sample interviewer question. Sends one question to your AI model.</small>
    </div>
  </section>;
}

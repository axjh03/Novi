import { useEffect, useRef, useState } from 'react';
import { Bug, Copy, Trash2 } from 'lucide-react';
import type { DebugState } from '../../../shared/debug';
import type { Result } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

const seconds = (since: number) => `${Math.max(0, Math.floor((Date.now() - since) / 1000))}s`;

export function DebugPanel({ compact = false, conversationId }: { compact?: boolean; conversationId?: string | null }) {
  const [state, setState] = useState<DebugState>({ enabled: false, active: [], events: [] });
  const [error, setError] = useState(''), [filter, setFilter] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const current = revision.current;
      let delay = 1000;
      try {
        const next = await unwrap(window.novi.getDebugState());
        if (!disposed && current === revision.current) { setState(next); setError(''); }
        if (!next.enabled) delay = 3000;
      } catch (err) { if (!disposed) setError(errorText(err)); }
      if (!disposed) timer = setTimeout(refresh, delay);
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);

  async function change(action: () => Promise<Result<DebugState>>) {
    revision.current++;
    setBusy(true); setError(''); setCopied(false);
    try { setState(await unwrap(action())); }
    catch (err) { setError(errorText(err)); }
    finally { revision.current++; setBusy(false); }
  }

  if (compact && !state.enabled) return null;
  const requestIds = new Set([...state.active, ...state.events].filter(item => item.conversationId === conversationId).map(item => item.id));
  const visible = (item: { id: string }) => !compact || !conversationId || requestIds.has(item.id);
  const active = state.active.filter(visible);
  const events = state.events.filter(item => visible(item) && (!filter || JSON.stringify(item).toLowerCase().includes(filter.toLowerCase())));
  const content = <>
    {!compact && <>
      <h2>Debug mode</h2>
      <label className="settings-toggle"><input type="checkbox" checked={state.enabled} disabled={busy}
        onChange={event => void change(() => window.novi.setDebugEnabled(event.target.checked))} />Show live request activity</label>
      <p className="muted">See connection checks, engine startup, file tools, response progress and failures. Keeps the latest 400 events in memory for this launch. Turning it off clears the log. Prompts, file contents, raw engine output and credentials are excluded.</p>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {state.enabled && <>
      <div className="debug-toolbar">
        <input aria-label="Filter debug events" placeholder="Filter by model, stage or request ID…" value={filter} onChange={event => setFilter(event.target.value)} />
        <button className="text-button" type="button" onClick={() => {
          void navigator.clipboard.writeText(JSON.stringify({ active, events }, null, 2)).then(() => setCopied(true)).catch(err => setError(errorText(err)));
        }}><Copy size={14} />{copied ? 'Copied' : 'Copy'}</button>
        {!compact && <button type="button" className="text-button" disabled={busy} onClick={() => void change(() => window.novi.clearDebug())}><Trash2 size={14} />Clear</button>}
      </div>
      {active.map(item => <article className="debug-active" key={item.id}>
        <strong>{item.stage}</strong>
        <span>{[item.operation, item.engine, item.model].filter(Boolean).join(' · ')}</span>
        <span>{seconds(item.startedAt)} elapsed · Last activity {seconds(item.lastActivityAt)} ago</span>
        {Date.now() - item.lastActivityAt > 30_000 && <p className="debug-waiting">No new activity reported for over 30 seconds. The request is still open; this does not confirm the model is making progress. Use Stop in the floating controls to cancel.</p>}
        <small>Request {item.id}{item.taskId ? ` · Task ${item.taskId}` : ''}</small>
        {item.operation === 'send' && <button type="button" className="text-button" onClick={() => {
          void unwrap(window.novi.stop()).catch(err => setError(errorText(err)));
        }}>Stop response</button>}
      </article>)}
      {!active.length && <p className="muted">No active requests{compact && conversationId ? ' in this conversation' : ''}.</p>}
      <ol className="debug-events" aria-label="Request activity">
        {events.slice(compact ? -60 : -400).reverse().map(item => <li key={item.sequence} className={`debug-event debug-${item.level}`}>
          <time dateTime={new Date(item.time).toISOString()}>{new Date(item.time).toLocaleTimeString()}</time>
          <div><strong>{item.stage}</strong><small>{[item.operation, item.engine, item.model, `request ${item.id.slice(0, 8)}`].filter(Boolean).join(' · ')}</small>
            <details><summary>Details</summary><pre>{JSON.stringify({ requestId: item.id, conversationId: item.conversationId, connectionId: item.connectionId, taskId: item.taskId, ...item.details }, null, 2)}</pre></details>
          </div>
        </li>)}
      </ol>
      {!events.length && <p className="muted">No events recorded yet. Activity before debug mode was enabled is not replayed.</p>}
    </>}
  </>;
  return compact ? <details className="debug-panel debug-chat"><summary><Bug size={14} />Debug activity {active.length ? `· ${active.length} running` : ''}</summary>{content}</details>
    : <section className="debug-panel">{content}</section>;
}

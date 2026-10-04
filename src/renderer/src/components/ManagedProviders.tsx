import { useState } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { PROVIDERS } from '../../../shared/providers';
import { errorText, unwrap } from '../services/api';

export function ManagedProviders({ state, onSaved }: { state: Snapshot; onSaved: (state: Snapshot) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function action(work: () => Promise<Snapshot>) {
    setBusy(true); setError('');
    try { onSaved(await work()); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <section className="provider-manager"><div className="section-title"><div><h2>API management</h2><p className="muted">Connections shared by your account owner. Choose which to enable and use.</p></div><button className="text-button" disabled={busy} onClick={() => void action(() => unwrap(window.novi.refreshManaged()))}><RefreshCw size={15} />Refresh</button></div>
    <p className="managed-note"><ShieldCheck size={15} />Read only · Provider keys and models are managed in the web portal.</p>
    {!state.settings!.connections.length && <div className="managed-empty"><h3>No API connections yet</h3><p className="muted">Ask your account owner to add a provider key in the web portal, then refresh here.</p></div>}
    <div className="connection-list">{state.settings!.connections.map(c => <div className="connection-row" key={c.id}><div><strong>{c.name}</strong><small>{(PROVIDERS[c.provider] || PROVIDERS.openai).name} · {c.model}</small><small>Shared by {c.ownerName} · Key hidden</small></div><div className="connection-actions"><label className="managed-toggle"><input type="checkbox" checked={c.enabled !== false} disabled={busy || !!state.contextSession} onChange={e => void action(() => unwrap(window.novi.enableConnection(c.id, e.target.checked)))} />Enabled</label><button className="text-button" disabled={busy || !!state.contextSession || c.enabled === false || state.settings!.activeConnectionId === c.id} onClick={() => void action(() => unwrap(window.novi.selectConnection(c.id)))}>{state.settings!.activeConnectionId === c.id ? <><Check size={14} />Selected</> : 'Use this key'}</button></div></div>)}</div>
    {state.contextSession && <p className="muted">End the current session before changing your selection.</p>}{error && <div className="error" role="alert">{error}</div>}
  </section>;
}

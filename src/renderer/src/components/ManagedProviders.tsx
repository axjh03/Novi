import { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { PROVIDERS } from '../../../shared/providers';
import { errorText, unwrap } from '../services/api';

export function ManagedProviders({ state, onSaved }: { state: Snapshot; onSaved: (state: Snapshot) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function action(work: () => Promise<Snapshot>) {
    setBusy(true); setError('');
    try { onSaved(await work()); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <section className="provider-manager"><div className="section-title"><div><h2>API management</h2><p className="muted">Select up to one key per provider. Choose the model when starting a session.</p></div><button className="text-button" disabled={busy} onClick={() => void action(() => unwrap(window.novi.refreshManaged()))}><RefreshCw size={15} />Refresh</button></div>
    <p className="managed-note"><ShieldCheck size={15} />Provider keys are managed in the web portal. Choose a model when starting a session.</p>
    {!state.settings!.connections.length && <div className="managed-empty"><h3>No API connections yet</h3><p className="muted">Ask your account owner to add a provider key in the web portal, then refresh here.</p></div>}
    <div className="connection-list">{state.settings!.connections.map(c => <div className="connection-row" key={c.id}><div><strong>{c.name}</strong><small>{(PROVIDERS[c.provider] || PROVIDERS.openai).name} · {c.model || 'Choose a model before starting'}</small><small>Shared by {c.ownerName} · Key hidden</small></div><button type="button" className={`managed-select ${c.enabled !== false ? 'active' : ''}`} aria-pressed={c.enabled !== false} disabled={busy || !!state.contextSession} onClick={() => void action(() => unwrap(window.novi.enableConnection(c.id, c.enabled === false)))}>{c.enabled !== false ? 'Selected' : 'Select'}</button></div>)}</div>
    {state.contextSession && <p className="muted">End the current session before changing your selection.</p>}{error && <div className="error" role="alert">{error}</div>}
  </section>;
}

import { useState } from 'react';
import { Check, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { PROVIDERS } from '../../../shared/providers';
import { errorText, unwrap } from '../services/api';

export function ManagedProviders({ state, onSaved }: { state: Snapshot; onSaved: (state: Snapshot) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function action(work: () => Promise<Snapshot>) {
    setBusy(true); setError('');
    try { onSaved(await work()); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  const connections = state.settings!.connections;
  return <section className="provider-manager" aria-label="API connections"><div className="section-title"><div><div className="studio-heading"><KeyRound size={18} /><h2>API connections</h2><span className="studio-count">{connections.filter(c => c.enabled !== false).length} selected</span></div><p className="muted">Choose a connection for each provider. Pick your model when starting a session.</p></div><button type="button" className="studio-refresh" aria-label="Refresh API connections" title="Refresh connections" disabled={busy} onClick={() => void action(() => unwrap(window.novi.refreshManaged()))}><RefreshCw size={15} className={busy ? 'spin' : ''} /></button></div>
    {!connections.length && <div className="managed-empty"><KeyRound size={24} /><h3>No connections yet</h3><p className="muted">Add a key in the web portal, then refresh here.</p></div>}
    <div className={`connection-list ${busy ? 'is-busy' : ''}`} aria-busy={busy}>{connections.map(c => <div className={`connection-row ${c.enabled !== false ? 'is-selected' : ''}`} key={c.id}>
      <span className="studio-avatar" aria-hidden="true">{(PROVIDERS[c.provider] || PROVIDERS.openai).name[0]}</span>
      <div className="connection-info"><div className="connection-name"><strong>{c.name}</strong><span>{(PROVIDERS[c.provider] || PROVIDERS.openai).name}</span></div><small>{c.model || 'Select a model in your session'}</small>{c.ownerName && <small className="connection-owner">Shared by {c.ownerName}</small>}</div>
      <button type="button" className={`managed-select ${c.enabled !== false ? 'active' : ''}`} aria-label={`${c.enabled !== false ? 'Deselect' : 'Select'} ${c.name}`} aria-pressed={c.enabled !== false} disabled={busy} onClick={() => void action(() => unwrap(window.novi.enableConnection(c.id, c.enabled === false)))}>{c.enabled !== false ? <><Check size={13} />Selected</> : 'Select'}</button>
    </div>)}</div>
    <p className="studio-footnote"><ShieldCheck size={13} />Keys are hidden and managed in your web account.</p>
    {error && <div className="error" role="alert">{error}</div>}
  </section>;
}

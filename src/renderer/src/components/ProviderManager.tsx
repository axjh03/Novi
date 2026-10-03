import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ConnectionInput, Snapshot } from '../../../shared/types';
import { newConnection, PROVIDERS } from '../../../shared/providers';
import { ProviderFields } from './ProviderFields';
import { errorText, unwrap } from '../services/api';

export function ProviderManager({ state, onSaved }: { state: Snapshot; onSaved: (state: Snapshot) => void }) {
  const [editing, setEditing] = useState<ConnectionInput | null>(null), [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function action(run: () => Promise<Snapshot>) {
    setBusy(true); setError('');
    try { onSaved(await run()); setEditing(null); setRemoving(null); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  function save(event: FormEvent) { event.preventDefault(); if (editing) void action(() => unwrap(window.novi.saveConnection(editing))); }
  return <section className="provider-manager"><div className="section-title"><div><h2>AI providers</h2><p className="muted">Save your connections, then choose one in chat.</p></div><button className="text-button" disabled={busy} onClick={() => { setEditing(newConnection()); setError(''); }}><Plus size={16} />Add provider</button></div>
    <div className="connection-list">{state.settings!.connections.map((connection) => <div className="connection-row" key={connection.id}>
      <div><strong>{connection.name}</strong><small>{PROVIDERS[connection.provider].name} · {connection.model}</small><small>{state.credentialIds.includes(connection.id) ? 'Key saved securely' : 'No saved key'}</small></div>
      <div className="connection-actions"><button className="text-button" disabled={busy || connection.id === state.settings!.activeConnectionId} onClick={() => void action(() => unwrap(window.novi.selectConnection(connection.id)))}>{connection.id === state.settings!.activeConnectionId ? <><Check size={13} />Active</> : 'Use'}</button><button className="icon-button" aria-label={`Edit ${connection.name}`} disabled={busy} onClick={() => { setEditing({ id: connection.id, name: connection.name, ai: { ...connection } }); setError(''); }}><Pencil size={15} /></button><button className="icon-button" aria-label={`Remove ${connection.name}`} disabled={busy || state.settings!.connections.length < 2} onClick={() => setRemoving(connection.id)}><Trash2 size={15} /></button></div>
      {removing === connection.id && <div className="confirmation"><p>Remove this connection and its saved API key? Your conversations will stay.</p><button className="text-button" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button" disabled={busy} onClick={() => void action(() => unwrap(window.novi.removeConnection(connection.id)))}>Remove provider</button></div>}
    </div>)}</div>
    {editing && <form className="connection-editor" onSubmit={save}><fieldset disabled={busy}><h3>{editing.id ? 'Edit connection' : 'Add a provider'}</h3><ProviderFields value={editing} onChange={setEditing} hasApiKey={!!editing.id && state.credentialIds.includes(editing.id)} /><div className="setup-actions"><button type="button" className="text-button" onClick={() => { setEditing(null); setError(''); }}>Cancel</button><button type="submit" className="primary">{busy ? 'Saving…' : 'Save provider'}</button></div></fieldset></form>}
    {error && <div className="error" role="alert">{error}</div>}
  </section>;
}

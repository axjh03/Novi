import { useState } from 'react';
import type { Snapshot } from '../../../../shared/types';
import { activeConnection, PROVIDERS } from '../../../../shared/providers';
import { unwrap, errorText } from '../../services/api';

export function ProviderPicker({ state, disabled, onSaved, onError }: { state: Snapshot; disabled: boolean; onSaved: (state: Snapshot) => void; onError: (error: string) => void }) {
  const [busy, setBusy] = useState(false), [custom, setCustom] = useState(false), [model, setModel] = useState('');
  const connection = activeConnection(state.settings!);
  if (!connection) return null;
  const options = PROVIDERS[connection.provider].models;
  async function select(id: string, model?: string) {
    setBusy(true);
    try { onSaved(await unwrap(window.novi.selectConnection(id, model))); setCustom(false); }
    catch (error) { onError(errorText(error)); }
    finally { setBusy(false); }
  }
  if (state.user?.managed) return <div className="chat-provider-picker"><select aria-label="Choose managed API connection" disabled={disabled || busy} value={connection.id} onChange={e => void select(e.target.value)}>{state.settings!.connections.filter(c => c.enabled !== false).map(c => <option key={c.id} value={c.id}>{c.name} · {c.model}</option>)}</select><span className="muted">Managed by {connection.ownerName}</span></div>;
  return <div className="chat-provider-picker"><select aria-label="Choose provider" disabled={disabled || busy} value={connection.id} onChange={(e) => void select(e.target.value)}>{state.settings!.connections.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
    <select aria-label="Choose model" disabled={disabled || busy} value={custom ? '__custom' : connection.model} onChange={(e) => { if (e.target.value === '__custom') { setCustom(true); setModel(connection.model); } else void select(connection.id, e.target.value); }}>
      {!options.some((m) => m.id === connection.model) && <option value={connection.model}>{connection.model}</option>}{options.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}<option value="__custom">Custom model…</option>
    </select>
    {custom && <form onSubmit={(e) => { e.preventDefault(); void select(connection.id, model); }}><input aria-label="Custom model ID" value={model} onChange={(e) => setModel(e.target.value)} required maxLength={200} disabled={disabled || busy} /><button className="text-button" disabled={disabled || busy}>Use model</button><button type="button" className="text-button" onClick={() => setCustom(false)}>Cancel</button></form>}
  </div>;
}

import { useEffect, useState } from 'react';
import type { ModelOption, ProviderConnection, Snapshot } from '../../../../shared/types';
import { activeConnection } from '../../../../shared/providers';
import { unwrap, errorText } from '../../services/api';
import { RefreshCw } from 'lucide-react';

interface Props { state: Snapshot; disabled: boolean; onSaved: (state: Snapshot) => void; onError: (error: string) => void; onReady: (ready: boolean) => void }
export function ProviderPicker(props: Props) {
  const connection = activeConnection(props.state.settings!);
  return connection ? <ConnectionPicker key={`${connection.id}:${connection.provider}:${connection.baseUrl}`} {...props} connection={connection} /> : null;
}

function ConnectionPicker({ state, disabled, onSaved, onError, onReady, connection }: Props & { connection: ProviderConnection }) {
  const [busy, setBusy] = useState(false), [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setModels([]); setError('');
    void unwrap(window.novi.listModels({ id: connection.id, name: connection.name, ai: connection }))
      .then(found => { if (!cancelled) setModels(found); })
      .catch(err => { if (!cancelled) setError(errorText(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // The keyed component resets discovery when the provider connection changes.
  }, [refresh]);
  const available = models.some(m => m.id === connection.model);
  useEffect(() => {
    onReady(!loading && !busy && available);
    return () => onReady(false);
  }, [loading, busy, available, onReady]);
  async function select(id: string, model?: string) {
    setBusy(true); onReady(false); onError('');
    try { onSaved(await unwrap(window.novi.selectConnection(id, model))); }
    catch (err) { onError(errorText(err)); }
    finally { setBusy(false); }
  }
  return <div className="chat-provider-picker">
    {state.settings!.connections.filter(c => c.enabled !== false).length > 1 ? <select aria-label={state.user?.managed ? 'Choose managed API connection' : 'Choose provider'} disabled={disabled || busy} value={connection.id} onChange={e => void select(e.target.value)}>
      {state.settings!.connections.filter(c => c.enabled !== false).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
    </select> : <span className="model-provider-name">{connection.name}</span>}
    <select aria-label="Choose model" disabled={disabled || busy || loading || !models.length} value={available ? connection.model : ''} onChange={e => void select(connection.id, e.target.value)}>
      <option value="" disabled>{loading ? 'Loading models…' : 'Choose a model'}</option>
      {models.map(m => <option value={m.id} key={m.id}>{m.name === m.id ? m.id : `${m.name} (${m.id})`}</option>)}
    </select>
    <button type="button" className="icon-button" aria-label="Refresh models" title="Refresh models" disabled={disabled || busy || loading} onClick={() => { onReady(false); setRefresh(n => n + 1); }}><RefreshCw size={15} /></button>
    {!loading && !error && connection.model && !available && <span role="status">The previous model is unavailable. Choose a model from the list.</span>}
    {error && <span className="error" role="alert">{error}</span>}
  </div>;
}

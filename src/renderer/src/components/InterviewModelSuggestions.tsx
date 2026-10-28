import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { AppMode, ModelOption, Snapshot } from '../../../shared/types';
import { suggestedInterviewModel } from '../../../shared/interviewProfile';
import { unwrap } from '../services/api';

export function InterviewModelSuggestions({ state, mode, disabled, onSaved, onError, onSelecting }: {
  state: Snapshot; mode: AppMode; disabled: boolean; onSaved: (state: Snapshot) => void; onError: (error: string) => void; onSelecting: (selecting: boolean) => void;
}) {
  const connections = state.settings!.connections.filter(connection => connection.enabled !== false);
  const key = JSON.stringify(connections.map(({ id, provider, baseUrl }) => [id, provider, baseUrl]));
  const [available, setAvailable] = useState<Record<string, ModelOption[]>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setAvailable({});
    void Promise.allSettled(connections.map(async connection => ({ id: connection.id, models: await unwrap(window.novi.listModels({ id: connection.id, name: connection.name, ai: connection })) })))
      .then(results => { if (!cancelled) { setAvailable(Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [[result.value.id, result.value.models]] : []))); setLoading(false); } });
    return () => { cancelled = true; };
  }, [key]);
  async function choose(connectionId: string, model: string) {
    onSelecting(true); onError('');
    try { onSaved(await unwrap(window.novi.selectConnection(connectionId, model))); }
    catch (error) { onError(error instanceof Error ? error.message : 'Could not select this model.'); }
    finally { onSelecting(false); }
  }
  return <section className="interview-model-suggestions" aria-label="Model suggestions">
    <h3><Sparkles size={15} />Suggested for this session</h3>
    <p className="muted">Choose any model below. Suggestions use the models your connections currently offer and your saved Fast / Deep choices.</p>
    {connections.map(connection => {
      const preferred = state.settings!.modelRoles?.[connection.id]?.[['coding', 'system-design', 'local-coding'].includes(mode) ? 'deep' : 'fast'];
      const model = suggestedInterviewModel(available[connection.id] || [], mode, preferred);
      return <div className="interview-model-row" key={connection.id}><div><strong>{connection.name}</strong><span>{loading ? 'Checking available models…' : model?.name || 'No models available. Refresh the picker above.'}</span></div>
        {model && <button type="button" className="secondary" disabled={disabled || loading} onClick={() => void choose(connection.id, model.id)}>Use model</button>}
      </div>;
    })}
  </section>;
}

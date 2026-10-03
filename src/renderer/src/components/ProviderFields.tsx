import { Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ConnectionInput, ModelOption, ProviderKind } from '../../../shared/types';
import { newConnection, PROVIDERS } from '../../../shared/providers';
import { errorText, unwrap } from '../services/api';

interface Props { value: ConnectionInput; onChange: (value: ConnectionInput) => void; section?: 'provider' | 'key' | 'model'; hasApiKey?: boolean }
export function ProviderFields({ value, onChange, section, hasApiKey = false }: Props) {
  const [visible, setVisible] = useState(false), [models, setModels] = useState<ModelOption[] | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const request = useRef(0);
  const ai = value.ai, info = PROVIDERS[ai.provider];
  useEffect(() => {
    request.current++; setModels(null); setError(''); setLoading(false); setVisible(false);
    return () => { request.current++; };
  }, [value.id, ai.provider, ai.baseUrl, value.apiKey]);
  const setAI = (patch: Partial<ConnectionInput['ai']>) => onChange({ ...value, ai: { ...ai, ...patch } });
  async function discover() {
    const current = ++request.current; setLoading(true); setError('');
    try {
      const found = await unwrap(window.novi.listModels(value));
      if (current === request.current) setModels(found);
    } catch (error) { if (current === request.current) setError(errorText(error)); }
    finally { if (current === request.current) setLoading(false); }
  }
  const options = models || info.models;
  return <>
    {(!section || section === 'provider') && <div className="provider-fields">
      <label>Choose provider<select value={ai.provider} onChange={(e) => onChange({ ...newConnection(e.target.value as ProviderKind), id: value.id })}>
        {Object.entries(PROVIDERS).map(([id, provider]) => <option key={id} value={id}>{provider.name}</option>)}
      </select></label>
      <label>Connection name<input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required maxLength={60} placeholder="e.g. Personal Claude" /></label>
      {ai.provider === 'compatible' && <label>API base URL<input type="url" value={ai.baseUrl} onChange={(e) => onChange({ ...value, apiKey: '', ai: { ...ai, baseUrl: e.target.value } })} placeholder="http://localhost:1234/v1" required /><small>For local servers or any service with an OpenAI-compatible API. Include the API path, usually /v1. Remote endpoints require HTTPS.</small></label>}
    </div>}
    {(!section || section === 'key') && <div><label>API key {ai.provider === 'compatible' && <span className="muted">(optional)</span>}<div className="password-field"><input type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={value.apiKey ?? ''} onChange={(e) => onChange({ ...value, apiKey: e.target.value })} placeholder={hasApiKey && value.apiKey === undefined ? 'Saved securely - enter to replace' : ai.provider === 'compatible' ? 'Leave blank for a keyless local server' : 'Enter your provider API key'} required={ai.provider !== 'compatible' && !(hasApiKey && value.apiKey === undefined)} maxLength={4096} /><button type="button" className="icon-button" aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><div className="privacy-note"><KeyRound size={16} /><p>Saved separately for this connection, encrypted on your device. Your key is sent only to this provider. {hasApiKey && value.apiKey === undefined && 'Leave unchanged to keep your saved key.'}</p></div></div>}
    {(!section || section === 'model') && <div className="model-fields">
      <div className="model-discovery"><span>{models ? 'Models from your provider' : 'Suggested models'}</span><button type="button" className="text-button" disabled={loading} onClick={() => void discover()}><RefreshCw size={13} />{loading ? 'Fetching...' : 'Fetch models'}</button></div>
      <label>Model<select aria-label="Choose model" value={options.some((m) => m.id === ai.model) ? ai.model : '__custom'} onChange={(e) => setAI({ model: e.target.value === '__custom' ? '' : e.target.value })}>
        {options.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}<option value="__custom">Custom model ID</option>
      </select><input aria-label="Model ID" value={ai.model} onChange={(e) => setAI({ model: e.target.value })} placeholder="Enter a model ID" required maxLength={200} /><small>{models ? 'Listed by this endpoint. Model permissions and image support may vary.' : 'Suggestions checked October 2, 2026. Fetch models for available IDs, or enter one manually.'}</small></label>
      {error && <div className="error" role="alert">{error}</div>}
      <label className="checkbox-label"><input type="checkbox" checked={ai.stream} onChange={(e) => setAI({ stream: e.target.checked })} />Stream responses as they arrive</label>
    </div>}
  </>;
}

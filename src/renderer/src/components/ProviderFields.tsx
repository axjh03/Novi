import { Eye, EyeOff, ExternalLink, KeyRound, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ConnectionInput, ModelOption, ProviderKind } from '../../../shared/types';
import { newConnection, PROVIDERS, SUPPORTED_PROVIDERS } from '../../../shared/providers';
import { errorText, unwrap } from '../services/api';

/** A problem shown directly under one field, so the fix is next to the mistake. */
export interface FieldProblem { field: 'name' | 'baseUrl' | 'key' | 'model'; message: string }

// Where each provider issues API keys.
const KEY_PAGES: Partial<Record<ProviderKind, string>> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/app/apikey',
};

interface Props { value: ConnectionInput; onChange: (value: ConnectionInput) => void; section?: 'provider' | 'key' | 'model'; hasApiKey?: boolean; problem?: FieldProblem | null }
export function ProviderFields({ value, onChange, section, hasApiKey = false, problem = null }: Props) {
  const [visible, setVisible] = useState(false), [models, setModels] = useState<ModelOption[] | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const request = useRef(0);
  const ai = value.ai;
  // OpenAI-compatible is no longer offered for new connections; older ones stay editable, and their server may not need a key.
  const compatible = ai.provider === 'compatible';
  const keyOptional = compatible || (hasApiKey && value.apiKey === undefined);
  const invalid = (field: FieldProblem['field']) => problem?.field === field ? { 'aria-invalid': true, 'aria-describedby': `provider-${field}-error` } : {};
  const problemText = (field: FieldProblem['field']) => problem?.field === field && <p id={`provider-${field}-error`} className="field-error" role="alert">{problem.message}</p>;
  useEffect(() => {
    request.current++; setModels(null); setError(''); setLoading(false); setVisible(false);
    return () => { request.current++; };
  }, [value.id, ai.provider, ai.baseUrl, value.apiKey]);
  useEffect(() => { if (section === 'model') void discover(); }, [section, value.id, ai.provider, ai.baseUrl, value.apiKey]);
  const setAI = (patch: Partial<ConnectionInput['ai']>) => onChange({ ...value, ai: { ...ai, ...patch } });
  async function discover() {
    const current = ++request.current; setLoading(true); setError('');
    try {
      const found = await unwrap(window.novi.listModels(value));
      if (current === request.current) setModels(found);
    } catch (error) { if (current === request.current) setError(errorText(error)); }
    finally { if (current === request.current) setLoading(false); }
  }
  const options = models || [];
  const keyPage = KEY_PAGES[ai.provider];
  return <>
    {(!section || section === 'provider') && <div className="provider-fields">
      <label>Choose provider<select value={ai.provider} onChange={(e) => onChange({ ...newConnection(e.target.value as ProviderKind), id: value.id })}>
        {SUPPORTED_PROVIDERS.map((id) => <option key={id} value={id}>{PROVIDERS[id].name}</option>)}
        {compatible && <option value="compatible">{PROVIDERS.compatible.name} (older connection)</option>}
      </select></label>
      <label>Connection name<input id="provider-name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} required maxLength={60} placeholder="e.g. OpenAI GPT-4o" {...invalid('name')} /></label>{problemText('name')}
      {compatible && <label>Server URL<input id="provider-baseUrl" value={ai.baseUrl} onChange={(e) => setAI({ baseUrl: e.target.value })} required maxLength={2048} spellCheck={false} placeholder="http://localhost:11434/v1" aria-describedby={problem?.field === 'baseUrl' ? 'provider-baseUrl-error provider-baseUrl-hint' : 'provider-baseUrl-hint'} aria-invalid={problem?.field === 'baseUrl' || undefined} /></label>}
      {compatible && problemText('baseUrl')}
      {compatible && <small id="provider-baseUrl-hint" className="field-hint">HTTPS, or HTTP for a server on this computer, e.g. http://localhost:11434/v1.</small>}
    </div>}
    {(!section || section === 'key') && <div><label>API key{compatible && <span className="field-optional"> (optional)</span>}<div className="password-field"><input id="provider-key" type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={value.apiKey ?? ''} onChange={(e) => onChange({ ...value, apiKey: e.target.value })} placeholder={hasApiKey && value.apiKey === undefined ? 'Saved securely - enter to replace' : compatible ? 'Leave empty if your server doesn’t need a key' : 'Enter your provider API key'} required={!keyOptional} maxLength={4096} {...invalid('key')} /><button type="button" className="icon-button" aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
      {problemText('key')}
      {keyPage && <p className="key-help"><button type="button" className="text-button" onClick={() => void unwrap(window.novi.openExternal(keyPage)).catch(() => {})}><ExternalLink size={13} />Get a key from {PROVIDERS[ai.provider].name}</button></p>}
      <div className="privacy-note"><KeyRound size={16} /><p>Saved separately for this connection, encrypted on your device. Your key is sent only to this provider. {hasApiKey && value.apiKey === undefined && 'Leave unchanged to keep your saved key.'}</p></div></div>}
    {section === 'model' && <div className="model-fields">
      <div className="model-discovery"><span>Models from your provider</span><button type="button" className="text-button" disabled={loading} onClick={() => void discover()}><RefreshCw size={13} />{loading ? 'Fetching...' : 'Refresh models'}</button></div>
      <label>Model<select id="provider-model" aria-label="Choose model" required value={options.some(m => m.id === ai.model) ? ai.model : ''} onChange={(e) => setAI({ model: e.target.value })} {...invalid('model')}>
        <option value="" disabled>{loading ? 'Loading models…' : 'Choose a model'}</option>
        {options.map(model => <option value={model.id} key={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>)}
      </select><small>Models listed by your provider. The connection is tested before starting a session.</small></label>
      {problemText('model')}
      {error && <div className="error" role="alert">{error}</div>}
      <label className="checkbox-label"><input type="checkbox" checked={ai.stream} onChange={(e) => setAI({ stream: e.target.checked })} />Stream responses as they arrive</label>
    </div>}
  </>;
}

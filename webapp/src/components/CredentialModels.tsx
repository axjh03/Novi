'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

type Model = { id: string; name: string };
export default function CredentialModels({ credentialId }: { credentialId: string }) {
  const [result, setResult] = useState<{ models: Model[]; checkedAt: string } | null>(null);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/control/credentials/${encodeURIComponent(credentialId)}/models`, { credentials: 'include', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to check models. Try again.');
      const next = body.data as { models: Model[]; checkedAt: string };
      setNewIds(result ? next.models.filter(model => !result.models.some(old => old.id === model.id)).map(model => model.id) : []);
      setResult(next);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to check models. Try again.'); }
    finally { setBusy(false); }
  }
  return <div>
    <button className="text-btn" type="button" disabled={busy} onClick={() => void check()}><RefreshCw size={15} />{busy ? 'Checking models…' : 'Check models'}</button>
    {error && <p role="alert">{error}{result && ' Showing the last successful check.'}</p>}
    {result && <>
      <p className="muted" role="status">{result.models.length} models · Checked {new Date(result.checkedAt).toLocaleString()}{newIds.length > 0 && ` · ${newIds.length} newly available since the last check`}</p>
      <label>Available models<select aria-label="Available models" defaultValue="" key={result.checkedAt}><option value="" disabled>View latest models</option>{result.models.map(model => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}{newIds.includes(model.id) ? ' · New' : ''}</option>)}</select></label>
      <small>Desktop users load this live list when choosing a model or clicking Refresh models.</small>
    </>}
  </div>;
}

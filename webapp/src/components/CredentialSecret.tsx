'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

/** A masked provider key with reveal and copy. The clear text is fetched on demand and hides itself after 30 seconds or when the tab is hidden. */
export default function CredentialSecret({ id, lastFour }: { id: string; lastFour: string }) {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const hide = () => { if (document.hidden) setSecret(''); };
    document.addEventListener('visibilitychange', hide);
    const timer = setTimeout(() => { setSecret(''); setCopied(false); }, 30_000);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hide); };
  }, [secret, copied]);
  async function read(copy: boolean) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/control/credentials/${id}/reveal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'include', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to access key.');
      if (copy) { await navigator.clipboard.writeText(result.data.secret); setCopied(true); }
      else setSecret(result.data.secret);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <span className="key-cell">
    <code>{secret || `••••${lastFour}`}</code>
    <button type="button" className="icon-btn" disabled={busy} aria-label={secret ? 'Hide API key' : 'Reveal API key'} aria-pressed={!!secret} onClick={() => secret ? setSecret('') : void read(false)}>{secret ? <EyeOff /> : <Eye />}</button>
    <button type="button" className="icon-btn" disabled={busy} aria-label="Copy API key" onClick={() => void read(true)}>{copied ? <Check /> : <Copy />}</button>
    <small role="status" aria-live="polite">{busy ? 'Reading…' : copied ? 'Copied' : secret ? 'Hides in 30 s' : ''}</small>
    {error && <small role="alert" className="key-error">{error}</small>}
  </span>;
}

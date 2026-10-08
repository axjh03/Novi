import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Smartphone, X } from 'lucide-react';
import type { RemoteCompanionStatus } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

export function RemoteCompanionModal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<RemoteCompanionStatus | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void unwrap(window.novi.getRemoteCompanionStatus()).then(value => {
      if (active) setStatus(value);
    }).catch(cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, []);

  async function toggleTunnel(enable: boolean) {
    setBusy(true); setError(''); setCopied(false);
    try { setStatus(await unwrap(window.novi.toggleRemoteTunnel(enable))); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!status?.bestUrl) return;
    try { await navigator.clipboard.writeText(status.bestUrl); setCopied(true); }
    catch (cause) { setError(errorText(cause)); }
  }

  return <dialog ref={dialog} className="companion-dialog" aria-labelledby="companion-title"
    onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="companion-card">
      <header><div><Smartphone size={18} /><h2 id="companion-title">Phone companion</h2></div>
        <button type="button" onClick={onClose} aria-label="Close phone companion"><X size={18} /></button></header>
      <p>Scan to control Novi. One connection across your chat sessions.</p>
      <div className="companion-network" aria-label="Connection type">
        {[false, true].map(remote => <button key={String(remote)} type="button" disabled={busy || !status}
          aria-pressed={Boolean(status?.tunnelActive) === remote} onClick={() => void toggleTunnel(remote)}>
          {remote ? 'Anywhere' : 'Same Wi-Fi'}</button>)}
      </div>
      <div className="companion-code">
        {busy ? <p role="status">Updating link…</p> : status?.running && status.qrSvg
          ? <div role="img" aria-label="Scan to open phone companion" dangerouslySetInnerHTML={{ __html: status.qrSvg }} />
          : <p role="status">{status ? 'Phone companion is unavailable.' : 'Loading link…'}</p>}
      </div>
      <p>{status?.tunnelActive ? 'Open your phone camera and scan.' : 'Connect your phone to the same Wi-Fi, then scan.'}</p>
      <div className="companion-link"><input aria-label="Phone companion link" readOnly value={status?.bestUrl || ''} />
        <button type="button" disabled={!status?.running || busy} onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}</button></div>
      {error && <p role="alert">{error}</p>}
      <footer><small>Keep Novi open on your desktop.</small><button type="button" onClick={onClose}>Close</button></footer>
    </div>
  </dialog>;
}

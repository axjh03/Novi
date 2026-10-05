import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Play, X } from 'lucide-react';
import type { ContextFolder, Snapshot } from '../../../shared/types';
import { activeConnection } from '../../../shared/providers';
import { Brand } from '../components/Brand';
import { ProviderPicker } from '../components/chat/ProviderPicker';
import { SettingsPage } from './SettingsPage';
import { errorText, unwrap } from '../services/api';

export function ContextPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const [settings, setSettings] = useState(false);
  const [folders, setFolders] = useState<ContextFolder[]>([]);
  const [purpose, setPurpose] = useState('');
  const [fields, setFields] = useState(['Role / perspective', 'Background', 'Output format', 'Constraints'].map((label) => ({ label, value: '' })));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [modelReady, setModelReady] = useState(false), [countdown, setCountdown] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; }, []);
  const connection = activeConnection(state.settings!);
  async function loadFolders() {
    setBusy(true); setError('');
    try { const loaded = await unwrap(window.novi.pickContextFolders()); if (loaded.length) setFolders(loaded); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  async function start() {
    if (busy || !modelReady) return;
    const current = ++attempt.current;
    setBusy(true); setChecking(true); setError('');
    try {
      await unwrap(window.novi.testConnection());
      if (current !== attempt.current) return;
      setChecking(false);
      for (let seconds = 5; seconds > 0; seconds--) {
        setCountdown(seconds);
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (current !== attempt.current) return;
      }
      setCountdown(null);
      onSaved(await unwrap(window.novi.startContext({ folderIds: folders.map((f) => f.id), purpose, fields })));
    } catch (err) { if (current === attempt.current) setError(errorText(err)); }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); setCountdown(null); } }
  }
  if (settings) return <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={() => {}} />;
  return <main className="context-page">
    <header className="context-header"><Brand /><div><button className="text-button" disabled={busy} onClick={() => setSettings(true)}>Settings</button><button className="text-button" disabled={busy} onClick={onSignOut}>Sign out</button></div></header>
    <section className="context-setup">
      <div className="context-setup-header">
        <span className="eyebrow">CONTEXT · TEMPORARY SESSIONS</span>
        <h1>Give Novi the background.</h1>
        <p>Choose your model and load reference folders to start your session.</p>
      </div>

      <div className="context-step-card">
        <h2><span className="step-num">1</span> Choose provider & model</h2>
        <ProviderPicker state={state} disabled={busy} onSaved={onSaved} onError={setError} onReady={setModelReady} />
        {!connection && <p className="managed-note">No enabled API connection is available. Open Settings → API management to enable a shared key.</p>}
      </div>

      <div className="context-step-card">
        <h2><span className="step-num">2</span> Load context</h2>
        <button className="secondary" disabled={busy || !connection} onClick={() => void loadFolders()}><FolderOpen size={15} /> {busy ? 'Working…' : folders.length ? 'Choose folders again' : 'Load context'}</button>
        <p className="context-hint">Select folders (TXT/PDF text up to 30 files / 80k chars).</p>
        {folders.map((folder) => <div className="context-folder" key={folder.id}><div><strong>{folder.name}</strong><span>{folder.files.length} files · {folder.characters.toLocaleString()} chars</span><button className="icon-button" disabled={busy} aria-label={`Remove ${folder.name}`} onClick={() => setFolders((items) => items.filter((f) => f.id !== folder.id))}><X size={14} /></button></div><details><summary>Review included files</summary><ul>{folder.files.map((file) => <li key={file}>{file}</li>)}</ul></details></div>)}
      </div>

      {!!folders.length && <form onSubmit={(event) => { event.preventDefault(); void start(); }}>
        <div className="context-step-card">
          <h2><span className="step-num">3</span> Tell Novi what’s going on</h2>
          <label>Session purpose (required)<textarea required maxLength={2000} rows={2} value={purpose} disabled={busy} onChange={(e) => setPurpose(e.target.value)} placeholder="What are we working on, and what should the AI help you achieve?" /></label>

          <details className="custom-fields-accordion">
            <summary>Custom fields & additional instructions (optional)</summary>
            <div className="context-fields">{fields.map((field, index) => <div key={index}>
              <label>Custom field {index + 1} name<input maxLength={80} value={field.label} disabled={busy} onChange={(e) => setFields((items) => items.map((f, i) => i === index ? { ...f, label: e.target.value } : f))} /></label>
              <label>Instructions<textarea rows={2} maxLength={2000} value={field.value} disabled={busy} onChange={(e) => setFields((items) => items.map((f, i) => i === index ? { ...f, value: e.target.value } : f))} /></label>
            </div>)}</div>
          </details>

          <p className="context-hint">Start sends included text and fields to <strong>{connection?.name} / {connection?.model}</strong>.</p>
          <button className="primary start-btn" disabled={busy || !purpose.trim() || !connection?.model || !modelReady}><Play size={15} />{checking ? 'Checking connection…' : countdown !== null ? `Starting in ${countdown}…` : busy ? 'Starting…' : 'Start session'}</button>
          {checking && <p role="status">Checking your API key and selected model…</p>}
          {countdown !== null && <div role="status"><p>Connection confirmed. Starting session in {countdown} seconds.</p><button type="button" className="text-button" onClick={() => { attempt.current++; setCountdown(null); setBusy(false); }}>Cancel start</button></div>}
        </div>
      </form>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </main>;
}

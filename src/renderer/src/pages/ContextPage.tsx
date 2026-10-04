import { useState } from 'react';
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
  const connection = activeConnection(state.settings!);
  async function loadFolders() {
    setBusy(true); setError('');
    try { const loaded = await unwrap(window.novi.pickContextFolders()); if (loaded.length) setFolders(loaded); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  async function start() {
    setBusy(true); setError('');
    try { onSaved(await unwrap(window.novi.startContext({ folderIds: folders.map((f) => f.id), purpose, fields }))); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  if (settings) return <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={() => {}} />;
  return <main className="context-page">
    <header className="context-header"><Brand /><div><button className="text-button" disabled={busy} onClick={() => setSettings(true)}>Settings</button><button className="text-button" disabled={busy} onClick={onSignOut}>Sign out</button></div></header>
    <section className="context-setup">
      <span className="eyebrow">CONTEXT · TEMPORARY SESSIONS</span>
      <h1>Give Novi the background.</h1>
      <p>Choose your model, load your reference folders, then start a private local session. Nothing is sent until you start.</p>
      <h2>1. Choose provider & model</h2>
      <ProviderPicker state={state} disabled={busy} onSaved={onSaved} onError={setError} />
      {!connection && <p className="managed-note">No enabled API connection is available. Open Settings ? API management to enable a shared key, or ask your account owner to add one.</p>}
      <h2>2. Load context</h2>
      <button className="secondary" disabled={busy || !connection} onClick={() => void loadFolders()}><FolderOpen size={16} /> {busy ? 'Working…' : folders.length ? 'Choose folders again' : 'Load context'}</button>
      <p className="context-hint">Select one or more folders. Includes subfolders, UTF-8 TXT, and searchable PDF text. Maximum 30 files / 80,000 text characters. Scans, diagrams, and image-only PDFs need OCR first.</p>
      {folders.map((folder) => <div className="context-folder" key={folder.id}><div><strong>{folder.name}</strong><span>{folder.files.length} files · {folder.characters.toLocaleString()} characters</span><button className="icon-button" disabled={busy} aria-label={`Remove ${folder.name}`} onClick={() => setFolders((items) => items.filter((f) => f.id !== folder.id))}><X size={14} /></button></div><details><summary>Review included files</summary><ul>{folder.files.map((file) => <li key={file}>{file}</li>)}</ul></details></div>)}
      {!!folders.length && <form onSubmit={(event) => { event.preventDefault(); void start(); }}>
        <h2>3. Tell Novi what’s going on</h2>
        <label>Session purpose (required)<textarea required maxLength={2000} rows={3} value={purpose} disabled={busy} onChange={(e) => setPurpose(e.target.value)} placeholder="What are we working on, and what should the AI help you achieve?" /></label>
        <div className="context-fields">{fields.map((field, index) => <div key={index}>
          <label>Custom field {index + 1} name (optional)<input maxLength={80} value={field.label} disabled={busy} onChange={(e) => setFields((items) => items.map((f, i) => i === index ? { ...f, label: e.target.value } : f))} /></label>
          <label>Custom field {index + 1} instructions<textarea rows={3} maxLength={2000} value={field.value} disabled={busy} onChange={(e) => setFields((items) => items.map((f, i) => i === index ? { ...f, value: e.target.value } : f))} /></label>
        </div>)}</div>
        <p className="context-hint">Start sends all included text and these fields to <strong>{connection?.name} / {connection?.model}</strong>. The first reply is saved temporarily as <strong>AI Context.md</strong>. End session deletes local session chats, image copies, and that file. Source folders are untouched. Your provider’s retention policy still applies.</p>
        <button className="primary" disabled={busy || !purpose.trim()}><Play size={16} /> Start session</button>
      </form>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </main>;
}

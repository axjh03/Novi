import { useEffect, useRef, useState } from 'react';
import { Check, FileText, FolderOpen, FolderPlus, Loader2, Lock, Play, X } from 'lucide-react';
import { ENGINES, type EngineId, type EngineModel, type EngineReadiness, type EngineUpdate, type SourcePreview } from '../../../shared/localCoding';
import type { ProviderConnection, Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import { LocalFileExplorer } from './LocalFileExplorer';

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Chooses the engine, then a compatible connection, then a model, and shows the reasoning level that will be used. */
export function useEngineChoice(state: Snapshot, initial?: { engine: EngineId; connectionId: string; model: string }) {
  const [readiness, setReadiness] = useState<EngineReadiness[] | null>(null);
  const [engine, setEngine] = useState<EngineId>(initial?.engine ?? 'codex');
  const [connectionId, setConnectionId] = useState(initial?.connectionId ?? '');
  const [models, setModels] = useState<EngineModel[] | null>(null);
  const [model, setModel] = useState(initial?.model ?? '');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void unwrap(window.novi.getLocalCodingReadiness()).then((items) => {
      if (!alive) return;
      setReadiness(items);
      if (!initial) {
        const first = items.find((item) => item.available);
        if (first) { setEngine(first.engine); setConnectionId(first.connections[0]?.id ?? ''); }
      }
    }).catch((cause) => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, []);
  const ready = readiness?.find((item) => item.engine === engine);
  useEffect(() => {
    if (ready && !ready.connections.some((item) => item.id === connectionId)) setConnectionId(ready.connections[0]?.id ?? '');
  }, [ready, connectionId]);
  useEffect(() => {
    if (!ready?.available || !connectionId) { setModels(null); return; }
    let alive = true;
    setModels(null); setError('');
    void unwrap(window.novi.listEngineModels({ engine, connectionId })).then((list) => {
      if (!alive) return;
      setModels(list);
      setModel((current) => {
        if (list.some((item) => item.id === current)) return current;
        // Prefer the connection's Deep model when this engine offers it.
        const deep = state.settings?.modelRoles?.[connectionId]?.deep;
        return list.find((item) => item.id === deep)?.id ?? list[0]?.id ?? '';
      });
    }).catch((cause) => { if (alive) { setModels([]); setError(errorText(cause)); } });
    return () => { alive = false; };
  }, [engine, connectionId, ready?.available]);
  const chosen = models?.find((item) => item.id === model) ?? null;
  const connection = state.settings?.connections.find((item) => item.id === connectionId);
  return { readiness, ready, engine, setEngine, connectionId, setConnectionId, models, model, setModel, chosen, connection, error };
}

export function EngineFields({ choice, disabled }: { choice: ReturnType<typeof useEngineChoice>; disabled: boolean }) {
  const { readiness, ready, engine, setEngine, connectionId, setConnectionId, models, model, setModel, chosen } = choice;
  return <div className="lc-engine-grid">
    <label>Agent
      <select value={engine} disabled={disabled || !readiness} onChange={(event) => setEngine(event.target.value as EngineId)}>
        {ENGINES.map((item) => { const status = readiness?.find((entry) => entry.engine === item.id); return <option key={item.id} value={item.id}>{item.label}{status && !status.available ? ' (unavailable)' : ''}</option>; })}
      </select>
    </label>
    <label>Connection
      <select value={connectionId} disabled={disabled || !ready?.connections.length} onChange={(event) => setConnectionId(event.target.value)}>
        {!ready?.connections.length && <option value="">No compatible connection</option>}
        {ready?.connections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label>Model
      <select value={model} disabled={disabled || !models?.length} onChange={(event) => setModel(event.target.value)}>
        {!models && <option value="">{ready?.available ? 'Loading models…' : 'Unavailable'}</option>}
        {models?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <div className="lc-reasoning"><span>Reasoning</span><strong>{chosen ? chosen.highestEffort ? `Highest supported · ${chosen.highestEffort}` : 'Model default (no reasoning levels)' : '—'}</strong></div>
    {ready && !ready.available && <p className="lc-problem" role="alert">{ready.problem}</p>}
  </div>;
}

export function LocalCodingSetup({ state, onStarted }: { state: Snapshot; onStarted: (snapshot: Snapshot, conversationId: string) => void }) {
  const choice = useEngineChoice(state);
  const [folder, setFolder] = useState(() => localStorage.getItem('novi_local_coding_folder') || '');
  const [extra, setExtra] = useState<string[]>([]);
  const [explorer, setExplorer] = useState<'folder' | 'files' | null>(null);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'start'>(''), [error, setError] = useState('');
  const attempt = useRef(0);

  async function review(workingFolder = folder, extraPaths = extra) {
    if (!workingFolder.trim()) return;
    const current = ++attempt.current;
    setBusy('preview'); setError(''); setPreview(null);
    try {
      const next = await unwrap(window.novi.selectLocalSources({ workingFolder: workingFolder.trim(), extra: extraPaths }));
      if (current === attempt.current) setPreview(next);
    } catch (cause) { if (current === attempt.current) setError(errorText(cause)); }
    finally { if (current === attempt.current) setBusy(''); }
  }

  async function start() {
    if (!preview || preview.blocking || !choice.chosen || !choice.connectionId) return;
    setBusy('start'); setError('');
    try {
      const result = await unwrap(window.novi.captureLocalSources({ selectionId: preview.selectionId, engine: choice.engine, connectionId: choice.connectionId, model: choice.model }));
      try { localStorage.setItem('novi_local_coding_folder', folder.trim()); } catch { /* convenience only */ }
      onStarted(result.snapshot, result.conversationId);
    } catch (cause) { setError(errorText(cause)); setPreview(null); }
    finally { setBusy(''); }
  }

  const changeSources = (nextFolder: string, nextExtra: string[]) => { setFolder(nextFolder); setExtra(nextExtra); setPreview(null); if (nextFolder.trim()) void review(nextFolder, nextExtra); };
  const provider = ENGINES.find((item) => item.id === choice.engine)!;
  const canStart = Boolean(preview && !preview.blocking && choice.chosen && choice.connectionId && !busy && choice.ready?.available);

  return <section className="lc-setup" aria-label="Local Coding setup">
    <header className="lc-setup-header">
      <h2>Local Coding</h2>
      <p>Ask questions about a project on this computer. The agent reads a captured copy, and every code change stays a proposal you review. Nothing is applied to your files.</p>
    </header>

    <div className="lc-field">
      <label htmlFor="lc-folder">Working folder</label>
      <form className="lc-folder-row" onSubmit={(event) => { event.preventDefault(); changeSources(folder, extra); }}>
        <input id="lc-folder" value={folder} spellCheck={false} disabled={!!busy} onChange={(event) => { setFolder(event.target.value); setPreview(null); }} placeholder="/Users/me/projects/interview-app" />
        <button type="submit" className="secondary" disabled={!!busy || !folder.trim()}>Open</button>
      </form>
      <button type="button" className="text-button lc-browse" disabled={!!busy} onClick={() => setExplorer('folder')}><FolderOpen size={14} />Browse inside Novi</button>
    </div>

    <div className="lc-field">
      <span className="lc-label">Additional context</span>
      <div className="lc-extra">
        {extra.map((path) => <span className="lc-chip" key={path} title={path}><FileText size={13} aria-hidden="true" />{path.split(/[\\/]/).pop()}<button type="button" className="icon-button" aria-label={`Remove ${path}`} disabled={!!busy} onClick={() => changeSources(folder, extra.filter((item) => item !== path))}><X size={12} /></button></span>)}
        <button type="button" className="secondary lc-add" disabled={!!busy || !folder.trim()} onClick={() => setExplorer('files')}><FolderPlus size={14} />Add files or folders</button>
      </div>
      <small>Screenshots, photos and audio transcripts are added in the message box after the session starts.</small>
    </div>

    <EngineFields choice={choice} disabled={!!busy} />
    {choice.error && <p className="error" role="alert">{choice.error}</p>}

    {busy === 'preview' && <p className="lc-status" role="status"><Loader2 size={14} className="spin" />Checking the selected files…</p>}
    {preview && <div className="lc-preview" aria-label="Source preview">
      <p><strong>Working folder:</strong> <span title={preview.roots[0].canonicalLocalPath}>{preview.roots[0].canonicalLocalPath}</span></p>
      <p><strong>Included:</strong> {preview.included.toLocaleString()} source and configuration files · {size(preview.includedBytes)}</p>
      {preview.excludedCount > 0 && <details className="lc-excluded"><summary><strong>Excluded:</strong> {preview.excludedCount.toLocaleString()} items (dependencies, generated output, credentials, binaries)</summary>
        <ul>{preview.excluded.map((item) => <li key={`${item.path}:${item.reason}`}><span>{item.path}</span><small>{item.reason}</small></li>)}</ul>
        {preview.excludedCount > preview.excluded.length && <small>And {preview.excludedCount - preview.excluded.length} more.</small>}
      </details>}
      <details className="lc-included"><summary>View included files</summary>
        <ul>{preview.includedPaths.map((path) => <li key={path}>{path}</li>)}</ul>
        {preview.included > preview.includedPaths.length && <small>And {preview.included - preview.includedPaths.length} more.</small>}
      </details>
      {preview.blocking && <p className="error" role="alert">{preview.blocking}</p>}
    </div>}

    <div className="lc-readonly"><Lock size={14} aria-hidden="true" /><span><strong>Read-only.</strong> All code changes remain proposals. Files are captured into Novi; the agent reads them with read-only tools and sends what it reads to {choice.connection ? `${choice.connection.name} (${provider.connectionLabel})` : `your ${provider.connectionLabel} connection`}.{choice.engine === 'antigravity' ? ' Antigravity (agy) does not support screenshots in headless mode.' : ''}</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="primary lc-start" disabled={!canStart} onClick={() => void start()}>{busy === 'start' ? <Loader2 size={15} className="spin" /> : <Play size={15} />}{busy === 'start' ? 'Capturing files…' : 'Start session'}</button>

    {explorer && <LocalFileExplorer mode={explorer} initialPath={explorer === 'folder' ? folder || undefined : folder || undefined}
      onCancel={() => setExplorer(null)}
      onUseFolder={(path) => { setExplorer(null); changeSources(path, extra); }}
      onAddPaths={(paths) => { setExplorer(null); changeSources(folder, [...extra, ...paths.filter((path) => !extra.includes(path))].slice(0, 8)); }} />}
  </section>;
}

/** Settings: whether each agent can run here, and why not. */
export function EngineReadinessList({ connections }: { connections?: ProviderConnection[] }) {
  const [items, setItems] = useState<EngineReadiness[] | null>(null), [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true); setError('');
    try { setItems(await unwrap(window.novi.getLocalCodingReadiness())); }
    catch (cause) { setError(errorText(cause)); }
    finally { setRefreshing(false); }
  }
  useEffect(() => { void refresh(); }, [connections]);
  return <div>
    <button type="button" className="text-button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Checking agents…' : 'Refresh agents'}</button>
    {error && <p className="error" role="alert">{error}</p>}
    {items && <ul className="lc-readiness">{items.map(item => <EngineStatusRow key={item.engine} item={item} onInstalled={setItems} />)}</ul>}
  </div>;
}

function EngineStatusRow({ item, onInstalled }: { item: EngineReadiness; onInstalled: (items: EngineReadiness[]) => void }) {
  const [connectionId, setConnectionId] = useState(item.connections[0]?.id ?? '');
  const [update, setUpdate] = useState<EngineUpdate | null>(null);
  const [busy, setBusy] = useState(''), [status, setStatus] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (!item.connections.some(connection => connection.id === connectionId)) setConnectionId(item.connections[0]?.id ?? '');
  }, [item.connections, connectionId]);
  useEffect(() => { setStatus(''); }, [connectionId]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError(''); setStatus('');
    try { await action(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(''); }
  }
  return <li className={item.available ? 'ok' : 'failed'}>
    {item.available ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
    <div>
      <strong>{item.label}</strong>
      <p>{item.installedVersion ? `Installed · ${item.installedVersion}` : 'Not installed or needs repair'}</p>
      {item.problem && <p>{item.problem}</p>}
      {item.connections.length > 0 && <label>API connection
        <select value={connectionId} disabled={!!busy} onChange={event => setConnectionId(event.target.value)}>
          {item.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
        </select>
      </label>}
      <div>
        <button type="button" className="text-button" disabled={!!busy || !item.installedVersion || !connectionId} onClick={() => void run('Checking login…', async () => {
          setStatus(await unwrap(window.novi.checkEngineLogin({ engine: item.engine, connectionId })));
        })}>Check login</button>
        {item.installedVersion && <button type="button" className="text-button" disabled={!!busy} onClick={() => void run('Checking updates…', async () => {
          const result = await unwrap(window.novi.checkEngineUpdate(item.engine));
          setUpdate(result);
          setStatus(result.updateAvailable ? `Update available · ${result.latestVersion}` : 'Agent is up to date.');
        })}>Check for updates</button>}
        {(!item.installedVersion || update?.updateAvailable) && <button type="button" className="text-button" disabled={!!busy} onClick={() => void run(item.installedVersion ? 'Updating agent…' : 'Installing agent…', async () => {
          onInstalled(await unwrap(window.novi.installEngine(item.engine)));
          setUpdate(null); setStatus('Agent installed. Choose a saved connection and check login.');
        })}>{item.installedVersion ? 'Update' : 'Install'}</button>}
      </div>
      {(busy || status) && <p role="status">{busy || status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </li>;
}

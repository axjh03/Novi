import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Code2, Download, FileText, FolderOpen, FolderPlus, Loader2, Lock, Play, RefreshCw, Terminal, Trash2, X } from 'lucide-react';
import { ENGINES, type EngineId, type EngineModel, type EngineReadiness, type EngineUpdate, type SourcePreview } from '../../../shared/localCoding';
import type { ProviderConnection, Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import { LocalFileExplorer } from './LocalFileExplorer';
import { lockedMessage } from '../../../shared/plans';
import { PlanLock } from './PlanLock';

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
    <div className="lc-reasoning"><span>Reasoning</span><strong>{chosen ? chosen.highestEffort ? `Highest supported · ${chosen.highestEffort}` : 'Model default (no reasoning levels)' : 'Choose a model first'}</strong></div>
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
/**
 * Settings › API: the Local Coding agents (engines), with install, update, sign-in check and removal.
 *
 * @param locked the license's plan doesn't include Local Coding: only the heading and the lock
 *   message are shown, and the main process is never asked about engines (it would refuse).
 */
export function EngineReadinessList({ connections, managed, locked = false }: { connections?: ProviderConnection[]; managed: boolean; locked?: boolean }) {
  const [items, setItems] = useState<EngineReadiness[] | null>(null), [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (locked) return;
    setRefreshing(true); setError('');
    try { setItems(await unwrap(window.novi.getLocalCodingReadiness())); }
    catch (cause) { setError(errorText(cause)); }
    finally { setRefreshing(false); }
  }
  useEffect(() => { void refresh(); }, [connections, locked]);
  if (locked) return <section className="provider-manager" aria-label="Local Coding agents">
    <div className="section-title"><div><div className="studio-heading"><Terminal size={18} /><h2>Local Coding agents</h2><PlanLock feature="local-coding" /></div><p className="muted">{lockedMessage('local-coding')}</p></div></div>
  </section>;
  return <section className="provider-manager" aria-label="Local Coding agents">
    <div className="section-title"><div><div className="studio-heading"><Terminal size={18} /><h2>Local Coding agents</h2>{items && <span className="studio-count">{items.filter(item => item.available).length} ready</span>}</div><p className="muted">Connect your projects to an agent. Uses your saved provider key.</p></div>
      <button type="button" className="studio-refresh" aria-label="Refresh coding agents" title="Refresh agents" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /></button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {!items && !error && <p className="muted" role="status">Checking agents…</p>}
    {items && <ul className="agent-list">{items.map(item => <EngineStatusRow key={item.engine} item={item} connections={connections ?? []} managed={managed} onInstalled={setItems} />)}</ul>}
  </section>;
}

function EngineStatusRow({ item, connections, managed, onInstalled }: { item: EngineReadiness; connections: ProviderConnection[]; managed: boolean; onInstalled: (items: EngineReadiness[]) => void }) {
  const [connectionId, setConnectionId] = useState(item.connections[0]?.id ?? '');
  const [update, setUpdate] = useState<EngineUpdate | null>(null);
  const [busy, setBusy] = useState(''), [status, setStatus] = useState(''), [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  useEffect(() => {
    if (!item.connections.some(connection => connection.id === connectionId)) setConnectionId(item.connections[0]?.id ?? '');
  }, [item.connections, connectionId]);
  useEffect(() => { setStatus(''); }, [connectionId]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError(''); setStatus('');
    try { await action(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(''); }
  }
  const spec = ENGINES.find(engine => engine.id === item.engine)!;
  const state = !item.installedVersion ? 'missing' : item.available ? 'ready' : 'blocked';
  const sameProvider = connections.filter(connection => connection.provider === spec.provider);
  // The main-process text points to this very screen; here, say what to do instead.
  const key = `${/^[AEIOU]/.test(spec.connectionLabel) ? 'an' : 'a'} ${spec.connectionLabel} key`;
  const hint = state === 'missing' ? null
    : state === 'ready' ? null
    : !sameProvider.length ? `Add ${key} ${managed ? 'in the web portal' : 'above'} to connect.`
    : sameProvider.every(connection => connection.enabled === false) ? `Select your ${spec.connectionLabel} connection above.`
    : item.problem;
  return <li className={`agent-row is-${state} ${busy ? 'is-busy' : ''}`} aria-label={item.label} aria-busy={!!busy}>
    <span className="studio-avatar" aria-hidden="true"><Code2 size={20} /></span>
    <div className="agent-body"><div className="agent-head">
      <strong>{item.label}</strong>{item.installedVersion && <span className="agent-version" title={item.installedVersion}>v{item.installedVersion.replace(/-(win32|linux|darwin)-.*$/, '')}</span>}
      {item.installedVersion && <span className="agent-status">{state === 'ready' ? <><Check size={11} aria-hidden="true" />Ready</> : 'Key needed'}</span>}
    </div>
    <small>{spec.connectionLabel}{item.connections.length === 1 && <> · {item.connections[0].name}</>}</small>
    {hint && <p className="agent-hint">{hint}</p>}
    {item.installedVersion && item.connections.length > 1 && <label>Connection
      <select value={connectionId} disabled={!!busy} onChange={event => setConnectionId(event.target.value)}>
        {item.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
      </select>
    </label>}
    {item.installedVersion && <div className="agent-links">
      {connectionId && <button type="button" disabled={!!busy} onClick={() => void run('Testing API key…', async () => {
        setStatus(await unwrap(window.novi.checkEngineLogin({ engine: item.engine, connectionId })));
      })}>Test API key</button>}
      <button type="button" disabled={!!busy} onClick={() => void run('Checking…', async () => {
        const result = await unwrap(window.novi.checkEngineUpdate(item.engine)); setUpdate(result);
        setStatus(result.updateAvailable ? `v${result.latestVersion.replace(/-(win32|linux|darwin)-.*$/, '')} available` : 'Up to date');
      })}>Check for updates</button>
      <button type="button" className="agent-uninstall" disabled={!!busy} onClick={() => setRemoving(true)}><Trash2 size={11} />Uninstall</button>
    </div>}
    {(busy || status) && <p className="agent-feedback" role="status">{busy ? <><Loader2 size={12} className="spin" aria-hidden="true" />{busy}</> : <><Check size={12} />{status}</>}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    </div>
    <div className="agent-actions">
      {(!item.installedVersion || update?.updateAvailable) && <button type="button" className="secondary" disabled={!!busy} onClick={() => void run(item.installedVersion ? 'Updating…' : 'Installing…', async () => {
        onInstalled(await unwrap(window.novi.installEngine(item.engine)));
        setUpdate(null);
      })}>{busy ? <Loader2 size={14} className="spin" /> : item.installedVersion ? <ArrowUp size={14} /> : <Download size={14} />}{item.installedVersion ? 'Update' : 'Install'}</button>}
    </div>
    {removing && <div className="agent-confirm" role="alert"><p>Uninstall {item.label}? Your projects, history, and API connections stay.</p><div><button type="button" className="text-button" disabled={!!busy} onClick={() => setRemoving(false)}>Cancel</button><button type="button" className="danger-button" disabled={!!busy} onClick={() => void run('Uninstalling…', async () => {
      onInstalled(await unwrap(window.novi.uninstallEngine(item.engine))); setUpdate(null); setRemoving(false);
    })}>Uninstall agent</button></div></div>}
  </li>;
}

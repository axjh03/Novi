import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Download, FolderOpen, Loader2, Lock, Play, RefreshCw, Terminal, Trash2 } from 'lucide-react';
import { ENGINES, type EngineId, type EngineModel, type EngineReadiness, type EngineUpdate, type SourcePreview } from '../../../shared/localCoding';
import type { ProviderConnection, Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import { LocalFileExplorer } from './LocalFileExplorer';
import { lockedMessage } from '../../../shared/plans';
import { PlanLock } from './PlanLock';
import codexLogo from '../assets/brands/codex.svg';
import claudeLogo from '../assets/brands/claude.svg';
import geminiLogo from '../assets/brands/gemini.svg';

const agentLogos = { codex: codexLogo, claude: claudeLogo, antigravity: geminiLogo };

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** The coding agent that runs on a provider connection: OpenAI keys run Codex, Anthropic keys Claude Code, Gemini keys Antigravity. */
export const engineForConnection = (connection: Pick<ProviderConnection, 'provider'>) => ENGINES.find((engine) => engine.provider === connection.provider) ?? null;

/**
 * The agent follows the chosen connection; only the model is a separate choice.
 * Connections are offered when their provider has an installed agent that accepts them.
 */
export function useEngineChoice(state: Snapshot, initial?: { engine: EngineId; connectionId: string; model: string }) {
  const [readiness, setReadiness] = useState<EngineReadiness[] | null>(null);
  const [connectionId, setConnectionId] = useState(initial?.connectionId ?? '');
  const [models, setModels] = useState<EngineModel[] | null>(null);
  const [model, setModel] = useState(initial?.model ?? '');
  const [error, setError] = useState('');
  const settings = state.settings;
  const connections = (settings?.connections ?? []).filter((connection) => connection.enabled !== false && engineForConnection(connection));
  useEffect(() => {
    let alive = true;
    void unwrap(window.novi.getLocalCodingReadiness()).then((items) => { if (alive) setReadiness(items); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, []);
  // A connection is usable when its agent is installed and lists it; prefer the active one.
  const usable = connections.filter((connection) => readiness?.find((item) => item.engine === engineForConnection(connection)!.id)?.connections.some((entry) => entry.id === connection.id));
  useEffect(() => {
    if (!readiness) return;
    if (usable.some((connection) => connection.id === connectionId)) return;
    const preferred = usable.find((connection) => connection.id === settings?.activeConnectionId) ?? usable[0];
    setConnectionId(preferred?.id ?? '');
  }, [readiness, connectionId, usable.map((connection) => connection.id).join(','), settings?.activeConnectionId]);
  const connection = connections.find((item) => item.id === connectionId);
  const engine = connection ? engineForConnection(connection)!.id : null;
  const ready = engine ? readiness?.find((item) => item.engine === engine) : undefined;
  useEffect(() => {
    if (!engine || !ready?.available || !connectionId) { setModels(null); return; }
    let alive = true;
    setModels(null); setError('');
    void unwrap(window.novi.listEngineModels({ engine, connectionId })).then((list) => {
      if (!alive) return;
      setModels(list);
      setModel((current) => {
        if (list.some((item) => item.id === current)) return current;
        // Prefer the connection's Deep model when this agent offers it, then the connection's own model.
        const deep = settings?.modelRoles?.[connectionId]?.deep;
        return list.find((item) => item.id === deep)?.id ?? list.find((item) => item.id === connection?.model)?.id ?? list[0]?.id ?? '';
      });
    }).catch((cause) => { if (alive) { setModels([]); setError(errorText(cause)); } });
    return () => { alive = false; };
  }, [engine, connectionId, ready?.available]);
  const chosen = models?.find((item) => item.id === model) ?? null;
  // Why nothing can start: no connection at all, or every connection's agent is missing.
  const problem = !connections.length ? 'Add an OpenAI, Anthropic or Gemini connection in Settings › API Management first.'
    : readiness && !usable.length ? `Install the coding agent for your connection in Settings › API Management › Local Coding agents (${connections.map((item) => engineForConnection(item)!.label).filter((label, index, all) => all.indexOf(label) === index).join(', ')}).`
    : ready && !ready.available ? ready.problem : null;
  return { readiness, ready, engine, connections: usable, connectionId, setConnectionId, models, model, setModel, chosen, connection, error, problem };
}

export function EngineFields({ choice, disabled }: { choice: ReturnType<typeof useEngineChoice>; disabled: boolean }) {
  const { readiness, engine, connections, connectionId, setConnectionId, models, model, setModel, chosen, problem } = choice;
  const spec = ENGINES.find((item) => item.id === engine);
  return <div className="lc-engine-grid">
    <label>Connection
      <select value={connectionId} disabled={disabled || !readiness || !connections.length} onChange={(event) => setConnectionId(event.target.value)}>
        {!connections.length && <option value="">{readiness ? 'No usable connection' : 'Checking agents…'}</option>}
        {connections.map((item) => <option key={item.id} value={item.id}>{item.name} · {engineForConnection(item)!.connectionLabel}</option>)}
      </select>
    </label>
    <label>Model
      <select value={model} disabled={disabled || !models?.length} onChange={(event) => setModel(event.target.value)}>
        {!models && <option value="">{engine && choice.ready?.available ? 'Loading models…' : 'Choose a connection'}</option>}
        {models?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <div className="lc-reasoning"><span>Agent</span><strong>{spec ? <><img src={agentLogos[spec.id]} alt="" width={14} height={14} aria-hidden="true" />{spec.label}</> : 'Follows the connection'}</strong>{chosen && <span className="muted">{chosen.highestEffort ? ' · reasoning high' : ''}</span>}</div>
    {problem && <p className="lc-problem" role="alert">{problem}</p>}
  </div>;
}

export function LocalCodingSetup({ state, onStarted }: { state: Snapshot; onStarted: (snapshot: Snapshot, conversationId: string) => void }) {
  const choice = useEngineChoice(state);
  const [folder, setFolder] = useState(() => localStorage.getItem('novi_local_coding_folder') || '');
  const [explorer, setExplorer] = useState(false);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'start'>(''), [error, setError] = useState('');
  const attempt = useRef(0);

  async function check(workingFolder = folder) {
    if (!workingFolder.trim()) return;
    const current = ++attempt.current;
    setBusy('preview'); setError(''); setPreview(null);
    try {
      const next = await unwrap(window.novi.selectLocalSources({ workingFolder: workingFolder.trim(), extra: [] }));
      if (current === attempt.current) setPreview(next);
    } catch (cause) { if (current === attempt.current) setError(errorText(cause)); }
    finally { if (current === attempt.current) setBusy(''); }
  }
  // A remembered folder is checked as soon as the screen opens.
  useEffect(() => { if (folder.trim()) void check(folder); }, []);

  async function start() {
    if (!preview || preview.blocking || !choice.chosen || !choice.connectionId || !choice.engine) return;
    setBusy('start'); setError('');
    try {
      const result = await unwrap(window.novi.captureLocalSources({ selectionId: preview.selectionId, engine: choice.engine, connectionId: choice.connectionId, model: choice.model }));
      try { localStorage.setItem('novi_local_coding_folder', folder.trim()); } catch { /* convenience only */ }
      onStarted(result.snapshot, result.conversationId);
    } catch (cause) { setError(errorText(cause)); setPreview(null); }
    finally { setBusy(''); }
  }

  const useFolder = (next: string) => { setFolder(next); setPreview(null); if (next.trim()) void check(next); };
  const canStart = Boolean(preview && !preview.blocking && choice.chosen && choice.connectionId && !busy && choice.ready?.available);

  return <section className="lc-setup" aria-label="Local Coding setup">
    <header className="lc-setup-header">
      <h2>Local Coding</h2>
      <p>Pick a project folder. A coding agent reads it in the background and answers in chat; proposed changes open in a review window with a file tree and diffs. Your files are never modified.</p>
    </header>

    <div className="lc-field">
      <label htmlFor="lc-folder">Working folder</label>
      <form className="lc-folder-row" onSubmit={(event) => { event.preventDefault(); useFolder(folder); }}>
        <input id="lc-folder" value={folder} spellCheck={false} disabled={!!busy} onChange={(event) => { setFolder(event.target.value); setPreview(null); }} placeholder="/Users/me/projects/interview-app" />
        <button type="submit" className="secondary" disabled={!!busy || !folder.trim()}>Open</button>
      </form>
      <button type="button" className="text-button lc-browse" disabled={!!busy} onClick={() => setExplorer(true)}><FolderOpen size={14} />Browse</button>
      {busy === 'preview' && <p className="lc-status" role="status"><Loader2 size={14} className="spin" />Scanning the folder…</p>}
      {preview && <p className="lc-folder-summary" aria-label="Folder summary"><Check size={13} aria-hidden="true" /><span title={preview.roots[0].canonicalLocalPath}>{preview.roots[0].canonicalLocalPath}</span> · {preview.included.toLocaleString()} files · {size(preview.includedBytes)}{preview.excludedCount > 0 ? ` · ${preview.excludedCount.toLocaleString()} skipped (dependencies, build output, secrets, binaries)` : ''}</p>}
      {preview?.blocking && <p className="error" role="alert">{preview.blocking}</p>}
    </div>

    <EngineFields choice={choice} disabled={!!busy} />
    {choice.error && <p className="error" role="alert">{choice.error}</p>}

    <div className="lc-readonly"><Lock size={14} aria-hidden="true" /><span><strong>Read-only.</strong> The agent only reads; nothing is written, run or deleted. What it reads is sent to {choice.connection ? `${choice.connection.name} (${engineForConnection(choice.connection)!.connectionLabel})` : 'the chosen connection'}.{choice.engine === 'antigravity' ? ' Antigravity (agy) does not support screenshots in headless mode.' : ''}</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="primary lc-start" disabled={!canStart} onClick={() => void start()}>{busy === 'start' ? <Loader2 size={15} className="spin" /> : <Play size={15} />}{busy === 'start' ? 'Reading the folder…' : 'Start'}</button>

    {explorer && <LocalFileExplorer mode="folder" initialPath={folder || undefined} onCancel={() => setExplorer(false)} onUseFolder={(path) => { setExplorer(false); useFolder(path); }} />}
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
    <span className="studio-avatar agent-brand" aria-hidden="true"><img src={agentLogos[item.engine]} alt="" width={26} height={26} /></span>
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

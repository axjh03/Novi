import { useState } from 'react';
import { GitBranch, Loader2, RefreshCw, Settings2, X } from 'lucide-react';
import { ENGINES, type ProjectState, type RefreshConflict, type RefreshDecision } from '../../../shared/localCoding';
import type { Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import { LocalFileExplorer } from './LocalFileExplorer';
import { EngineFields, useEngineChoice } from './LocalCodingSetup';

export interface ReconcileRequest { baseVersionId: string; fromVersionId: string; fromLabel: string; fileIds: string[]; files: string[] }

export function LocalCodingHistory({ state, project, busy, onProject, onSnapshot, onError, onReconcile, readyNotice, onDismissNotice }: {
  state: Snapshot; project: ProjectState; busy: boolean;
  onProject: (project: ProjectState) => void; onSnapshot: (snapshot: Snapshot) => void; onError: (message: string) => void;
  onReconcile: (request: ReconcileRequest) => void;
  readyNotice: { versionId: string; label: string; baseLabel: string } | null; onDismissNotice: () => void;
}) {
  const [working, setWorking] = useState(''), [explorer, setExplorer] = useState(false), [engineOpen, setEngineOpen] = useState(false);
  const [pending, setPending] = useState<{ id: string; conflicts: RefreshConflict[]; carryVersionId: string; carryLabel: string } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, RefreshDecision | 'ai'>>({});
  const byId = new Map(project.versions.map((version) => [version.id, version]));
  const selected = byId.get(project.selectedVersionId);
  const parent = selected?.parentVersionId ? byId.get(selected.parentVersionId) : null;
  const baseline = selected && selected.kind !== 'local' ? byId.get(selected.localSnapshotId) : null;
  const running = project.activeTaskVersionId ? byId.get(project.activeTaskVersionId) : null;
  const engineLabel = ENGINES.find((item) => item.id === project.engine)?.label ?? project.engine;

  async function select(versionId: string) {
    try { onProject(await unwrap(window.novi.selectProjectVersion({ projectId: project.projectId, versionId }))); }
    catch (cause) { onError(errorText(cause)); }
  }
  async function refresh(carry: boolean, addPaths: string[] = []) {
    if (busy || working) return;
    setWorking(carry ? 'Refreshing and carrying forward…' : addPaths.length ? 'Adding sources…' : 'Capturing latest local files…');
    try {
      const carryVersionId = carry && selected && selected.kind !== 'local' ? selected.id : null;
      const { result, project: next } = await unwrap(window.novi.refreshLocalSources({ projectId: project.projectId, carryVersionId, addPaths }));
      onProject(next);
      if (result.pendingId && carryVersionId) {
        setDecisions({});
        setPending({ id: result.pendingId, conflicts: result.conflicts, carryVersionId, carryLabel: selected!.label });
      }
    } catch (cause) { onError(errorText(cause)); }
    finally { setWorking(''); }
  }
  async function resolve() {
    if (!pending) return;
    const ai = pending.conflicts.filter((conflict) => decisions[conflict.fileId] === 'ai');
    // Files sent to the AI start from the local side; its proposal is then validated like any other.
    const final: Record<string, RefreshDecision> = Object.fromEntries(pending.conflicts.map((conflict) => [conflict.fileId, decisions[conflict.fileId] === 'keep-proposed' ? 'keep-proposed' : 'keep-local'] as const));
    setWorking('Combining…');
    try {
      const { result, project: next } = await unwrap(window.novi.resolveRefreshConflict({ projectId: project.projectId, pendingId: pending.id, decisions: final }));
      onProject(next);
      const carry = pending;
      setPending(null);
      if (ai.length && result.resultVersionId) onReconcile({ baseVersionId: result.resultVersionId, fromVersionId: carry.carryVersionId, fromLabel: carry.carryLabel, fileIds: ai.map((item) => item.fileId), files: ai.map((item) => item.relativePath) });
    } catch (cause) { onError(errorText(cause)); }
    finally { setWorking(''); }
  }
  async function compare(conflict: RefreshConflict) {
    try { await unwrap(window.novi.openReview({ projectId: project.projectId, fromVersionId: project.selectedVersionId, toVersionId: pending!.carryVersionId, fileId: conflict.fileId })); }
    catch (cause) { onError(errorText(cause)); }
  }

  return <section className="lc-history" aria-label="Local Coding versions">
    <div className="lc-history-top">
      <span className="lc-session-name" title={project.roots.map((root) => root.canonicalLocalPath).join('\n')}><GitBranch size={14} aria-hidden="true" />{project.name}</span>
      <span className="lc-engine" title={`${project.connectionName}${project.reasoningEffort ? ` · reasoning ${project.reasoningEffort}` : ''}`}>{engineLabel} · {project.model}</span>
      <button type="button" className="icon-button" aria-label="Change agent or model" title="Change agent or model" disabled={busy || !!working} onClick={() => setEngineOpen((open) => !open)}><Settings2 size={14} /></button>
    </div>
    <div className="lc-chips" role="group" aria-label="Context version">
      {project.versions.map((version) => <button type="button" key={version.id} className={`lc-version ${version.kind}`} aria-pressed={version.id === project.selectedVersionId}
        title={version.parentVersionId ? `Based on ${byId.get(version.parentVersionId)?.label}` : 'Captured from your files'} onClick={() => void select(version.id)}>
        {version.label}{version.id === project.activeTaskVersionId && <Loader2 size={11} className="spin" aria-label="Request running on this version" />}
      </button>)}
    </div>
    <p className="lc-next">
      Next request uses: <strong>{selected?.label ?? '—'}</strong>
      {parent && <> · Based on {parent.label}</>}
      {baseline && <> · local baseline {baseline.label}</>}
      {running && running.id !== project.selectedVersionId && <> · running on {running.label}</>}
    </p>
    {readyNotice && <p className="lc-ready" role="status">{readyNotice.label} is ready (based on {readyNotice.baseLabel}).
      <button type="button" className="text-button" onClick={() => { void select(readyNotice.versionId); onDismissNotice(); }}>View it</button>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismissNotice}><X size={12} /></button></p>}
    <div className="lc-actions">
      <button type="button" className="text-button" disabled={busy || !!working} onClick={() => void refresh(false)}><RefreshCw size={13} />Capture latest local files</button>
      <button type="button" className="text-button" disabled={busy || !!working || !selected || selected.kind === 'local'} title={selected?.kind === 'local' ? 'Select an iteration to carry forward' : undefined} onClick={() => void refresh(true)}><RefreshCw size={13} />Refresh and carry forward {selected && selected.kind !== 'local' ? selected.label : 'an iteration'}</button>
      <button type="button" className="text-button" disabled={busy || !!working} onClick={() => setExplorer(true)}>Add sources</button>
      {working && <span className="lc-status" role="status"><Loader2 size={13} className="spin" />{working}</span>}
    </div>
    {engineOpen && <EngineSwitch state={state} project={project} onClose={() => setEngineOpen(false)} onSaved={(snapshot, next) => { onSnapshot(snapshot); onProject(next); setEngineOpen(false); }} onError={onError} />}
    {explorer && <LocalFileExplorer mode="files" initialPath={project.roots[0].canonicalLocalPath} onCancel={() => setExplorer(false)} onAddPaths={(paths) => { setExplorer(false); void refresh(false, paths); }} />}
    {pending && <div className="session-confirm" role="alertdialog" aria-modal="true" aria-label="Resolve refresh conflicts"><div className="lc-conflicts">
      <h2>Local files changed where {pending.carryLabel} proposed changes</h2>
      <p>Choose what each file should contain in the combined version. This changes Novi's virtual copy only; your files are not touched.</p>
      <ul>{pending.conflicts.map((conflict) => <li key={conflict.fileId}>
        <span className="lc-conflict-path">{conflict.rootName}/{conflict.relativePath}</span>
        <small>Local: {conflict.local === 'absent' ? 'deleted' : 'changed'} · {pending.carryLabel}: {conflict.proposed === 'absent' ? 'deleted' : 'changed'}</small>
        <div className="lc-conflict-actions" role="group" aria-label={`Resolve ${conflict.relativePath}`}>
          <button type="button" className="text-button" onClick={() => void compare(conflict)}>Compare</button>
          {(['keep-local', 'keep-proposed', 'ai'] as const).map((choice) => <button type="button" key={choice} className={`text-button ${decisions[conflict.fileId] === choice ? 'chosen' : ''}`} aria-pressed={decisions[conflict.fileId] === choice}
            onClick={() => setDecisions((current) => ({ ...current, [conflict.fileId]: choice }))}>{choice === 'keep-local' ? 'Keep local in proposal' : choice === 'keep-proposed' ? 'Keep proposed' : 'Ask AI to reconcile'}</button>)}
        </div>
      </li>)}</ul>
      <div className="lc-conflict-footer">
        <button type="button" className="text-button" disabled={!!working} onClick={() => setPending(null)}>Decide later</button>
        <button type="button" className="primary" disabled={!!working || pending.conflicts.some((conflict) => !decisions[conflict.fileId])} onClick={() => void resolve()}>Create combined version</button>
      </div>
      <small>“Decide later” keeps the new local snapshot; run “Refresh and carry forward” again to combine.</small>
    </div></div>}
  </section>;
}

function EngineSwitch({ state, project, onClose, onSaved, onError }: { state: Snapshot; project: ProjectState; onClose: () => void; onSaved: (snapshot: Snapshot, project: ProjectState) => void; onError: (message: string) => void }) {
  const choice = useEngineChoice(state, { engine: project.engine, connectionId: project.connectionId, model: project.model });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const result = await unwrap(window.novi.updateLocalCodingEngine({ projectId: project.projectId, engine: choice.engine, connectionId: choice.connectionId, model: choice.model }));
      onSaved(result.snapshot, result.project);
    } catch (cause) { onError(errorText(cause)); }
    finally { setSaving(false); }
  }
  return <div className="lc-engine-switch">
    <EngineFields choice={choice} disabled={saving} />
    {choice.error && <p className="error" role="alert">{choice.error}</p>}
    <small>The next request starts a fresh engine session from the selected version. Saved versions stay as they are.</small>
    <div><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={saving || !choice.chosen || !choice.ready?.available} onClick={() => void save()}>Use this agent</button></div>
  </div>;
}

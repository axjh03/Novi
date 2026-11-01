'use client';

import { useState } from 'react';
import type { ActionArtifact } from '@/lib/github-artifacts';

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Frees GitHub Actions build storage: reads every artifact in the repository and deletes them in batches. */
export default function ArtifactCleanup() {
  const [artifacts, setArtifacts] = useState<ActionArtifact[] | null>(null);
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function inspect() {
    setBusy(true); setError(''); setArtifacts(null); setMessage('Reading artifacts…');
    try {
      const found = new Map<number, ActionArtifact>();
      for (let page = 1; ; page++) {
        const response = await fetch(`/api/control/release/artifacts?page=${page}`, { cache: 'no-store', credentials: 'include' });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Could not read artifacts.');
        setRepo(json.data.repo);
        for (const artifact of json.data.artifacts) found.set(artifact.id, artifact);
        setMessage(`Read ${found.size} artifacts…`);
        if (!json.data.hasNext) break;
      }
      setArtifacts([...found.values()]);
      setMessage(found.size ? '' : 'No Actions artifacts remain.');
    } catch (cause) { setMessage(''); setError(cause instanceof Error ? cause.message : 'Could not read artifacts.'); }
    finally { setBusy(false); }
  }

  async function cleanup() {
    if (!artifacts?.length || busy) return;
    const total = size(artifacts.reduce((sum, artifact) => sum + artifact.size, 0));
    if (!window.confirm(`Permanently delete these ${artifacts.length} Actions artifacts (${total}) from ${repo}? They cannot be restored. Published release downloads and workflow logs are kept.`)) return;
    setBusy(true); setError('');
    let deleted = 0;
    try {
      for (let offset = 0; offset < artifacts.length; offset += 5) {
        setMessage(`Deleting… ${deleted} of ${artifacts.length} removed.`);
        const response = await fetch('/api/control/release/artifacts', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ confirm: 'delete-artifacts', ids: artifacts.slice(offset, offset + 5).map(artifact => artifact.id) }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Cleanup interrupted. Refresh before retrying.');
        const results: { id: number; deleted: boolean; error: string | null }[] = json.data.results;
        const removed = new Set(results.filter(result => result.deleted).map(result => result.id));
        deleted += removed.size;
        setArtifacts(current => current?.filter(artifact => !removed.has(artifact.id)) ?? null);
        const failure = results.find(result => !result.deleted);
        if (failure) throw new Error(failure.error || 'Cleanup interrupted. Refresh before retrying.');
      }
      setMessage(`Deleted ${deleted} artifacts (${total}). GitHub updates the storage quota within 6–12 hours.`);
    } catch (cause) {
      setMessage(`${deleted} deletions confirmed. Refresh the list before retrying.`);
      setError(cause instanceof Error ? cause.message : 'Cleanup interrupted.');
      setArtifacts(null);
    } finally { setBusy(false); }
  }

  const total = artifacts ? size(artifacts.reduce((sum, artifact) => sum + artifact.size, 0)) : '';
  return <section className="panel" aria-labelledby="artifact-cleanup-title">
    <div className="panel-head"><h2 id="artifact-cleanup-title">Build artifact storage</h2>{artifacts ? <span>{repo} · {artifacts.length} artifacts · {total}</span> : <span>Release downloads and logs are kept</span>}</div>
    {artifacts && artifacts.length > 0 && <details><summary className="panel-note" style={{ cursor: 'pointer' }}>Show the {artifacts.length} artifacts</summary><div className="table-wrap" style={{ maxHeight: 240, overflow: 'auto' }}>
      <table><thead><tr><th>Name</th><th>Created</th><th className="num">Size</th></tr></thead><tbody>{artifacts.map(artifact => <tr key={artifact.id}>
        <td>{artifact.name}</td><td>{new Date(artifact.createdAt).toLocaleString()}</td><td className="num">{size(artifact.size)}</td>
      </tr>)}</tbody></table></div></details>}
    {(message || error) && <p className={error ? 'panel-note' : 'panel-note'} role={error ? 'alert' : 'status'} style={error ? { color: 'var(--negative)' } : undefined}>{error || message}</p>}
    <div className="panel-foot"><button type="button" className="btn" disabled={busy} onClick={() => void inspect()}>{artifacts ? 'Refresh' : 'Read artifacts'}</button>{artifacts && artifacts.length > 0 && <button type="button" className="btn danger" disabled={busy} onClick={() => void cleanup()}>Delete all {artifacts.length}</button>}</div>
  </section>;
}

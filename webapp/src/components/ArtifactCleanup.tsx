'use client';

import { useState } from 'react';
import type { ActionArtifact } from '@/lib/github-artifacts';

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

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
      setMessage(found.size ? '' : 'No Actions artifacts remain in this repository.');
    } catch (cause) { setMessage(''); setError(cause instanceof Error ? cause.message : 'Could not read artifacts.'); }
    finally { setBusy(false); }
  }

  async function cleanup() {
    if (!artifacts?.length || busy) return;
    const total = size(artifacts.reduce((sum, artifact) => sum + artifact.size, 0));
    if (!window.confirm(`Permanently delete these ${artifacts.length} Actions artifacts (${total}) from ${repo}? They cannot be restored. Published release downloads and workflow logs will be kept.`)) return;
    setBusy(true); setError('');
    let deleted = 0;
    try {
      for (let offset = 0; offset < artifacts.length; offset += 5) {
        setMessage(`Deleting artifacts… ${deleted} of ${artifacts.length} removed.`);
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
      setMessage(`Deleted ${deleted} artifacts (${total}). GitHub may take 6–12 hours to update the storage quota.`);
    } catch (cause) {
      setMessage(`${deleted} deletions confirmed. Refresh the list before retrying.`);
      setError(cause instanceof Error ? cause.message : 'Cleanup interrupted.');
      setArtifacts(null);
    } finally { setBusy(false); }
  }

  return <section className="panel" style={{ padding: '18px 22px' }} aria-labelledby="artifact-cleanup-title">
    <div className="panel-heading"><h2 id="artifact-cleanup-title">Actions artifact storage</h2>
      <button type="button" className="btn" disabled={busy} onClick={() => void inspect()}>Refresh artifacts</button></div>
    <p className="panel-description">Free build storage using the saved GitHub connection. Published release downloads and workflow logs are kept. Quota updates can take 6–12 hours.</p>
    {artifacts && <>
      <p><strong>{repo}</strong> · {artifacts.length} artifacts · {size(artifacts.reduce((sum, artifact) => sum + artifact.size, 0))}</p>
      {artifacts.length > 0 && <>
        <details><summary>Review artifacts to delete</summary><div className="table-wrap" style={{ maxHeight: 240, overflow: 'auto' }}>
          <table><thead><tr><th>Name</th><th>Created</th><th>Size</th></tr></thead><tbody>{artifacts.map(artifact => <tr key={artifact.id}>
            <td>{artifact.name}</td><td>{new Date(artifact.createdAt).toLocaleString()}</td><td>{size(artifact.size)}</td>
          </tr>)}</tbody></table></div></details>
        <button type="button" className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => void cleanup()}>Delete all listed artifacts</button>
      </>}
    </>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

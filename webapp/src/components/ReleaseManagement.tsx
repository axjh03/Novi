'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import ArtifactCleanup from './ArtifactCleanup';

interface CommitItem { sha: string; message: string; author: string; date: string; url: string }
interface WorkflowJobSummary { name: string; status: string; conclusion: string | null; startedAt: string | null; completedAt: string | null }
interface WorkflowRun { id: number; name: string; status: string; conclusion: string | null; htmlUrl: string; createdAt: string; runNumber: number; headBranch?: string }
interface ReleaseAssetSummary { id: number; name: string; size: number; downloadCount: number; browserDownloadUrl: string }
interface SemVerOptions { current: string; nextPatch: string; nextMinor: string; nextMajor: string; defaultNext: string }
interface ReleaseData {
  repo: string; currentTag: string; currentVersion: string; semver: SemVerOptions; nextSuggestedVersion: string;
  releaseDate: string; releaseName: string; releaseBody: string; releaseAssets: ReleaseAssetSummary[];
  state: 'BUILDING' | 'FAILED' | 'OUTDATED' | 'UP_TO_DATE'; stateReason: string; isOutdated: boolean; commitsAhead: number;
  commits: CommitItem[]; latestRun: WorkflowRun | null; jobs: WorkflowJobSummary[]; configured: boolean;
}
type Bump = 'patch' | 'minor' | 'major' | 'custom';

function elapsedTime(startedAt: string | null | undefined, now: number) {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start)) return 'not started';
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), remainder = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}
const platform = (name: string) => name.includes('macos') ? { label: 'macOS', note: 'arm64 and x64 .dmg', icon: '/apple-logo.png' } : name.includes('windows') ? { label: 'Windows', note: 'x64 setup .exe', icon: '/microsoft.png' } : { label: 'Linux', note: '.deb and AppImage', icon: '/ubuntu.png' };
const jobState = (job: WorkflowJobSummary) => job.status === 'in_progress' ? 'building' : job.conclusion === 'success' ? 'success' : job.conclusion === 'failure' ? 'failed' : job.conclusion === 'cancelled' ? 'cancelled' : 'queued';

/** The desktop release desk: the shipped tag against main, the GitHub Actions runners, and one button to build and publish the next version. */
export default function ReleaseManagement({ admin }: { admin: boolean }) {
  const [data, setData] = useState<ReleaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [bump, setBump] = useState<Bump>('patch');
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const fetchStatus = async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/control/release', { headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read the release status.');
      const next: ReleaseData = json.data;
      setData(next);
      // The version field starts on the next patch; a typed version is kept across refreshes.
      setVersion(current => current || next.semver?.nextPatch || '');
      // Release notes are never filled in from commits: users read them in Settings › Updates.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the release status.');
    } finally {
      if (!background) setLoading(false);
    }
  };
  useEffect(() => { void fetchStatus(); return () => { if (poll.current) clearInterval(poll.current); }; }, []);
  useEffect(() => {
    if (data?.state !== 'BUILDING') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data?.state]);
  // Live polling while a build is queued or running.
  useEffect(() => {
    if (data?.state === 'BUILDING') { if (!poll.current) poll.current = setInterval(() => { void fetchStatus(true); }, 5000); }
    else if (poll.current) { clearInterval(poll.current); poll.current = null; }
    return () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };
  }, [data?.state]);
  useEffect(() => { if (confirming && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [confirming]);

  const choose = (type: Exclude<Bump, 'custom'>) => { if (!data?.semver) return; setBump(type); setVersion(type === 'patch' ? data.semver.nextPatch : type === 'minor' ? data.semver.nextMinor : data.semver.nextMajor); };
  const trigger = async () => {
    if (!version) return;
    setTriggering(true); setError(null); setConfirming(false);
    try {
      const res = await fetch('/api/control/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ version, releaseNotes: notes }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start the release.');
      setTimeout(() => { void fetchStatus(); }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the release.');
    } finally { setTriggering(false); }
  };

  if (loading && !data) return <section className="panel"><div className="empty" role="status"><p>Reading GitHub Actions…</p></div></section>;
  const building = data?.state === 'BUILDING';
  const next = version || data?.nextSuggestedVersion || '';
  const headline = !data ? null
    : data.state === 'BUILDING' ? { badge: 'building', title: `Building v${next}`, text: `${data.stateReason} Elapsed ${elapsedTime(data.latestRun?.createdAt, clock)}.` }
    : data.state === 'FAILED' ? { badge: 'failed', title: 'Last build failed', text: `${data.stateReason} Installers were not published.` }
    : data.state === 'OUTDATED' ? { badge: 'outdated', title: `${data.commitsAhead} ${data.commitsAhead === 1 ? 'commit' : 'commits'} since ${data.currentTag}`, text: `Installers are on ${data.currentTag}. A release now ships v${next}.` }
    : { badge: 'success', title: `${data.currentTag} is up to date`, text: `Main is fully shipped · ${data.releaseAssets?.length || 0} installers live.` };

  return <div className="stack">
    {data && headline && <section className="panel release-state" aria-live="polite">
      <div><h2>{headline.title}<span className={`badge status-${headline.badge}`}>{headline.badge}</span></h2><p>{headline.text}</p></div>
      <div className="page-actions">
        {data.latestRun && <a className="btn" href={data.latestRun.htmlUrl} target="_blank" rel="noopener noreferrer">{data.state === 'FAILED' ? 'Failure logs' : 'Logs'}<ExternalLink /></a>}
        <button type="button" className="btn" disabled={loading} onClick={() => void fetchStatus()}><RefreshCw className={loading ? 'spin' : ''} />Check</button>
        {!building && <button type="button" className="btn primary" disabled={triggering || !next} onClick={() => setConfirming(true)}>{data.state === 'FAILED' ? 'Retry' : 'Release'} v{next}</button>}
      </div>
    </section>}
    {error && <div className="alert" role="alert">{error}<button className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}><X size={14} /></button></div>}

    {data?.jobs && data.jobs.length > 0 && <section className="panel" aria-labelledby="runners-title">
      <div className="panel-head"><h2 id="runners-title">Build runners</h2>{data.latestRun && <a href={data.latestRun.htmlUrl} target="_blank" rel="noopener noreferrer">Run #{data.latestRun.runNumber} · {data.latestRun.headBranch || data.currentTag}</a>}</div>
      <ul className="rows">{data.jobs.map(job => { const p = platform(job.name), state = jobState(job); return <li key={job.name} className="job-row"><img src={p.icon} alt="" /><div><strong>{p.label}</strong><small>{p.note} · {job.name}</small></div>{state === 'building' && <span className="muted num">{elapsedTime(job.startedAt || data.latestRun?.createdAt, clock)}</span>}<span className={`badge status-${state}`}>{state === 'building' ? <><Loader2 size={11} className="spin" /> building</> : state}</span></li>; })}</ul>
    </section>}

    <div className="release-grid">
      <section className="panel" aria-labelledby="release-title">
        <div className="panel-head"><h2 id="release-title">New release</h2><span>Shipped: {data?.currentTag || '—'}</span></div>
        <div className="release-form">
          <label>Version
            {data?.semver && <div className="version-pick" role="group" aria-label="Next version">
              <button type="button" aria-pressed={bump === 'patch'} onClick={() => choose('patch')}>Patch<b>v{data.semver.nextPatch}</b></button>
              <button type="button" aria-pressed={bump === 'minor'} onClick={() => choose('minor')}>Minor<b>v{data.semver.nextMinor}</b></button>
              <button type="button" aria-pressed={bump === 'major'} onClick={() => choose('major')}>Major<b>v{data.semver.nextMajor}</b></button>
            </div>}
            <span className="version-field"><span className="muted">v</span><input type="text" value={version} inputMode="decimal" pattern="\d+\.\d+\.\d+" placeholder="0.1.3" onChange={e => { setVersion(e.target.value.replace(/^v/, '')); setBump('custom'); }} /></span>
          </label>
          <label htmlFor="release-notes">Release notes<small>Shown to users in Settings › Updates. Empty uses release-notes/v{next || 'x.y.z'}.md from the repository.</small>
            <textarea id="release-notes" rows={6} value={notes} onChange={e => setNotes(e.target.value)} placeholder={'One short line per change, in plain words.'} />
          </label>
          <ol className="release-steps"><li>macOS builds the Apple Silicon and Intel .dmg.</li><li>Windows builds the setup .exe and tests an in-app update to it.</li><li>Ubuntu builds .deb and AppImage for x64 and arm64. Only when all three succeed is the release published to /download and in-app updates.</li></ol>
        </div>
        <div className="panel-foot"><span>{building ? 'A build is already running.' : `Creates tag v${next || 'x.y.z'} on GitHub.`}</span><button type="button" className="btn primary" disabled={triggering || !version || building} onClick={() => setConfirming(true)}>{triggering ? <><Loader2 size={14} className="spin" />Starting…</> : <>Build and release v{next}<ArrowRight /></>}</button></div>
      </section>

      <section className="panel" aria-labelledby="commits-title">
        <div className="panel-head"><h2 id="commits-title">Commits since {data?.currentTag || 'the last release'}</h2><span>{data?.commitsAhead || 0}</span></div>
        {data?.commits?.length ? <ul className="rows commit-list">{data.commits.map(c => <li key={c.sha}><div><strong>{c.message}</strong><small>{c.author} · {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><a href={c.url} target="_blank" rel="noopener noreferrer"><code>{c.sha.slice(0, 7)}</code></a></li>)}</ul> : <p className="rows-empty boxed">Everything on main is in {data?.currentTag}.</p>}
        {data?.releaseAssets && data.releaseAssets.length > 0 && <>
          <div className="panel-head"><h2>Installers in {data.currentTag}</h2><span>{data.releaseAssets.length} files</span></div>
          <ul className="rows asset-list">{data.releaseAssets.map(asset => <li key={asset.id}><div><code>{asset.name}</code></div><span className="muted num">{(asset.size / (1024 * 1024)).toFixed(1)} MB</span></li>)}</ul>
        </>}
      </section>
    </div>

    {admin && <ArtifactCleanup />}

    {confirming && <dialog ref={dialog} className="modal" aria-labelledby="release-confirm-title" onCancel={e => { e.preventDefault(); if (!triggering) setConfirming(false); }}><div className="modal-card">
      <div className="modal-header"><h2 id="release-confirm-title">Release v{version}?</h2><button className="icon-btn" aria-label="Close" disabled={triggering} onClick={() => setConfirming(false)}><X size={19} /></button></div>
      <p className="form-intro">Creates tag <code>v{version}</code> on GitHub and builds macOS, Windows and Linux in turn. The release publishes only if all three succeed.</p>
      <div className="modal-actions"><button type="button" className="btn" disabled={triggering} onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="btn primary" disabled={triggering} onClick={() => void trigger()}>{triggering ? 'Starting…' : 'Start release'}<ArrowRight /></button></div>
    </div></dialog>}
  </div>;
}

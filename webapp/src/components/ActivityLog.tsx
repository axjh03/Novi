'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { activityEvents, type ActivityPage } from '@/lib/activity-events';

const defaults = { from: '', to: '', event: '', sort: 'desc', page: 1 };
const ago = (value: string) => {
  const seconds = Math.max(0, (Date.now() - +new Date(value)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Account and license changes, newest first, filtered by event and date range; 20 per page from the server. */
export default function ActivityLog({ refreshKey }: { refreshKey: object }) {
  const [filters, setFilters] = useState(defaults);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [result, setResult] = useState<ActivityPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const invalidRange = !!(draft.from && draft.to && draft.from > draft.to);
  const change = (patch: Partial<typeof defaults>) => {
    setLoading(true);
    setFilters(current => ({ ...current, ...patch, page: 1 }));
  };
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(filters.page), sort: filters.sort, event: filters.event });
    if (filters.from) query.set('from', new Date(filters.from).toISOString());
    // Include the entire ending minute selected by the user.
    if (filters.to) query.set('to', new Date(+new Date(filters.to) + 59_999).toISOString());
    async function load() {
      setLoading(true); setError('');
      try {
        const response = await fetch(`/api/control/activity?${query}`, { credentials: 'include', cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load activity.');
        if (!controller.signal.aborted) setResult(body.data);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [filters, refreshKey, retry]);
  function applyRange(e: FormEvent) {
    e.preventDefault();
    if (!invalidRange) change(draft);
  }
  const clear = () => { setDraft({ from: '', to: '' }); change(defaults); };
  const hasFilters = !!(filters.from || filters.to || filters.event || draft.from || draft.to);
  const pageTo = (page: number) => { setLoading(true); setFilters(current => ({ ...current, page })); };

  return <section className="panel activity-panel" aria-label="Account and license activity">
    <form className="toolbar activity-toolbar" onSubmit={applyRange}>
      <select aria-label="Event type" value={filters.event} onChange={e => change({ event: e.target.value })}><option value="">All events</option>{Object.entries(activityEvents).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label>From<input type="datetime-local" aria-label="From" value={draft.from} onChange={e => setDraft(current => ({ ...current, from: e.target.value }))} /></label>
      <label>To<input type="datetime-local" aria-label="To" value={draft.to} aria-invalid={invalidRange} aria-describedby={invalidRange ? 'activity-range-error' : undefined} onChange={e => setDraft(current => ({ ...current, to: e.target.value }))} /></label>
      <button className="btn" type="submit" disabled={invalidRange || (draft.from === filters.from && draft.to === filters.to)}>Apply</button>
      {hasFilters && <button type="button" className="text-btn" onClick={clear}>Clear</button>}
      <div className="toolbar-end"><span role="status">{result ? `${result.total} ${result.total === 1 ? 'event' : 'events'}` : ''}</span><select aria-label="Sort by" value={filters.sort} onChange={e => change({ sort: e.target.value })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></div>
    </form>
    {invalidRange && <p className="activity-range-error" id="activity-range-error" role="alert">The end must be on or after the start.</p>}
    {error ? <div className="empty" role="alert"><h3>Activity could not be loaded</h3><p>{error}</p><button className="btn" onClick={() => setRetry(current => current + 1)}><RefreshCw size={14} />Retry</button></div>
      : loading && !result ? <div className="empty" role="status"><p>Loading…</p></div>
      : result && <>
        {!!result.items.length && <div className="table-wrap" tabIndex={0} role="region" aria-label="Activity"><table className="activity-table" aria-label="Activity events" aria-busy={loading}><thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">By</th><th scope="col">Account or license</th></tr></thead><tbody>{result.items.map(item => <tr key={item.id}><td><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{ago(item.createdAt).replace(/^j/, 'J')}</time><small>{new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></td><td>{activityEvents[item.action] || item.action}</td><td>{item.actorName}</td><td>{item.targetName}<small>{item.targetId}</small></td></tr>)}</tbody></table></div>}
        {!result.items.length && <div className="empty"><h3>No activity found</h3><p>{hasFilters ? 'Try a wider date range or another event type.' : 'Account and license changes appear here.'}</p>{hasFilters && <button className="btn" onClick={clear}>Clear filters</button>}</div>}
        {result.total > 0 && <div className="pager"><span>{`${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}`}</span><nav aria-label="Activity pagination"><button className="btn" aria-label="Previous page" disabled={result.page <= 1} onClick={() => pageTo(result.page - 1)}><ChevronLeft size={15} /></button><span>{result.page} / {result.pages}</span><button className="btn" aria-label="Next page" disabled={result.page >= result.pages} onClick={() => pageTo(result.page + 1)}><ChevronRight size={15} /></button></nav></div>}
      </>}
  </section>;
}

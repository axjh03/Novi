'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { activityEvents, type ActivityPage } from '@/lib/activity-events';

const defaults = { from: '', to: '', event: '', sort: 'desc', page: 1 };

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

  return <section className="panel activity-panel" aria-label="Account and license activity">
    <div className="panel-heading"><h2>Account &amp; license changes</h2><span className="badge">20 per page</span></div>
    <div className="license-controls">
      <form className="activity-range" onSubmit={applyRange}>
        <label>From<input type="datetime-local" value={draft.from} onChange={e => setDraft(current => ({ ...current, from: e.target.value }))} /></label>
        <label>Through<input type="datetime-local" value={draft.to} onChange={e => setDraft(current => ({ ...current, to: e.target.value }))} aria-invalid={invalidRange} aria-describedby={invalidRange ? 'activity-range-error' : undefined} /></label>
        <button className="btn" type="submit" disabled={invalidRange}>Apply dates</button>
      </form>
      {invalidRange && <p className="activity-range-error" id="activity-range-error" role="alert">The end must be on or after the start.</p>}
      <p className="activity-timezone">Dates and times use your local time zone. The ending minute is included.</p>
      <div className="activity-filters">
        <label>Event type<select aria-label="Event type" value={filters.event} onChange={e => change({ event: e.target.value })}><option value="">All account &amp; license events</option>{Object.entries(activityEvents).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Sort by<select aria-label="Sort by" value={filters.sort} onChange={e => change({ sort: e.target.value })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>
        {hasFilters && <button className="text-btn" onClick={clear}>Clear filters</button>}
      </div>
    </div>
    {error ? <div className="empty" role="alert"><h3>Activity could not be loaded</h3><p>{error}</p><button className="btn" onClick={() => setRetry(current => current + 1)}><RefreshCw size={14} />Retry</button></div>
      : loading ? <div className="empty" role="status">Loading activity…</div>
      : result && <>
        <div className="license-results" role="status">{result.total} {result.total === 1 ? 'event' : 'events'}{filters.from || filters.to || filters.event ? ' matching filters' : ''}</div>
        {!!result.items.length && <div className="table-wrap" tabIndex={0} role="region" aria-label="Activity results, scroll horizontally for more columns"><table className="activity-table" aria-label="Activity events"><thead><tr><th scope="col">Date &amp; time</th><th scope="col">Event</th><th scope="col">Changed by</th><th scope="col">Account / license</th></tr></thead><tbody>{result.items.map(item => <tr key={item.id}><td><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}<small>{new Date(item.createdAt).toLocaleTimeString()}</small></time></td><td>{activityEvents[item.action]}</td><td>{item.actorName}</td><td>{item.targetName}<small>{item.targetId}</small></td></tr>)}</tbody></table></div>}
        {!result.items.length && <div className="empty"><ShieldCheck size={25} /><h3>No activity found</h3><p>{hasFilters ? 'Try a wider date range or a different event type.' : 'Account and license changes will appear here.'}</p>{hasFilters && <button className="btn" onClick={clear}>Clear filters</button>}</div>}
        <div className="license-pagination"><span>{result.total ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}` : '0 results'}</span><nav aria-label="Activity pagination"><button className="btn" aria-label="Previous page" disabled={result.page <= 1} onClick={() => { setLoading(true); setFilters(current => ({ ...current, page: result.page - 1 })); }}><ChevronLeft size={15} /></button><span>Page {result.page} of {result.pages}</span><button className="btn" aria-label="Next page" disabled={result.page >= result.pages} onClick={() => { setLoading(true); setFilters(current => ({ ...current, page: result.page + 1 })); }}><ChevronRight size={15} /></button></nav></div>
      </>}
  </section>;
}

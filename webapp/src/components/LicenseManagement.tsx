'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, KeyRound, Search, X } from 'lucide-react';
import { LICENSE_PLANS, PLAN_NAMES, type LicensePlan } from '../../../src/shared/plans';

type Account = { id: string; name: string; username: string; role: string; status: string };
export type License = { id: string; key: string; ownerId: string; accountId: string | null; status: string; plan: string; expiresAt: string; createdAt: string };
/** A plan's display name ("Pro"), or the stored value if it is ever unknown. */
export const planName = (plan: string) => PLAN_NAMES[plan as LicensePlan] ?? plan;
type Props = {
  licenses: License[];
  accounts: Account[];
  admin: boolean;
  busy: boolean;
  onRenew: (license: License) => void;
  onChangePlan: (license: License) => void;
  onTerminate: (license: License) => void;
};
const defaults = { search: '', owner: '', account: '', assignment: 'all', status: '', plan: '', sort: 'owner', pageSize: 20, page: 1 };
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export default function LicenseManagement({ licenses, accounts, admin, busy, onRenew, onChangePlan, onTerminate }: Props) {
  const [view, setView] = useState(defaults);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const change = (patch: Partial<typeof defaults>) => setView(current => ({ ...current, ...patch, page: 1 }));
  const accountMap = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const rows = licenses.map(license => ({
    ...license,
    owner: accountMap.get(license.ownerId),
    account: license.accountId ? accountMap.get(license.accountId) : undefined,
    state: license.status === 'TERMINATED' ? 'terminated' : +new Date(license.expiresAt) <= now ? 'expired' : 'active',
  }));
  const ownerIds = new Set(licenses.map(license => license.ownerId));
  const assignedIds = new Set(licenses.filter(license => !view.owner || license.ownerId === view.owner).map(license => license.accountId));
  const byName = (a: Account, b: Account) => compare(a.name, b.name) || compare(a.username, b.username);
  const owners = accounts.filter(account => ownerIds.has(account.id)).sort(byName);
  const assignedAccounts = accounts.filter(account => assignedIds.has(account.id)).sort(byName);
  const query = view.search.trim().toLowerCase();
  const filtered = rows.filter(row =>
    (!view.owner || row.ownerId === view.owner) &&
    (!view.account || row.accountId === view.account) &&
    (view.assignment === 'all' || (view.assignment === 'assigned' ? !!row.accountId : !row.accountId)) &&
    (!view.plan || row.plan === view.plan) &&
    (!view.status || (view.status === 'expiring' ? row.state === 'active' && +new Date(row.expiresAt) <= now + 30 * 86400000 : row.state === view.status)) &&
    `${row.key} ${row.owner?.name || ''} ${row.owner?.username || ''} ${row.account?.name || ''} ${row.account?.username || ''}`.toLowerCase().includes(query)
  ).sort((a, b) => {
    let order = 0;
    if (view.sort === 'owner') order = compare(a.owner?.name || a.ownerId, b.owner?.name || b.ownerId) || compare(a.ownerId, b.ownerId) || +new Date(a.expiresAt) - +new Date(b.expiresAt);
    if (view.sort === 'account') order = Number(!a.accountId) - Number(!b.accountId) || compare(a.account?.name || a.accountId || '', b.account?.name || b.accountId || '');
    if (view.sort === 'expiry') order = +new Date(a.expiresAt) - +new Date(b.expiresAt);
    if (view.sort === 'expiry-desc') order = +new Date(b.expiresAt) - +new Date(a.expiresAt);
    if (view.sort === 'newest') order = +new Date(b.createdAt) - +new Date(a.createdAt);
    if (view.sort === 'oldest') order = +new Date(a.createdAt) - +new Date(b.createdAt);
    return order || compare(a.key, b.key) || compare(a.id, b.id);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / view.pageSize));
  const page = Math.min(view.page, pages);
  const start = (page - 1) * view.pageSize;
  const visible = filtered.slice(start, start + view.pageSize);
  const assigned = licenses.filter(license => license.accountId).length;
  const hasFilters = !!(query || view.owner || view.account || view.status || view.plan || view.assignment !== 'all');
  const clearFilters = () => change({ search: '', owner: '', account: '', assignment: 'all', status: '', plan: '' });
  const identity = (account: Account | undefined, fallback: string) => account
    ? <><strong>{account.name}</strong><small>@{account.username}{account.status !== 'ACTIVE' && ` · ${account.status.toLowerCase()}`}</small></>
    : <span className="muted">{fallback}</span>;

  return <section className="panel license-panel" aria-label="License inventory">
    <div className="license-views" aria-label="Assignment views">
      {([['all', 'All licenses', licenses.length], ['unassigned', 'Unassigned', licenses.length - assigned], ['assigned', 'Assigned', assigned]] as const).map(([value, label, count]) =>
        <button key={value} aria-pressed={view.assignment === value} onClick={() => change({ assignment: value, account: '' })}>{label}<span>{count}</span></button>
      )}
    </div>
    <div className="license-controls">
      <div className="search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search licenses" placeholder="Search license key, owner, or account…" value={view.search} onChange={e => change({ search: e.target.value })} /></div>
      <details className="license-filter-details"><summary>Filters & sorting · Owner, account, plan, status, and date</summary><div className="license-filters">
        <label>Owner<select aria-label="Owner" value={view.owner} onChange={e => change({ owner: e.target.value, account: '' })}><option value="">All owners</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} (@{owner.username})</option>)}</select></label>
        <label>Assigned account<select aria-label="Assigned account" disabled={view.assignment === 'unassigned'} value={view.account} onChange={e => change({ account: e.target.value })}><option value="">All accounts</option>{assignedAccounts.map(account => <option key={account.id} value={account.id}>{account.name} (@{account.username})</option>)}</select></label>
        <label>Plan<select aria-label="Plan" value={view.plan} onChange={e => change({ plan: e.target.value })}><option value="">All plans</option>{LICENSE_PLANS.map(plan => <option key={plan} value={plan}>{PLAN_NAMES[plan]}</option>)}</select></label>
        <label>Status<select aria-label="Status" value={view.status} onChange={e => change({ status: e.target.value })}><option value="">All statuses</option><option value="active">Active</option><option value="expiring">Expiring in 30 days</option><option value="expired">Expired</option><option value="terminated">Terminated</option></select></label>
        <label>Sort by<select aria-label="Sort by" value={view.sort} onChange={e => change({ sort: e.target.value })}><option value="owner">Owner · A–Z</option><option value="account">Assigned account · A–Z</option><option value="expiry">Expiry · soonest first</option><option value="expiry-desc">Expiry · latest first</option><option value="newest">Issued · newest first</option><option value="oldest">Issued · oldest first</option></select></label>
      </div></details>
    </div>
    <div className="license-results"><span role="status">{filtered.length} {filtered.length === 1 ? 'license' : 'licenses'}{hasFilters ? ` matching filters · ${licenses.length} total` : ' in your workspace'}</span>{hasFilters && <button className="text-btn" onClick={clearFilters}><X size={13} />Clear filters</button>}</div>
    {!!visible.length && <div className="table-wrap" tabIndex={0} role="region" aria-label="License results, scroll horizontally for more columns"><table className="license-table" aria-label="Licenses">
      <thead><tr><th scope="col">License key</th><th scope="col">Owner</th><th scope="col">Assigned account</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Expires</th><th scope="col">{admin ? 'Manage' : 'Actions'}</th></tr></thead>
      <tbody>{visible.map((license, index) => <Fragment key={license.id}>
        {view.sort === 'owner' && (index === 0 || visible[index - 1].ownerId !== license.ownerId) && <tr className="license-owner-group"><th scope="rowgroup" colSpan={7}>{license.owner?.name || license.ownerId}<span>{license.owner?.role === 'SUBCORP' ? 'Sub-corporation' : license.owner?.role === 'STANDALONE' ? 'Standalone' : 'Owner'}{index === 0 && start > 0 && filtered[start - 1].ownerId === license.ownerId ? ' · continued' : ''}</span></th></tr>}
        <tr className="license-row">
          <td><code>{license.key}</code></td>
          <td>{identity(license.owner, license.ownerId)}</td>
          <td>{license.accountId ? identity(license.account, 'Account unavailable') : <span className="muted">Unassigned</span>}</td>
          <td><span className="badge">{planName(license.plan)}</span></td>
          <td><span className={`badge license-status ${license.state}`}>{license.state}</span></td>
          {/* Lifetime is stored with a far-future expiry; show what it means instead of the date. */}
          <td>{license.plan === 'LIFETIME' ? <span>Never</span> : <><time dateTime={license.expiresAt}>{date(license.expiresAt)}</time>{license.state === 'active' && <small>{Math.ceil((+new Date(license.expiresAt) - now) / 86400000)} days left</small>}</>}</td>
          <td>{license.state !== 'terminated' ? <div className="row-actions">{license.plan !== 'LIFETIME' && <button disabled={busy} aria-label={`${admin ? 'Renew' : 'Request renewal for'} ${license.key}`} onClick={() => onRenew(license)}>{admin ? 'Renew' : 'Request renewal'}</button>}{admin && <><button disabled={busy} aria-label={`Change plan of ${license.key}`} onClick={() => onChangePlan(license)}>Change plan</button><button disabled={busy} aria-label={`Terminate ${license.key}`} onClick={() => onTerminate(license)}>Terminate</button></>}{!admin && license.plan === 'LIFETIME' && <span className="muted">No renewal needed</span>}</div> : <span className="muted">Closed</span>}</td>
        </tr>
      </Fragment>)}</tbody>
    </table></div>}
    {!visible.length && <div className="empty"><KeyRound size={25} /><h3>{licenses.length ? 'No matching licenses' : 'No licenses yet'}</h3><p>{licenses.length ? 'Try another search or clear your filters.' : admin ? 'Issue a license to a standalone or sub-corporation owner.' : 'Request licenses to begin creating desktop accounts.'}</p>{hasFilters && <button className="btn" onClick={clearFilters}>Clear filters</button>}</div>}
    <div className="license-pagination">
      <span aria-live="polite">{filtered.length ? `${start + 1}–${Math.min(start + view.pageSize, filtered.length)} of ${filtered.length}` : '0 results'}</span>
      <label>Rows per page<select aria-label="Rows per page" value={view.pageSize} onChange={e => change({ pageSize: Number(e.target.value) })}>{[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      <nav aria-label="License pagination"><button className="btn" aria-label="Previous page" disabled={page === 1} onClick={() => setView(current => ({ ...current, page: page - 1 }))}><ChevronLeft size={15} /></button><span>Page {page} of {pages}</span><button className="btn" aria-label="Next page" disabled={page === pages} onClick={() => setView(current => ({ ...current, page: page + 1 }))}><ChevronRight size={15} /></button></nav>
    </div>
    <div className="panel-footer">Assignment is permanent. Unassigned licenses must be active before they can be used to create a desktop account.</div>
  </section>;
}

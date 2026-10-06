'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, ArrowRight, Building2, Check, ChevronRight, CircleHelp, Command, Eye, EyeOff, GitBranch, KeyRound, LayoutDashboard, LogOut, Maximize2, Minimize2, Monitor, MoreHorizontal, Plus, RefreshCw, Rocket, Search, ShieldCheck, Users, X } from 'lucide-react';
import { canResetPassword } from '@/lib/access-permissions';
import LicenseManagement, { type License } from './LicenseManagement';
import ActivityLog from './ActivityLog';
import ReleaseManagement from './ReleaseManagement';
import PublicLanding from './PublicLanding';
import RemoteFileExplorer from './RemoteFileExplorer';

type Account = { id: string; username: string; name: string; role: string; status: string; parentId: string | null; createdAt: string };
type Credential = { id: string; ownerId: string; provider: string; nickname: string; model: string; lastFour: string };
type Session = { id: string; accountId: string; deviceName: string; ipAddress: string | null; lastSeenAt: string };
type Order = { id: string; ownerId: string; quantity: number; duration: number; unit: string; status: string; createdAt: string };
type State = { user: Pick<Account, 'id' | 'name' | 'username' | 'role'>; accounts: Account[]; licenses: License[]; credentials: Credential[]; sessions: Session[]; requests: Order[]; providers: Record<string, { name: string }> };
type Form = { kind: string; id?: string; title: string; values: Record<string, string>; message?: string; path?: string; method?: string; payload?: object };
const names: Record<string, string> = { ADMIN: 'Administrator', STANDALONE: 'Standalone', CORP: 'Corporation', SUBCORP: 'Sub-corporation', LICENSE: 'Desktop account' };
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const remaining = (license: License) => license.status === 'TERMINATED' ? 'Terminated' : +new Date(license.expiresAt) <= Date.now() ? 'Expired' : `${Math.ceil((+new Date(license.expiresAt) - Date.now()) / 86400000)} days left`;
async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`/api/control/${path}`, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store', ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
  return data.data;
}
function Mark({ asLink = true }: { asLink?: boolean } = {}) {
  const content = (
    <>
      <img src="/logo.svg" alt="Novi Logo" width={32} height={32} style={{ borderRadius: 8, objectFit: 'contain' }} />
      novi<span className="brand-dot">.</span>
    </>
  );
  if (!asLink) {
    return <span className="brand">{content}</span>;
  }
  return (
    <a href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
      {content}
    </a>
  );
}
function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><KeyRound size={25} /><h3>{title}</h3><p>{children}</p></div>; }

function AccountGraph({ accounts, sessions }: { accounts: Account[]; sessions: Session[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const graph = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === graph.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  const nodeWidth = 220, nodeHeight = 96, columnGap = 48, rowGap = 70, padding = 24;
  const accountIds = new Set(accounts.map(account => account.id));
  const children = new Map<string, Account[]>();
  accounts.forEach(account => {
    if (!account.parentId || !accountIds.has(account.parentId)) return;
    children.set(account.parentId, [...(children.get(account.parentId) || []), account]);
  });
  const roots = accounts.filter(account => !account.parentId || !accountIds.has(account.parentId));
  const nodes: { account: Account; x: number; y: number; childCount: number }[] = [];
  const edges: { parentId: string; childId: string; fromX: number; fromY: number; toX: number; toY: number }[] = [];
  const visited = new Set<string>();
  let leaf = 0, maxDepth = 0;

  function place(account: Account, depth: number): number {
    if (visited.has(account.id)) return padding + leaf++ * (nodeWidth + columnGap);
    visited.add(account.id);
    maxDepth = Math.max(maxDepth, depth);
    const allChildren = children.get(account.id) || [];
    const visibleChildren = collapsed.has(account.id) ? [] : allChildren;
    const childNodes = visibleChildren.map(child => ({ child, x: place(child, depth + 1) }));
    const x = childNodes.length
      ? (childNodes[0].x + childNodes[childNodes.length - 1].x) / 2
      : padding + leaf++ * (nodeWidth + columnGap);
    const y = padding + depth * (nodeHeight + rowGap);
    nodes.push({ account, x, y, childCount: allChildren.length });
    childNodes.forEach(({ child, x: childX }) => edges.push({
      parentId: account.id, childId: child.id,
      fromX: x + nodeWidth / 2, fromY: y + nodeHeight,
      toX: childX + nodeWidth / 2, toY: y + nodeHeight + rowGap,
    }));
    return x;
  }

  roots.forEach(root => { place(root, 0); leaf += 0.35; });
  accounts.filter(account => !visited.has(account.id)).forEach(account => place(account, 0));
  const width = Math.max(720, ...nodes.map(node => node.x + nodeWidth + padding));
  const height = Math.max(250, padding * 2 + (maxDepth + 1) * nodeHeight + maxDepth * rowGap);
  const toggle = (id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleFullscreen = () => {
    if (fullscreen) void document.exitFullscreen();
    else void graph.current?.requestFullscreen();
  };

  return <div ref={graph} className="account-graph" aria-label="Interactive account hierarchy">
    <div className="graph-help"><span>Select an account or collapse a branch. Scroll to explore the graph.</span><div className="graph-actions"><button onClick={() => setCollapsed(new Set())}>Expand all</button><button onClick={() => setCollapsed(new Set(children.keys()))}>Collapse all</button><button aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}{fullscreen ? 'Exit full screen' : 'Full screen'}</button></div></div>
    <div className="graph-viewport" tabIndex={0}>
      <div className="graph-canvas" style={{ width, height }}>
        <svg aria-hidden="true" width={width} height={height}>
          {edges.map(edge => {
            const middleY = (edge.fromY + edge.toY) / 2;
            return <path key={`${edge.parentId}-${edge.childId}`} d={`M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${middleY}, ${edge.toX} ${middleY}, ${edge.toX} ${edge.toY}`} />;
          })}
        </svg>
        {nodes.map(({ account, x, y, childCount }) => {
          const session = sessions.find(item => item.accountId === account.id);
          return <article className={`graph-node${selectedId === account.id ? ' selected' : ''}`} style={{ left: x, top: y }} key={account.id}>
            <button className="graph-node-main" aria-pressed={selectedId === account.id} onClick={() => setSelectedId(account.id)}>
              <span className="tree-icon">{account.role === 'LICENSE' ? <Monitor size={17} /> : <Building2 size={17} />}</span>
              <span><b>{account.name}</b><small>@{account.username} · {names[account.role]}</small></span>
              <Badge>{account.status.toLowerCase()}</Badge>
            </button>
            <div className="graph-node-footer">
              <span title={session ? `${session.deviceName} · IP: ${session.ipAddress || 'unavailable'}` : undefined}>{session ? <><span className="status-dot" />{session.deviceName} · IP: {session.ipAddress || 'unavailable'}</> : 'No active device'}</span>
              {childCount > 0 && <button aria-label={`${collapsed.has(account.id) ? 'Expand' : 'Collapse'} ${account.name}`} aria-expanded={!collapsed.has(account.id)} onClick={() => toggle(account.id)}><ChevronRight size={14} />{childCount}</button>}
            </div>
          </article>;
        })}
      </div>
    </div>
  </div>;
}

export default function ManagementApp() {
  const [screen, setScreen] = useState('landing'), [data, setData] = useState<State | null>(null), [tab, setTab] = useState('Overview');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [checking, setChecking] = useState(true);
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [showPassword, setShowPassword] = useState(false);
  const [search, setSearch] = useState(''), [roleFilter, setRoleFilter] = useState('ALL'), [parentFilter, setParentFilter] = useState('ALL'), [tree, setTree] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [activeExplorer, setActiveExplorer] = useState<{ sessionId: string; deviceName: string; username: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (form && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [form?.kind, form?.id]);
  const refresh = useCallback(async () => { const next = await api<State>('state'); setData(next); setScreen('portal'); }, []);
  useEffect(() => { if (location.hash === '#signin') setScreen('signin'); void refresh().catch(e => { if (e.status !== 401) setError(e.message); }).finally(() => setChecking(false)); }, [refresh]);
  useEffect(() => { if (!data) return; const timer = setInterval(() => { void refresh().catch(e => { setError(e.message); if ([401, 403].includes(e.status)) { setData(null); setScreen('signin'); } }); }, 30_000); return () => clearInterval(timer); }, [data?.user.id, refresh]);
  async function run(path: string, method: string, body?: object) {
    setBusy(true); setError(''); setNotice('');
    try { await api(path, method, body); setForm(null); await refresh(); setNotice('Changes saved.'); }
    catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 401) { setData(null); setScreen('signin'); }
    } finally { setBusy(false); }
  }
  async function signin(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('login', 'POST', { username, password }); setPassword(''); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function signout() {
    setBusy(true); setError('');
    try { await api('logout', 'POST'); setData(null); setScreen('landing'); setTab('Overview'); location.hash = ''; }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const enter = () => { setScreen('signin'); location.hash = 'signin'; setError(''); };
  const changeTab = (value: string) => { setTab(value); setSearch(''); setError(''); setNotice(''); };
  const confirm = (title: string, message: string, path: string, method: string, payload?: object) => setForm({ kind: 'confirm', title, message, path, method, payload, values: {} });
  if (checking) return <div className="loading"><Mark /><p>Opening your workspace…</p></div>;
  if (screen === 'landing' && !data) return <PublicLanding onSignIn={enter} />;
  if (!data) return <div className="signin"><aside><button className="text-btn" onClick={() => { setScreen('landing'); location.hash = ''; }}><Mark asLink={false} /></button><div><span className="eyebrow">WELCOME TO YOUR WORKSPACE</span><h1>Everything in<br />its right place.</h1><p>Your accounts, licenses, and AI connections.<br />One considered space to manage them all.</p></div><small><ShieldCheck size={16} /> Access is provided by your administrator.</small></aside><main><div className="signin-card"><span className="eyebrow">GOOD TO SEE YOU AGAIN</span><h2>Sign in.</h2><p className="muted">Enter your username and password to continue.</p><form onSubmit={signin}><fieldset disabled={busy}><label>Username<input autoFocus autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} maxLength={64} placeholder="Your username" /></label><label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} maxLength={128} placeholder="Enter your password" /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>{error && <div className="alert" role="alert">{error}</div>}<button className="btn dark full">{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button></fieldset></form><p className="signin-help"><CircleHelp size={16} /> Need access or a password reset? Contact your administrator.</p><p className="muted tiny">Licensed desktop accounts sign in through the desktop app.</p></div></main></div>;

  const admin = data.user.role === 'ADMIN';
  const managesPasswords = ['ADMIN', 'CORP', 'SUBCORP'].includes(data.user.role);
  const manageable = ['STANDALONE', 'SUBCORP'].includes(data.user.role);
  const accountName = (id: string | null) => data.accounts.find(a => a.id === id)?.username || '—';
  const owners = data.accounts.filter(a => ['STANDALONE', 'SUBCORP'].includes(a.role) && a.status === 'ACTIVE');
  const selectedAccounts = data.accounts.filter(a => (roleFilter === 'ALL' || a.role === roleFilter) && (parentFilter === 'ALL' || a.parentId === parentFilter) && `${a.username} ${a.name}`.toLowerCase().includes(search.toLowerCase()));
  const activeLicenses = data.licenses.filter(l => l.status === 'ACTIVE' && +new Date(l.expiresAt) > Date.now());
  const tabs = [{ name: 'Overview', icon: LayoutDashboard }, { name: 'User management', icon: Users }, { name: 'Licenses', icon: KeyRound }, { name: 'API management', icon: Command }, { name: 'Purchase requests', icon: ArrowUpRight }, ...(admin ? [{ name: 'Releases', icon: Rocket }, { name: 'Activity', icon: ShieldCheck }] : [])];
  const newAccount = () => setForm({ kind: 'account', title: 'Create an account', values: { role: admin ? 'STANDALONE' : data.user.role === 'CORP' ? 'SUBCORP' : 'LICENSE', parentId: admin ? '' : data.user.id, username: '', name: '', password: '', licenseId: '' } });
  const newLicense = () => setForm({ kind: admin ? 'license' : 'request', title: admin ? 'Issue a license' : 'Request licenses', values: { ownerId: manageable ? data.user.id : owners[0]?.id || '', duration: '1', unit: 'YEARS', quantity: '1' } });
  const field = (key: string, value: string) => setForm(f => f ? { ...f, values: { ...f.values, [key]: value, ...(key === 'role' ? { parentId: admin ? '' : data.user.id, licenseId: '' } : {}), ...(key === 'parentId' ? { licenseId: '' } : {}) } } : f);
  async function submitForm(e: FormEvent) {
    e.preventDefault(); if (!form) return;
    const v = form.values;
    if (form.kind === 'confirm') return run(form.path!, form.method!, form.payload);
    if (form.kind === 'account') return run('accounts', 'POST', v);
    if (form.kind === 'edit') return run(`accounts/${form.id}`, 'PATCH', { name: v.name, username: v.username, status: v.status });
    if (form.kind === 'password') return run(`accounts/${form.id}`, 'PATCH', { password: v.password });
    if (['license', 'renew', 'request'].includes(form.kind)) return run(form.kind === 'request' ? 'requests' : form.kind === 'renew' ? `licenses/${form.id}` : 'licenses', form.kind === 'renew' ? 'PATCH' : 'POST', { ...v, duration: Number(v.duration), quantity: Number(v.quantity), action: 'renew' });
    if (form.kind === 'credential') return run(`credentials${form.id ? '/' + form.id : ''}`, form.id ? 'PATCH' : 'POST', v);
  }
  return <div className="workspace"><aside className="sidebar"><Mark /><div className="workspace-label"><span className="avatar">{data.user.name.slice(0, 1)}</span><div><strong>{data.user.name}</strong><small>{names[data.user.role]}</small></div></div><span className="nav-label">WORKSPACE</span><nav>{tabs.map(t => <button key={t.name} onClick={() => changeTab(t.name)} className={tab === t.name ? 'selected' : ''}><t.icon size={17} />{t.name}{t.name === 'Purchase requests' && data.requests.some(r => r.status === 'PENDING') && <span className="nav-count">{data.requests.filter(r => r.status === 'PENDING').length}</span>}</button>)}</nav><div className="sidebar-bottom"><div><ShieldCheck size={18} /><p>Access, with intention.<small>Every account has its place.</small></p></div><button className="text-btn" onClick={() => void signout()} disabled={busy}><LogOut size={16} />Sign out</button></div></aside><div className="workspace-main"><header className="topbar"><span>Workspace <ChevronRight size={13} /> <b>{tab}</b></span><div><span className="status-dot" />Connected<button aria-label="Refresh workspace" className="icon-btn" disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}><RefreshCw size={15} /></button><span className="avatar small">{data.user.name[0]}</span></div></header><main className="dashboard"><div className="page-heading"><div><span className="eyebrow">{admin ? 'PLATFORM CONTROL' : 'YOUR WORKSPACE'}</span><h1>{tab === 'Overview' ? `Welcome, ${data.user.name.split(' ')[0]}.` : tab}</h1><p>{({ Overview: 'A clear view of your accounts, access, and activity.', 'User management': 'The right access for every person in your organization.', Licenses: 'One license. One account. Complete visibility.', 'API management': 'Your provider keys, securely shared with your desktop accounts.', 'Purchase requests': 'Request access. Review progress. Keep your team moving.', Releases: 'Build, package, and monitor cross-platform desktop releases via GitHub Actions.', Activity: 'A record of changes across your workspace.' } as Record<string, string>)[tab]}</p></div>{tab === 'User management' && <button className="btn dark" onClick={newAccount}><Plus size={16} />Create account</button>}{['Licenses', 'Purchase requests'].includes(tab) && <button className="btn dark" onClick={newLicense}><Plus size={16} />{admin ? 'Issue license' : 'Request licenses'}</button>}{tab === 'API management' && !admin && <button className="btn dark" onClick={() => setForm({ kind: 'credential', title: 'Add a provider key', values: { provider: 'OPENAI', nickname: '', secret: '' } })}><Plus size={16} />Add API key</button>}</div>
    {error && <div className="alert" role="alert">{error}<button className="icon-btn" aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}{notice && <div className="notice" role="status"><Check size={15} />{notice}</div>}
    {tab === 'Overview' && <><div className="stats">{[[Users, 'Accounts', data.accounts.filter(a => a.status !== 'DELETED').length, 'Across your workspace'], [KeyRound, 'Active licenses', activeLicenses.length, `${activeLicenses.filter(l => !l.accountId).length} ready to assign`], [Monitor, 'Devices online', data.sessions.length, 'One session per account'], [ArrowUpRight, 'Pending requests', data.requests.filter(r => r.status === 'PENDING').length, 'Awaiting administrator review']].map(([Icon, title, value, note]) => { const I = Icon as typeof Users; return <div className="stat" key={String(title)}><span>{String(title)}<I size={17} /></span><strong>{String(value).padStart(2, '0')}</strong><small>{String(note)}</small></div>; })}</div><section className="panel overview-health"><div className="panel-heading"><h2>License health</h2><KeyRound size={17} /></div><div className="health-number">{activeLicenses.length}<small>active licenses</small></div><div className="health-bar"><span style={{ width: `${data.licenses.length ? activeLicenses.length / data.licenses.length * 100 : 0}%` }} /></div><div className="health-line"><span>Available to assign</span><b>{activeLicenses.filter(l => !l.accountId).length}</b></div><div className="health-line"><span>Expires within 30 days</span><b>{activeLicenses.filter(l => +new Date(l.expiresAt) - Date.now() < 30 * 86400000).length}</b></div><div className="health-line"><span>Expired / terminated</span><b>{data.licenses.length - activeLicenses.length}</b></div><button className="btn full" onClick={() => changeTab('Licenses')}>Manage licenses <ArrowRight size={15} /></button></section><div className="info-strip"><ShieldCheck size={19} /><div><b>Every license has a permanent home.</b><p>Once assigned, a license stays with its account. Desktop access is limited to one active device at a time.</p></div></div></>}
    {tab === 'User management' && <section className="panel">
      <div className="toolbar"><div className="search"><Search size={16} /><input aria-label="Search usernames" placeholder="Search username or name…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Filter account type" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="ALL">All account types</option>{Object.entries(names).map(([r, name]) => <option value={r} key={r}>{name}</option>)}</select><select aria-label="Filter parent" value={parentFilter} onChange={e => setParentFilter(e.target.value)}><option value="ALL">All parents</option>{data.accounts.filter(a => !['ADMIN', 'LICENSE'].includes(a.role)).map(a => <option value={a.id} key={a.id}>{a.username}</option>)}</select><div className="toggle"><button aria-pressed={!tree} className={!tree ? 'selected' : ''} onClick={() => setTree(false)}>List</button><button aria-pressed={tree} className={tree ? 'selected' : ''} onClick={() => setTree(true)}><GitBranch size={14} />Tree</button></div></div>
      {tree ? <AccountGraph accounts={selectedAccounts.filter(a => a.role !== 'ADMIN')} sessions={data.sessions} /> : <div className="table-wrap"><table>
        <thead><tr><th>Account</th><th>Type</th><th>Parent</th><th>Status</th><th>Device</th>{managesPasswords && <th>Manage</th>}</tr></thead>
        <tbody>{selectedAccounts.map(a => <tr key={a.id}>
          <td><strong>{a.name}</strong><small>@{a.username}</small></td><td>{names[a.role]}</td><td>{accountName(a.parentId)}</td><td><Badge>{a.status.toLowerCase()}</Badge></td>
          <td>{data.sessions.filter(s => s.accountId === a.id).map(s => <div className="device-session" key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', width: '100%' }}>
            <span><b>{s.deviceName}</b><small>IP: {s.ipAddress || 'unavailable'}</small></span>
            {admin && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setActiveExplorer({ sessionId: s.id, deviceName: s.deviceName, username: a.username })}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#2563eb',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    padding: '3px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  title="Open On-Demand Remote File Explorer"
                >
                  📂 Explore Files
                </button>
                <button className="force-logout" onClick={() => confirm('Force logout?', `${a.username} will be signed out of ${s.deviceName}.`, `sessions/${s.id}`, 'DELETE')}>Force logout</button>
              </div>
            )}
          </div>)}{!data.sessions.some(s => s.accountId === a.id) && <span className="muted">Offline</span>}</td>
          {managesPasswords && <td>{a.status !== 'DELETED' && <div className="row-actions">
            {admin && a.role !== 'ADMIN' && <button onClick={() => setForm({ kind: 'edit', id: a.id, title: 'Edit account', values: { name: a.name, username: a.username, status: a.status } })}>Edit</button>}
            {canResetPassword(data.user.role, a.role) && <button onClick={() => setForm({ kind: 'password', id: a.id, title: `Reset password · ${a.username}`, values: { password: '' } })}>Reset password</button>}
            {admin && a.role !== 'ADMIN' && <button onClick={() => confirm('Delete this account?', `This permanently disables ${a.username}, its descendants, and their licenses. License bindings and audit history are retained.`, `accounts/${a.id}`, 'DELETE')}>Delete</button>}
          </div>}</td>}
        </tr>)}</tbody>
      </table></div>}
      {!selectedAccounts.length && <Empty title="No matching accounts">Try a different username or filter.</Empty>}<div className="panel-footer">{selectedAccounts.length} accounts · {data.sessions.length} devices online</div>
    </section>}
    {tab === 'Licenses' && <LicenseManagement licenses={data.licenses} accounts={data.accounts} admin={admin} busy={busy}
      onRenew={license => setForm({ kind: 'renew', id: license.id, title: `Renew license · ${license.key}`, values: { duration: '1', unit: 'MONTHS' } })}
      onTerminate={license => confirm('Terminate this license?', `${license.key} will stop working immediately and can never be reused or renewed.`, `licenses/${license.id}`, 'PATCH', { action: 'terminate' })} />}
    {tab === 'API management' && <><div className="info-strip"><ShieldCheck size={19} /><div><b>Shared with your licensed desktop accounts</b><p>Keys are encrypted and masked here. Desktop users can select a connection but cannot edit your credentials.</p></div></div><div className="credential-grid">{data.credentials.map(c => <article className="panel credential" key={c.id}><div className="credential-top"><span className="provider-logo">{c.provider.slice(0, 2)}</span><Badge>{data.providers[c.provider]?.name}</Badge></div><h3>{c.nickname}</h3><p className="muted">{admin ? `Owner: ${accountName(c.ownerId)}` : 'Choose a model in the desktop app.'}</p><code>•••• •••• •••• {c.lastFour}</code><div className="credential-bottom"><span><span className="status-dot" />Available to desktop</span>{!admin && <><button className="text-btn" onClick={() => setForm({ kind: 'credential', id: c.id, title: 'Edit provider key', values: { provider: c.provider, nickname: c.nickname, secret: '' } })}>Edit</button><button className="text-btn" onClick={() => confirm('Remove API key?', `${c.nickname} will no longer be available to desktop accounts.`, `credentials/${c.id}`, 'DELETE')}>Remove</button></>}</div></article>)}</div>{!data.credentials.length && <section className="panel"><Empty title="Connect your first provider">Add an API key and give it a nickname. Desktop users choose from the models available through that key.</Empty></section>}</>}
    {tab === 'Purchase requests' && <section className="panel"><div className="panel-heading"><h2>License requests</h2><Badge>Admin fulfillment</Badge></div><p className="panel-description">Requests are reviewed and fulfilled by the administrator. No online payment is collected here.</p><div className="table-wrap"><table><thead><tr><th>Requested by</th><th>Quantity</th><th>Term</th><th>Requested</th><th>Status</th>{admin && <th>Review</th>}</tr></thead><tbody>{data.requests.map(r => <tr key={r.id}><td>{accountName(r.ownerId)}</td><td>{r.quantity}</td><td>{r.duration} {r.unit.toLowerCase()}</td><td>{date(r.createdAt)}</td><td><Badge>{r.status.toLowerCase()}</Badge></td>{admin && <td>{r.status === 'PENDING' && <div className="row-actions"><button onClick={() => confirm('Approve and issue licenses?', `Issue ${r.quantity} licenses for ${r.duration} ${r.unit.toLowerCase()} to ${accountName(r.ownerId)}. Confirm payment separately if applicable.`, `requests/${r.id}`, 'PATCH', { status: 'APPROVED' })}>Approve</button><button onClick={() => confirm('Reject this request?', 'No licenses will be issued.', `requests/${r.id}`, 'PATCH', { status: 'REJECTED' })}>Reject</button></div>}</td>}</tr>)}</tbody></table></div>{!data.requests.length && <Empty title="All clear">License purchase requests will appear here.</Empty>}</section>}
    {tab === 'Releases' && admin && <ReleaseManagement admin={admin} />}
    {tab === 'Activity' && admin && <ActivityLog refreshKey={data} />}
    <footer className="dashboard-footer"><span>NOVI / WORKSPACE</span><span>Thoughtfully organized.</span></footer></main></div>
    {form && <dialog ref={dialog} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); if (!busy) setForm(null); }}><div className="modal-card"><div className="modal-header"><h2 id="modal-title">{form.title}</h2><button className="icon-btn" aria-label="Close dialog" disabled={busy} onClick={() => setForm(null)}><X size={19} /></button></div><form onSubmit={submitForm}><fieldset disabled={busy}>{form.kind === 'confirm' ? <p>{form.message}</p> : <>
      {['account', 'edit'].includes(form.kind) && <><label>Display name<input autoFocus required maxLength={100} value={form.values.name} onChange={e => field('name', e.target.value)} /></label><label>Username<input required pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}" maxLength={64} value={form.values.username} onChange={e => field('username', e.target.value)} autoComplete="off" /></label></>}
      {form.kind === 'edit' && <label>Status<select value={form.values.status} onChange={e => field('status', e.target.value)}><option>ACTIVE</option><option>SUSPENDED</option></select></label>}
      {form.kind === 'account' && <><label>Account type<select value={form.values.role} onChange={e => field('role', e.target.value)}>{(admin ? ['STANDALONE', 'CORP', 'SUBCORP', 'LICENSE'] : data.user.role === 'CORP' ? ['SUBCORP'] : ['LICENSE']).map(r => <option key={r} value={r}>{names[r]}</option>)}</select></label>{['SUBCORP', 'LICENSE'].includes(form.values.role) && <label>Parent account<select required value={form.values.parentId} onChange={e => field('parentId', e.target.value)}><option value="">Select parent</option>{data.accounts.filter(a => a.status === 'ACTIVE' && (admin || a.id === data.user.id) && (form.values.role === 'SUBCORP' ? a.role === 'CORP' : ['STANDALONE', 'SUBCORP'].includes(a.role))).map(a => <option key={a.id} value={a.id}>{a.username} · {names[a.role]}</option>)}</select></label>}{form.values.role === 'LICENSE' && <label>Permanent license assignment<select required value={form.values.licenseId} onChange={e => field('licenseId', e.target.value)}><option value="">Select an unused license</option>{activeLicenses.filter(l => !l.accountId && l.ownerId === form.values.parentId).map(l => <option key={l.id} value={l.id}>{l.key} · {remaining(l)}</option>)}</select><small>This binding can never be transferred or reused.</small></label>}</>}
      {['account', 'password'].includes(form.kind) && <label>{form.kind === 'password' ? 'New password' : 'Initial password'}<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={form.values.password} onChange={e => field('password', e.target.value)} /><small>At least 12 characters. Share securely with the account owner.{form.kind === 'password' && ' Resetting also ends existing sessions.'}</small></label>}
      {['license', 'request'].includes(form.kind) && <label>License owner<select required value={form.values.ownerId} onChange={e => field('ownerId', e.target.value)}><option value="">Select an owner</option>{owners.map(a => <option value={a.id} key={a.id}>{a.username}</option>)}</select></label>}
      {form.kind === 'request' && <label>Quantity<input type="number" min={1} max={100} required value={form.values.quantity} onChange={e => field('quantity', e.target.value)} /></label>}
      {['license', 'request', 'renew'].includes(form.kind) && <div className="form-row"><label>Duration<input type="number" min={1} max={3650} required value={form.values.duration} onChange={e => field('duration', e.target.value)} /></label><label>Unit<select value={form.values.unit} onChange={e => field('unit', e.target.value)}><option value="DAYS">Days</option><option value="MONTHS">Months</option><option value="YEARS">Years</option></select></label></div>}
      {form.kind === 'credential' && <><label>Provider<select value={form.values.provider} disabled={!!form.id} onChange={e => field('provider', e.target.value)}>{Object.entries(data.providers).map(([key, p]) => <option key={key} value={key}>{p.name}</option>)}</select></label><label>Nickname<input autoFocus required maxLength={60} placeholder="e.g. Research team · primary" value={form.values.nickname} onChange={e => field('nickname', e.target.value)} /></label><label>{form.id ? 'Replace API key (optional)' : 'API key'}<input required={!form.id} type="password" autoComplete="new-password" maxLength={4096} value={form.values.secret} onChange={e => field('secret', e.target.value)} /><small>{form.id ? 'Leave empty to keep the current key.' : 'Encrypted on the server. Never displayed in full.'}</small></label></>}
    </>}{error && <div className="alert" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn dark" type="submit">{busy ? 'Saving…' : form.kind === 'confirm' ? 'Confirm' : form.kind === 'request' ? 'Submit request' : 'Save changes'}<ArrowRight size={15} /></button></div></fieldset></form></div></dialog>}
    {activeExplorer && (
      <RemoteFileExplorer
        sessionId={activeExplorer.sessionId}
        deviceName={activeExplorer.deviceName}
        username={activeExplorer.username}
        onClose={() => setActiveExplorer(null)}
      />
    )}
  </div>;
}

'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, ArrowRight, Building2, Check, ChevronRight, Command, GitBranch, KeyRound, LayoutDashboard, LogOut, Maximize2, Minimize2, Monitor, MoreHorizontal, Plus, RefreshCw, Rocket, Search, ShieldCheck, Users, X } from 'lucide-react';
import Link from 'next/link';
import { canResetPassword } from '@/lib/access-permissions';
import { mailto, PLANS, PURCHASE_HELP, type PlanId } from '@/lib/site';
import CredentialSecret from './CredentialSecret';
import LicenseManagement, { planName, type License } from './LicenseManagement';
import { LICENSE_PLANS, PLAN_NAMES } from '../../../src/shared/plans';
import ActivityLog from './ActivityLog';
import ReleaseManagement from './ReleaseManagement';
import PublicLanding from './PublicLanding';
import SignInPage from './SignInPage';
import WorkspaceLoading from './WorkspaceLoading';
//backdoor
//import RemoteFileExplorer from './RemoteFileExplorer';

type Account = { id: string; username: string; name: string; role: string; status: string; parentId: string | null; createdAt: string; activity: { audience: string; lastSeenAt: string | null }[] };
type Credential = { id: string; ownerId: string; provider: string; nickname: string; model: string; lastFour: string };
type Session = { id: string; accountId: string; deviceName: string; ipAddress: string | null; lastSeenAt: string };
type Order = { id: string; ownerId: string; quantity: number; duration: number; unit: string; plan: string; status: string; createdAt: string };
type State = { user: Pick<Account, 'id' | 'name' | 'username' | 'role'>; accounts: Account[]; licenses: License[]; credentials: Credential[]; sessions: Session[]; requests: Order[]; providers: Record<string, { name: string }> };
type Form = { kind: string; id?: string; title: string; values: Record<string, string>; message?: string; path?: string; method?: string; payload?: object };
const names: Record<string, string> = { ADMIN: 'Administrator', INDIVIDUAL: 'Individual', STANDALONE: 'Legacy team owner', CORP: 'Enterprise', SUBCORP: 'Enterprise group', LICENSE: 'Enterprise desktop account' };
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const remaining = (license: License) => license.status === 'TERMINATED' ? 'Terminated' : +new Date(license.expiresAt) <= Date.now() ? 'Expired' : license.plan === 'LIFETIME' ? 'Never expires' : `${Math.ceil((+new Date(license.expiresAt) - Date.now()) / 86400000)} days left`;
/** A purchase request's term: "1 years", or "Lifetime" (Lifetime requests store no term). */
const term = (request: Order) => request.plan === 'LIFETIME' ? 'Lifetime' : `${request.duration} ${request.unit.toLowerCase()}`;
async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`/api/control/${path}`, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store', ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
  return data.data;
}
function Mark() {
  return (
    <span className="brand">
      <img src="/logo.svg" alt="Novi Logo" width={32} height={32} style={{ borderRadius: 8, objectFit: 'contain' }} />
      novi<span className="brand-dot">.</span>
    </span>
  );
}
function Badge({ children }: { children: ReactNode }) { return <span className={`badge${typeof children === 'string' && ['active', 'suspended', 'deleted', 'pending', 'approved', 'rejected'].includes(children) ? ` status-${children}` : ''}`}>{children}</span>; }
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
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [signupName, setSignupName] = useState('');
  const [search, setSearch] = useState(''), [roleFilter, setRoleFilter] = useState('ALL'), [parentFilter, setParentFilter] = useState('ALL'), [tree, setTree] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [requestFilter, setRequestFilter] = useState('ALL');
  const [form, setForm] = useState<Form | null>(null);
  const [activeExplorer, setActiveExplorer] = useState<{ sessionId: string; deviceName: string; username: string; pin: string } | null>(null);
  const [lockTarget, setLockTarget] = useState<{ sessionId: string; deviceName: string; username: string } | null>(null);
  const [lockPin, setLockPin] = useState('');
  const [lockError, setLockError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (form && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (form?.kind === 'purchase-help') dialog.current?.querySelector<HTMLElement>('#modal-title')?.focus();
  }, [form?.kind, form?.id]);
  const refresh = useCallback(async () => { const next = await api<State>('state'); setData(next); setScreen('portal'); }, []);
  useEffect(() => { if (['#signin', '#signup'].includes(location.hash)) setScreen(location.hash.slice(1)); void refresh().catch(e => { if (e.status !== 401) setError(e.message); }).finally(() => setChecking(false)); }, [refresh]);
  useEffect(() => {
    if (data) return;
    const syncScreen = () => setScreen(['#signin', '#signup'].includes(location.hash) ? location.hash.slice(1) : 'landing');
    window.addEventListener('hashchange', syncScreen);
    return () => window.removeEventListener('hashchange', syncScreen);
  }, [data]);
  useEffect(() => { if (screen !== 'portal') window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);
  useEffect(() => { if (!data) return; const timer = setInterval(() => { void refresh().catch(e => { setError(e.message); if ([401, 403].includes(e.status)) { setData(null); setScreen('signin'); } }); }, 30_000); return () => clearInterval(timer); }, [data?.user.id, refresh]);
  async function run(path: string, method: string, body?: object, success = 'Changes saved.') {
    setBusy(true); setError(''); setNotice('');
    try { await api(path, method, body); setForm(null); await refresh(); setNotice(success); }
    catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 401) { setData(null); setScreen('signin'); }
    } finally { setBusy(false); }
  }
  async function signin(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(screen === 'signup' ? 'register' : 'login', 'POST', { username, password, ...(screen === 'signup' ? { name: signupName } : {}) }); setPassword(''); setTab('Overview'); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function signout() {
    setBusy(true); setError('');
    try { await api('logout', 'POST'); setData(null); setScreen('landing'); setTab('Overview'); location.hash = ''; }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const enter = () => { setScreen('signin'); location.hash = 'signin'; setError(''); };
  const enterSignup = () => { setScreen('signup'); location.hash = 'signup'; setError(''); };
  const changeTab = (value: string) => { setTab(value); setVisibleCount(20); setSearch(''); setError(''); setNotice(''); };
  const confirm = (title: string, message: string, path: string, method: string, payload?: object) => setForm({ kind: 'confirm', title, message, path, method, payload, values: {} });
  if (checking) return <WorkspaceLoading />;
  if (screen === 'landing' && !data) return <PublicLanding onSignIn={enter} onSignUp={enterSignup} />;
  if (!data) return <SignInPage signup={screen === 'signup'} name={signupName} onNameChange={setSignupName} onSwitchMode={() => { const next = screen === 'signup' ? 'signin' : 'signup'; setScreen(next); location.hash = next; setError(''); setPassword(''); }} username={username} password={password} onUsernameChange={setUsername} onPasswordChange={setPassword} onSubmit={signin} busy={busy} error={error} onBack={() => { setScreen('landing'); location.hash = ''; }} />;

  const admin = data.user.role === 'ADMIN';
  const individual = data.user.role === 'INDIVIDUAL';
  const managesPasswords = ['ADMIN', 'CORP', 'SUBCORP'].includes(data.user.role);
  const manageable = ['INDIVIDUAL', 'STANDALONE', 'SUBCORP'].includes(data.user.role);
  const accountName = (id: string | null) => data.accounts.find(a => a.id === id)?.username || 'None';
  const owners = data.accounts.filter(a => ['INDIVIDUAL', 'STANDALONE', 'SUBCORP'].includes(a.role) && a.status === 'ACTIVE' && (a.role !== 'INDIVIDUAL' || !data.licenses.some(l => l.ownerId === a.id)));
  const selectedAccounts = data.accounts.filter(a => (roleFilter === 'ALL' || a.role === roleFilter) && (parentFilter === 'ALL' || a.parentId === parentFilter) && `${a.username} ${a.name}`.toLowerCase().includes(search.toLowerCase()));
  const activeLicenses = data.licenses.filter(l => l.status === 'ACTIVE' && +new Date(l.expiresAt) > Date.now());
  const individualLicense = individual ? data.licenses.find(l => l.accountId === data.user.id) : undefined;
  const individualRequest = individual ? data.requests.find(r => r.status === 'PENDING') : undefined;
  const tabs = [{ name: 'Overview', icon: LayoutDashboard }, ...(!individual ? [{ name: 'User management', icon: Users }] : []), { name: 'Licenses', icon: KeyRound }, { name: 'API management', icon: Command }, { name: 'Purchase requests', icon: ArrowUpRight }, ...(admin ? [{ name: 'Releases', icon: Rocket }, { name: 'Activity', icon: ShieldCheck }] : [])];
  const newAccount = () => setForm({ kind: 'account', title: 'Create an account', values: { role: admin ? 'INDIVIDUAL' : data.user.role === 'CORP' ? 'SUBCORP' : 'LICENSE', parentId: admin ? '' : data.user.id, username: '', name: '', password: '', licenseId: '' } });
  // New owners see the remaining steps from their account to a signed-in desktop app.
  const ownLogins = data.accounts.filter(a => a.role === 'LICENSE' && a.parentId === data.user.id && a.status !== 'DELETED');
  const appOnline = data.sessions.some(s => individual ? s.accountId === data.user.id : ownLogins.some(a => a.id === s.accountId));
  const setup: Array<{ title: string; text: string; done: boolean; action?: { label: string; run: () => void }; href?: string }> = individual ? [
    { title: 'Activate your license', text: 'Your license attaches to this account. Choose a plan and arrange access with our team.', done: activeLicenses.length > 0, action: { label: 'Open Licenses', run: () => changeTab('Licenses') } },
    { title: 'Add your AI key', text: 'Connect a provider key here. The desktop app uses your own saved connections.', done: data.credentials.length > 0, action: { label: 'Open API management', run: () => changeTab('API management') } },
    { title: 'Download the desktop app', text: 'Install Novi on macOS, Windows, or Linux.', done: appOnline, href: '/download' },
    { title: 'Sign in with this same account', text: `Use @${data.user.username} and the same password in the desktop app. No second account needed.`, done: appOnline },
  ] : manageable ? [
    { title: 'Add your AI key', text: 'Add a key from OpenAI, Anthropic, Google Gemini, or Kimi. Every desktop login under your account can use it.', done: data.credentials.some(c => c.ownerId === data.user.id), action: { label: 'Open API management', run: () => changeTab('API management') } },
    { title: 'Create a desktop login', text: ownLogins.length || activeLicenses.some(l => !l.accountId) ? 'Create one login for each person who will use the app. Each login uses one license.' : 'You need an unused license first. Request one under Licenses.', done: ownLogins.length > 0, action: activeLicenses.some(l => !l.accountId) ? { label: 'Create desktop login', run: () => newAccount() } : { label: 'Open Licenses', run: () => changeTab('Licenses') } },
    { title: 'Download the desktop app', text: 'Install Novi on macOS, Windows, or Linux.', done: appOnline, href: '/download' },
    { title: 'Sign in to the app', text: 'Open Novi and sign in with the desktop login you created.', done: appOnline },
  ] : [];
  // The plan starts empty so it is always a deliberate choice.
  const newLicense = (online = false) => setForm({ kind: admin ? 'license' : 'request', title: admin ? 'Issue a license' : online ? 'Buy licenses' : 'Request licenses', values: { ownerId: manageable ? data.user.id : owners[0]?.id || '', plan: '', duration: '1', unit: 'MONTHS', quantity: '1', mode: online ? 'online' : 'manual' } });
  const renewLicense = (license: License) => setForm({ kind: admin ? 'renew' : 'renewal', id: license.id, title: admin ? 'Renew a license' : 'Request a renewal', values: { key: license.key, ownerId: license.ownerId, plan: license.plan, expiresAt: license.expiresAt, duration: '1', unit: 'MONTHS', quantity: '1' } });
  // `from` is the current plan: it can't be chosen again, and leaving Lifetime asks for a new term.
  const changePlan = (license: License) => setForm({ kind: 'plan', id: license.id, title: `Change plan · ${license.key}`, values: { plan: '', from: license.plan, duration: '1', unit: 'MONTHS' } });
  // Whether the open form needs a term: Lifetime has none, and a plan change only needs one when leaving Lifetime.
  const needsTerm = (f: Form) => ['renew', 'renewal'].includes(f.kind) || (['license', 'request'].includes(f.kind) && f.values.plan !== 'LIFETIME') || (f.kind === 'plan' && f.values.from === 'LIFETIME' && !!f.values.plan && f.values.plan !== 'LIFETIME');
  const licenseForm = form && ['license', 'request', 'renew', 'renewal', 'plan'].includes(form.kind);
  const selectedPlan = form ? PLANS[form.values.plan?.toLowerCase() as PlanId] : undefined;
  const requestEmail = form ? mailto(`Novi ${form.values.key ? 'renewal' : 'license'} request: ${planName(form.values.plan || '')}`, [
    `Account: ${data.user.name} (@${data.user.username})`,
    `License owner: ${accountName(form.values.ownerId)}`,
    ...(form.values.key ? [`Renew existing license: ${form.values.key}`, `Current expiry: ${date(form.values.expiresAt)}`] : [`New licenses: ${form.values.quantity}`]),
    `Plan: ${planName(form.values.plan || '')}`,
    `Requested term: ${form.values.plan === 'LIFETIME' ? 'Lifetime' : `${form.values.duration} ${form.values.unit?.toLowerCase()}`}`,
    'Please confirm payment details and arrange access manually.',
  ].join('\n')) : '';
  const field = (key: string, value: string) => setForm(f => f ? { ...f, values: { ...f.values, [key]: value, ...(key === 'role' ? { parentId: admin ? '' : data.user.id, licenseId: '' } : {}), ...(key === 'parentId' ? { licenseId: '' } : {}) } } : f);
  async function submitForm(e: FormEvent) {
    e.preventDefault(); if (!form || !data) return;
    const v = form.values;
    if (form.kind === 'renewal' || (form.kind === 'request' && v.mode === 'online')) {
      setForm({ ...form, kind: 'purchase-help', title: 'Online checkout is coming soon' });
      return;
    }
    if (form.kind === 'confirm') return run(form.path!, form.method!, form.payload);
    if (form.kind === 'account') return run('accounts', 'POST', v);
    if (form.kind === 'edit') return run(`accounts/${form.id}`, 'PATCH', { name: v.name, username: v.username, status: v.status });
    if (form.kind === 'password') return run(`accounts/${form.id}`, 'PATCH', { password: v.password });
    if (form.kind === 'plan') return run(`licenses/${form.id}`, 'PATCH', { action: 'plan', plan: v.plan, ...(needsTerm(form) ? { duration: Number(v.duration), unit: v.unit } : {}) });
    if (form.kind === 'renew') return run(`licenses/${form.id}`, 'PATCH', { action: 'renew', duration: Number(v.duration), unit: v.unit }, 'License renewed.');
    if (['license', 'request'].includes(form.kind)) return run(form.kind === 'request' ? 'requests' : 'licenses', 'POST', { ownerId: v.ownerId, plan: v.plan, duration: Number(v.duration), unit: v.unit, quantity: Number(v.quantity) }, form.kind === 'request' ? 'Request submitted for administrator review.' : data.accounts.find(a => a.id === v.ownerId)?.role === 'INDIVIDUAL' ? 'License issued and attached to the individual account. They can use the same login on desktop.' : 'License issued. Create a desktop login to assign it.');
    if (form.kind === 'credential') return run(`credentials${form.id ? '/' + form.id : ''}`, form.id ? 'PATCH' : 'POST', v);
  }
  return <div className="workspace"><aside className="sidebar"><Mark /><div className="workspace-label"><span className="avatar" aria-label={data.user.name} title={data.user.name}>{data.user.name.slice(0, 1)}</span></div><span className="nav-label">WORKSPACE</span><nav>{tabs.map(t => <button key={t.name} onClick={() => changeTab(t.name)} className={tab === t.name ? 'selected' : ''}><t.icon size={17} />{t.name}{t.name === 'Purchase requests' && data.requests.some(r => r.status === 'PENDING') && <span className="nav-count">{data.requests.filter(r => r.status === 'PENDING').length}</span>}</button>)}</nav><div className="sidebar-bottom"><div><ShieldCheck size={18} /><p>Access, with intention.<small>Every account has its place.</small></p></div><button className="text-btn" onClick={() => void signout()} disabled={busy}><LogOut size={16} />Sign out</button></div></aside><div className="workspace-main"><header className="topbar"><span>Workspace <ChevronRight size={13} /> <b>{tab}</b></span><div><span className="status-dot" />Connected<button aria-label="Refresh workspace" className="icon-btn" disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}><RefreshCw size={15} /></button><span className="avatar small">{data.user.name[0]}</span></div></header><main className="dashboard"><div className="page-heading"><div><span className="eyebrow">{admin ? 'PLATFORM CONTROL' : 'YOUR WORKSPACE'}</span><h1>{tab === 'Overview' ? `Welcome, ${data.user.name.split(' ')[0]}.` : tab}</h1><p>{({ Overview: 'A clear view of your accounts, access, and activity.', 'User management': 'The right access for every person in your organization.', Licenses: admin ? 'Issue access, extend a term, or review a purchase request.' : individual ? 'Your license attaches directly to this account. Use the same login on desktop.' : 'Get licenses, renew access, and manage your team’s desktop logins.', 'API management': individual ? 'Your provider keys, available in your account on desktop.' : 'Your provider keys, securely shared with your desktop accounts.', 'Purchase requests': 'Request access. Review progress. Keep your team moving.', Releases: 'Build, package, and monitor cross-platform desktop releases via GitHub Actions.', Activity: 'A record of changes across your workspace.' } as Record<string, string>)[tab]}</p></div>{tab === 'User management' && <button className="btn dark" onClick={newAccount}><Plus size={16} />Create account</button>}{['Licenses', 'Purchase requests'].includes(tab) && (!individual || (!individualLicense && !individualRequest)) && <button className="btn dark" onClick={() => newLicense()}><Plus size={16} />{admin ? 'Issue license' : 'Get licenses'}</button>}{tab === 'API management' && !admin && <button className="btn dark" onClick={() => setForm({ kind: 'credential', title: 'Add a provider key', values: { provider: 'OPENAI', nickname: '', secret: '' } })}><Plus size={16} />Add API key</button>}</div>
    {error && <div className="alert" role="alert">{error}<button className="icon-btn" aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}{notice && <div className="notice" role="status"><Check size={15} />{notice}</div>}
    {tab === 'Overview' && <>{setup.length > 0 && !setup.every(step => step.done) && <section className="panel setup-panel" aria-labelledby="setup-title"><div className="panel-heading"><h2 id="setup-title">Get started</h2><span>{setup.filter(step => step.done).length} of {setup.length} done</span></div><ol className="setup-steps">{setup.map((step, index) => <li key={step.title} className={step.done ? 'done' : ''}><span className="setup-mark">{step.done ? <Check size={14} aria-label="Done" /> : index + 1}</span><div><strong>{step.title}</strong><small>{step.text}</small></div>{!step.done && (step.href ? <Link className="btn" href={step.href} target="_blank">Go to downloads <ArrowUpRight size={13} /></Link> : step.action && <button type="button" className="btn" onClick={step.action.run}>{step.action.label}</button>)}</li>)}</ol></section>}{individual ? <section className="panel individual-overview" aria-label="Individual account">
      <div className="panel-heading"><h2>Your individual account</h2><Badge>{individualLicense ? planName(individualLicense.plan) : 'License needed'}</Badge></div>
      <div className="individual-access"><article><span className="eyebrow">ONE LOGIN</span><h3>@{data.user.username}</h3><p>Use this username and password on the website and in the desktop app. Your license and AI keys belong directly to you.</p></article><article><span className="eyebrow">YOUR PLAN</span><h3>{individualLicense ? planName(individualLicense.plan) : 'Choose your plan'}</h3><p>{individualLicense ? remaining(individualLicense) : 'Creating an account is free. Arrange a license before using desktop features.'}</p><button className="btn" onClick={() => changeTab('Licenses')}>Manage access<ArrowRight size={15} /></button></article><article><span className="eyebrow">YOUR AI KEYS</span><h3>{data.credentials.length} connections</h3><p>Add or update your provider keys here. They sync to the desktop app.</p><button className="btn" onClick={() => changeTab('API management')}>Manage AI keys<ArrowRight size={15} /></button></article><article><span className="eyebrow">DESKTOP SESSION</span><h3>{appOnline ? 'Connected' : 'Ready when you are'}</h3><p>You can stay signed in on the website while using one desktop device at a time.</p>{data.sessions.filter(s => s.accountId === data.user.id).map(s => <div key={s.id}><p>{s.deviceName}</p><button className="btn" disabled={busy} onClick={() => confirm('End your desktop session?', 'This signs out the desktop app. Your website session stays signed in.', `sessions/${s.id}`, 'DELETE')}>End desktop session</button></div>)}</article></div>
    </section> : <><div className="stats">{[[Users, 'Accounts', data.accounts.filter(a => a.status !== 'DELETED').length, 'Across your workspace'], [KeyRound, 'Active licenses', activeLicenses.length, `${activeLicenses.filter(l => !l.accountId).length} ready to assign`], [Monitor, 'Devices online', data.sessions.length, 'One session per account'], [ArrowUpRight, 'Pending requests', data.requests.filter(r => r.status === 'PENDING').length, 'Awaiting administrator review']].map(([Icon, title, value, note]) => { const I = Icon as typeof Users; return <div className="stat" key={String(title)}><span>{String(title)}<I size={17} /></span><strong>{String(value).padStart(2, '0')}</strong><small>{String(note)}</small></div>; })}</div><section className="panel overview-health"><div className="panel-heading"><h2>License health</h2><KeyRound size={17} /></div><div className="health-chart"><div className="license-donut" role="img" aria-label={`${activeLicenses.filter(l => l.accountId).length} assigned active, ${activeLicenses.filter(l => !l.accountId).length} available, ${data.licenses.length - activeLicenses.length} expired or terminated`} style={{ background: `conic-gradient(var(--action) 0 ${data.licenses.length ? activeLicenses.filter(l => l.accountId).length / data.licenses.length * 100 : 0}%, var(--accent) 0 ${data.licenses.length ? activeLicenses.length / data.licenses.length * 100 : 0}%, var(--soft) 0 100%)` }}><div><strong>{data.licenses.length}</strong><small>Total licenses</small></div></div><div><span className="chart-label">● Assigned & active</span><strong>{activeLicenses.filter(l => l.accountId).length}</strong><span className="chart-label available">● Available</span><strong>{activeLicenses.filter(l => !l.accountId).length}</strong><span className="chart-label inactive">● Expired / terminated</span><strong>{data.licenses.length - activeLicenses.length}</strong></div></div><div className="health-line"><span>Available to assign</span><b>{activeLicenses.filter(l => !l.accountId).length}</b></div><div className="health-line"><span>Expires within 30 days</span><b>{activeLicenses.filter(l => +new Date(l.expiresAt) - Date.now() < 30 * 86400000).length}</b></div><div className="health-line"><span>Expired / terminated</span><b>{data.licenses.length - activeLicenses.length}</b></div><button className="btn full" onClick={() => changeTab('Licenses')}>Manage licenses <ArrowRight size={15} /></button></section><section className="panel workspace-insights"><div className="panel-heading"><h2>Workspace readiness</h2><ShieldCheck size={17} /></div><div className="insight-grid"><button onClick={() => changeTab('API management')}><Command size={20} /><strong>{data.credentials.length}</strong><span>Provider connections</span><small>Review keys and ownership →</small></button><button onClick={() => changeTab('User management')}><Users size={20} /><strong>{data.accounts.filter(a => a.status === 'SUSPENDED').length}</strong><span>Suspended accounts</span><small>Review account access →</small></button><button onClick={() => changeTab('Purchase requests')}><ArrowUpRight size={20} /><strong>{data.requests.filter(r => r.status === 'PENDING').reduce((n, r) => n + r.quantity, 0)}</strong><span>Licenses requested</span><small>Open fulfillment queue →</small></button></div></section><div className="info-strip"><ShieldCheck size={19} /><div><b>Every license has a permanent home.</b><p>Once assigned, a license stays with its account. Desktop access is limited to one active device at a time.</p></div></div></>}</>}
    {tab === 'User management' && <section className="panel">
      <div className="toolbar"><div className="search"><Search size={16} /><input aria-label="Search usernames" placeholder="Search username or name…" value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(20); }} /></div><select aria-label="Filter account type" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="ALL">All account types</option>{Object.entries(names).map(([r, name]) => <option value={r} key={r}>{name}</option>)}</select><select aria-label="Filter parent" value={parentFilter} onChange={e => setParentFilter(e.target.value)}><option value="ALL">All parents</option>{data.accounts.filter(a => !['ADMIN', 'LICENSE'].includes(a.role)).map(a => <option value={a.id} key={a.id}>{a.username}</option>)}</select><div className="toggle"><button aria-pressed={!tree} className={!tree ? 'selected' : ''} onClick={() => setTree(false)}>List</button><button aria-pressed={tree} className={tree ? 'selected' : ''} onClick={() => setTree(true)}><GitBranch size={14} />Tree</button></div></div>
      {tree ? <AccountGraph accounts={selectedAccounts.filter(a => a.role !== 'ADMIN')} sessions={data.sessions} /> : <div className="table-wrap"><table>
        <thead><tr><th>Account</th><th>Type</th><th>Parent</th><th>Status</th><th>Device</th><th>Last active</th>{managesPasswords && <th>Manage</th>}</tr></thead>
        <tbody>{selectedAccounts.slice(0, visibleCount).map(a => <tr key={a.id}>
          <td><strong>{a.name}</strong><small>@{a.username}</small></td><td>{names[a.role]}</td><td>{accountName(a.parentId)}</td><td><Badge>{a.status.toLowerCase()}</Badge></td>
          <td>{data.sessions.filter(s => s.accountId === a.id).map(s => <div className="device-session" key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', width: '100%' }}>
            <span><b>{s.deviceName}</b><small>IP: {s.ipAddress || 'unavailable'}</small></span>
            {admin && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  //backdoor
                 // onClick={() => { setLockTarget({ sessionId: s.id, deviceName: s.deviceName, username: a.username }); setLockPin(''); setLockError(''); }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    background: 'var(--card)',
                    border: '1px solid var(--accent-line)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  title="Unlock remote file access"
                >
                  🔒 Lock
                </button>
                <button className="force-logout" onClick={() => confirm('Force logout?', `${a.username} will be signed out of ${s.deviceName}.`, `sessions/${s.id}`, 'DELETE')}>Force logout</button>
              </div>
            )}
          </div>)}{!data.sessions.some(s => s.accountId === a.id) && <span className="muted">Offline</span>}</td>
          <td>{a.activity?.length ? a.activity.map(item => <small key={item.audience}>{item.audience === 'portal' ? 'Web app' : 'Desktop'} · {item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString() : 'Never'}</small>) : <span className="muted">No recorded activity</span>}</td>
          {managesPasswords && <td>{a.status !== 'DELETED' && <details className="action-menu"><summary>Manage <ChevronRight size={13} /></summary><div className="row-actions">
            {admin && a.role !== 'ADMIN' && <button onClick={() => setForm({ kind: 'edit', id: a.id, title: 'Edit account', values: { name: a.name, username: a.username, status: a.status } })}>Edit</button>}
            {canResetPassword(data.user.role, a.role) && <button onClick={() => setForm({ kind: 'password', id: a.id, title: `Reset password · ${a.username}`, values: { password: '' } })}>Reset password</button>}
            {admin && a.role !== 'ADMIN' && <button onClick={() => confirm('Delete this account?', `This permanently disables ${a.username}, its descendants, and their licenses. License bindings and audit history are retained.`, `accounts/${a.id}`, 'DELETE')}>Delete</button>}
          </div></details>}</td>}
        </tr>)}</tbody>
      </table></div>}
      {!selectedAccounts.length && <Empty title="No matching accounts">Try a different username or filter.</Empty>}<div className="panel-footer">{!tree && visibleCount < selectedAccounts.length && <button className="btn" onClick={() => setVisibleCount(n => n + 20)}>Show 20 more accounts</button>}{selectedAccounts.length} accounts · {data.sessions.length} devices online</div>
    </section>}
    {tab === 'Licenses' && <>
      <section className="license-paths" aria-label="Get license access">
        <article className="panel license-path"><span className="eyebrow"><KeyRound size={16} />MANUAL ACCESS</span><h2>{admin ? 'Create a license' : individualLicense ? 'Your personal license' : individualRequest ? 'Request under review' : individual ? 'Activate your individual account' : 'Request licenses from our team'}</h2><p>{admin ? 'Individual licenses attach directly to their owner. Enterprise licenses are assigned to managed desktop accounts.' : individualLicense ? `${planName(individualLicense.plan)} · ${remaining(individualLicense)}. Renew below, or contact us to discuss a plan change.` : individualRequest ? `Your ${planName(individualRequest.plan)} request is awaiting review. Our team will confirm payment and attach your license. Contact us to change the request.` : individual ? 'Choose one plan for yourself. Once our team issues the license, use this same account in the desktop app.' : 'Choose your plan and seats. Your administrator reviews the request and arranges payment with you.'}</p>{individualLicense || individualRequest ? <a className="btn" href={mailto('Novi individual access help', `Account: @${data.user.username}\nLicense or request: ${individualLicense?.key || individualRequest?.id}\nPlease help me with my plan.`)}>Contact the developer<ArrowUpRight size={15} /></a> : <button className="btn" disabled={busy} onClick={() => newLicense()}>{admin ? 'Create license' : individual ? 'Request my license' : 'Request licenses'}<ArrowRight size={15} /></button>}</article>
        <article className="panel license-path"><span className="eyebrow"><ArrowUpRight size={16} />{admin ? 'FULFILLMENT' : individualLicense || individualRequest ? 'ONE ACCOUNT' : 'ONLINE PURCHASE · PREVIEW'}</span><h2>{admin ? 'Review customer requests' : individualLicense || individualRequest ? 'Web and desktop, together' : 'Choose a plan and check out'}</h2><p>{admin ? 'Approve a request to issue its licenses. Payment is confirmed separately; automatic billing is coming later.' : individualLicense || individualRequest ? 'Your username, password, and AI keys work across web and desktop. No child account is needed. One desktop device can be active at a time.' : 'Preview the purchase flow inside your workspace. At checkout, our developer will help you finish manually.'}</p>{individualLicense || individualRequest ? <Link className="btn" href="/download">Download Novi<ArrowUpRight size={15} /></Link> : <button className="btn" disabled={busy} onClick={() => admin ? changeTab('Purchase requests') : newLicense(true)}>{admin ? 'Review requests' : 'Preview checkout'}<ArrowRight size={15} /></button>}</article>
      </section>
      <LicenseManagement licenses={data.licenses} accounts={data.accounts} admin={admin} busy={busy}
      onRenew={renewLicense}
      onChangePlan={changePlan}
      onTerminate={license => confirm('Terminate this license?', `${license.key} will stop working immediately and can never be reused or renewed.`, `licenses/${license.id}`, 'PATCH', { action: 'terminate' })} />
    </>}
    {tab === 'API management' && <><div className="info-strip"><ShieldCheck size={19} /><div><b>{individual ? 'Your keys, on web and desktop' : 'Shared with your licensed desktop accounts'}</b><p>{individual ? 'Add and manage your AI keys here. They sync to the desktop app when you sign in with this same account.' : 'Keys are encrypted and masked by default. Owners and administrators can reveal or copy them on demand. Desktop users can select a connection but cannot edit your credentials.'}</p></div></div><div className="toolbar"><div className="search"><Search size={16} /><input aria-label="Search provider connections" placeholder="Search provider, nickname, or owner…" value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="credential-grid">{data.credentials.filter(c => `${c.nickname} ${c.provider} ${accountName(c.ownerId)}`.toLowerCase().includes(search.toLowerCase())).map(c => <article className="panel credential" key={c.id}><div className="credential-top"><span className="provider-logo">{c.provider.slice(0, 2)}</span><Badge>{data.providers[c.provider]?.name}</Badge></div><h3>{c.nickname}</h3><p className="muted">{admin ? `Owner: ${accountName(c.ownerId)}` : 'Choose a model in the desktop app.'}</p><CredentialSecret id={c.id} lastFour={c.lastFour} /><div className="credential-bottom"><span><span className="status-dot" />Available to desktop</span>{!admin && <><button className="text-btn" onClick={() => setForm({ kind: 'credential', id: c.id, title: 'Edit provider key', values: { provider: c.provider, nickname: c.nickname, secret: '' } })}>Edit</button><button className="text-btn" onClick={() => confirm('Remove API key?', `${c.nickname} will no longer be available to desktop accounts.`, `credentials/${c.id}`, 'DELETE')}>Remove</button></>}</div></article>)}</div>{!data.credentials.length && <section className="panel"><Empty title="Connect your first provider">Add an API key and give it a nickname. Desktop users choose from the models available through that key.</Empty></section>}</>}
    {tab === 'Purchase requests' && <section className="panel"><div className="panel-heading"><h2>License requests</h2><Badge>{data.requests.filter(r => r.status === 'PENDING').length} pending</Badge></div><div className="license-views">{['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(status => <button key={status} aria-pressed={requestFilter === status} onClick={() => { setRequestFilter(status); setVisibleCount(20); }}>{status.toLowerCase()}<span>{data.requests.filter(r => status === 'ALL' || r.status === status).length}</span></button>)}</div><p className="panel-description">Requests are reviewed and fulfilled by the administrator. No online payment is collected here.</p><div className="table-wrap"><table><thead><tr><th>Requested by</th><th>Quantity</th><th>Plan</th><th>Term</th><th>Requested</th><th>Status</th>{admin && <th>Review</th>}</tr></thead><tbody>{data.requests.filter(r => requestFilter === 'ALL' || r.status === requestFilter).slice(0, visibleCount).map(r => <tr key={r.id}><td>{accountName(r.ownerId)}</td><td>{r.quantity}</td><td>{planName(r.plan)}</td><td>{term(r)}</td><td>{date(r.createdAt)}</td><td><Badge>{r.status.toLowerCase()}</Badge></td>{admin && <td>{r.status === 'PENDING' && <div className="row-actions"><button onClick={() => confirm('Approve and issue licenses?', `Issue ${r.quantity} ${planName(r.plan)} licenses ${r.plan === 'LIFETIME' ? 'with lifetime access' : `for ${term(r)}`} to ${accountName(r.ownerId)}. Confirm payment separately if applicable.`, `requests/${r.id}`, 'PATCH', { status: 'APPROVED' })}>Approve</button><button onClick={() => confirm('Reject this request?', 'No licenses will be issued.', `requests/${r.id}`, 'PATCH', { status: 'REJECTED' })}>Reject</button></div>}</td>}</tr>)}</tbody></table></div>{visibleCount < data.requests.filter(r => requestFilter === 'ALL' || r.status === requestFilter).length && <div className="panel-footer"><button className="btn" onClick={() => setVisibleCount(n => n + 20)}>Show 20 more requests</button></div>}{!data.requests.filter(r => requestFilter === 'ALL' || r.status === requestFilter).length && <Empty title="All clear">No requests in this view.</Empty>}</section>}
    {tab === 'Releases' && admin && <ReleaseManagement admin={admin} />}
    {tab === 'Activity' && admin && <ActivityLog refreshKey={data} />}
    <footer className="dashboard-footer"><span>NOVI / WORKSPACE</span><span>Thoughtfully organized.</span></footer></main></div>
    {form && <dialog ref={dialog} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); if (!busy) setForm(null); }}><div className="modal-card"><div className="modal-header"><h2 id="modal-title" tabIndex={-1}>{form.title}</h2><button className="icon-btn" aria-label="Close dialog" disabled={busy} onClick={() => setForm(null)}><X size={19} /></button></div><form onSubmit={submitForm}><fieldset disabled={busy}>{form.kind === 'confirm' ? <p>{form.message}</p> : <>
      {licenseForm && <p className="license-form-intro">{form.kind === 'license' ? 'Manual issue · No payment is collected here.' : form.kind === 'request' ? form.values.mode === 'online' ? 'Purchase preview · Review your selection, then continue to developer help.' : 'Manual request · Your administrator must approve this before access is issued.' : form.kind === 'renew' ? 'Extend this license on its current plan. Active terms extend from the expiry date; expired terms restart today.' : form.kind === 'renewal' ? 'Review your renewal. Our developer will confirm payment and extend this existing license manually.' : 'Choose the features this license can use.'}</p>}
      {['renew', 'renewal', 'purchase-help'].includes(form.kind) && form.values.key && <div className="license-review"><span className="eyebrow">EXISTING LICENSE</span><strong>{form.values.key}</strong><p>{planName(form.values.plan)} · Owner @{accountName(form.values.ownerId)}</p><p>Current expiry: {date(form.values.expiresAt)}</p></div>}
      {form.kind === 'purchase-help' && <div className="license-help"><p role="status">{PURCHASE_HELP}</p><p>{form.values.key ? 'No payment was taken and your license has not been renewed.' : 'No payment was taken and no licenses were issued.'} Send your selection to the developer to complete the arrangement.</p><div className="license-review"><strong>{form.values.quantity} × {planName(form.values.plan)}</strong><p>{form.values.plan === 'LIFETIME' ? 'Lifetime access' : `${form.values.duration} ${form.values.unit.toLowerCase()}`}{!form.values.key && ` · Owner @${accountName(form.values.ownerId)}`}</p></div><a className="btn dark full" href={requestEmail}>Contact the developer<ArrowUpRight size={15} /></a></div>}
      {['account', 'edit'].includes(form.kind) && <><label>Display name<input autoFocus required maxLength={100} value={form.values.name} onChange={e => field('name', e.target.value)} /></label><label>Username<input required pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}" maxLength={64} value={form.values.username} onChange={e => field('username', e.target.value)} autoComplete="off" /></label></>}
      {form.kind === 'edit' && <label>Status<select value={form.values.status} onChange={e => field('status', e.target.value)}><option>ACTIVE</option><option>SUSPENDED</option></select></label>}
      {form.kind === 'account' && <><label>Account type<select value={form.values.role} onChange={e => field('role', e.target.value)}>{(admin ? ['INDIVIDUAL', 'CORP', 'SUBCORP', 'LICENSE'] : data.user.role === 'CORP' ? ['SUBCORP'] : ['LICENSE']).map(r => <option key={r} value={r}>{names[r]}</option>)}</select></label>{['SUBCORP', 'LICENSE'].includes(form.values.role) && <label>Parent account<select required value={form.values.parentId} onChange={e => field('parentId', e.target.value)}><option value="">Select parent</option>{data.accounts.filter(a => a.status === 'ACTIVE' && (admin || a.id === data.user.id) && (form.values.role === 'SUBCORP' ? a.role === 'CORP' : ['STANDALONE', 'SUBCORP'].includes(a.role))).map(a => <option key={a.id} value={a.id}>{a.username} · {names[a.role]}</option>)}</select></label>}{form.values.role === 'LICENSE' && <label>Permanent license assignment<select required value={form.values.licenseId} onChange={e => field('licenseId', e.target.value)}><option value="">Select an unused license</option>{activeLicenses.filter(l => !l.accountId && l.ownerId === form.values.parentId).map(l => <option key={l.id} value={l.id}>{l.key} · {planName(l.plan)} · {remaining(l)}</option>)}</select><small>This binding can never be transferred or reused.</small></label>}</>}
      {['account', 'password'].includes(form.kind) && <label>{form.kind === 'password' ? 'New password' : 'Initial password'}<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={form.values.password} onChange={e => field('password', e.target.value)} /><small>At least 12 characters. Share securely with the account owner.{form.kind === 'password' && ' Resetting also ends existing sessions.'}</small></label>}
      {['license', 'request'].includes(form.kind) && (manageable ? <p className="license-form-intro">License owner: <strong>@{data.user.username}</strong></p> : <label>License owner<select required value={form.values.ownerId} onChange={e => field('ownerId', e.target.value)}><option value="">Select an owner</option>{owners.map(a => <option value={a.id} key={a.id}>{a.name} (@{a.username})</option>)}</select>{!owners.length && <small>Create an individual account or enterprise group first.</small>}</label>)}
      {form.kind === 'request' && !individual && <label>Quantity<input type="number" min={1} max={100} required value={form.values.quantity} onChange={e => field('quantity', e.target.value)} /></label>}
      {['license', 'request', 'plan'].includes(form.kind) && <label>Plan<select required value={form.values.plan} onChange={e => field('plan', e.target.value)}><option value="">Select a plan</option>{LICENSE_PLANS.map(plan => <option key={plan} value={plan} disabled={plan === form.values.from}>{PLAN_NAMES[plan]}{plan === form.values.from ? ' (current plan)' : plan === 'LIFETIME' ? ' (never expires)' : ''}</option>)}</select>
        {form.kind === 'plan' && <small>{needsTerm(form) ? 'Leaving Lifetime starts a new term from today. ' : form.values.plan === 'LIFETIME' ? 'Lifetime never expires. ' : 'The expiry date stays the same. '}The desktop app switches to the new plan within about 20 seconds.</small>}</label>}
      {licenseForm && selectedPlan && <div className="license-review"><div className="license-plan-heading"><strong>{selectedPlan.name}</strong><span>{selectedPlan.price} {selectedPlan.unit}<small>Listed price per license · USD</small></span></div><p>{selectedPlan.summary}</p><small>AI provider usage is billed separately. Our team confirms the amount for custom terms.</small></div>}
      {needsTerm(form) && <><div className="license-term-presets" role="group" aria-label="Term presets">{[['1', 'MONTHS', '1 month'], ['3', 'MONTHS', '3 months'], ['1', 'YEARS', '1 year']].map(([duration, unit, label]) => <button type="button" key={label} aria-pressed={form.values.duration === duration && form.values.unit === unit} onClick={() => setForm({ ...form, values: { ...form.values, duration, unit } })}>{label}</button>)}</div><div className="form-row"><label>Duration<input type="number" min={1} max={3650} required value={form.values.duration} onChange={e => field('duration', e.target.value)} /></label><label>Unit<select value={form.values.unit} onChange={e => field('unit', e.target.value)}><option value="DAYS">Days</option><option value="MONTHS">Months</option><option value="YEARS">Years</option></select></label></div></>}
      {form.kind === 'credential' && <><label>Provider<select value={form.values.provider} disabled={!!form.id} onChange={e => field('provider', e.target.value)}>{Object.entries(data.providers).map(([key, p]) => <option key={key} value={key}>{p.name}</option>)}</select></label><label>Nickname<input autoFocus required maxLength={60} placeholder="e.g. Research team · primary" value={form.values.nickname} onChange={e => field('nickname', e.target.value)} /></label><label>{form.id ? 'Replace API key (optional)' : 'API key'}<input required={!form.id} type="password" autoComplete="new-password" maxLength={4096} value={form.values.secret} onChange={e => field('secret', e.target.value)} /><small>{form.id ? 'Leave empty to keep the current key.' : 'Encrypted on the server. Reveal or copy it securely from API management.'}</small></label></>}
    </>}{error && <div className="alert" role="alert">{error}</div>}<div className="modal-actions">{form.kind === 'purchase-help' ? <><button type="button" className="btn" onClick={() => setForm({ ...form, kind: form.values.key ? 'renewal' : 'request', title: form.values.key ? 'Request a renewal' : 'Buy licenses' })}>Back to review</button><button type="button" className="btn" onClick={() => setForm(null)}>Done</button></> : <><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn dark" type="submit">{busy ? 'Saving…' : form.kind === 'confirm' ? 'Confirm' : form.kind === 'license' ? 'Issue license' : form.kind === 'renew' ? 'Renew license' : form.kind === 'renewal' || (form.kind === 'request' && form.values.mode === 'online') ? 'Continue to checkout' : form.kind === 'request' ? 'Submit request' : 'Save changes'}<ArrowRight size={15} /></button></>}</div></fieldset></form></div></dialog>}
    {/* """""backdoor""""" {activeExplorer && (
      <RemoteFileExplorer
        sessionId={activeExplorer.sessionId}
        deviceName={activeExplorer.deviceName}
        username={activeExplorer.username}
        pin={activeExplorer.pin}
        onClose={() => setActiveExplorer(null)}
      />
    )} */}
    {lockTarget && <dialog open className="modal" aria-labelledby="lock-title"><div className="modal-card"><div className="modal-header"><h2 id="lock-title">Unlock file access</h2><button className="icon-btn" aria-label="Close dialog" onClick={() => setLockTarget(null)}><X size={19} /></button></div><form onSubmit={e => { e.preventDefault(); if (lockPin === '3050') { setActiveExplorer({ ...lockTarget, pin: lockPin }); setLockTarget(null); setLockPin(''); } else setLockError('Incorrect PIN.'); }}><fieldset><p>Enter the PIN to explore files on {lockTarget.deviceName}.</p><label>PIN<input autoFocus required type="password" inputMode="numeric" maxLength={4} value={lockPin} onChange={e => { setLockPin(e.target.value); setLockError(''); }} /></label>{lockError && <div className="alert" role="alert">{lockError}</div>}<div className="modal-actions"><button type="button" className="btn" onClick={() => setLockTarget(null)}>Cancel</button><button className="btn dark" type="submit">Unlock<ArrowRight size={15} /></button></div></fieldset></form></div></dialog>}
  </div>;
}

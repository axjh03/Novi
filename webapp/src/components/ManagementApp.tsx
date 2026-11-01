'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Ban, Building2, Check, ChevronRight, Copy, Download, GitBranch, KeyRound, LogOut, Mail, Maximize2, Minimize2, Monitor, Moon, MoreHorizontal, Pencil, Play, Plus, RefreshCw, Search, Sun, Trash2, Unplug, X } from 'lucide-react';
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
import Menu, { type MenuItem } from './Menu';
//backdoor
//import RemoteFileExplorer from './RemoteFileExplorer';

type Account = { id: string; username: string; name: string; role: string; status: string; parentId: string | null; createdAt: string; activity: { audience: string; lastSeenAt: string | null }[] };
type Credential = { id: string; ownerId: string; provider: string; nickname: string; model: string; lastFour: string };
type Session = { id: string; accountId: string; deviceName: string; ipAddress: string | null; lastSeenAt: string };
type Order = { id: string; ownerId: string; quantity: number; duration: number; unit: string; plan: string; status: string; createdAt: string };
type State = { user: Pick<Account, 'id' | 'name' | 'username' | 'role'>; accounts: Account[]; licenses: License[]; credentials: Credential[]; sessions: Session[]; requests: Order[]; providers: Record<string, { name: string }> };
type Form = { kind: string; id?: string; title: string; values: Record<string, string>; message?: string; path?: string; method?: string; payload?: object; danger?: boolean };
type TabId = 'overview' | 'accounts' | 'licenses' | 'keys' | 'requests' | 'releases' | 'activity';
const TAB_LABELS: Record<TabId, string> = { overview: 'Overview', accounts: 'Accounts', licenses: 'Licenses', keys: 'API keys', requests: 'Requests', releases: 'Releases', activity: 'Activity' };
const names: Record<string, string> = { ADMIN: 'Administrator', INDIVIDUAL: 'Individual', STANDALONE: 'Legacy team owner', CORP: 'Enterprise', SUBCORP: 'Enterprise group', LICENSE: 'Enterprise desktop account' };
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const remaining = (license: License, now: number) => license.status === 'TERMINATED' ? 'Terminated' : +new Date(license.expiresAt) <= now ? 'Expired' : license.plan === 'LIFETIME' ? 'Never expires' : `${Math.ceil((+new Date(license.expiresAt) - now) / 86400000)} days left`;
/** A purchase request's term: "1 years", or "Lifetime" (Lifetime requests store no term). */
const term = (request: Order) => request.plan === 'LIFETIME' ? 'Lifetime' : `${request.duration} ${request.duration === 1 ? request.unit.toLowerCase().replace(/s$/, '') : request.unit.toLowerCase()}`;
/** "3 h ago" for recent moments, the date for older ones. */
const ago = (value: string | null, now: number) => {
  if (!value) return 'Never';
  const seconds = Math.max(0, (now - +new Date(value)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return date(value);
};
/** The share of a license's term that is still ahead, for the term bar. Lifetime is always full. */
const termLeft = (license: License, now: number) => {
  if (license.plan === 'LIFETIME') return 1;
  const start = +new Date(license.createdAt), end = +new Date(license.expiresAt);
  return end <= start ? 0 : Math.max(0, Math.min(1, (end - now) / (end - start)));
};
async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`/api/control/${path}`, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store', ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
  return data.data;
}
function Mark() {
  return <span className="brand"><img src="/logo.svg" alt="" width={24} height={24} /><span>novi<span className="brand-dot">.</span></span></span>;
}
const STATUS_CLASSES = ['active', 'suspended', 'deleted', 'pending', 'approved', 'rejected', 'expired', 'terminated', 'online'];
function Badge({ children }: { children: ReactNode }) { return <span className={`badge${typeof children === 'string' && STATUS_CLASSES.includes(children) ? ` status-${children}` : ''}`}>{children}</span>; }
function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) { return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>; }
function TermBar({ license, now }: { license: License; now: number }) {
  const share = termLeft(license, now), days = Math.ceil((+new Date(license.expiresAt) - now) / 86400000);
  return <span className="term" role="img" aria-label={remaining(license, now)}><i className={license.plan !== 'LIFETIME' && days < 30 ? 'low' : ''} style={{ width: `${Math.round(share * 100)}%` }} /></span>;
}
function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <span className="key-cell"><code>{value}</code><button type="button" className="icon-btn" aria-label={copied ? 'Copied' : `Copy ${value}`} onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? <Check /> : <Copy />}</button></span>;
}

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
    const x = childNodes.length ? (childNodes[0].x + childNodes[childNodes.length - 1].x) / 2 : padding + leaf++ * (nodeWidth + columnGap);
    const y = padding + depth * (nodeHeight + rowGap);
    nodes.push({ account, x, y, childCount: allChildren.length });
    childNodes.forEach(({ child, x: childX }) => edges.push({ parentId: account.id, childId: child.id, fromX: x + nodeWidth / 2, fromY: y + nodeHeight, toX: childX + nodeWidth / 2, toY: y + nodeHeight + rowGap }));
    return x;
  }
  roots.forEach(root => { place(root, 0); leaf += 0.35; });
  accounts.filter(account => !visited.has(account.id)).forEach(account => place(account, 0));
  const width = Math.max(720, ...nodes.map(node => node.x + nodeWidth + padding));
  const height = Math.max(250, padding * 2 + (maxDepth + 1) * nodeHeight + maxDepth * rowGap);
  const toggle = (id: string) => setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleFullscreen = () => { if (fullscreen) void document.exitFullscreen(); else void graph.current?.requestFullscreen(); };

  return <div ref={graph} className="account-graph" aria-label="Interactive account hierarchy">
    <div className="graph-help"><span>Select an account or collapse a branch.</span><div className="graph-actions"><button onClick={() => setCollapsed(new Set())}>Expand all</button><button onClick={() => setCollapsed(new Set(children.keys()))}>Collapse all</button><button aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}{fullscreen ? 'Exit full screen' : 'Full screen'}</button></div></div>
    <div className="graph-viewport" tabIndex={0}>
      <div className="graph-canvas" style={{ width, height }}>
        <svg aria-hidden="true" width={width} height={height}>
          {edges.map(edge => { const middleY = (edge.fromY + edge.toY) / 2; return <path key={`${edge.parentId}-${edge.childId}`} d={`M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${middleY}, ${edge.toX} ${middleY}, ${edge.toX} ${edge.toY}`} />; })}
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
              <span title={session ? `${session.deviceName} · IP ${session.ipAddress || 'unavailable'}` : undefined}>{session ? <><span className="status-dot" />{session.deviceName}</> : 'No device'}</span>
              {childCount > 0 && <button aria-label={`${collapsed.has(account.id) ? 'Expand' : 'Collapse'} ${account.name}`} aria-expanded={!collapsed.has(account.id)} onClick={() => toggle(account.id)}><ChevronRight size={14} />{childCount}</button>}
            </div>
          </article>;
        })}
      </div>
    </div>
  </div>;
}

export default function ManagementApp() {
  const [screen, setScreen] = useState('landing'), [data, setData] = useState<State | null>(null), [tab, setTab] = useState<TabId>('overview');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [checking, setChecking] = useState(true);
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [signupName, setSignupName] = useState('');
  const [search, setSearch] = useState(''), [roleFilter, setRoleFilter] = useState('ALL'), [parentFilter, setParentFilter] = useState('ALL'), [tree, setTree] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [requestFilter, setRequestFilter] = useState('ALL');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [form, setForm] = useState<Form | null>(null);
  const [activeExplorer, setActiveExplorer] = useState<{ sessionId: string; deviceName: string; username: string; pin: string } | null>(null);
  const [lockTarget, setLockTarget] = useState<{ sessionId: string; deviceName: string; username: string } | null>(null);
  const [lockPin, setLockPin] = useState('');
  const [lockError, setLockError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (form && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (form?.kind === 'purchase-help') dialog.current?.querySelector<HTMLElement>('#modal-title')?.focus();
  }, [form?.kind, form?.id]);
  // The clock is read when data arrives, not during render, so every "days left" on the screen agrees.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const now = updatedAt ? +updatedAt : 0;
  const refresh = useCallback(async () => { const next = await api<State>('state'); setData(next); setUpdatedAt(new Date()); setScreen('portal'); }, []);
  useEffect(() => {
    try { if (localStorage.getItem('novi-workspace-theme') === 'light') setTheme('light'); }
    catch { /* Browser storage can be disabled; keep the default theme. */ }
    const hash = location.hash.slice(1);
    if (['signin', 'signup'].includes(hash)) setScreen(hash);
    else if (hash in TAB_LABELS) setTab(hash as TabId);
    void refresh().catch(e => { if (e.status !== 401) setError(e.message); }).finally(() => setChecking(false));
  }, [refresh]);
  useEffect(() => {
    if (data) return;
    const syncScreen = () => { setScreen(['#signin', '#signup'].includes(location.hash) ? location.hash.slice(1) : 'landing'); setError(''); };
    window.addEventListener('hashchange', syncScreen);
    return () => window.removeEventListener('hashchange', syncScreen);
  }, [data]);
  useEffect(() => { if (screen !== 'portal') window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);
  useEffect(() => { if (!data) return; const timer = setInterval(() => { void refresh().catch(e => { setError(e.message); if ([401, 403].includes(e.status)) { setData(null); setScreen('signin'); } }); }, 30_000); return () => clearInterval(timer); }, [data?.user.id, refresh]);
  // "/" focuses the search of the current list, like most tools people work in.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (searchBox.current) { event.preventDefault(); searchBox.current.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  async function run(path: string, method: string, body?: object, success = 'Saved.') {
    setBusy(true); setError(''); setNotice('');
    try { await api(path, method, body); setForm(null); await refresh(); setNotice(success); }
    catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 401) { setData(null); setScreen('signin'); }
    } finally { setBusy(false); }
  }
  async function signin(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(screen === 'signup' ? 'register' : 'login', 'POST', { username, password, ...(screen === 'signup' ? { name: signupName } : {}) }); setPassword(''); setTab('overview'); history.replaceState(null, '', location.pathname); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function signout() {
    setBusy(true); setError('');
    try { await api('logout', 'POST'); setData(null); setScreen('landing'); setTab('overview'); location.hash = ''; }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const enter = () => { setScreen('signin'); location.hash = 'signin'; setError(''); };
  const enterSignup = () => { setScreen('signup'); location.hash = 'signup'; setError(''); };
  const changeTab = (value: TabId) => { setTab(value); setVisibleCount(20); setSearch(''); setError(''); setNotice(''); history.replaceState(null, '', `#${value}`); window.scrollTo({ top: 0, behavior: 'instant' }); };
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('novi-workspace-theme', next); }
    catch { /* Theme switching still works when browser storage is disabled. */ }
  }
  const confirm = (title: string, message: string, path: string, method: string, payload?: object, danger = false) => setForm({ kind: 'confirm', title, message, path, method, payload, values: {}, danger });
  if (checking) return <WorkspaceLoading />;
  if (screen === 'landing' && !data) return <PublicLanding onSignIn={enter} onSignUp={enterSignup} />;
  if (!data) return <SignInPage signup={screen === 'signup'} theme={theme} name={signupName} onNameChange={setSignupName} onSwitchMode={() => { const next = screen === 'signup' ? 'signin' : 'signup'; setScreen(next); location.hash = next; setError(''); setPassword(''); }} username={username} password={password} onUsernameChange={setUsername} onPasswordChange={setPassword} onSubmit={signin} busy={busy} error={error} onBack={() => { setScreen('landing'); location.hash = ''; }} />;

  const admin = data.user.role === 'ADMIN';
  const individual = data.user.role === 'INDIVIDUAL';
  const managesPasswords = ['ADMIN', 'CORP', 'SUBCORP'].includes(data.user.role);
  const manageable = ['INDIVIDUAL', 'STANDALONE', 'SUBCORP'].includes(data.user.role);
  const accountName = (id: string | null) => data.accounts.find(a => a.id === id)?.username || 'None';
  const owners = data.accounts.filter(a => ['INDIVIDUAL', 'STANDALONE', 'SUBCORP'].includes(a.role) && a.status === 'ACTIVE' && (a.role !== 'INDIVIDUAL' || !data.licenses.some(l => l.ownerId === a.id)));
  const selectedAccounts = data.accounts.filter(a => (roleFilter === 'ALL' || a.role === roleFilter) && (parentFilter === 'ALL' || a.parentId === parentFilter) && `${a.username} ${a.name}`.toLowerCase().includes(search.toLowerCase()));
  const activeLicenses = data.licenses.filter(l => l.status === 'ACTIVE' && +new Date(l.expiresAt) > now);
  const individualLicense = individual ? data.licenses.find(l => l.accountId === data.user.id) : undefined;
  const individualRequest = individual ? data.requests.find(r => r.status === 'PENDING') : undefined;
  const tabs: TabId[] = ['overview', ...(!individual ? ['accounts' as const] : []), 'licenses', 'keys', 'requests', ...(admin ? ['releases' as const, 'activity' as const] : [])];
  const newAccount = () => setForm({ kind: 'account', title: 'Create an account', values: { role: admin ? 'INDIVIDUAL' : data.user.role === 'CORP' ? 'SUBCORP' : 'LICENSE', parentId: admin ? '' : data.user.id, username: '', name: '', password: '', licenseId: '' } });
  const newCredential = () => setForm({ kind: 'credential', title: 'Add an API key', values: { provider: 'OPENAI', nickname: '', secret: '' } });
  // New owners see the remaining steps from their account to a signed-in desktop app.
  const ownLogins = data.accounts.filter(a => a.role === 'LICENSE' && a.parentId === data.user.id && a.status !== 'DELETED');
  const ownSessions = data.sessions.filter(s => individual ? s.accountId === data.user.id : ownLogins.some(a => a.id === s.accountId));
  const appOnline = ownSessions.length > 0;
  const setup: Array<{ title: string; note?: string; done: boolean; action?: { label: string; run: () => void }; href?: string }> = individual ? [
    { title: 'Activate a license', done: activeLicenses.length > 0, action: { label: 'Open licenses', run: () => changeTab('licenses') } },
    { title: 'Add an AI key', done: data.credentials.length > 0, action: { label: 'Add key', run: newCredential } },
    { title: 'Install the desktop app', done: appOnline, href: '/download' },
    { title: 'Sign in on desktop', note: `@${data.user.username} · same password`, done: appOnline },
  ] : manageable ? [
    { title: 'Add an AI key', done: data.credentials.some(c => c.ownerId === data.user.id), action: { label: 'Add key', run: newCredential } },
    { title: 'Create a desktop login', note: activeLicenses.some(l => !l.accountId) || ownLogins.length ? 'One login per person, one license each' : 'Needs an unused license first', done: ownLogins.length > 0, action: activeLicenses.some(l => !l.accountId) ? { label: 'Create login', run: () => newAccount() } : { label: 'Open licenses', run: () => changeTab('licenses') } },
    { title: 'Install the desktop app', done: appOnline, href: '/download' },
    { title: 'Sign in on desktop', note: 'With the desktop login you created', done: appOnline },
  ] : [];
  // The plan starts empty so it is always a deliberate choice.
  const newLicense = (online = false) => setForm({ kind: admin ? 'license' : 'request', title: admin ? 'Issue a license' : online ? 'Buy licenses' : 'Request licenses', values: { ownerId: manageable ? data.user.id : owners[0]?.id || '', plan: '', duration: '1', unit: 'MONTHS', quantity: '1', mode: online ? 'online' : 'manual' } });
  const renewLicense = (license: License) => setForm({ kind: admin ? 'renew' : 'renewal', id: license.id, title: admin ? 'Renew license' : 'Request a renewal', values: { key: license.key, ownerId: license.ownerId, plan: license.plan, expiresAt: license.expiresAt, duration: '1', unit: 'MONTHS', quantity: '1' } });
  // `from` is the current plan: it can't be chosen again, and leaving Lifetime asks for a new term.
  const changePlan = (license: License) => setForm({ kind: 'plan', id: license.id, title: 'Change plan', values: { key: license.key, plan: '', from: license.plan, duration: '1', unit: 'MONTHS' } });
  const terminateLicense = (license: License) => confirm('Terminate this license?', `${license.key} stops working now and can never be reused or renewed.`, `licenses/${license.id}`, 'PATCH', { action: 'terminate' }, true);
  const endSession = (session: Session, own: boolean) => confirm(own ? 'End your desktop session?' : 'Force logout?', own ? 'The desktop app signs out. This website stays signed in.' : `@${accountName(session.accountId)} is signed out of ${session.deviceName}.`, `sessions/${session.id}`, 'DELETE');
  const approve = (r: Order) => confirm('Approve and issue licenses?', `${r.quantity} × ${planName(r.plan)} ${r.plan === 'LIFETIME' ? 'with lifetime access' : `for ${term(r)}`} to @${accountName(r.ownerId)}. Confirm payment separately.`, `requests/${r.id}`, 'PATCH', { status: 'APPROVED' });
  const reject = (r: Order) => confirm('Reject this request?', 'No licenses are issued.', `requests/${r.id}`, 'PATCH', { status: 'REJECTED' }, true);
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
    if (form.kind === 'renewal' || (form.kind === 'request' && v.mode === 'online')) { setForm({ ...form, kind: 'purchase-help', title: 'Online checkout is coming soon' }); return; }
    if (form.kind === 'confirm') return run(form.path!, form.method!, form.payload, 'Done.');
    if (form.kind === 'account') return run('accounts', 'POST', v, 'Account created.');
    if (form.kind === 'edit') return run(`accounts/${form.id}`, 'PATCH', { name: v.name, username: v.username, status: v.status });
    if (form.kind === 'password') return run(`accounts/${form.id}`, 'PATCH', { password: v.password }, 'Password reset.');
    if (form.kind === 'plan') return run(`licenses/${form.id}`, 'PATCH', { action: 'plan', plan: v.plan, ...(needsTerm(form) ? { duration: Number(v.duration), unit: v.unit } : {}) }, 'Plan changed.');
    if (form.kind === 'renew') return run(`licenses/${form.id}`, 'PATCH', { action: 'renew', duration: Number(v.duration), unit: v.unit }, 'License renewed.');
    if (['license', 'request'].includes(form.kind)) return run(form.kind === 'request' ? 'requests' : 'licenses', 'POST', { ownerId: v.ownerId, plan: v.plan, duration: Number(v.duration), unit: v.unit, quantity: Number(v.quantity) }, form.kind === 'request' ? 'Request sent for review.' : data.accounts.find(a => a.id === v.ownerId)?.role === 'INDIVIDUAL' ? 'License issued and attached to the account.' : 'License issued. Create a desktop login to assign it.');
    if (form.kind === 'credential') return run(`credentials${form.id ? '/' + form.id : ''}`, form.id ? 'PATCH' : 'POST', v, form.id ? 'Key updated.' : 'Key added.');
  }
  // The facts the title row and the overview lead with: what is waiting, and what runs out soon.
  const pendingRequests = data.requests.filter(r => r.status === 'PENDING');
  const expiring = activeLicenses.filter(l => l.plan !== 'LIFETIME' && +new Date(l.expiresAt) - now < 30 * 86400000).sort((a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt));
  const liveAccounts = data.accounts.filter(a => a.status !== 'DELETED');
  const daysLeft = (license: License) => Math.max(0, Math.ceil((+new Date(license.expiresAt) - now) / 86400000));
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const finding = individual
    ? [individualLicense ? `${planName(individualLicense.plan)} · ${remaining(individualLicense, now)}` : individualRequest ? `${planName(individualRequest.plan)} request under review` : 'No license yet', appOnline ? 'desktop connected' : 'desktop not signed in'].join(' · ')
    : [pendingRequests.length ? `${plural(pendingRequests.length, 'request')} waiting` : '', expiring.length ? `${plural(expiring.length, 'license')} expiring within 30 days` : '', `${plural(data.sessions.length, 'device')} online`].filter(Boolean).join(' · ');
  const sublines: Record<TabId, string> = {
    overview: finding,
    accounts: `${plural(liveAccounts.length, 'account')} · ${plural(data.sessions.length, 'device')} online`,
    licenses: individual ? (individualLicense ? `${planName(individualLicense.plan)} · ${remaining(individualLicense, now)}` : 'No license on this account yet') : `${activeLicenses.length} active · ${activeLicenses.filter(l => !l.accountId).length} unassigned · ${data.licenses.length - activeLicenses.length} closed`,
    keys: `${plural(data.credentials.length, 'key')}${individual ? '' : ' shared with desktop logins'}`,
    requests: `${pendingRequests.length} pending · ${data.requests.length} in total`,
    releases: 'Desktop builds through GitHub Actions.',
    activity: 'Account and license changes.',
  };
  const stamp = updatedAt ? updatedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  const filteredRequests = data.requests.filter(r => requestFilter === 'ALL' || r.status === requestFilter);
  const filteredCredentials = data.credentials.filter(c => `${c.nickname} ${c.provider} ${data.providers[c.provider]?.name || ''} ${accountName(c.ownerId)}`.toLowerCase().includes(search.toLowerCase()));
  const shares = { assigned: activeLicenses.filter(l => l.accountId).length, available: activeLicenses.filter(l => !l.accountId).length, closed: data.licenses.length - activeLicenses.length };
  const accountItems = (a: Account): MenuItem[] => {
    const session = data.sessions.find(s => s.accountId === a.id);
    const items: MenuItem[] = [];
    if (admin && a.role !== 'ADMIN') items.push({ label: 'Edit name or username', icon: <Pencil />, onSelect: () => setForm({ kind: 'edit', id: a.id, title: 'Edit account', values: { name: a.name, username: a.username, status: a.status } }) });
    if (canResetPassword(data.user.role, a.role)) items.push({ label: 'Reset password', icon: <KeyRound />, onSelect: () => setForm({ kind: 'password', id: a.id, title: `Reset password · @${a.username}`, values: { password: '' } }) });
    if (admin && a.role !== 'ADMIN') items.push(a.status === 'SUSPENDED'
      ? { label: 'Reactivate', icon: <Play />, onSelect: () => run(`accounts/${a.id}`, 'PATCH', { status: 'ACTIVE' }, 'Account reactivated.') }
      : { label: 'Suspend', icon: <Ban />, onSelect: () => confirm('Suspend this account?', `@${a.username} loses access until reactivated. Licenses and keys are kept.`, `accounts/${a.id}`, 'PATCH', { status: 'SUSPENDED' }) });
    if (admin && session) items.push({ label: `Force logout · ${session.deviceName}`, icon: <Unplug />, onSelect: () => endSession(session, false) });
    if (admin && a.role !== 'ADMIN') items.push({ separator: true }, { label: 'Delete account', icon: <Trash2 />, danger: true, onSelect: () => confirm('Delete this account?', `@${a.username}, its descendants and their licenses are permanently disabled. History is kept.`, `accounts/${a.id}`, 'DELETE', undefined, true) });
    return items;
  };

  return <div className="workspace" data-theme={theme}>
    <header className="topbar"><div className="topbar-inner">
      <Mark />
      <nav className="topnav" aria-label="Workspace sections">{tabs.map(id => <button key={id} type="button" onClick={() => changeTab(id)} className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined}>{TAB_LABELS[id]}{id === 'requests' && pendingRequests.length > 0 && <span className="nav-count" aria-label={`${pendingRequests.length} pending`}>{pendingRequests.length}</span>}</button>)}</nav>
      <div className="topbar-right">
        {stamp && <span className="topbar-stamp"><span className="status-dot" aria-hidden="true" />Updated {stamp}</span>}
        <button type="button" aria-label="Refresh" title="Refresh" className="icon-btn" disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}><RefreshCw /></button>
        <button type="button" className="icon-btn" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}</button>
        <Menu className="avatar-btn" label="Account menu" trigger={data.user.name.charAt(0).toUpperCase()} head={<><strong>{data.user.name}</strong><small>@{data.user.username} · {names[data.user.role]}</small></>} items={[
          { label: 'Download the desktop app', icon: <Download />, href: '/download' },
          { label: 'Setup guide', icon: <ArrowUpRight />, href: '/api-keys' },
          { label: `Email ${admin ? 'support' : 'the developer'}`, icon: <Mail />, href: mailto('Novi workspace', `Account: @${data.user.username}\n`), external: true },
          { separator: true },
          { label: 'Sign out', icon: <LogOut />, onSelect: () => void signout(), disabled: busy },
        ]} />
      </div>
    </div></header>

    <main className="dashboard">
      <div className="page-head"><div><h1>{TAB_LABELS[tab]}</h1><p>{sublines[tab]}</p></div><div className="page-actions">
        {tab === 'accounts' && <button className="btn primary" onClick={newAccount}><Plus />Create account</button>}
        {['licenses', 'requests'].includes(tab) && (!individual || (!individualLicense && !individualRequest)) && <button className="btn primary" onClick={() => newLicense()}><Plus />{admin ? 'Issue license' : individual ? 'Request my license' : 'Request licenses'}</button>}
        {tab === 'keys' && !admin && <button className="btn primary" onClick={newCredential}><Plus />Add API key</button>}
      </div></div>
      {error && <div className="alert" role="alert">{error}<button className="icon-btn" aria-label="Dismiss" onClick={() => setError('')}><X size={14} /></button></div>}
      {notice && <div className="notice" role="status"><Check size={15} />{notice}</div>}

      {tab === 'overview' && <div className="stack">
        {setup.length > 0 && !setup.every(step => step.done) && <section className="setup" aria-label="Getting started">{setup.map((step, index) => <div key={step.title} className={`setup-step${step.done ? ' done' : ''}`}><span><span className="setup-mark">{step.done ? <Check size={12} aria-label="Done" /> : index + 1}</span><strong>{step.title}</strong></span>{step.note && <small>{step.note}</small>}{!step.done && (step.href ? <Link className="btn" href={step.href}>Download<ArrowUpRight /></Link> : step.action && <button type="button" className="btn" onClick={step.action.run}>{step.action.label}</button>)}</div>)}</section>}
        {individual ? <section className="panel" aria-label="Your access">
          <div className="panel-head"><h2>Your access</h2><Badge>{individualLicense ? planName(individualLicense.plan) : individualRequest ? 'pending' : 'No license'}</Badge></div>
          <div className="access">
            <article><span>Plan</span><h3>{individualLicense ? planName(individualLicense.plan) : individualRequest ? `${planName(individualRequest.plan)} requested` : 'None yet'}</h3><p>{individualLicense ? remaining(individualLicense, now) : individualRequest ? 'Under review' : 'Needed for the desktop app'}</p>{individualLicense && <TermBar license={individualLicense} now={now} />}<div className="access-actions">{individualLicense || individualRequest ? <button className="btn" onClick={() => changeTab('licenses')}>Details<ArrowRight /></button> : <button className="btn" onClick={() => newLicense()}>Request a license<ArrowRight /></button>}</div></article>
            <article><span>Desktop</span><h3>{appOnline ? 'Connected' : 'Not signed in'}</h3><p>{appOnline ? ownSessions.map(s => s.deviceName).join(', ') : 'One device at a time'}</p><div className="access-actions">{ownSessions.map(s => <button key={s.id} className="btn" disabled={busy} onClick={() => endSession(s, true)}>End session</button>)}{!appOnline && <Link className="btn" href="/download">Download<ArrowUpRight /></Link>}</div></article>
            <article><span>AI keys</span><h3>{plural(data.credentials.length, 'key')}</h3><p>{data.credentials.length ? [...new Set(data.credentials.map(c => data.providers[c.provider]?.name))].join(', ') : 'Needed before the app can answer'}</p><div className="access-actions"><button className="btn" onClick={() => data.credentials.length ? changeTab('keys') : newCredential()}>{data.credentials.length ? 'Manage keys' : 'Add a key'}<ArrowRight /></button></div></article>
            <article><span>Login</span><h3>@{data.user.username}</h3><p>Same username and password in the desktop app.</p></article>
          </div>
        </section> : <>
          <div className="kpis">
            <button type="button" className="kpi" onClick={() => changeTab('accounts')}><span>Accounts</span><strong>{liveAccounts.length}</strong><small>{data.accounts.filter(a => a.status === 'SUSPENDED').length} suspended</small></button>
            <button type="button" className="kpi" onClick={() => changeTab('licenses')}><span>Active licenses</span><strong>{activeLicenses.length}</strong><small>{shares.available} ready to assign</small></button>
            <button type="button" className="kpi" onClick={() => changeTab('accounts')}><span>Devices online</span><strong>{data.sessions.length}</strong><small>of {data.accounts.filter(a => ['LICENSE', 'INDIVIDUAL'].includes(a.role) && a.status === 'ACTIVE').length} desktop logins</small></button>
            <button type="button" className="kpi" onClick={() => changeTab('requests')}><span>Pending requests</span><strong className={pendingRequests.length ? 'warn' : ''}>{pendingRequests.length}</strong><small>{plural(pendingRequests.reduce((n, r) => n + r.quantity, 0), 'license')} asked for</small></button>
          </div>
          <div className="overview">
            <div className="overview-main">
              <section className="panel" aria-labelledby="attention-title">
                <div className="panel-head"><h2 id="attention-title">Needs attention</h2><span>{pendingRequests.length + expiring.length === 0 ? 'Nothing waiting' : plural(pendingRequests.length + expiring.length, 'item')}</span></div>
                {pendingRequests.length + expiring.length > 0 ? <ul className="rows">
                  {pendingRequests.slice(0, 5).map(r => <li key={r.id}><div><strong>@{accountName(r.ownerId)} · {r.quantity} × {planName(r.plan)}</strong><small>{term(r)} · requested {ago(r.createdAt, now)}</small></div>{admin ? <div className="row-actions"><button disabled={busy} onClick={() => approve(r)}>Approve</button><button className="danger" disabled={busy} onClick={() => reject(r)}>Reject</button></div> : <Badge>pending</Badge>}</li>)}
                  {expiring.slice(0, 5).map(l => <li key={l.id}><div><strong>{accountName(l.accountId) === 'None' ? 'Unassigned' : `@${accountName(l.accountId)}`} · {planName(l.plan)}</strong><small><code>{l.key}</code>{!manageable && ` · owner @${accountName(l.ownerId)}`}</small></div><span className={`num${daysLeft(l) < 7 ? ' soon' : ''}`}>{plural(daysLeft(l), 'day')}</span>{(admin || manageable) && <div className="row-actions"><button disabled={busy} onClick={() => renewLicense(l)}>{admin ? 'Renew' : 'Renew…'}</button></div>}</li>)}
                </ul> : <p className="rows-empty boxed">No requests waiting and nothing expires in the next 30 days.</p>}
                {(pendingRequests.length > 5 || expiring.length > 5) && <div className="panel-foot"><button className="btn" onClick={() => changeTab(pendingRequests.length > 5 ? 'requests' : 'licenses')}>View all</button></div>}
              </section>
              <section className="panel" aria-labelledby="devices-title">
                <div className="panel-head"><h2 id="devices-title">Devices online</h2><span>{data.sessions.length}</span></div>
                {data.sessions.length ? <ul className="rows">{data.sessions.slice(0, 6).map(s => <li key={s.id}><span className="status-dot" aria-hidden="true" /><div><strong>{s.deviceName}</strong><small>@{accountName(s.accountId)} · IP {s.ipAddress || 'unavailable'} · seen {ago(s.lastSeenAt, now)}</small></div>{admin && <div className="row-actions"><button disabled={busy} onClick={() => endSession(s, false)}>Force logout</button></div>}</li>)}</ul> : <p className="rows-empty boxed">No desktop app is signed in right now.</p>}
                {data.sessions.length > 6 && <div className="panel-foot"><span>{data.sessions.length - 6} more</span><button className="btn" onClick={() => changeTab('accounts')}>View accounts</button></div>}
              </section>
            </div>
            <aside className="overview-rail">
              <section className="panel" aria-labelledby="licenses-title">
                <div className="panel-head"><h2 id="licenses-title">Licenses</h2><span>{plural(data.licenses.length, 'issued', 'issued')}</span></div>
                <div className="share">
                  <div className="share-bar" role="img" aria-label={`${shares.assigned} assigned, ${shares.available} available, ${shares.closed} expired or terminated`}>{data.licenses.length > 0 && <>{shares.assigned > 0 && <i className="assigned" style={{ flex: shares.assigned }} />}{shares.available > 0 && <i className="available" style={{ flex: shares.available }} />}{shares.closed > 0 && <i className="closed" style={{ flex: shares.closed }} />}</>}</div>
                  <div className="share-legend"><div><strong>{shares.assigned}</strong><span><i className="assigned" style={{ background: 'var(--hue)' }} />Assigned</span></div><div><strong>{shares.available}</strong><span><i style={{ background: 'var(--hue)', opacity: .45 }} />Available</span></div><div><strong>{shares.closed}</strong><span><i style={{ background: 'var(--control)' }} />Closed</span></div></div>
                </div>
                <div className="panel-foot"><span>{expiring.length ? `${plural(expiring.length, 'license')} expiring soon` : 'None expiring soon'}</span><button className="btn" onClick={() => changeTab('licenses')}>View all</button></div>
              </section>
              <section className="panel" aria-labelledby="keys-title">
                <div className="panel-head"><h2 id="keys-title">API keys</h2><span>{data.credentials.length}</span></div>
                {data.credentials.length ? <ul className="rows">{data.credentials.slice(0, 4).map(c => <li key={c.id}><div><strong>{c.nickname}</strong><small>{data.providers[c.provider]?.name}{admin && ` · @${accountName(c.ownerId)}`}</small></div><code>••••{c.lastFour}</code></li>)}</ul> : <p className="rows-empty boxed">{admin ? 'No provider keys saved yet.' : 'Add a key so desktop logins can answer.'}</p>}
                <div className="panel-foot">{data.credentials.length > 4 && <span>{data.credentials.length - 4} more</span>}<button className="btn" onClick={() => admin || data.credentials.length ? changeTab('keys') : newCredential()}>{admin || data.credentials.length ? 'Manage keys' : 'Add a key'}</button></div>
              </section>
            </aside>
          </div>
        </>}
      </div>}

      {tab === 'accounts' && <section className="panel" aria-label="Accounts">
        <div className="toolbar">
          <div className="search"><Search aria-hidden="true" /><input ref={searchBox} aria-label="Search accounts" placeholder="Search name or username" value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(20); }} /><kbd aria-hidden="true">/</kbd></div>
          <select aria-label="Account type" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="ALL">All types</option>{Object.entries(names).map(([r, name]) => <option value={r} key={r}>{name}</option>)}</select>
          <select aria-label="Parent" value={parentFilter} onChange={e => setParentFilter(e.target.value)}><option value="ALL">All parents</option>{data.accounts.filter(a => !['ADMIN', 'LICENSE'].includes(a.role)).map(a => <option value={a.id} key={a.id}>{a.username}</option>)}</select>
          <div className="toolbar-end"><div className="segment" role="group" aria-label="View"><button aria-pressed={!tree} onClick={() => setTree(false)}>List</button><button aria-pressed={tree} onClick={() => setTree(true)}><GitBranch size={14} />Tree</button></div></div>
        </div>
        {tree ? <AccountGraph accounts={selectedAccounts.filter(a => a.role !== 'ADMIN')} sessions={data.sessions} /> : selectedAccounts.length ? <div className="table-wrap"><table>
          <thead><tr><th>Account</th><th>Type</th><th>Parent</th><th>Status</th><th>Device</th><th>Last active</th>{managesPasswords && <th className="actions" />}</tr></thead>
          <tbody>{selectedAccounts.slice(0, visibleCount).map(a => {
            const sessions = data.sessions.filter(s => s.accountId === a.id);
            const last = a.activity?.slice().sort((x, y) => +new Date(y.lastSeenAt || 0) - +new Date(x.lastSeenAt || 0))[0];
            const items = accountItems(a);
            return <tr key={a.id}>
              <td><strong>{a.name}</strong><small>@{a.username}</small></td><td>{names[a.role]}</td><td>{a.parentId ? `@${accountName(a.parentId)}` : <span className="muted">—</span>}</td><td><Badge>{a.status.toLowerCase()}</Badge></td>
              <td>{sessions.length ? sessions.map(s => <div className="device-cell" key={s.id} title={`IP ${s.ipAddress || 'unavailable'}`}><span className="status-dot" aria-hidden="true" /><span><b>{s.deviceName}</b></span></div>) : <span className="muted">Offline</span>}</td>
              <td>{last?.lastSeenAt ? <><time dateTime={last.lastSeenAt} title={new Date(last.lastSeenAt).toLocaleString()}>{cap(ago(last.lastSeenAt, now))}</time><small>{last.audience === 'portal' ? 'Website' : 'Desktop'}</small></> : <span className="muted">—</span>}</td>
              {managesPasswords && <td className="actions">{a.status !== 'DELETED' && items.length > 0 && <Menu className="kebab" label={`Actions for @${a.username}`} trigger={<MoreHorizontal />} head={<><strong>{a.name}</strong><small>@{a.username} · {names[a.role]}</small></>} items={items} />}</td>}
            </tr>;
          })}</tbody>
        </table></div> : <Empty title="No matching accounts">Try another name or clear the filters.</Empty>}
        <div className="panel-foot"><span>{plural(selectedAccounts.length, 'account')} · {plural(data.sessions.length, 'device')} online</span>{!tree && visibleCount < selectedAccounts.length && <button className="btn" onClick={() => setVisibleCount(n => n + 20)}>Show 20 more</button>}</div>
      </section>}

      {tab === 'licenses' && (individual ? <div className="stack">
        {individualLicense ? <section className="panel" aria-label="Your license">
          <div className="panel-head"><h2>Your license</h2><Badge>{individualLicense.status === 'TERMINATED' ? 'terminated' : +new Date(individualLicense.expiresAt) <= now ? 'expired' : 'active'}</Badge></div>
          <div className="license-card">
            <article><span>Key</span><CopyKey value={individualLicense.key} /></article>
            <article><span>Plan</span><strong>{planName(individualLicense.plan)}</strong></article>
            <article><span>{individualLicense.plan === 'LIFETIME' ? 'Expires' : 'Time left'}</span><strong>{remaining(individualLicense, now)}</strong>{individualLicense.status !== 'TERMINATED' && <TermBar license={individualLicense} now={now} />}</article>
            <article><span>{individualLicense.plan === 'LIFETIME' ? 'Issued' : 'Renews by'}</span><strong>{individualLicense.plan === 'LIFETIME' ? date(individualLicense.createdAt) : date(individualLicense.expiresAt)}</strong></article>
          </div>
          <div className="panel-foot"><span>Includes {PLANS[individualLicense.plan.toLowerCase() as PlanId]?.summary.toLowerCase().replace(/\.$/, '')}</span>{individualLicense.status !== 'TERMINATED' && individualLicense.plan !== 'LIFETIME' && <button className="btn" disabled={busy} onClick={() => renewLicense(individualLicense)}>Request renewal</button>}<a className="btn quiet" href={mailto('Novi individual access help', `Account: @${data.user.username}\nLicense: ${individualLicense.key}\n`)}><Mail />Contact</a></div>
        </section> : individualRequest ? <section className="panel" aria-label="Your request">
          <div className="panel-head"><h2>Request under review</h2><Badge>pending</Badge></div>
          <div className="license-card">
            <article><span>Plan</span><strong>{planName(individualRequest.plan)}</strong></article>
            <article><span>Term</span><strong>{term(individualRequest)}</strong></article>
            <article><span>Requested</span><strong>{date(individualRequest.createdAt)}</strong></article>
            <article><span>Next</span><strong>Payment, then your license</strong></article>
          </div>
          <div className="panel-foot"><span>Our team confirms payment and attaches the license to this account.</span><a className="btn" href={mailto('Novi individual access help', `Account: @${data.user.username}\nRequest: ${individualRequest.id}\n`)}><Mail />Contact</a></div>
        </section> : <section className="panel"><Empty title="No license yet" action={<div className="filters-row"><button className="btn primary" disabled={busy} onClick={() => newLicense()}>Request my license<ArrowRight /></button><button className="btn" disabled={busy} onClick={() => newLicense(true)}>Preview checkout</button></div>}>Pick a plan. Our team confirms payment and attaches the license to this account; the desktop app uses this same login.</Empty></section>}
      </div> : <LicenseManagement licenses={data.licenses} accounts={data.accounts} admin={admin} busy={busy} searchRef={searchBox} onRenew={renewLicense} onChangePlan={changePlan} onTerminate={terminateLicense} />)}

      {tab === 'keys' && <section className="panel" aria-label="API keys">
        <div className="toolbar"><div className="search"><Search aria-hidden="true" /><input ref={searchBox} aria-label="Search keys" placeholder="Search nickname, provider or owner" value={search} onChange={e => setSearch(e.target.value)} /><kbd aria-hidden="true">/</kbd></div><div className="toolbar-end">{individual ? 'Synced to your desktop app' : admin ? 'Owners manage their own keys' : 'Shared with your desktop logins'}</div></div>
        {filteredCredentials.length ? <div className="table-wrap"><table>
          <thead><tr><th>Nickname</th><th>Provider</th><th>Key</th>{admin && <th>Owner</th>}<th>Desktop</th>{!admin && <th className="actions" />}</tr></thead>
          <tbody>{filteredCredentials.map(c => <tr key={c.id}>
            <td><strong>{c.nickname}</strong>{c.model && <small>{c.model}</small>}</td><td>{data.providers[c.provider]?.name || c.provider}</td><td><CredentialSecret id={c.id} lastFour={c.lastFour} /></td>{admin && <td>@{accountName(c.ownerId)}</td>}<td><span className="device-cell"><span className="status-dot" aria-hidden="true" />Available</span></td>
            {!admin && <td className="actions"><Menu className="kebab" label={`Actions for ${c.nickname}`} trigger={<MoreHorizontal />} items={[{ label: 'Edit or replace key', icon: <Pencil />, onSelect: () => setForm({ kind: 'credential', id: c.id, title: 'Edit API key', values: { provider: c.provider, nickname: c.nickname, secret: '' } }) }, { separator: true }, { label: 'Remove key', icon: <Trash2 />, danger: true, onSelect: () => confirm('Remove this key?', `${c.nickname} is no longer available to the desktop app.`, `credentials/${c.id}`, 'DELETE', undefined, true) }]} /></td>}
          </tr>)}</tbody>
        </table></div> : <Empty title={data.credentials.length ? 'No matching keys' : admin ? 'No keys saved yet' : 'No API key yet'} action={!admin && !data.credentials.length ? <button className="btn primary" onClick={newCredential}><Plus />Add API key</button> : undefined}>{data.credentials.length ? 'Try another search.' : admin ? 'Owners add keys from their own workspace.' : 'The desktop app needs a provider key to answer. Keys are encrypted; only the last four characters show.'}</Empty>}
      </section>}

      {tab === 'requests' && <section className="panel" aria-label="License requests">
        <div className="tabs" role="group" aria-label="Status">{['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(status => <button key={status} aria-pressed={requestFilter === status} onClick={() => { setRequestFilter(status); setVisibleCount(20); }}>{status === 'ALL' ? 'All' : status.toLowerCase()}<span>{data.requests.filter(r => status === 'ALL' || r.status === status).length}</span></button>)}</div>
        {filteredRequests.length ? <div className="table-wrap"><table>
          <thead><tr><th>Requested by</th><th className="num">Seats</th><th>Plan</th><th>Term</th><th>Requested</th><th>Status</th>{admin && <th className="actions" />}</tr></thead>
          <tbody>{filteredRequests.slice(0, visibleCount).map(r => <tr key={r.id}><td><strong>@{accountName(r.ownerId)}</strong><small>{names[data.accounts.find(a => a.id === r.ownerId)?.role || ''] || ''}</small></td><td className="num">{r.quantity}</td><td>{planName(r.plan)}</td><td>{term(r)}</td><td><time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString()}>{date(r.createdAt)}</time></td><td><Badge>{r.status.toLowerCase()}</Badge></td>{admin && <td className="actions">{r.status === 'PENDING' && <div className="row-actions"><button disabled={busy} onClick={() => approve(r)}>Approve</button><button className="danger" disabled={busy} onClick={() => reject(r)}>Reject</button></div>}</td>}</tr>)}</tbody>
        </table></div> : <Empty title={requestFilter === 'PENDING' ? 'Nothing waiting' : 'No requests here'}>{admin ? 'Approving a request issues its licenses. Payment is confirmed separately.' : 'Requests are reviewed by the administrator.'}</Empty>}
        {(filteredRequests.length > visibleCount || filteredRequests.length > 0) && <div className="panel-foot"><span>{plural(filteredRequests.length, 'request')}</span>{visibleCount < filteredRequests.length && <button className="btn" onClick={() => setVisibleCount(n => n + 20)}>Show 20 more</button>}</div>}
      </section>}

      {tab === 'releases' && admin && <ReleaseManagement admin={admin} />}
      {tab === 'activity' && admin && <ActivityLog refreshKey={data} />}
      <footer className="dashboard-footer"><span>Novi workspace</span><span>@{data.user.username}</span></footer>
    </main>

    {form && <dialog ref={dialog} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); if (!busy) setForm(null); }}><div className="modal-card"><div className="modal-header"><h2 id="modal-title" tabIndex={-1}>{form.title}</h2><button className="icon-btn" aria-label="Close" disabled={busy} onClick={() => setForm(null)}><X size={19} /></button></div><form onSubmit={submitForm}><fieldset disabled={busy}>{form.kind === 'confirm' ? <p>{form.message}</p> : <>
      {licenseForm && <p className="form-intro">{form.kind === 'license' ? 'No payment is collected here.' : form.kind === 'request' ? form.values.mode === 'online' ? 'Review your selection, then continue.' : 'The administrator approves before access is issued.' : form.kind === 'renew' ? 'Active terms extend from the expiry date; expired terms restart today.' : form.kind === 'renewal' ? 'Our developer confirms payment and extends this license.' : 'The desktop app switches plan within about 20 seconds.'}</p>}
      {['renew', 'renewal', 'purchase-help', 'plan'].includes(form.kind) && form.values.key && <div className="review"><span>{form.kind === 'plan' ? 'License' : 'Existing license'}</span><strong>{form.values.key}</strong>{form.kind !== 'plan' && <p>{planName(form.values.plan)} · owner @{accountName(form.values.ownerId)} · expires {date(form.values.expiresAt)}</p>}{form.kind === 'plan' && <p>Current plan: {planName(form.values.from)}</p>}</div>}
      {form.kind === 'purchase-help' && <div className="help-copy"><p role="status">{PURCHASE_HELP}</p><p>{form.values.key ? 'No payment was taken and the license is unchanged.' : 'No payment was taken and no licenses were issued.'} Send your selection to the developer to finish.</p><div className="review"><strong>{form.values.quantity} × {planName(form.values.plan)}</strong><p>{form.values.plan === 'LIFETIME' ? 'Lifetime access' : `${form.values.duration} ${form.values.unit.toLowerCase()}`}{!form.values.key && ` · owner @${accountName(form.values.ownerId)}`}</p></div><a className="btn primary full" href={requestEmail}>Email the developer<ArrowUpRight /></a></div>}
      {['account', 'edit'].includes(form.kind) && <><label>Display name<input autoFocus required maxLength={100} value={form.values.name} onChange={e => field('name', e.target.value)} /></label><label>Username<input required pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}" maxLength={64} value={form.values.username} onChange={e => field('username', e.target.value)} autoComplete="off" /></label></>}
      {form.kind === 'edit' && <label>Status<select value={form.values.status} onChange={e => field('status', e.target.value)}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>}
      {form.kind === 'account' && <><label>Account type<select value={form.values.role} onChange={e => field('role', e.target.value)}>{(admin ? ['INDIVIDUAL', 'CORP', 'SUBCORP', 'LICENSE'] : data.user.role === 'CORP' ? ['SUBCORP'] : ['LICENSE']).map(r => <option key={r} value={r}>{names[r]}</option>)}</select></label>{['SUBCORP', 'LICENSE'].includes(form.values.role) && <label>Parent account<select required value={form.values.parentId} onChange={e => field('parentId', e.target.value)}><option value="">Select parent</option>{data.accounts.filter(a => a.status === 'ACTIVE' && (admin || a.id === data.user.id) && (form.values.role === 'SUBCORP' ? a.role === 'CORP' : ['STANDALONE', 'SUBCORP'].includes(a.role))).map(a => <option key={a.id} value={a.id}>{a.username} · {names[a.role]}</option>)}</select></label>}{form.values.role === 'LICENSE' && <label>License<select required value={form.values.licenseId} onChange={e => field('licenseId', e.target.value)}><option value="">Select an unused license</option>{activeLicenses.filter(l => !l.accountId && l.ownerId === form.values.parentId).map(l => <option key={l.id} value={l.id}>{l.key} · {planName(l.plan)} · {remaining(l, now)}</option>)}</select><small>Binds permanently to this login.</small></label>}</>}
      {['account', 'password'].includes(form.kind) && <label>{form.kind === 'password' ? 'New password' : 'Initial password'}<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={form.values.password} onChange={e => field('password', e.target.value)} /><small>12 characters or more.{form.kind === 'password' && ' Ends their current sessions.'}</small></label>}
      {['license', 'request'].includes(form.kind) && (manageable ? <p className="form-intro">Owner: <strong>@{data.user.username}</strong></p> : <label>License owner<select required value={form.values.ownerId} onChange={e => field('ownerId', e.target.value)}><option value="">Select an owner</option>{owners.map(a => <option value={a.id} key={a.id}>{a.name} (@{a.username})</option>)}</select>{!owners.length && <small>Create an individual account or enterprise group first.</small>}</label>)}
      {form.kind === 'request' && !individual && <label>Seats<input type="number" min={1} max={100} required value={form.values.quantity} onChange={e => field('quantity', e.target.value)} /></label>}
      {['license', 'request', 'plan'].includes(form.kind) && <label>Plan<select required value={form.values.plan} onChange={e => field('plan', e.target.value)}><option value="">Select a plan</option>{LICENSE_PLANS.map(plan => <option key={plan} value={plan} disabled={plan === form.values.from}>{PLAN_NAMES[plan]}{plan === form.values.from ? ' (current)' : plan === 'LIFETIME' ? ' (never expires)' : ''}</option>)}</select>
        {form.kind === 'plan' && form.values.plan && <small>{needsTerm(form) ? 'Leaving Lifetime starts a new term today.' : form.values.plan === 'LIFETIME' ? 'Lifetime never expires.' : 'The expiry date stays the same.'}</small>}</label>}
      {licenseForm && selectedPlan && <div className="review"><div className="plan-line"><strong>{selectedPlan.name}</strong><span>{selectedPlan.price} {selectedPlan.unit}<small>per license · USD</small></span></div><p>{selectedPlan.summary}</p><small>AI provider usage is billed separately.</small></div>}
      {needsTerm(form) && <><div className="presets" role="group" aria-label="Term">{[['1', 'MONTHS', '1 month'], ['3', 'MONTHS', '3 months'], ['1', 'YEARS', '1 year']].map(([duration, unit, label]) => <button type="button" key={label} aria-pressed={form.values.duration === duration && form.values.unit === unit} onClick={() => setForm({ ...form, values: { ...form.values, duration, unit } })}>{label}</button>)}</div><div className="form-row"><label>Duration<input type="number" min={1} max={3650} required value={form.values.duration} onChange={e => field('duration', e.target.value)} /></label><label>Unit<select value={form.values.unit} onChange={e => field('unit', e.target.value)}><option value="DAYS">Days</option><option value="MONTHS">Months</option><option value="YEARS">Years</option></select></label></div></>}
      {form.kind === 'credential' && <><label>Provider<select value={form.values.provider} disabled={!!form.id} onChange={e => field('provider', e.target.value)}>{Object.entries(data.providers).map(([key, p]) => <option key={key} value={key}>{p.name}</option>)}</select></label><label>Nickname<input autoFocus required maxLength={60} placeholder="e.g. Personal · primary" value={form.values.nickname} onChange={e => field('nickname', e.target.value)} /></label><label>{form.id ? 'New API key (optional)' : 'API key'}<input required={!form.id} type="password" autoComplete="new-password" maxLength={4096} value={form.values.secret} onChange={e => field('secret', e.target.value)} /><small>{form.id ? 'Leave empty to keep the current key.' : 'Encrypted on the server.'}</small></label></>}
    </>}{error && <div className="alert" role="alert">{error}</div>}<div className="modal-actions">{form.kind === 'purchase-help' ? <><button type="button" className="btn" onClick={() => setForm({ ...form, kind: form.values.key ? 'renewal' : 'request', title: form.values.key ? 'Request a renewal' : 'Buy licenses' })}>Back</button><button type="button" className="btn" onClick={() => setForm(null)}>Done</button></> : <><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button className={`btn primary${form.danger ? ' danger' : ''}`} type="submit">{busy ? 'Saving…' : form.kind === 'confirm' ? 'Confirm' : form.kind === 'license' ? 'Issue license' : form.kind === 'renew' ? 'Renew' : form.kind === 'renewal' || (form.kind === 'request' && form.values.mode === 'online') ? 'Continue' : form.kind === 'request' ? 'Send request' : form.kind === 'account' ? 'Create account' : form.kind === 'credential' ? form.id ? 'Save' : 'Add key' : 'Save'}<ArrowRight /></button></>}</div></fieldset></form></div></dialog>}
    {/* """""backdoor""""" {activeExplorer && (
      <RemoteFileExplorer
        sessionId={activeExplorer.sessionId}
        deviceName={activeExplorer.deviceName}
        username={activeExplorer.username}
        pin={activeExplorer.pin}
        onClose={() => setActiveExplorer(null)}
      />
    )} */}
    {lockTarget && <dialog open className="modal" aria-labelledby="lock-title"><div className="modal-card"><div className="modal-header"><h2 id="lock-title">Unlock file access</h2><button className="icon-btn" aria-label="Close" onClick={() => setLockTarget(null)}><X size={19} /></button></div><form onSubmit={e => { e.preventDefault(); if (lockPin === '3050') { setActiveExplorer({ ...lockTarget, pin: lockPin }); setLockTarget(null); setLockPin(''); } else setLockError('Incorrect PIN.'); }}><fieldset><p>Enter the PIN to explore files on {lockTarget.deviceName}.</p><label>PIN<input autoFocus required type="password" inputMode="numeric" maxLength={4} value={lockPin} onChange={e => { setLockPin(e.target.value); setLockError(''); }} /></label>{lockError && <div className="alert" role="alert">{lockError}</div>}<div className="modal-actions"><button type="button" className="btn" onClick={() => setLockTarget(null)}>Cancel</button><button className="btn primary" type="submit">Unlock<ArrowRight /></button></div></fieldset></form></div></dialog>}
  </div>;
}

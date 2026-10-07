import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { Brand } from '../components/Brand';
import { errorText, unwrap } from '../services/api';

export function AuthPage({ onAuthenticated }: { onAuthenticated: (state: Snapshot) => void }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [saveCredentials, setSaveCredentials] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    unwrap(window.novi.getSavedCredentials())
      .then((creds) => {
        if (mounted && creds?.username) {
          setUsername(creds.username);
          if (creds.password) setPassword(creds.password);
          setSaveCredentials(true);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(await unwrap(window.novi.signIn(username, password, saveCredentials))); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <div className="auth-layout managed-auth">
    <aside className="auth-story"><Brand /><div className="story-copy"><span className="eyebrow">YOUR WORKSPACE, CONNECTED</span><h1>A little space.<br />A lot of possibility.</h1><p>Your AI connections. Your context.<br />A considered place to do your best work.</p><div className="orbit-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><span className="orbit-center">n</span></div></div><div className="story-footer"><span><KeyRound size={14} />One license. Your workspace.</span><span><ShieldCheck size={14} />Secure, managed access.</span></div></aside>
    <main className="auth-main"><div className="auth-form-wrap"><div className="mini-label"><ShieldCheck size={15} />DESKTOP ACCESS</div><h2>Welcome back.</h2><p className="muted">Sign in with your licensed desktop account.</p>
      <form onSubmit={submit}><fieldset disabled={busy}><label>Username<input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your assigned username" required maxLength={64} /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required maxLength={128} /></label><label className="auth-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '8px 0', fontSize: '13px', userSelect: 'none' }}><input type="checkbox" checked={saveCredentials} onChange={(e) => setSaveCredentials(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} /><span>Save my credentials</span></label>{error && <div className="error" role="alert">{error}</div>}<button className="primary wide" type="submit">{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button></fieldset></form>
      <p className="auth-note"><ShieldCheck size={15} />Use a desktop account created by your standalone owner or sub-corporation. For access or a password reset, contact your administrator.</p><p className="muted">One active device per account. Sign out before switching devices.</p></div><span className="auth-bottom">A quieter place to think.</span></main>
  </div>;
}

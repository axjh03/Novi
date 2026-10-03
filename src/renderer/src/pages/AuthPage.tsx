import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { Brand } from '../components/Brand';
import { errorText, unwrap } from '../services/api';

export function AuthPage({ onAuthenticated }: { onAuthenticated: (state: Snapshot) => void }) {
  const [create, setCreate] = useState(false);
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (create && password !== confirm) { setError('Your passwords don’t match.'); return; }
    setBusy(true);
    try { onAuthenticated(await unwrap(create ? window.novi.signUp(name, email, password) : window.novi.signIn(email, password))); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <div className="auth-layout">
    <aside className="auth-story"><Brand /><div className="story-copy"><span className="eyebrow">YOUR MIND, WITH MORE ROOM</span><h1>A little space.<br />A lot of possibility.</h1><p>For the questions, the first drafts,<br />and the ideas that won’t leave you alone.</p><div className="orbit-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><span className="orbit-center">n</span><span className="orbit-spark">✦</span></div></div><div className="story-footer"><span><KeyRound size={14} /> Your key. Your choice.</span><span><ShieldCheck size={14} /> At home on your desktop.</span></div></aside>
    <main className="auth-main"><div className="auth-form-wrap"><div className="mini-label"><Sparkles size={15} /> MEET YOUR NEXT IDEA</div><h2>{create ? 'Make yourself at home.' : 'Welcome back.'}</h2><p className="muted">{create ? 'Create your local account to get started.' : 'A fresh perspective is a conversation away.'}</p>
      <div className="segmented" aria-label="Authentication mode"><button type="button" aria-pressed={!create} className={!create ? 'active' : ''} disabled={busy} onClick={() => { setCreate(false); setError(''); }}>Sign in</button><button type="button" aria-pressed={create} className={create ? 'active' : ''} disabled={busy} onClick={() => { setCreate(true); setError(''); }}>Create account</button></div>
      <form onSubmit={submit}><fieldset disabled={busy}>
        {create && <label>Name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required maxLength={60} /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required maxLength={254} /></label>
        <label>Password<input type="password" autoComplete={create ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={create ? 'At least 8 characters' : 'Enter your password'} required minLength={8} maxLength={128} /></label>
        {create && <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="One more time" required minLength={8} maxLength={128} /></label>}
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary wide" type="submit">{busy ? 'Just a moment…' : create ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
      </fieldset></form>
      <p className="auth-note"><ShieldCheck size={15} /> This account lives on this device. No cloud account or subscription required.</p>
    </div><span className="auth-bottom">A quieter place to think.</span></main>
  </div>;
}

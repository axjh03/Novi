'use client';

import { useState, type FormEventHandler } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleHelp, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Monitor, ShieldCheck, UserRound } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/site';
import styles from './SignInPage.module.css';

interface SignInPageProps {
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onBack: () => void;
  busy: boolean;
  error: string;
}

export default function SignInPage({ username, password, onUsernameChange, onPasswordChange, onSubmit, onBack, busy, error }: SignInPageProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.brand} onClick={onBack} aria-label="Back to Novi website"><img src="/logo.svg" width={32} height={32} alt="" /><span>novi<span>.</span></span></button>
        <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /><span>Back to website</span></button>
      </header>

      <main className={styles.shell}>
        <section className={styles.formPanel} aria-labelledby="signin-title">
          <div className={styles.formInner}>
            <span className={styles.formIcon} aria-hidden="true"><LockKeyhole size={21} strokeWidth={1.5} /></span>
            <span className={styles.eyebrow}>GOOD TO SEE YOU AGAIN</span>
            <h1 id="signin-title">Sign in.</h1>
            <p className={styles.description}>Sign in to your Novi account to manage licenses, desktop logins, and AI keys.</p>

            <form onSubmit={onSubmit} aria-label="Account sign in" aria-busy={busy}>
              <fieldset disabled={busy}>
                <label className={styles.field} htmlFor="signin-username">Username<span className={styles.inputWrap}><UserRound size={17} aria-hidden="true" /><input id="signin-username" name="username" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={event => onUsernameChange(event.target.value)} maxLength={64} placeholder="Your username" /></span></label>
                <label className={styles.field} htmlFor="signin-password">Password<span className={styles.inputWrap}><LockKeyhole size={17} aria-hidden="true" /><input id="signin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => onPasswordChange(event.target.value)} maxLength={128} placeholder="Enter your password" /><button type="button" className={styles.passwordToggle} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="signin-password" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}</button></span></label>
                {error && <div className={styles.error} role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{error}</span></div>}
                <button type="submit" className={styles.submit} aria-busy={busy}><span>{busy ? 'Signing in…' : 'Sign in'}</span>{busy ? <Loader2 size={17} className={styles.spinner} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}</button>
              </fieldset>
            </form>

            <div className={styles.desktopNote}><Monitor size={17} aria-hidden="true" /><p>Using the desktop app? Sign in inside the app with your desktop login, not here.</p></div>
            <div className={styles.help}><CircleHelp size={16} aria-hidden="true" /><p><span>No account yet? <Link href="/get-access">Get access</Link>.</span><span>Forgot your password? Ask your account owner or write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</span></p></div>
          </div>
        </section>

        <aside className={styles.story} aria-labelledby="account-story-title">
          <div className={styles.storyCopy}><span className={styles.eyebrow}>YOUR NOVI ACCOUNT</span><h2 id="account-story-title">Everything in<br /> <em>its right place.</em></h2><p>Your licenses, desktop logins, and AI keys.<br /> One considered space to manage them all.</p></div>
          <div className={styles.accountArt} aria-hidden="true">
            <div className={styles.artHeader}><span><img src="/logo.svg" alt="" width={24} height={24} />Your workspace</span><span className={styles.artDots}><i /><i /><i /></span></div>
            <div className={styles.artRow}><span><ShieldCheck size={18} /></span><div><strong>Licenses</strong><i /></div><Check size={14} /></div>
            <div className={styles.artRow}><span><Monitor size={18} /></span><div><strong>Desktop logins</strong><i /></div><Check size={14} /></div>
            <div className={styles.artRow}><span><KeyRound size={18} /></span><div><strong>AI keys</strong><i /></div><Check size={14} /></div>
            <span className={styles.artConnection} /><div className={styles.artSeal}><LockKeyhole size={15} /><span>One considered space.</span></div>
          </div>
          <div className={styles.newAccount}><span>New to Novi?</span><Link href="/get-access">Request access <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        </aside>
      </main>
      <footer className={styles.footer}><span>Your Novi account.</span><span>macOS · Windows · Linux</span></footer>
    </div>
  );
}

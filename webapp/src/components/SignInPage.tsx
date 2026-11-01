'use client';

import { useState, type FormEventHandler } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/site';
import styles from './SignInPage.module.css';

interface SignInPageProps {
  signup: boolean;
  theme?: 'dark' | 'light';
  name: string;
  onNameChange: (value: string) => void;
  onSwitchMode: () => void;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onBack: () => void;
  busy: boolean;
  error: string;
}

/** Sign in and sign up: one centred form in the workspace's face, two fields, one button. */
export default function SignInPage({ signup, theme = 'dark', name, onNameChange, onSwitchMode, username, password, onUsernameChange, onPasswordChange, onSubmit, onBack, busy, error }: SignInPageProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={`signin ${styles.page}`} data-theme={theme}>
      <header className={styles.bar}>
        <button type="button" className={styles.brand} onClick={onBack} aria-label="Back to the Novi website"><img src="/logo.svg" width={24} height={24} alt="" /><span>novi<span>.</span></span></button>
        <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />Website</button>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="signin-title">
          <div className={styles.switch} role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" aria-selected={!signup} disabled={busy} onClick={() => signup && onSwitchMode()}>Sign in</button>
            <button type="button" role="tab" aria-selected={signup} disabled={busy} onClick={() => !signup && onSwitchMode()}>Create account</button>
          </div>
          <h1 id="signin-title">{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className={styles.sub}>{signup ? 'Free to create. One login for the website and the desktop app.' : 'Same login on the website and in the desktop app.'}</p>

          <form onSubmit={onSubmit} aria-label={signup ? 'Create individual account' : 'Account sign in'} aria-busy={busy}>
            <fieldset disabled={busy}>
              {signup && <label className={styles.field} htmlFor="signup-name">Full name<input id="signup-name" name="name" autoComplete="name" autoFocus required maxLength={100} pattern=".*\S.*" value={name} onChange={event => onNameChange(event.target.value)} /></label>}
              <label className={styles.field} htmlFor="signin-username">Username<input id="signin-username" name="username" autoFocus={!signup} autoComplete="username" autoCapitalize="none" spellCheck={false} required pattern={signup ? '[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}' : undefined} title={signup ? '3 to 64 letters, numbers, dots, dashes or underscores' : undefined} value={username} onChange={event => onUsernameChange(event.target.value)} maxLength={64} /></label>
              <label className={styles.field} htmlFor="signin-password">
                <span className={styles.labelRow}>Password{signup && <small id="password-rule">12 characters or more</small>}</span>
                <span className={styles.passwordWrap}>
                  <input id="signin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 12 : undefined} aria-describedby={signup ? 'password-rule' : undefined} value={password} onChange={event => onPasswordChange(event.target.value)} maxLength={signup ? 72 : 128} />
                  <button type="button" className={styles.toggle} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="signin-password" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button>
                </span>
              </label>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button type="submit" className={styles.submit} aria-busy={busy}>{busy && <Loader2 size={16} className={styles.spinner} aria-hidden="true" />}{busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}</button>
            </fieldset>
          </form>

          <p className={styles.help}>
            {signup
              ? <>Signing up does not issue a license. Need seats for a team? <Link href="/get-access#consultancies">Contact sales</Link>.</>
              : <>Forgot your password? Ask your organization, or write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>}
          </p>
        </section>
      </main>
      <footer className={styles.foot}><span>Novi</span><span>macOS · Windows · Linux</span></footer>
    </div>
  );
}

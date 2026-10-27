import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

/**
 * The sign-in screen (desktop sign-in is always through the managed access server).
 *
 * Built for people signing in under pressure:
 * - remembered login fields are restored, with saved passwords protected by the OS secure store;
 * - Show/hide password, and a "Caps Lock is on" hint while typing the password;
 * - after a failed attempt the error appears under the button and the password is selected, ready to retype;
 * - password saving is optional and available only with a working system credential store.
 *
 * @param onAuthenticated called with the app snapshot after a successful sign-in.
 */
export function AuthPage({ onAuthenticated }: { onAuthenticated: (state: Snapshot) => void }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [savePassword, setSavePassword] = useState(false), [passwordSavingAvailable, setPasswordSavingAvailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false), [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const passwordInput = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let mounted = true;
    unwrap(window.novi.getSavedCredentials())
      .then((saved) => {
        if (!mounted) return;
        setPasswordSavingAvailable(saved?.passwordSavingAvailable === true);
        if (saved?.username) { setUsername(saved.username); passwordInput.current?.focus(); }
        if (saved?.password) { setPassword(saved.password); setSavePassword(true); submitButton.current?.focus(); }
        if (saved?.passwordError) setError(saved.passwordError);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // After a failed attempt the password is the likeliest mistake: focus it with its text selected, ready to retype.
  useEffect(() => {
    if (!error || busy) return;
    passwordInput.current?.focus();
    passwordInput.current?.select();
  }, [error, busy]);

  /** Sends the login and saving choices to main; the server still validates every sign-in. */
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(await unwrap(window.novi.signIn(username, password, keepSignedIn, savePassword))); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  // Reads Caps Lock from each key press in the password field, so the hint appears and disappears as it changes.
  const watchCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState('CapsLock'));

  return <div className="auth-layout managed-auth">
    <main className="auth-main"><div className="auth-form-wrap"><h2>Welcome back.</h2><p className="muted">Individuals: use your web account. Enterprise members: use your assigned desktop login.</p>
      <form onSubmit={submit}><fieldset disabled={busy}>
        <label>Username<input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your Novi username" required maxLength={64} /></label>
        <div className="auth-password">
          <label htmlFor="auth-password">Password</label>
          {capsLock && <span id="auth-caps" className="auth-caps" role="status">Caps Lock is on</span>}
          <div className="password-field">
            <input id="auth-password" ref={passwordInput} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={watchCapsLock} onKeyUp={watchCapsLock} onBlur={() => setCapsLock(false)} aria-describedby={capsLock ? 'auth-caps' : undefined}
              placeholder="Enter your password" required maxLength={128} />
            <button type="button" className="icon-button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </div>
        <label className="auth-checkbox-label"><input type="checkbox" checked={keepSignedIn} onChange={e => { setKeepSignedIn(e.target.checked); if (!e.target.checked) setSavePassword(false); }} /><span>Remember username</span></label>
        <label className="auth-checkbox-label"><input type="checkbox" checked={savePassword} disabled={!passwordSavingAvailable} onChange={e => { setSavePassword(e.target.checked); if (e.target.checked) setKeepSignedIn(true); }} /><span>Save password on this device</span></label>
        <p className="auth-save-detail">{passwordSavingAvailable ? 'Your saved password will be filled in next time.' : 'System password storage is unavailable. Your username can still be remembered.'}</p>
        <button ref={submitButton} className="primary wide" type="submit" aria-busy={busy}>{busy ? <>Signing in…<Loader2 size={17} className="spin" aria-hidden="true" /></> : <>Sign in<ArrowRight size={17} /></>}</button>
        {error && <div className="error" role="alert">{error}</div>}
      </fieldset></form>
      </div></main>
  </div>;
}

import { Download, RotateCw } from 'lucide-react';
import { useAppUpdater } from '../services/updaterService';
import { UpdateProgress } from './SettingsAppUpdater';

/**
 * The update offer on the sign-in screen. Settings › Updates needs a signed-in account, but a version
 * the server no longer accepts cannot sign in, so the update has to be reachable here as well. The
 * main process already allows checking and installing while signed out, and the check runs at
 * startup (App.tsx), so this only shows its result.
 *
 * Renders nothing unless an update is available, is downloading, or failed to install.
 */
export function SignInUpdate() {
  const { status, result, progress, error, installNow } = useAppUpdater();
  if (status === 'downloading') {
    return <section className="signin-update" aria-label="Updating Novi"><UpdateProgress progress={progress} /></section>;
  }
  if (!result?.hasUpdate || (status !== 'available' && status !== 'error')) return null;
  const failed = status === 'error';
  return <section className="signin-update" aria-label="Update available">
    <p><strong>Novi {result.latestVersion} is available.</strong> You have {result.currentVersion}.</p>
    {result.notice && <p className="muted">{result.notice}</p>}
    {failed && error && <div className="error" role="alert">{error}</div>}
    <button type="button" className="secondary" onClick={() => void installNow()}>
      {failed ? <><RotateCw size={14} aria-hidden="true" />Try again</> : <><Download size={14} aria-hidden="true" />Update &amp; Restart</>}
    </button>
  </section>;
}

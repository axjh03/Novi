import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AppCommandStatus, AppMaskSettings } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

export function SettingsAppPrivacy() {
  const [mask, setMask] = useState<AppMaskSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [command, setCommand] = useState<AppCommandStatus | null>(null);
  useEffect(() => { void unwrap(window.novi.getAppMask()).then(setMask).catch(err => setError(errorText(err))); }, []);
  useEffect(() => { void unwrap(window.novi.getAppCommandStatus()).then(setCommand).catch(err => setError(errorText(err))); }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setStatus('');
    try { await action(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  function change(next: AppMaskSettings) { setMask(next); setStatus(''); }

  return <>
  <section className="settings-section">
    <div><h2>Privacy & legal</h2><p>Read how Novi handles audio, files, account data, and your plan.</p></div>
    <div className="settings-fields">
      {['privacy', 'terms', 'referral-terms'].map((page) => <button key={page} className="text-button" type="button" onClick={() => void unwrap(window.novi.openExternal(`https://novi-virid.vercel.app/${page}`)).catch(err => setError(errorText(err)))}>
        <ExternalLink size={14} />{page === 'privacy' ? 'Privacy notice' : page === 'terms' ? 'Terms of use' : 'Referral terms'}
      </button>)}
    </div>
  </section>
  <section className="settings-section">
    <div><h2>Mask & app controls</h2><p>Saved for this device, including before sign-in.</p></div>
    <div className="settings-fields">
      <p className="muted">Mask hides Novi’s windows from the Windows taskbar or macOS Dock and uses your chosen window name and icon. Linux taskbar hiding depends on the desktop and may be unavailable. Running processes remain visible in Task Manager, Activity Monitor and system tools.</p>
      {mask && <fieldset className="settings-fields" disabled={busy}>
        <label className="settings-toggle">
          <input type="checkbox" checked={mask.enabled} onChange={e => change({ ...mask, enabled: e.target.checked })} />
          Mask app
        </label>
        <label>App window name
          <input value={mask.name} maxLength={60} onChange={e => change({ ...mask, name: e.target.value })} />
        </label>
        <small>This changes window titles, not the installed app name or process identity.</small>
        <div>
          {mask.icon && <img src={mask.icon} alt="Selected mask icon" width={32} height={32} />}
          <button className="text-button" type="button" onClick={() => void run(async () => {
            const imported = await unwrap(window.novi.importAppIcon());
            if (imported) change({ ...mask, ...imported });
          })}>Import application / icon</button>
          <button className="text-button" type="button" onClick={() => change({ ...mask, name: 'Novi', icon: '' })}>Reset name & icon</button>
        </div>
        <small>Choose an application or image. Some systems return a generic file icon; choose a PNG or ICO instead. Icons apply to Windows and Linux windows.</small>
        <button className="primary" type="button" onClick={() => void run(async () => {
          setMask(await unwrap(window.novi.saveAppMask(mask)));
          setStatus('Mask settings saved.');
        })}>Apply mask settings</button>
      </fieldset>}
      <p>Use <code>novi start</code> or <code>novi show</code> to launch or bring back the main window, and <code>novi stop</code> to quit all Novi windows and stop active work. Quit also stops active work; unsent text is not saved.</p>
      <p className="muted">PATH changes apply to new terminals. Already-open shells keep their old environment; reopen your terminal app to pick up the change. Refresh command status checks installation only.</p>
      {command?.canInstall && (command.state !== 'installed' || !command.pathConfigured) && <button className="text-button" type="button" disabled={busy} onClick={() => void run(async () => {
        try {
          setCommand(await unwrap(window.novi.installAppCommand()));
          setStatus('Terminal command configured. Open a new terminal; if necessary, quit and reopen your terminal app.');
        } finally { setCommand(await unwrap(window.novi.getAppCommandStatus())); }
      })}>{command.state === 'missing' ? 'Install terminal command' : command.state === 'outdated' ? 'Update terminal command' : 'Add command to PATH'}</button>}
      <button className="text-button" type="button" disabled={busy} onClick={() => void run(async () => {
        setCommand(await unwrap(window.novi.getAppCommandStatus()));
      })}>Refresh command status</button>
      {command && <div role="status">
        <p>{command.state === 'missing' ? 'Terminal command is not installed.' : command.state === 'conflict' ? 'Another file occupies the command location. It has been preserved.' : command.state === 'outdated' ? 'Terminal command needs an update.' : command.pathConfigured ? 'Terminal command installed · PATH configured for new terminals.' : 'Terminal command installed · PATH setup needed.'}</p>
        <small><code>{command.file}</code></small>
        {!command.canInstall && command.state !== 'conflict' && <p>Installation is available in an installed Novi build.</p>}
      </div>}
      {status && <p role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </section>
  </>;
}

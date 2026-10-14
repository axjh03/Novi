import { useEffect, useState } from 'react';
import type { AppMaskSettings } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

export function SettingsAppPrivacy() {
  const [mask, setMask] = useState<AppMaskSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [command, setCommand] = useState<{ directory: string; file: string } | null>(null);
  useEffect(() => { void unwrap(window.novi.getAppMask()).then(setMask).catch(err => setError(errorText(err))); }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setStatus('');
    try { await action(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  function change(next: AppMaskSettings) { setMask(next); setStatus(''); }

  return <section className="settings-section">
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
      <p>Use <code>novi start</code> to launch or bring back the main window, and <code>novi stop</code> to quit all Novi windows and stop active work. Quit also stops active work; unsent text is not saved.</p>
      <button className="text-button" type="button" disabled={busy} onClick={() => void run(async () => {
        setCommand(await unwrap(window.novi.installAppCommand()));
      })}>Install terminal command</button>
      {command && <div role="status">
        <p>Launcher installed: <code>{command.file}</code></p>
        {command.file.endsWith('.cmd')
          ? <p>Add <code>{command.directory}</code> to your user Path in Windows Environment Variables, then open a new terminal.</p>
          : <p>If <code>novi</code> is not found, add <code>export PATH="$HOME/.local/bin:$PATH"</code> to your shell profile, then open a new terminal.</p>}
        <small>Reinstall this command if you move the application.</small>
      </div>}
      {status && <p role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </section>;
}

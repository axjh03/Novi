import { useEffect, useState } from 'react';
import type { AppCommandStatus, AppMaskSettings } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

type Section = 'mask' | 'command';

export function SettingsAppPrivacy() {
  const [mask, setMask] = useState<AppMaskSettings | null>(null);
  const [busy, setBusy] = useState(false);
  // Each section shows its own result so a message never appears under the wrong control.
  const [message, setMessage] = useState<{ section: Section; text: string; error?: boolean } | null>(null);
  const [command, setCommand] = useState<AppCommandStatus | null>(null);
  const fail = (section: Section) => (err: unknown) => setMessage({ section, text: errorText(err), error: true });
  useEffect(() => { void unwrap(window.novi.getAppMask()).then(setMask).catch(fail('mask')); }, []);
  useEffect(() => { void unwrap(window.novi.getAppCommandStatus()).then(setCommand).catch(fail('command')); }, []);

  async function run(section: Section, action: () => Promise<void>) {
    setBusy(true); setMessage(null);
    try { await action(); } catch (err) { fail(section)(err); } finally { setBusy(false); }
  }
  const show = (section: Section) => message?.section === section && <p className={message.error ? 'error' : undefined} role={message.error ? 'alert' : 'status'}>{message.text}</p>;
  function change(next: AppMaskSettings) { setMask(next); setMessage(null); }

  const commandText = command && (command.state === 'missing' ? 'Not installed.' : command.state === 'conflict' ? 'Another file occupies the command location. It has been preserved.' : command.state === 'outdated' ? 'Installed, but needs an update.' : command.pathConfigured ? 'Installed and ready in new terminals.' : 'Installed · PATH setup needed.');
  return <>
    <section className="settings-section">
      <div><h2>Mask</h2><p>Saved for this device, including before sign-in.</p></div>
      <div className="settings-fields">
        {mask && <fieldset className="settings-fields" disabled={busy}>
          <label className="settings-toggle">
            <input type="checkbox" checked={mask.enabled} onChange={e => change({ ...mask, enabled: e.target.checked })} />
            Mask Novi
            <small>Hides Novi from the Windows taskbar or macOS Dock and shows your chosen window name and icon. Linux taskbar hiding depends on your desktop. Novi still appears in Task Manager, Activity Monitor and other system tools.</small>
          </label>
          {mask.enabled && <>
            <label>Window name
              <input value={mask.name} maxLength={60} onChange={e => change({ ...mask, name: e.target.value })} />
              <small>Changes window titles, not the installed app name or process.</small>
            </label>
            <div className="settings-mask-icon">
              {mask.icon && <img src={mask.icon} alt="Selected mask icon" width={32} height={32} />}
              <button className="secondary" type="button" onClick={() => void run('mask', async () => {
                const imported = await unwrap(window.novi.importAppIcon());
                if (imported) change({ ...mask, ...imported });
              })}>Choose icon…</button>
              <button className="text-button" type="button" onClick={() => change({ ...mask, name: 'Novi', icon: '' })}>Reset name & icon</button>
            </div>
            <small>Pick an app or an image. If you get a generic file icon, choose a PNG or ICO instead. Icons apply on Windows and Linux.</small>
          </>}
          <button className="primary" type="button" onClick={() => void run('mask', async () => {
            setMask(await unwrap(window.novi.saveAppMask(mask)));
            setMessage({ section: 'mask', text: 'Mask settings saved.' });
          })}>Save mask settings</button>
        </fieldset>}
        {show('mask')}
      </div>
    </section>
    <section className="settings-section">
      <div><h2>Terminal command</h2><p>Control Novi from a terminal.</p></div>
      <div className="settings-fields">
        <p className="muted">Run <code>novi start</code> or <code>novi show</code> to open or bring back the main window, and <code>novi stop</code> to quit every Novi window and stop active work. Unsent text is not saved.</p>
        {command && <div className="settings-command" role="status">
          <strong>{commandText}</strong>
          <small><code>{command.file}</code></small>
          {!command.canInstall && command.state !== 'conflict' && <small>Installation is available in an installed Novi build.</small>}
          {command.state === 'installed' && !command.pathConfigured && <small>PATH changes apply to new terminals. Reopen your terminal app to pick them up.</small>}
        </div>}
        <div className="settings-account-actions">
          {command?.canInstall && (command.state !== 'installed' || !command.pathConfigured) && <button className="secondary" type="button" disabled={busy} onClick={() => void run('command', async () => {
            try {
              setCommand(await unwrap(window.novi.installAppCommand()));
              setMessage({ section: 'command', text: 'Terminal command configured. Open a new terminal; if necessary, quit and reopen your terminal app.' });
            } finally { setCommand(await unwrap(window.novi.getAppCommandStatus())); }
          })}>{command.state === 'missing' ? 'Install terminal command' : command.state === 'outdated' ? 'Update terminal command' : 'Add command to PATH'}</button>}
          <button className="text-button" type="button" disabled={busy} onClick={() => void run('command', async () => {
            setCommand(await unwrap(window.novi.getAppCommandStatus()));
          })}>Check again</button>
        </div>
        {show('command')}
      </div>
    </section>
  </>;
}

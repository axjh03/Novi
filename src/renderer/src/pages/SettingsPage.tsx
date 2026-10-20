import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, LogOut, Power, Trash2 } from 'lucide-react';
import { DEFAULT_AUDIO_RECORD_SHORTCUT, DEFAULT_BEHAVIORAL_SHORTCUT, DEFAULT_CLICK_THROUGH_SHORTCUT, DEFAULT_CODING_SHORTCUT, DEFAULT_SCREENSHOT_SHORTCUT, DEFAULT_TRANSPARENT_SHORTCUT, type SettingsInput, type Snapshot } from '../../../shared/types';
import { ShortcutField } from '../components/ShortcutField';
import { ProviderManager } from '../components/ProviderManager';
import { DeviceTester } from '../components/DeviceTester';
import { SettingsAppUpdater } from '../components/SettingsAppUpdater';
import { SettingsAppPrivacy } from '../components/SettingsAppPrivacy';
import { DebugPanel } from '../components/DebugPanel';
import { LocalAISetup } from '../components/LocalAISetup';
import { EngineReadinessList } from '../components/LocalCodingSetup';
import { endingWarning } from '../components/TitleBar';
import { errorText, unwrap } from '../services/api';

// Every hotkey is recorded from the keys pressed; each must be different.
const shortcuts = [
  { key: 'clickThroughShortcut', label: 'Interaction toggle shortcut', defaultValue: DEFAULT_CLICK_THROUGH_SHORTCUT, description: 'Press once to enable click-through, then again to restore interaction. Works while transparent mode is on.' },
  { key: 'transparentShortcut', label: 'Transparency toggle shortcut', defaultValue: DEFAULT_TRANSPARENT_SHORTCUT, description: 'Turns transparent stealth mode on or off. While transparent, this is the only way to turn it off.' },
  { key: 'codingModeShortcut', label: 'Coding Mode hotkey', defaultValue: DEFAULT_CODING_SHORTCUT },
  { key: 'behavioralModeShortcut', label: 'Behavioral Interview Mode hotkey', defaultValue: DEFAULT_BEHAVIORAL_SHORTCUT },
  { key: 'screenshotShortcut', label: 'Full-screen capture hotkey', defaultValue: DEFAULT_SCREENSHOT_SHORTCUT },
  { key: 'audioRecordShortcut', label: 'System audio capture hotkey', defaultValue: DEFAULT_AUDIO_RECORD_SHORTCUT },
] as const;

interface Props { state: Snapshot; onSaved: (state: Snapshot) => void; onBack: () => void; onSignOut: () => void; onCleared: () => void }
type Tab = 'general' | 'devices' | 'api' | 'local-ai' | 'debug';
const tabs: Array<[Tab, string]> = [['general', 'General'], ['api', 'API Management'], ['local-ai', 'Local AI'], ['devices', 'Audio & Camera'], ['debug', 'Debug']];
const themes = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const;

export function SettingsPage({ state, onSaved, onBack, onSignOut, onCleared }: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [value, setValue] = useState<SettingsInput>({
    ...state.settings!,
    clickThroughShortcut: state.settings!.clickThroughShortcut || DEFAULT_CLICK_THROUGH_SHORTCUT,
    transparentShortcut: state.settings!.transparentShortcut || DEFAULT_TRANSPARENT_SHORTCUT,
    audioPipelineMode: state.settings!.audioPipelineMode || 'local_stt',
    codingModeShortcut: state.settings!.codingModeShortcut || 'Alt+C',
    behavioralModeShortcut: state.settings!.behavioralModeShortcut || 'Alt+B',
    screenshotShortcut: state.settings!.screenshotShortcut || 'Alt+3',
    audioRecordShortcut: state.settings!.audioRecordShortcut || 'Alt+A',
    fastInterviewModel: state.settings!.fastInterviewModel ?? false,
    checkUpdatesAtStartup: state.settings!.checkUpdatesAtStartup ?? true,
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false), [leaving, setLeaving] = useState(false), [accountError, setAccountError] = useState('');
  // Which account action is waiting for confirmation: both end the session and drop unsent work.
  const [accountConfirm, setAccountConfirm] = useState<'sign-out' | 'quit' | null>(null);

  function change(next: SettingsInput) { setValue(next); setSaved(false); setDirty(true); }
  function shortcutField({ key, label, defaultValue, description }: typeof shortcuts[number] & { description?: string }) {
    return <ShortcutField key={key} label={label} value={value[key] || defaultValue} defaultValue={defaultValue} description={description}
      onChange={(shortcut) => change({ ...value, [key]: shortcut })}
      others={shortcuts.filter((other) => other.key !== key).map((other) => ({ label: other.label, value: value[other.key] || other.defaultValue }))} />;
  }

  async function save(event?: FormEvent) {
    if (event) event.preventDefault();
    setBusy(true); setError('');
    try {
      const updated = await unwrap(window.novi.saveSettings(value));
      onSaved(updated);
      setValue({ ...updated.settings! });
      setSaved(true); setDirty(false);
      return true;
    } catch (err) {
      setError(errorText(err));
      setTab('general'); setLeaving(false);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true); setAccountError('');
    try {
      await unwrap(window.novi.clearHistory());
      onSaved(await unwrap(window.novi.session()));
      onCleared();
      setConfirm(false);
    } catch (err) {
      setAccountError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-page">
      <header>
        <button className="text-button" onClick={() => dirty ? setLeaving(true) : onBack()} disabled={busy}>
          <ArrowLeft size={16} />Back
        </button>
        {leaving && dirty ? <div className="settings-leave" role="alert">
          <span>You have unsaved changes.</span>
          <button type="button" className="text-button" disabled={busy} onClick={onBack}>Discard</button>
          <button type="button" className="primary" disabled={busy} onClick={() => void save().then(ok => { if (ok) onBack(); })}>{busy ? 'Saving…' : 'Save and go back'}</button>
        </div> : <span className="eyebrow">MAKE IT YOURS</span>}
      </header>

      {/* One width for every tab, so the page doesn't shift sideways when switching. */}
      <div className="settings-content">
        <h1>Settings</h1>
        <p className="muted">Your account, shortcuts, AI connections and devices.</p>

        <div className="segmented settings-tabs" aria-label="Settings tabs">
          {tabs.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
        </div>

        {tab === 'local-ai' && <LocalAISetup onSettingsSaved={(updated, modelId) => {
          onSaved(updated);
          setValue(current => ({ ...current, localASRModelId: modelId }));
        }} />}
        {/* Tab 1: General */}
        {tab === 'general' && (
          <>
            <form onSubmit={save}>
              <fieldset disabled={busy}>
                <section className="settings-section">
                  <div>
                    <h2>Profile</h2>
                    <p>How Novi greets you.</p>
                  </div>
                  <div className="settings-fields">
                    <dl className="settings-info">
                      <div><dt>Display name</dt><dd>{value.displayName}</dd></div>
                      <div><dt>Username</dt><dd>{state.user!.username || state.user!.email}</dd></div>
                      {state.user?.licenseKey && <div><dt>License</dt><dd><code>{state.user.licenseKey}</code>
                        <small>Expires {new Date(state.user.licenseExpiresAt!).toLocaleDateString()} · {Math.max(0, Math.ceil((+new Date(state.user.licenseExpiresAt!) - Date.now()) / 86400000))} days left</small></dd></div>}
                    </dl>
                  </div>
                </section>

                <section className="settings-section">
                  <div>
                    <h2>Visibility</h2>
                    <p>Hide Novi from screen sharing and let clicks pass through it.</p>
                  </div>
                  <div className="settings-fields settings-fields-interaction">
                    {shortcuts.slice(0, 2).map(shortcutField)}
                  </div>
                </section>

                <section className="settings-section">
                  <div>
                    <h2>Hotkeys</h2>
                    <p>Work from anywhere, even while Novi is in the background.</p>
                  </div>
                  <div className="settings-fields settings-fields-interaction">
                    {shortcuts.slice(2).map(shortcutField)}
                  </div>
                </section>

                <section className="settings-section">
                  <div>
                    <h2>Appearance</h2>
                    <p>Set the mood.</p>
                  </div>
                  <div className="settings-fields">
                    <div className="segmented settings-theme" role="group" aria-label="Theme">
                      {themes.map(([id, label]) => <button key={id} type="button" aria-pressed={value.theme === id} className={value.theme === id ? 'active' : ''} onClick={() => change({ ...value, theme: id })}>{label}</button>)}
                    </div>
                  </div>
                </section>

                <section className="settings-section">
                  <div>
                    <h2>Updates</h2>
                    <p>Keep Novi current.</p>
                  </div>
                  <div className="settings-fields">
                    <SettingsAppUpdater
                      value={value}
                      onChange={change}
                      disabled={busy}
                    />
                  </div>
                </section>

                <div className={`settings-save ${dirty ? 'is-dirty' : ''}`}>
                  {error ? <div className="error" role="alert">{error}</div> : <span role="status">{dirty ? 'Unsaved changes' : saved && <><Check size={15} />Changes saved</>}</span>}
                  <button className="primary" type="submit" disabled={!dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
                </div>
              </fieldset>
            </form>

            <SettingsAppPrivacy />

            <section className="settings-section">
              <div>
                <h2>Data & account</h2>
                <p>Your history, your sign-in, and quitting the app.</p>
              </div>
              <div className="settings-fields">
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => setConfirm(true)}
                >
                  <Trash2 size={16} />Clear conversation history
                </button>
                {confirm && (
                  <div className="confirmation" role="alert">
                    <p>Delete all saved conversations and their local image copies? {state.contextSession ? 'Loaded reference context stays active until you end the session. ' : ''}This cannot be undone.</p>
                    <div>
                      <button className="text-button" onClick={() => setConfirm(false)}>Cancel</button>
                      <button className="danger-button" onClick={() => void clear()} disabled={busy}>Delete all conversations</button>
                    </div>
                  </div>
                )}
                <div className="settings-account-actions">
                  <button className="secondary" disabled={busy} onClick={() => setAccountConfirm('sign-out')}>
                    <LogOut size={16} />Sign out
                  </button>
                  <button className="secondary" type="button" disabled={busy} onClick={() => setAccountConfirm('quit')}><Power size={16} />Quit Novi</button>
                </div>
                {accountConfirm && (
                  <div className="confirmation" role="alert">
                    <p>{accountConfirm === 'quit' ? 'Quit Novi?' : 'Sign out?'} {endingWarning(Boolean(state.contextSession))}</p>
                    <div>
                      <button className="text-button" autoFocus onClick={() => setAccountConfirm(null)}>Cancel</button>
                      {accountConfirm === 'quit'
                        ? <button className="danger-button" disabled={busy} onClick={() => {
                          setAccountConfirm(null);
                          void unwrap(window.novi.quitApp()).catch(err => setAccountError(errorText(err)));
                        }}>Quit Novi</button>
                        : <button className="danger-button" disabled={busy} onClick={() => { setAccountConfirm(null); onSignOut(); }}>Sign out</button>}
                    </div>
                  </div>
                )}
                {accountError && <p className="error" role="alert">{accountError}</p>}
              </div>
            </section>
          </>
        )}

        {tab === 'devices' && <DeviceTester />}
        {tab === 'debug' && <DebugPanel />}

        {tab === 'api' && <div className="settings-studio api-studio">
          <ProviderManager state={state} onSaved={onSaved} />
          <EngineReadinessList connections={state.settings?.connections} managed={Boolean(state.user?.managed)} />
        </div>}
      </div>
    </main>
  );
}

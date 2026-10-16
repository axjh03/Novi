import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, LogOut, Trash2 } from 'lucide-react';
import { DEFAULT_AUDIO_RECORD_SHORTCUT, DEFAULT_BEHAVIORAL_SHORTCUT, DEFAULT_CLICK_THROUGH_SHORTCUT, DEFAULT_CODING_SHORTCUT, DEFAULT_SCREENSHOT_SHORTCUT, DEFAULT_TRANSPARENT_SHORTCUT, type SettingsInput, type Snapshot } from '../../../shared/types';
import { ShortcutField } from '../components/ShortcutField';
import { ProviderManager } from '../components/ProviderManager';
import { DeviceTester } from '../components/DeviceTester';
import { SettingsAppUpdater } from '../components/SettingsAppUpdater';
import { SettingsAppPrivacy } from '../components/SettingsAppPrivacy';
import { LocalAISetup } from '../components/LocalAISetup';
import { EngineReadinessList } from '../components/LocalCodingSetup';
import { errorText, unwrap } from '../services/api';

// Every hotkey is recorded from the keys pressed; each must be different.
const shortcuts = [
  { key: 'clickThroughShortcut', label: 'Interaction toggle shortcut', defaultValue: DEFAULT_CLICK_THROUGH_SHORTCUT, description: 'Press once to enable click-through, then again to restore interaction. Works while transparent mode is on.' },
  { key: 'transparentShortcut', label: 'Transparency toggle shortcut', defaultValue: DEFAULT_TRANSPARENT_SHORTCUT, description: 'Turns transparent stealth mode on or off. While transparent, this is the only way to turn it off.' },
  { key: 'codingModeShortcut', label: 'Coding Mode hotkey', defaultValue: DEFAULT_CODING_SHORTCUT, description: 'Opens the movable code viewer.' },
  { key: 'behavioralModeShortcut', label: 'Behavioral Interview Mode hotkey', defaultValue: DEFAULT_BEHAVIORAL_SHORTCUT, description: 'Activates Behavioral Interview Studio with STAR framework guides and candidate story bank.' },
  { key: 'screenshotShortcut', label: 'Full-screen capture hotkey', defaultValue: DEFAULT_SCREENSHOT_SHORTCUT, description: 'Takes a full-screen screenshot and attaches it to the chat composer.' },
  { key: 'audioRecordShortcut', label: 'System audio capture hotkey', defaultValue: DEFAULT_AUDIO_RECORD_SHORTCUT, description: 'Captures desktop playback without opening your microphone. Saves locally and then transcribes or attaches it.' },
] as const;

interface Props { state: Snapshot; onSaved: (state: Snapshot) => void; onBack: () => void; onSignOut: () => void; onCleared: () => void }

export function SettingsPage({ state, onSaved, onBack, onSignOut, onCleared }: Props) {
  const [tab, setTab] = useState<'general' | 'devices' | 'api' | 'local-ai'>('general');
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

  function change(next: SettingsInput) { setValue(next); setSaved(false); }
  function shortcutField({ key, label, defaultValue, description }: typeof shortcuts[number]) {
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
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true); setError('');
    try {
      await unwrap(window.novi.clearHistory());
      onSaved(await unwrap(window.novi.session()));
      onCleared();
      setConfirm(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-page">
      <header>
        <button className="text-button" onClick={onBack} disabled={busy}>
          <ArrowLeft size={16} />Back
        </button>
        <span className="eyebrow">MAKE IT YOURS</span>
      </header>

      <div className={`settings-content ${tab === 'general' ? '' : 'settings-content-wide'}`}>
        <h1>Settings</h1>
        <p className="muted">Configure your audio devices, AI models, and interaction preferences.</p>

        {/* Navigation Tabs */}
        <div className="segmented settings-tabs" aria-label="Settings tabs">
          <button type="button" aria-pressed={tab === 'local-ai'} className={tab === 'local-ai' ? 'active' : ''} onClick={() => setTab('local-ai')}>Local AI</button>
          <button
            type="button"
            aria-pressed={tab === 'general'}
            className={tab === 'general' ? 'active' : ''}
            onClick={() => setTab('general')}
          >
            General
          </button>
          <button
            type="button"
            aria-pressed={tab === 'devices'}
            className={tab === 'devices' ? 'active' : ''}
            onClick={() => setTab('devices')}
          >
            Audio & Camera
          </button>
          <button
            type="button"
            aria-pressed={tab === 'api'}
            className={tab === 'api' ? 'active' : ''}
            onClick={() => setTab('api')}
          >
            API Management
          </button>
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
                    <p>A familiar face.</p>
                  </div>
                  <div className="settings-fields">
                    <label>
                      Display name
                      <input
                        value={value.displayName}
                        onChange={(e) => change({ ...value, displayName: e.target.value })}
                        required
                        maxLength={60}
                      />
                    </label>
                    <label>
                      Username
                      <input value={state.user!.username || state.user!.email} readOnly />
                      <small>Your assigned desktop account.</small>
                    </label>
                    {state.user?.licenseKey && (
                      <label>
                        License
                        <input readOnly value={state.user.licenseKey} />
                        <small>
                          Expires {new Date(state.user.licenseExpiresAt!).toLocaleString()} •{' '}
                          {Math.max(0, Math.ceil((+new Date(state.user.licenseExpiresAt!) - Date.now()) / 86400000))} days remaining
                        </small>
                      </label>
                    )}
                  </div>
                </section>

                <section className="settings-section">
                  <div>
                    <h2>Interaction</h2>
                    <p>One shortcut toggles both modes.</p>
                  </div>
                  <div className="settings-fields settings-fields-interaction">
                    {shortcuts.slice(0, 2).map(shortcutField)}
                    <label className="settings-toggle">
                      <input type="checkbox" checked={value.transparentOnStart === true}
                        onChange={(e) => change({ ...value, transparentOnStart: e.target.checked })} />
                      Start sessions in Transparent mode
                      <small>Asks the operating system to exclude Novi from capture when a session starts. Results vary by OS and sharing app and are not guaranteed.</small>
                    </label>
                    {shortcuts.slice(2).map(shortcutField)}
                  </div>
                </section>

                <section className="settings-section">
                  <div>
                    <h2>Appearance</h2>
                    <p>Set the mood.</p>
                  </div>
                  <div className="settings-fields">
                    <label>
                      Theme
                      <select
                        value={value.theme}
                        onChange={(e) => change({ ...value, theme: e.target.value as SettingsInput['theme'] })}
                      >
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="settings-section">
                  <div>
                    <h2>Application updates</h2>
                    <p>Manage app version and updates.</p>
                  </div>
                  <div className="settings-fields">
                    <SettingsAppUpdater
                      value={value}
                      onChange={change}
                      disabled={busy}
                    />
                  </div>
                </section>

                {error && <div className="error" role="alert">{error}</div>}

                <div className="settings-save">
                  <span role="status">{saved && <><Check size={15} />Changes saved</>}</span>
                  <button className="primary" type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
                </div>
              </fieldset>
            </form>

            <SettingsAppPrivacy />

            <section className="settings-section">
              <div>
                <h2>Data & account</h2>
                <p>Always in your hands.</p>
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
                <button className="text-button" disabled={busy} onClick={onSignOut}>
                  <LogOut size={16} />Sign out
                </button>
              </div>
            </section>
          </>
        )}

        {tab === 'devices' && <DeviceTester />}

        {tab === 'api' && <>
          <ProviderManager state={state} onSaved={onSaved} />
          <section className="settings-section lc-settings">
            <div><h2>Local Coding agents</h2><p>Install or update agents here. Codex uses your saved OpenAI API key, Claude uses Anthropic, and Antigravity uses Gemini, each on its official endpoint. Check login verifies the selected key; no separate browser sign-in is needed.</p></div>
            <EngineReadinessList connections={state.settings?.connections} />
          </section>
        </>}
        <button className="danger-button" type="button" onClick={() => {
          void unwrap(window.novi.quitApp()).catch(err => setError(errorText(err)));
        }}>Quit Novi</button>
        {tab !== 'general' && error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  );
}

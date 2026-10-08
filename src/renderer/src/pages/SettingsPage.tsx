import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, LogOut, Trash2 } from 'lucide-react';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, DEFAULT_TRANSPARENT_SHORTCUT, type SettingsInput, type Snapshot } from '../../../shared/types';
import { ProviderManager } from '../components/ProviderManager';
import { DeviceTester } from '../components/DeviceTester';
import { SettingsAppUpdater } from '../components/SettingsAppUpdater';
import { LocalAISetup } from '../components/LocalAISetup';
import { errorText, unwrap } from '../services/api';

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
    autoSendOnAudioStop: state.settings!.autoSendOnAudioStop ?? false,
    fastInterviewModel: state.settings!.fastInterviewModel ?? false,
    checkUpdatesAtStartup: state.settings!.checkUpdatesAtStartup ?? true,
    autoStartEmptySession: state.settings!.autoStartEmptySession ?? false,
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [confirm, setConfirm] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false), [shortcutHint, setShortcutHint] = useState('');
  const shortcutInput = useRef<HTMLInputElement>(null);

  function change(next: SettingsInput) { setValue(next); setSaved(false); }

  function captureShortcut(event: KeyboardEvent<HTMLInputElement>) {
    event.preventDefault();
    if (event.key === 'Escape') { setRecordingShortcut(false); setShortcutHint('Shortcut recording cancelled.'); return; }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
    const keyAliases: Record<string, string> = { ' ': 'Space', Enter: 'Return', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', PageUp: 'PageUp', PageDown: 'PageDown' };
    const rawKey = keyAliases[event.key] || event.key;
    const key = /^[a-z]$/i.test(rawKey) ? rawKey.toUpperCase() : rawKey;
    if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Backspace|Delete|Insert|Return|Esc|Up|Down|Left|Right|Home|End|PageUp|PageDown|NumLock)$/.test(key)) {
      setShortcutHint('That key is not supported. Try a letter, number, or function key.');
      return;
    }
    const modifiers = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'].filter(Boolean);
    if (!modifiers.length) { setShortcutHint('Include at least one modifier key, such as Ctrl, Alt, or Shift.'); return; }
    const shortcut = [...modifiers, key].join('+');
    change({ ...value, clickThroughShortcut: shortcut });
    setRecordingShortcut(false);
    setShortcutHint(`Captured ${shortcut}. Save changes to apply it.`);
  }

  async function save(event?: FormEvent) {
    if (event) event.preventDefault();
    setBusy(true); setError('');
    try {
      const updated = await unwrap(window.novi.saveSettings(value));
      onSaved(updated);
      setValue({ ...updated.settings! });
      setSaved(true);
      setShortcutHint('');
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
                  <div className="settings-fields">
                    <label>
                      Interaction toggle shortcut
                      <div className="shortcut-setting">
                        <input
                          ref={shortcutInput}
                          className="shortcut-input"
                          value={recordingShortcut ? 'Press your key combination…' : value.clickThroughShortcut}
                          readOnly
                          onKeyDown={captureShortcut}
                          onBlur={() => setRecordingShortcut(false)}
                        />
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => {
                            setRecordingShortcut(true);
                            setShortcutHint('Press a key combination with Ctrl, Alt, Shift, or the Windows key.');
                            shortcutInput.current?.focus();
                          }}
                        >
                          Record shortcut
                        </button>
                      </div>
                      <small>
                        {shortcutHint || 'Press once to enable click-through, then press it again to restore interaction. Works while transparent mode is on. Save changes to apply.'}
                      </small>
                    </label>

                    <label>
                      Transparency toggle shortcut
                      <input
                        className="shortcut-input"
                        value={value.transparentShortcut || DEFAULT_TRANSPARENT_SHORTCUT}
                        onChange={(e) => change({ ...value, transparentShortcut: e.target.value })}
                        placeholder="e.g. Option+Control+T or Home+PageUp"
                      />
                      <small>Toggles transparent stealth mode on or off. Default: {DEFAULT_TRANSPARENT_SHORTCUT}.</small>
                    </label>

                    <label>
                      Coding Mode hotkey
                      <input
                        className="shortcut-input"
                        value={value.codingModeShortcut || 'Alt+C'}
                        onChange={(e) => change({ ...value, codingModeShortcut: e.target.value })}
                        placeholder="e.g. Alt+C"
                      />
                      <small>Opens the movable code viewer. Default: Alt+C (Option+C on Mac).</small>
                    </label>

                    <label>
                      Behavioral Interview Mode hotkey
                      <input
                        className="shortcut-input"
                        value={value.behavioralModeShortcut || 'Alt+B'}
                        onChange={(e) => change({ ...value, behavioralModeShortcut: e.target.value })}
                        placeholder="e.g. Alt+B"
                      />
                      <small>Activates Behavioral Interview Studio with STAR framework guides and candidate story bank. Default: Alt+B (Option+B on Mac).</small>
                    </label>

                    <label>
                      Full-screen capture hotkey
                      <input
                        className="shortcut-input"
                        value={value.screenshotShortcut || 'Alt+3'}
                        onChange={(e) => change({ ...value, screenshotShortcut: e.target.value })}
                        placeholder="e.g. Alt+3"
                      />
                      <small>Takes a full-screen screenshot and attaches it to the chat composer. Default: Alt+3 (Option+3 on Mac).</small>
                    </label>

                    <label>
                      System audio capture hotkey
                      <input
                        className="shortcut-input"
                        value={value.audioRecordShortcut || 'Alt+A'}
                        onChange={(e) => change({ ...value, audioRecordShortcut: e.target.value })}
                        placeholder="e.g. Alt+A"
                      />
                      <small>Captures desktop playback without opening your microphone. Saves locally and then transcribes or attaches it. Default: Alt+A (Option+A on Mac).</small>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(value.autoSendOnAudioStop)}
                        onChange={(e) => change({ ...value, autoSendOnAudioStop: e.target.checked })}
                        style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                      />
                      <div>
                        <strong>Send transcript automatically</strong>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                          When transcription finishes, send the text as a new message.
                        </div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(value.fastInterviewModel)}
                        onChange={(e) => change({ ...value, fastInterviewModel: e.target.checked })}
                        style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                      />
                      <div>
                        <strong>Use a faster interview model</strong>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                          Choose a smaller model when Interview mode is active.
                        </div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(value.autoStartEmptySession)}
                        onChange={(e) => change({ ...value, autoStartEmptySession: e.target.checked })}
                        style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                      />
                      <div>
                        <strong>Auto-start empty session on sign-in</strong>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                          Jump straight into chat with your active model when you sign in, without requiring source folders.
                        </div>
                      </div>
                    </label>
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

        {tab === 'api' && <ProviderManager state={state} onSaved={onSaved} />}
      </div>
    </main>
  );
}

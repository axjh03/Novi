import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, LogOut, Trash2, Mic, Video, Cpu, Zap, Radio, ShieldCheck, KeyRound, Sparkles } from 'lucide-react';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, type SettingsInput, type Snapshot, type AudioPipelineMode } from '../../../shared/types';
import { ProviderManager } from '../components/ProviderManager';
import { DeviceTester } from '../components/DeviceTester';
import { errorText, unwrap } from '../services/api';

interface Props { state: Snapshot; onSaved: (state: Snapshot) => void; onBack: () => void; onSignOut: () => void; onCleared: () => void }

export function SettingsPage({ state, onSaved, onBack, onSignOut, onCleared }: Props) {
  const [tab, setTab] = useState<'general' | 'pipeline' | 'devices' | 'api'>('general');
  const [value, setValue] = useState<SettingsInput>({
    ...state.settings!,
    clickThroughShortcut: state.settings!.clickThroughShortcut || DEFAULT_CLICK_THROUGH_SHORTCUT,
    audioPipelineMode: state.settings!.audioPipelineMode || 'local_stt',
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

      <div className="settings-content">
        <h1>Settings</h1>
        <p className="muted">Configure your audio devices, AI models, and interaction preferences.</p>

        {/* Navigation Tabs */}
        <div className="segmented settings-tabs" aria-label="Settings tabs" style={{ maxWidth: 640 }}>
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
            aria-pressed={tab === 'pipeline'}
            className={tab === 'pipeline' ? 'active' : ''}
            onClick={() => setTab('pipeline')}
          >
            AI Pipeline
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
                  disabled={busy || !state.contextSession}
                  onClick={() => setConfirm(true)}
                >
                  <Trash2 size={16} />Clear session conversations
                </button>
                {confirm && (
                  <div className="confirmation" role="alert">
                    <p>Delete this session’s conversations and their local image copies? Loaded reference context stays active until you end the session. This cannot be undone.</p>
                    <div>
                      <button className="text-button" onClick={() => setConfirm(false)}>Cancel</button>
                      <button className="danger-button" onClick={() => void clear()} disabled={busy}>Delete session conversations</button>
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

        {/* Tab 2: AI Pipeline Mode */}
        {tab === 'pipeline' && (
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <section className="settings-section">
                <div>
                  <h2>Audio & AI Pipeline</h2>
                  <p>Choose how spoken audio is processed and sent to your models.</p>
                </div>
                <div className="settings-fields" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Mode 1: Local STT -> Text Stream (Recommended) */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                      background: value.audioPipelineMode === 'local_stt' ? 'var(--selected)' : 'var(--surface)',
                      border: value.audioPipelineMode === 'local_stt' ? '1px solid var(--accent)' : '1px solid var(--border, #e5e5e5)',
                      borderRadius: 12,
                      padding: '18px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease-in-out',
                    }}
                  >
                    <input
                      type="radio"
                      name="pipelineMode"
                      checked={value.audioPipelineMode === 'local_stt'}
                      onChange={() => change({ ...value, audioPipelineMode: 'local_stt' })}
                      style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--button)', minHeight: 18, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 15 }}>Local Audio STT → Stream Text</strong>
                        <span style={{
                          background: 'var(--selected)', color: 'var(--accent)', fontSize: 10, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 4, letterSpacing: '0.04em'
                        }}>
                          ⚡ FASTEST (~400ms)
                        </span>
                        <span style={{
                          background: 'var(--panel)', color: 'var(--muted)', fontSize: 10, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 4
                        }}>
                          🔒 100% PRIVATE AUDIO
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--muted, #666)', margin: '0 0 10px', lineHeight: 1.5 }}>
                        Converts spoken system audio to text locally using on-device Whisper. Only the transcription text is sent to your configured OpenAI, Claude, or Gemini model, returning streaming text answers almost instantaneously.
                      </p>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div>• <b>Zero Audio Upload Lag:</b> No heavy WAV audio transferred across the internet.</div>
                        <div>• <b>Zero Audio API Surcharges:</b> Transcription is 100% free; only pay standard text tokens.</div>
                        <div>• Compatible with all <b>OpenAI, Claude, and Gemini</b> chat models.</div>
                      </div>
                    </div>
                  </label>

                  {/* Mode 2: Live Audio Streaming */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                      background: value.audioPipelineMode === 'live_stream' ? 'var(--selected)' : 'var(--surface)',
                      border: value.audioPipelineMode === 'live_stream' ? '1px solid var(--accent)' : '1px solid var(--border, #e5e5e5)',
                      borderRadius: 12,
                      padding: '18px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease-in-out',
                    }}
                  >
                    <input
                      type="radio"
                      name="pipelineMode"
                      checked={value.audioPipelineMode === 'live_stream'}
                      onChange={() => change({ ...value, audioPipelineMode: 'live_stream' })}
                      style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--button)', minHeight: 18, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 15 }}>Live Audio Streaming (Realtime Multimodal)</strong>
                        <span style={{
                          background: 'var(--selected)', color: 'var(--accent)', fontSize: 10, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 4, letterSpacing: '0.04em'
                        }}>
                          🎙️ REALTIME WEBSOCKET
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--muted, #666)', margin: '0 0 10px', lineHeight: 1.5 }}>
                        Streams system audio continuously via WebSockets directly to multimodal realtime endpoints (OpenAI Realtime API or Gemini 2.0 Live) to evaluate live inflection, natural speaking cadence, and stream text answers back.
                      </p>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div>• <b>Speech-to-Text streaming:</b> Natural voice interruption support.</div>
                        <div>• Best paired with <b>OpenAI Realtime (gpt-4o-realtime-preview)</b> and <b>Gemini 2.0 Flash</b>.</div>
                        <div>• Requires higher network bandwidth and standard provider audio-in minute rates.</div>
                      </div>
                    </div>
                  </label>
                </div>
              </section>

              {error && <div className="error" role="alert">{error}</div>}

              <div className="settings-save">
                <span role="status">{saved && <><Check size={15} />Changes saved</>}</span>
                <button className="primary" type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </fieldset>
          </form>
        )}

        {/* Tab 3: Device Testing (Audio & Camera) */}
        {tab === 'devices' && <DeviceTester />}

        {/* Tab 4: API Management (OpenAI, Claude, Gemini) */}
        {tab === 'api' && (
          <div>
            <div style={{
              background: 'var(--panel)',
              border: '1px solid var(--border, #e5e5e5)',
              borderRadius: 10,
              padding: '14px 18px',
              marginBottom: 24,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <ShieldCheck size={18} color="var(--accent)" />
              <div>
                <strong>Supported Providers:</strong> Novi exclusively supports <b>OpenAI</b>, <b>Anthropic (Claude)</b>, and <b>Google (Gemini)</b>. Add your keys below.
              </div>
            </div>
            <ProviderManager state={state} onSaved={onSaved} />
          </div>
        )}
      </div>
    </main>
  );
}

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, LogOut, Trash2 } from 'lucide-react';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, type SettingsInput, type Snapshot } from '../../../shared/types';
import { ProviderManager } from '../components/ProviderManager';
import { errorText, unwrap } from '../services/api';

interface Props { state: Snapshot; onSaved: (state: Snapshot) => void; onBack: () => void; onSignOut: () => void; onCleared: () => void }
export function SettingsPage({ state, onSaved, onBack, onSignOut, onCleared }: Props) {
  const [tab, setTab] = useState<'general' | 'api'>('general');
  const [value, setValue] = useState<SettingsInput>({ ...state.settings!, clickThroughShortcut: state.settings!.clickThroughShortcut || DEFAULT_CLICK_THROUGH_SHORTCUT });
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
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const updated = await unwrap(window.novi.saveSettings(value)); onSaved(updated); setValue({ ...updated.settings! }); setSaved(true); setShortcutHint(''); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setError('');
    try { await unwrap(window.novi.clearHistory()); onCleared(); setConfirm(false); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <main className="settings-page"><header><button className="text-button" onClick={onBack} disabled={busy}><ArrowLeft size={16} />Back</button><span className="eyebrow">MAKE IT YOURS</span></header><div className="settings-content"><h1>Settings</h1><p className="muted">Your space, just the way you like it.</p><div className="segmented settings-tabs" aria-label="Settings tabs"><button type="button" aria-pressed={tab === "general"} className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>General</button><button type="button" aria-pressed={tab === "api"} className={tab === "api" ? "active" : ""} onClick={() => setTab("api")}>API management</button></div>{tab === "api" ? <ProviderManager state={state} onSaved={onSaved} /> : <><form onSubmit={save}><fieldset disabled={busy}>

    <section className="settings-section"><div><h2>Profile</h2><p>A familiar face.</p></div><div className="settings-fields"><label>Display name<input value={value.displayName} onChange={(e) => change({ ...value, displayName: e.target.value })} required maxLength={60} /></label><label>Username<input value={state.user!.username || state.user!.email} readOnly /><small>Your assigned desktop account.</small></label>{state.user?.licenseKey && <label>License<input readOnly value={state.user.licenseKey} /><small>Expires {new Date(state.user.licenseExpiresAt!).toLocaleString()} ? {Math.max(0, Math.ceil((+new Date(state.user.licenseExpiresAt!) - Date.now()) / 86400000))} days remaining</small></label>}</div></section>
    <section className="settings-section"><div><h2>Interaction</h2><p>One shortcut toggles both modes.</p></div><div className="settings-fields"><label>Interaction toggle shortcut<div className="shortcut-setting"><input ref={shortcutInput} className="shortcut-input" value={recordingShortcut ? 'Press your key combination…' : value.clickThroughShortcut} readOnly onKeyDown={captureShortcut} onBlur={() => setRecordingShortcut(false)} /><button className="text-button" type="button" onClick={() => { setRecordingShortcut(true); setShortcutHint('Press a key combination with Ctrl, Alt, Shift, or the Windows key.'); shortcutInput.current?.focus(); }}>Record shortcut</button></div><small>{shortcutHint || 'Press once to enable click-through, then press it again to restore interaction. Works while transparent mode is on. Save changes to apply.'}</small></label></div></section>
    <section className="settings-section"><div><h2>Appearance</h2><p>Set the mood.</p></div><div className="settings-fields"><label>Theme<select value={value.theme} onChange={(e) => change({ ...value, theme: e.target.value as SettingsInput['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div></section>
    {error && <div className="error" role="alert">{error}</div>}<div className="settings-save"><span role="status">{saved && <><Check size={15} />Changes saved</>}</span><button className="primary" type="submit">{busy ? 'Saving…' : 'Save changes'}</button></div>
  </fieldset></form><section className="settings-section"><div><h2>Data & account</h2><p>Always in your hands.</p></div><div className="settings-fields"><button className="danger-button" disabled={busy || !state.contextSession} onClick={() => setConfirm(true)}><Trash2 size={16} />Clear session conversations</button>{confirm && <div className="confirmation" role="alert"><p>Delete this session’s conversations and their local image copies? Loaded reference context stays active until you end the session. This cannot be undone.</p><div><button className="text-button" onClick={() => setConfirm(false)}>Cancel</button><button className="danger-button" onClick={() => void clear()} disabled={busy}>Delete session conversations</button></div></div>}<button className="text-button" disabled={busy} onClick={onSignOut}><LogOut size={16} />Sign out</button></div></section></>}</div></main>;
}

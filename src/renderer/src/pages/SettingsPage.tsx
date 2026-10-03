import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, LogOut, Trash2 } from 'lucide-react';
import type { SettingsInput, Snapshot } from '../../../shared/types';
import { ProviderManager } from '../components/ProviderManager';
import { errorText, unwrap } from '../services/api';

interface Props { state: Snapshot; onSaved: (state: Snapshot) => void; onBack: () => void; onSignOut: () => void; onCleared: () => void }
export function SettingsPage({ state, onSaved, onBack, onSignOut, onCleared }: Props) {
  const [value, setValue] = useState<SettingsInput>({ ...state.settings! });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [confirm, setConfirm] = useState(false);
  function change(next: SettingsInput) { setValue(next); setSaved(false); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const updated = await unwrap(window.novi.saveSettings(value)); onSaved(updated); setValue({ ...updated.settings! }); setSaved(true); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setError('');
    try { await unwrap(window.novi.clearHistory()); onCleared(); setConfirm(false); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <main className="settings-page"><header><button className="text-button" onClick={onBack} disabled={busy}><ArrowLeft size={16} />Back</button><span className="eyebrow">MAKE IT YOURS</span></header><div className="settings-content"><h1>Settings</h1><p className="muted">Your space, just the way you like it.</p>{state.contextSession ? <p className="muted">End this session to change AI providers or models.</p> : <ProviderManager state={state} onSaved={onSaved} />}<form onSubmit={save}><fieldset disabled={busy}>

    <section className="settings-section"><div><h2>Profile</h2><p>A familiar face.</p></div><div className="settings-fields"><label>Display name<input value={value.displayName} onChange={(e) => change({ ...value, displayName: e.target.value })} required maxLength={60} /></label><label>Email<input value={state.user!.email} type="email" readOnly /><small>Your local account identifier.</small></label></div></section>
    <section className="settings-section"><div><h2>Appearance</h2><p>Set the mood.</p></div><div className="settings-fields"><label>Theme<select value={value.theme} onChange={(e) => change({ ...value, theme: e.target.value as SettingsInput['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div></section>
    {error && <div className="error" role="alert">{error}</div>}<div className="settings-save"><span role="status">{saved && <><Check size={15} />Changes saved</>}</span><button className="primary" type="submit">{busy ? 'Saving…' : 'Save changes'}</button></div>
  </fieldset></form><section className="settings-section"><div><h2>Data & account</h2><p>Always in your hands.</p></div><div className="settings-fields"><button className="danger-button" disabled={busy || !state.contextSession} onClick={() => setConfirm(true)}><Trash2 size={16} />Clear session conversations</button>{confirm && <div className="confirmation" role="alert"><p>Delete this session’s conversations and their local image copies? Loaded reference context stays active until you end the session. This cannot be undone.</p><div><button className="text-button" onClick={() => setConfirm(false)}>Cancel</button><button className="danger-button" onClick={() => void clear()} disabled={busy}>Delete session conversations</button></div></div>}<button className="text-button" disabled={busy} onClick={onSignOut}><LogOut size={16} />Sign out</button></div></section></div></main>;
}

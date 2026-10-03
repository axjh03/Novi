import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import type { SettingsInput, Snapshot } from '../../../shared/types';
import { newConnection } from '../../../shared/providers';
import { Brand } from '../components/Brand';
import { ProviderFields } from '../components/ProviderFields';
import { unwrap, errorText } from '../services/api';

const titles = ['Welcome to Novi.', 'Your AI, your choice.', 'Bring your own key.', 'Choose your thinking partner.'];
const descriptions = ['First things first. What should Novi call you?', 'Connect to a provider you love, or a model running on your device.', 'A direct connection between you and your AI provider.', 'Pick a model to start. You can always change it in Settings.'];
export function OnboardingPage({ state, onComplete, onSignOut }: { state: Snapshot; onComplete: (state: Snapshot) => void; onSignOut: () => void }) {
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [value, setValue] = useState<SettingsInput>({ displayName: state.settings!.displayName, theme: state.settings!.theme, connection: newConnection() });
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (step < 3) { setStep(step + 1); return; }
    setBusy(true);
    try { onComplete(await unwrap(window.novi.saveSettings(value))); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <div className="onboarding"><header><Brand /><button className="text-button" onClick={onSignOut} disabled={busy}>Sign out</button></header><main className="setup-card"><div className="step-track" aria-label={`Step ${step + 1} of 4`}>{['You', 'Provider', 'API key', 'Model'].map((label, index) => <div key={label} className={index <= step ? 'reached' : ''}><span>{index < step ? <Check size={13} /> : index + 1}</span>{label}</div>)}</div><span className="eyebrow">LET’S MAKE THIS YOURS · 0{step + 1}</span><h1>{titles[step]}</h1><p className="muted setup-description">{descriptions[step]}</p><form onSubmit={submit}><fieldset disabled={busy}>
    {step === 0 ? <label>Display name<input autoFocus value={value.displayName} onChange={(e) => setValue({ ...value, displayName: e.target.value })} placeholder="Your name" required maxLength={60} /><small>A name that feels like you.</small></label> : <ProviderFields value={value.connection!} onChange={(connection) => setValue({ ...value, connection })} section={(['provider', 'key', 'model'] as const)[step - 1]} />}
    {error && <div className="error" role="alert">{error}</div>}<div className="setup-actions"><button className="text-button" type="button" disabled={!step} onClick={() => { setStep(step - 1); setError(''); }}><ArrowLeft size={16} />Back</button><button className="primary" type="submit">{busy ? 'Saving securely…' : step === 3 ? 'Start a conversation' : 'Continue'}<ArrowRight size={17} /></button></div></fieldset></form></main><footer><ShieldCheck size={14} />Local by default. Connected on your terms.</footer></div>;
}

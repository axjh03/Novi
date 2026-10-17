import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, type SettingsInput, type Snapshot } from '../../../shared/types';
import { newConnection, PROVIDERS } from '../../../shared/providers';
import { Brand } from '../components/Brand';
import { ProviderFields, type FieldProblem } from '../components/ProviderFields';
import { unwrap, errorText } from '../services/api';

const titles = ['Welcome to Novi.', 'Your AI, your choice.', 'Bring your own key.', 'Choose your thinking partner.'];
const descriptions = ['First things first. What should Novi call you?', 'Connect to a provider you love, or a model running on your device.', 'A direct connection between you and your AI provider.', 'Pick a model to start. You can always change it in Settings.'];
type Problem = FieldProblem | { field: 'displayName'; message: string };

export function OnboardingPage({ state, onComplete, onSignOut }: { state: Snapshot; onComplete: (state: Snapshot) => void; onSignOut: () => void }) {
  const [step, setStep] = useState(0), [busy, setBusy] = useState<'' | 'checking' | 'saving'>(''), [error, setError] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  // Onboarding has no Settings, so Sign out stays here, but asks first: it throws away what was entered.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const keepGoing = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmSignOut) keepGoing.current?.focus(); }, [confirmSignOut]);
  const [value, setValue] = useState<SettingsInput>({ displayName: state.settings!.displayName, theme: state.settings!.theme, clickThroughShortcut: state.settings!.clickThroughShortcut || DEFAULT_CLICK_THROUGH_SHORTCUT, connection: newConnection() });
  const connection = value.connection!;
  const providerName = PROVIDERS[connection.ai.provider].name;

  // Put the cursor in the field that needs fixing.
  useEffect(() => { if (problem && !busy) document.getElementById(problem.field === 'displayName' ? 'onboarding-name' : `provider-${problem.field}`)?.focus(); }, [problem, busy]);

  // Each step checks its own input and says what to fix under the field, instead of the browser's pop-up bubbles.
  function check(): Problem | null {
    if (step === 0 && !value.displayName.trim()) return { field: 'displayName', message: 'Enter the name Novi should use for you.' };
    if (step === 1 && !connection.name.trim()) return { field: 'name', message: 'Give this connection a name.' };
    if (step === 1 && connection.ai.provider === 'compatible' && !connection.ai.baseUrl.trim()) return { field: 'baseUrl', message: 'Enter your server’s URL.' };
    if (step === 2 && connection.ai.provider !== 'compatible' && !connection.apiKey?.trim()) return { field: 'key', message: `Paste your ${providerName} API key.` };
    if (step === 3 && !connection.ai.model) return { field: 'model', message: 'Choose a model to continue.' };
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const found = check();
    setProblem(found);
    if (found) return;
    if (step === 2) {
      // Check the key here, while the user is still looking at it, instead of on the next step.
      setBusy('checking');
      try { await unwrap(window.novi.listModels(connection)); }
      catch (cause) {
        const message = errorText(cause);
        setProblem({ field: 'key', message: /API key was rejected/.test(message) ? `${providerName} rejected this key. Check that you copied all of it, or create a new key.` : message });
        return;
      } finally { setBusy(''); }
    }
    if (step < 3) { setStep(step + 1); return; }
    setBusy('saving');
    try { onComplete(await unwrap(window.novi.saveSettings(value))); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(''); }
  }
  const setConnection = (next: SettingsInput['connection']) => { setValue({ ...value, connection: next }); setProblem(null); };
  const fieldProblem = problem && problem.field !== 'displayName' ? problem : null;

  return <div className="onboarding"><header><Brand />{confirmSignOut
    ? <div className="onboarding-signout" role="alertdialog" aria-labelledby="onboarding-signout-text" onKeyDown={(e) => { if (e.key === 'Escape') setConfirmSignOut(false); }}>
      <span id="onboarding-signout-text">Sign out? What you’ve entered here won’t be saved.</span>
      <button ref={keepGoing} type="button" className="text-button" onClick={() => setConfirmSignOut(false)}>Keep going</button>
      <button type="button" className="danger-button" onClick={onSignOut}>Sign out</button>
    </div>
    : <button type="button" className="text-button" onClick={() => setConfirmSignOut(true)} disabled={!!busy}>Sign out</button>}</header><main className="setup-card"><div className="step-track" aria-label={`Step ${step + 1} of 4`}>{['You', 'Provider', 'API key', 'Model'].map((label, index) => <div key={label} className={index <= step ? 'reached' : ''}><span>{index < step ? <Check size={13} /> : index + 1}</span>{label}</div>)}</div><span className="eyebrow">LET’S MAKE THIS YOURS · 0{step + 1}</span><h1>{titles[step]}</h1><p className="muted setup-description">{descriptions[step]}</p><form onSubmit={submit} noValidate><fieldset disabled={!!busy}>
    {step === 0 ? <><label>Display name<input id="onboarding-name" autoFocus value={value.displayName} onChange={(e) => { setValue({ ...value, displayName: e.target.value }); setProblem(null); }} placeholder="Your name" required maxLength={60}
      aria-invalid={problem?.field === 'displayName' || undefined} aria-describedby={problem?.field === 'displayName' ? 'onboarding-name-error' : undefined} /><small>A name that feels like you.</small></label>
      {problem?.field === 'displayName' && <p id="onboarding-name-error" className="field-error" role="alert">{problem.message}</p>}</>
      : <ProviderFields value={connection} onChange={setConnection} section={(['provider', 'key', 'model'] as const)[step - 1]} problem={fieldProblem} />}
    {error && <div className="error" role="alert">{error}</div>}<div className="setup-actions"><button className="text-button" type="button" disabled={!step} onClick={() => { setStep(step - 1); setError(''); setProblem(null); }}><ArrowLeft size={16} />Back</button><button className="primary" type="submit">{busy === 'checking' ? 'Checking your key…' : busy === 'saving' ? 'Saving securely…' : step === 3 ? 'Start a conversation' : 'Continue'}<ArrowRight size={17} /></button></div></fieldset></form></main><footer><ShieldCheck size={14} />Local by default. Connected on your terms.</footer></div>;
}

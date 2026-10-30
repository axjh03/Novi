import { useEffect, useState, Component, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { AccessStatus, Snapshot } from '../../shared/types';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ChatPage } from './pages/ChatPage';
import { SetupWorkspace } from './components/SetupWorkspace';
import { Brand } from './components/Brand';
import { TitleBar } from './components/TitleBar';
import { AppModeProvider } from './context/AppModeContext';
import { updaterService } from './services/updaterService';
import { errorText, unwrap } from './services/api';
import { applyTheme, rememberTheme, savedTheme } from './services/theme';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AppModeProvider snapshot={null}><div className="app-shell"><TitleBar /><div className="startup"><Brand /><h2>Novi couldn’t display this screen.</h2><p>Your saved conversations are still on this device.</p><button className="primary" onClick={() => location.reload()}>Reload Novi</button></div></div></AppModeProvider> : this.props.children; }
}
function Application() {
  const [state, setState] = useState<Snapshot | null>(null), [error, setError] = useState('');
  const [access, setAccess] = useState<AccessStatus>({ offline: false, connectionLost: false });
  async function load() {
    setError('');
    try { const snapshot = await unwrap(window.novi.session()); setState(snapshot); if (snapshot.access) setAccess(snapshot.access); }
    catch (error) { setError(errorText(error)); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => window.novi.onSessionEnded((message) => { setState({ user: null, settings: null, credentialIds: [], conversations: [] }); setError(message); }), []);
  useEffect(() => window.novi.onAccessStatus(setAccess), []);
  // A plan change (for example a downgrade picked up at check-in) updates the locks and leaves a
  // locked mode. Only a signed-in snapshot is applied, so a "session ended" message is never cleared.
  useEffect(() => window.novi.onPlanChanged(() => {
    void unwrap(window.novi.session()).then((snapshot) => { if (snapshot.user) setState(snapshot); }).catch(() => {});
  }), []);
  // If startup failed while offline, load again as soon as the access server answers.
  useEffect(() => { if (!state && error && !access.offline) void load(); }, [access.offline]);
  useEffect(() => {
    if (state?.settings?.checkUpdatesAtStartup !== false) {
      void updaterService.initStartupCheck(true);
    }
  }, [state?.settings?.checkUpdatesAtStartup]);
  useEffect(() => {
    // Remember the account's theme so startup and sign-in use it before any account loads.
    const chosen = state?.settings?.theme;
    if (chosen) rememberTheme(chosen);
    const theme = chosen || savedTheme();
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [state?.settings?.theme]);
  async function signOut() {
    try { await unwrap(window.novi.signOut()); setState({ user: null, settings: null, credentialIds: [], conversations: [] }); }
    catch (error) { setError(errorText(error)); }
  }
  if (!state) {
    return (
      <AppModeProvider snapshot={null}>
        <div className="app-shell">
          <TitleBar />
          <div className="app-content startup">
            <Brand />
            <p role="status">{error || 'Making room for your next idea…'}</p>
            {error && <button className="primary" onClick={() => void load()}>Try again</button>}
          </div>
        </div>
      </AppModeProvider>
    );
  }
  return (
    <AppModeProvider snapshot={state} onSnapshotUpdated={setState}>
      <div className="app-shell">
        <TitleBar sessionActive={Boolean(state.user && state.settings?.onboardingComplete && state.contextSession)} />
        <div className="app-content">
          {state.user && access.connectionLost && <div className="connection-status" role="status"><Loader2 size={14} className="spin" aria-hidden="true" />Connection lost. Reconnecting… Your session stays open.</div>}
          {error && <div className="global-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
          {!state.user ? (
            <AuthPage onAuthenticated={setState} />
          ) : !state.settings?.onboardingComplete ? (
            <OnboardingPage state={state} onComplete={setState} onSignOut={() => void signOut()} />
          ) : state.contextSession ? (
            <ChatPage key={state.contextSession.id} state={state} onSaved={setState} onSignOut={() => void signOut()} />
          ) : (
            <SetupWorkspace key={state.user.id} state={state} onSaved={setState} onSignOut={() => void signOut()} />
          )}
        </div>
      </div>
    </AppModeProvider>
  );
}
export function App() { return <ErrorBoundary><Application /></ErrorBoundary>; }

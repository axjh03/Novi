import { useEffect, useState, Component, type ReactNode } from 'react';
import type { Snapshot } from '../../shared/types';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ChatPage } from './pages/ChatPage';
import { ContextPage } from './pages/ContextPage';
import { Brand } from './components/Brand';
import { TitleBar } from './components/TitleBar';
import { AppModeProvider } from './context/AppModeContext';
import { errorText, unwrap } from './services/api';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AppModeProvider snapshot={null}><div className="app-shell"><TitleBar /><div className="startup"><Brand /><h2>Novi couldn’t display this screen.</h2><p>Your saved conversations are still on this device.</p><button className="primary" onClick={() => location.reload()}>Reload Novi</button></div></div></AppModeProvider> : this.props.children; }
}
function Application() {
  const [state, setState] = useState<Snapshot | null>(null), [error, setError] = useState('');
  async function load() { setError(''); try { setState(await unwrap(window.novi.session())); } catch (error) { setError(errorText(error)); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => window.novi.onSessionEnded((message) => { setState({ user: null, settings: null, credentialIds: [], conversations: [] }); setError(message); }), []);
  useEffect(() => {
    const theme = state?.settings?.theme || 'system';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
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
          {error && <div className="global-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
          {!state.user ? (
            <AuthPage onAuthenticated={setState} />
          ) : !state.settings?.onboardingComplete ? (
            <OnboardingPage state={state} onComplete={setState} onSignOut={() => void signOut()} />
          ) : state.contextSession ? (
            <ChatPage key={state.contextSession.id} state={state} onSaved={setState} onSignOut={() => void signOut()} />
          ) : (
            <ContextPage key={state.user.id} state={state} onSaved={setState} onSignOut={() => void signOut()} />
          )}
        </div>
      </div>
    </AppModeProvider>
  );
}
export function App() { return <ErrorBoundary><Application /></ErrorBoundary>; }

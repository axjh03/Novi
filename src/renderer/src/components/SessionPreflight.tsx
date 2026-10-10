import { useEffect, useRef, useState } from 'react';
import type { ContextFolder } from '../../../shared/types';
import { selectedSpeechModel, type LocalAISetup } from '../../../shared/localAI';
import { errorText, unwrap } from '../services/api';
import { InterviewAudio } from '../services/interviewAudio';
import { Brand } from './Brand';

export function SessionPreflight({ onContinue, onSettings, onFolders }: {
  onContinue: () => void; onSettings: () => void; onFolders: (folders: ContextFolder[]) => void;
}) {
  const [storage, setStorage] = useState(false), [setup, setSetup] = useState<LocalAISetup | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [acknowledged, setAcknowledged] = useState(false);
  const capture = useRef<InterviewAudio | null>(null), mounted = useRef(false);
  async function refresh() {
    const permissions = await unwrap(window.novi.checkPermissions());
    if (mounted.current) setStorage(permissions.storage);
    const next = await unwrap(window.novi.localAISetup());
    if (mounted.current) setSetup(next);
  }
  useEffect(() => {
    mounted.current = true;
    void refresh().catch(cause => { if (mounted.current) setError(errorText(cause)); });
    return () => { mounted.current = false; capture.current?.close(); };
  }, []);

  async function run(name: string, operation: () => Promise<string>) {
    setBusy(name); setError(''); setAcknowledged(false);
    try {
      const result = await operation();
      if (mounted.current) setResults(current => ({ ...current, [name]: result }));
    } catch (cause) {
      if (mounted.current) setResults(current => ({ ...current, [name]: errorText(cause) }));
    } finally { if (mounted.current) setBusy(''); }
  }
  async function testAudio(source: 'microphone' | 'system') {
    let peak = 0;
    const audio = new InterviewAudio(async frame => {
      for (const sample of frame.samples) peak = Math.max(peak, Math.abs(sample));
    }, () => {});
    capture.current = audio;
    try {
      await audio.start('permission-test', Date.now(), source === 'system' ? 'interviewer' : 'conversation', '', '', [source]);
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (peak < 0.001) throw new Error('No sound detected. Speak or play audio, check the input and OS privacy settings, then retry.');
      return 'Ready';
    } finally { await audio.stop(); capture.current = null; }
  }
  async function testScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) throw new Error('Screen capture is unavailable. Check OS Screen Recording permissions and retry.');
      return 'Ready';
    } finally { stream.getTracks().forEach(track => track.stop()); }
  }
  async function installSpeech() {
    const speech = setup && selectedSpeechModel(setup);
    for (const id of [speech?.id || 'zipformer-en-small', 'silero-vad']) {
      if (!setup?.models.some(model => model.id === id && model.state === 'READY')) await unwrap(window.novi.downloadLocalModel(id));
    }
    await refresh();
    return 'Files verified';
  }
  const speech = setup && selectedSpeechModel(setup);
  const speechReady = speech?.state === 'READY' && !speech.reason && setup?.models.some(model => model.id === 'silero-vad' && model.state === 'READY' && !model.reason);
  const ready = speechReady && ['microphone', 'system', 'screen'].every(name => results[name] === 'Ready');
  return <main className="session-preflight">
    <Brand /><h1>Before your session</h1>
    <p>Grant access and test capture now. Speak during the microphone test and play sound during the system audio test. Tests stop automatically and are not saved or sent to AI.</p>
    <div className="preflight-row"><div><strong>App storage</strong><p role="status">{storage ? 'Read/write access verified' : 'Storage access has not been verified'}</p></div><button className="secondary" disabled={!!busy} onClick={() => void run('storage', async () => { const next = await unwrap(window.novi.requestPermissions(['storage'])); setStorage(next.storage); return next.storage ? 'Ready' : 'Check your user folder permissions.'; })}>Check storage</button></div>
    {(['microphone', 'system', 'screen'] as const).map(name => <div className="preflight-row" key={name}>
      <div><strong>{name === 'system' ? 'System audio' : name === 'screen' ? 'Screen capture' : 'Microphone'}</strong><p role="status">{busy === name ? 'Testing…' : results[name] || 'Not tested'}</p></div>
      <button className="secondary" disabled={!!busy} onClick={() => void run(name, () => name === 'screen' ? testScreen() : testAudio(name))}>Test {name === 'system' ? 'system audio' : name === 'screen' ? 'screen' : 'microphone'}</button>
    </div>)}
    <div className="preflight-row"><div><strong>Local speech and neural VAD</strong><p role="status">{speechReady ? `${speech?.name} and VAD files verified` : 'Speech files need installation or repair'}{results.speech && ` · ${results.speech}`}</p></div><button className="secondary" disabled={!!busy || !!speechReady} onClick={() => void run('speech', installSpeech)}>{busy === 'speech' ? 'Installing…' : 'Install speech essentials'}</button></div>
    <div className="preflight-row"><div><strong>Source folders (optional)</strong><p role="status">{results.folders || 'Choose folders to grant access and read their documents before starting.'}</p></div><button className="secondary" disabled={!!busy} onClick={() => void run('folders', async () => { const folders = await unwrap(window.novi.pickContextFolders()); if (folders.length) onFolders(folders); return folders.length ? `${folders.length} folders loaded` : 'No folders selected'; })}>Choose source folders</button></div>
    <p className="muted">OS privacy settings can require an app restart. Some systems ask you to choose a screen for every capture. Camera and full transcription tests are available in Settings.</p>
    {results.storage && <p role="status">{results.storage}</p>}{error && <p className="error" role="alert">{error}</p>}
    {!ready && <label className="preflight-ack"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Continue with missing or untested features. Capture or local transcription may be unavailable.</label>}
    <div className="preflight-actions"><button className="secondary" disabled={!!busy} onClick={onSettings}>Settings and full tests</button><button className="primary" disabled={!!busy || !storage || (!ready && !acknowledged)} onClick={onContinue}>Continue to session setup</button></div>
  </main>;
}

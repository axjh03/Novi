import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Loader2, ShieldCheck, X } from 'lucide-react';
import type { ContextFolder, Snapshot } from '../../../shared/types';
import { activeConnection } from '../../../shared/providers';
import { selectedSpeechModel, type LocalAISetup } from '../../../shared/localAI';
import { errorText, unwrap } from '../services/api';
import { InterviewAudio } from '../services/interviewAudio';
import { READINESS_CHECKS, allReady, markReadinessRun, readReadiness, recordReadiness, type Readiness, type ReadinessCheck } from '../services/readiness';
import { useAppMode } from '../context/AppModeContext';
import { AudioMeter } from './AudioMeter';
import { Brand } from './Brand';

// What to do while each check runs.
const PROMPTS: Record<ReadinessCheck, string> = {
  storage: 'Checking that Novi can save your settings…',
  ai: 'Checking your AI connection…',
  speech: 'Checking speech files. Missing files download now.',
  microphone: 'Say something now. Testing your microphone for 3 seconds.',
  system: 'Play a video or music now. Testing system audio for 4 seconds; Novi also plays a short chime.',
  screen: 'If asked, choose the screen to share.',
};

// A soft three-note chime. Where the system audio capture includes Novi's own sound, it passes the test unaided.
function playChime(): () => void {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = 0.06;
  gain.connect(context.destination);
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const tone = context.createOscillator();
    tone.frequency.value = frequency;
    tone.connect(gain);
    const at = context.currentTime + 0.3 + index * 0.35;
    tone.start(at);
    tone.stop(at + 0.3);
  });
  return () => { void context.close().catch(() => {}); };
}

export function SessionPreflight({ state, onSaved, onContinue, onSettings, onFolders }: {
  state: Snapshot; onSaved: (state: Snapshot) => void;
  onContinue: () => void; onSettings: () => void; onFolders: (folders: ContextFolder[]) => void;
}) {
  const settings = state.settings!;
  const { monitors, workingMonitorId, setWorkingMonitor, refreshMonitors } = useAppMode();
  const [readiness, setReadiness] = useState<Readiness | null>(readReadiness);
  const [running, setRunning] = useState<ReadinessCheck | null>(null), [runningAll, setRunningAll] = useState(false);
  const [level, setLevel] = useState(0), [setup, setSetup] = useState<LocalAISetup | null>(null);
  const [folders, setFolders] = useState(''), [choosingFolders, setChoosingFolders] = useState(false);
  const [error, setError] = useState(''), [acknowledged, setAcknowledged] = useState(false), [saving, setSaving] = useState(false);
  const capture = useRef<InterviewAudio | null>(null), mounted = useRef(false);
  const record = (check: ReadinessCheck, ok: boolean, detail: string) => { const next = recordReadiness(check, { ok, detail }); if (mounted.current) setReadiness(next); };

  async function refreshSetup() {
    const next = await unwrap(window.novi.localAISetup());
    if (mounted.current) setSetup(next);
    return next;
  }
  useEffect(() => {
    mounted.current = true;
    void refreshMonitors();
    // Storage and speech files can be verified quietly; the other checks need the user.
    void (async () => {
      const permissions = await unwrap(window.novi.checkPermissions());
      if (permissions.storage && !readReadiness()?.results.storage) record('storage', true, 'Read and write access verified');
      const next = await refreshSetup();
      if (speechStatus(next).ready && !readReadiness()?.results.speech) record('speech', true, speechStatus(next).detail);
    })().catch(cause => { if (mounted.current) setError(errorText(cause)); });
    return () => { mounted.current = false; capture.current?.close(); };
  }, []);

  function speechStatus(current: LocalAISetup | null) {
    const speech = current && selectedSpeechModel(current);
    const ready = Boolean(speech?.state === 'READY' && !speech.reason && current?.models.some(model => model.id === 'silero-vad' && model.state === 'READY' && !model.reason));
    return { ready, detail: ready ? `${speech!.name} and voice detection ready` : 'Speech files need installing' };
  }

  async function testAudio(source: 'microphone' | 'system') {
    let peak = 0;
    const audio = new InterviewAudio(async frame => {
      let sum = 0;
      for (const sample of frame.samples) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
      if (mounted.current) setLevel(Math.min(1, Math.sqrt(sum / frame.samples.length) * 8) * 100);
    }, () => {});
    capture.current = audio;
    let stopChime = () => {};
    try {
      await audio.start('permission-test', Date.now(), source === 'system' ? 'interviewer' : 'conversation', '', '', [source]);
      if (source === 'system') stopChime = playChime();
      await new Promise(resolve => setTimeout(resolve, source === 'system' ? 4000 : 3000));
      if (peak < 0.001) throw new Error(source === 'system'
        ? 'No sound detected. Play a video or music, check the output device and OS privacy settings, then retry.'
        : 'No sound detected. Speak, check the input device and OS privacy settings, then retry.');
      return source === 'system' ? 'Novi can hear your computer’s sound' : 'Novi can hear you';
    } finally { stopChime(); await audio.stop(); capture.current = null; if (mounted.current) setLevel(0); }
  }
  async function testScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) throw new Error('Screen capture is unavailable. Check OS Screen Recording permissions and retry.');
      return 'Snapshots can capture your screen';
    } finally { stream.getTracks().forEach(track => track.stop()); }
  }
  async function testSpeech() {
    let current = setup || await refreshSetup();
    if (!speechStatus(current).ready) {
      const speech = selectedSpeechModel(current);
      for (const id of [speech?.id || 'zipformer-en-small', 'silero-vad']) {
        if (!current.models.some(model => model.id === id && model.state === 'READY')) await unwrap(window.novi.downloadLocalModel(id));
      }
      current = await refreshSetup();
    }
    const status = speechStatus(current);
    if (!status.ready) throw new Error('Speech files could not be verified. Open Settings › Local AI to repair them.');
    return status.detail;
  }
  async function testAI() {
    const connection = activeConnection(settings);
    if (!connection) throw new Error('Add or enable an AI connection in Settings.');
    // The model is chosen on the next step; until then, check that the key works by listing models.
    if (!connection.model) {
      const models = await unwrap(window.novi.listModels({ id: connection.id, name: connection.name, ai: connection }));
      if (!models.length) throw new Error(`${connection.name} returned no models. Check the connection in Settings.`);
      return `${connection.name} is reachable · choose a model on the next step`;
    }
    await unwrap(window.novi.testConnection());
    return `${connection.name} · ${connection.model} answered`;
  }
  async function testStorage() {
    const next = await unwrap(window.novi.requestPermissions(['storage']));
    if (!next.storage) throw new Error('Novi can’t save to your user folder. Check its permissions.');
    return 'Read and write access verified';
  }
  const tests: Record<ReadinessCheck, () => Promise<string>> = {
    storage: testStorage, ai: testAI, speech: testSpeech,
    microphone: () => testAudio('microphone'), system: () => testAudio('system'), screen: testScreen,
  };

  async function runCheck(check: ReadinessCheck) {
    setRunning(check); setError(''); setAcknowledged(false);
    try { record(check, true, await tests[check]()); }
    catch (cause) { record(check, false, errorText(cause)); }
    finally { if (mounted.current) setRunning(null); }
  }
  // Runs every check in order and keeps going past failures, so one pass shows everything.
  async function runAll() {
    setRunningAll(true);
    try {
      for (const { id } of READINESS_CHECKS) {
        if (!mounted.current) return;
        await runCheck(id);
      }
      const next = markReadinessRun();
      if (mounted.current) setReadiness(next);
    } finally { if (mounted.current) setRunningAll(false); }
  }

  async function saveTransparentOnStart(enabled: boolean) {
    setSaving(true); setError('');
    try { onSaved(await unwrap(window.novi.saveSettings({ ...settings, transparentOnStart: enabled }))); }
    catch (cause) { setError(errorText(cause)); }
    finally { if (mounted.current) setSaving(false); }
  }

  const busy = Boolean(running) || runningAll || choosingFolders;
  const ready = allReady(readiness);
  const storageReady = readiness?.results.storage?.ok === true;
  const monitorId = workingMonitorId ?? monitors.find(monitor => monitor.isPrimary)?.id;
  const ranAt = readiness?.ranAt && new Date(readiness.ranAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return <main className="session-preflight get-ready">
    <Brand /><h1>Get ready</h1>
    <p>One click checks everything Novi needs during your interview. Speak when asked and play some sound for the system audio test. Tests stop automatically and are not saved or sent to AI.</p>
    <div className="get-ready-run">
      <button type="button" className="primary get-ready-button" disabled={busy} onClick={() => void runAll()}>
        {runningAll ? <><Loader2 size={16} className="spin" />Checking…</> : readiness?.ranAt ? 'Run checks again' : 'Get ready'}
      </button>
      <span className="get-ready-summary" role="status">
        {running ? PROMPTS[running] : ready ? `You’re ready${ranAt ? ` · checked at ${ranAt}` : ''}` : ranAt ? `Checked at ${ranAt}. Retry anything marked below.` : 'Takes about 15 seconds.'}
      </span>
      {(running === 'microphone' || running === 'system') && <AudioMeter level={level} />}
    </div>

    <ul className="get-ready-checks" aria-label="Readiness checks">
      {READINESS_CHECKS.map(({ id, name }) => {
        const result = readiness?.results[id];
        return <li key={id} className={`get-ready-check ${result ? result.ok ? 'ok' : 'failed' : ''}`}>
          <span className="get-ready-icon" aria-hidden="true">
            {running === id ? <Loader2 size={15} className="spin" /> : result ? result.ok ? <Check size={15} /> : <X size={15} /> : <Circle size={15} />}
          </span>
          <div><strong>{name}</strong><p role="status">{running === id ? 'Testing…' : result?.detail || 'Not checked yet'}</p></div>
          <button type="button" className="secondary" disabled={busy} aria-label={`${result ? 'Retry' : 'Check'} ${name.toLowerCase()}`} onClick={() => void runCheck(id)}>{result ? 'Retry' : 'Check'}</button>
        </li>;
      })}
    </ul>

    <section className="get-ready-placement" aria-label="Where Novi opens">
      <h2>Where Novi opens</h2>
      <p>During a session the answer panel docks on the right of this screen, and the message tray sits at the top center.</p>
      {monitors.length > 1
        ? <label>Screen<select value={monitorId ?? ''} disabled={busy} onChange={event => void setWorkingMonitor(Number(event.target.value))}>
          {monitors.map(monitor => <option key={monitor.id} value={monitor.id}>{monitor.label}{monitor.isPrimary ? ' (main)' : ''}</option>)}
        </select></label>
        : <p className="muted">{monitors[0] ? `${monitors[0].label} · your only screen` : 'Your screen'}</p>}
      <label className="get-ready-toggle"><input type="checkbox" checked={settings.transparentOnStart === true} disabled={saving}
        onChange={event => void saveTransparentOnStart(event.target.checked)} />
        <span><ShieldCheck size={15} aria-hidden="true" />Start sessions in Transparent mode</span>
      </label>
      <small>Transparent mode hides Novi from screen sharing and recording. Like the Transparency button, clicks then pass through Novi; press NumLock (Windows) or {settings.clickThroughShortcut} to click it.</small>
    </section>

    <div className="preflight-row"><div><strong>Source folders (optional)</strong><p role="status">{folders || 'Choose folders to grant access and read their documents before starting.'}</p></div><button className="secondary" disabled={busy} onClick={() => void (async () => {
      setChoosingFolders(true); setError('');
      try { const loaded = await unwrap(window.novi.pickContextFolders()); if (loaded.length) onFolders(loaded); if (mounted.current) setFolders(loaded.length ? `${loaded.length} folders loaded` : 'No folders selected'); }
      catch (cause) { if (mounted.current) setFolders(errorText(cause)); }
      finally { if (mounted.current) setChoosingFolders(false); }
    })()}>Choose source folders</button></div>
    <p className="muted">OS privacy settings can require an app restart. Some systems ask you to choose a screen for every capture. Camera and full transcription tests are available in Settings.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!ready && <label className="preflight-ack"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Continue with missing or untested features. Capture or local transcription may be unavailable.</label>}
    <div className="preflight-actions"><button className="secondary" disabled={busy} onClick={onSettings}>Settings and full tests</button><button className="primary" disabled={busy || !storageReady || (!ready && !acknowledged)} onClick={onContinue}>Continue to session setup</button></div>
  </main>;
}

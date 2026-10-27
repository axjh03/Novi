import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, Check, Cpu, HardDrive, Loader2, Mic, Monitor, ShieldCheck, Volume2, X } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { activeConnection } from '../../../shared/providers';
import { selectedSpeechModel, type LocalAISetup } from '../../../shared/localAI';
import { errorText, unwrap } from '../services/api';
import { InterviewAudio } from '../services/interviewAudio';
import { READINESS_CHECKS, allReady, loadReadiness, markReadinessRun, readReadiness, recordReadiness, type Readiness, type ReadinessCheck } from '../services/readiness';
import { DeviceError, deviceError } from '../services/deviceErrors';
import { AudioMeter } from './AudioMeter';

// What to do while each check runs.
const PROMPTS: Record<ReadinessCheck, string> = {
  storage: 'Checking that Novi can save your settings…',
  ai: 'Checking your AI connection…',
  speech: 'Checking speech files. Missing files download now.',
  microphone: 'Say something now. Testing your microphone for 3 seconds.',
  system: 'Play a video or music now. Testing system audio for 4 seconds; Novi also plays a short chime.',
  screen: 'If asked, choose the screen to share.',
};
const CHECK_ICONS = { storage: HardDrive, ai: Cpu, speech: AudioLines, microphone: Mic, system: Volume2, screen: Monitor };

/**
 * Plays a soft three-note chime (C, E, G) through the speakers during the system audio test.
 * On computers where system audio capture also records Novi's own sound, the chime alone is enough
 * for the test to pass, so the user doesn't have to find a video to play.
 *
 * @returns a function that stops the chime and releases the audio device.
 */
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

/**
 * Get ready: the checks shown once per launch before session setup.
 *
 * Checks, in order: app storage, AI connection, speech files, microphone, system audio, screen
 * capture. Storage and speech files are checked quietly when the screen opens; the others need the
 * user (speaking, playing sound, or allowing screen sharing), so they run when asked.
 *
 * Results are kept for the rest of the day per account (services/readiness.ts). The Continue bar
 * stays at the bottom of the screen and says what failed or wasn't checked, but never blocks:
 * "Continue anyway" is always available unless a check is running or storage is unusable.
 *
 * @param onContinue called when the user moves on to session setup.
 * @param onChooseModel opens session setup's model step to repair a failed AI check.
 * @param onSettings opens Settings (for fixing a device or connection).
 */
export function SessionPreflight({ state, onContinue, onChooseModel, onSettings }: {
  state: Snapshot; onContinue: () => void; onChooseModel: () => void; onSettings: () => void;
}) {
  const settings = state.settings!;
  const [readiness, setReadiness] = useState<Readiness | null>(() => loadReadiness(state.user!.id));
  const [running, setRunning] = useState<ReadinessCheck | null>(null), [runningAll, setRunningAll] = useState(false);
  const [level, setLevel] = useState(0), [setup, setSetup] = useState<LocalAISetup | null>(null);
  const [error, setError] = useState('');
  const capture = useRef<InterviewAudio | null>(null), mounted = useRef(false);
  // Stores one check's result (saved for the day) and updates the screen if it is still open.
  const record = (check: ReadinessCheck, ok: boolean, detail: string, details?: string) => { const next = recordReadiness(check, { ok, detail, ...(details ? { details } : {}) }); if (mounted.current) setReadiness(next); };

  /** Reloads the local speech setup (which models are installed) from the main process. */
  async function refreshSetup() {
    const next = await unwrap(window.novi.localAISetup());
    if (mounted.current) setSetup(next);
    return next;
  }
  useEffect(() => {
    mounted.current = true;
    // Storage and speech files can be verified quietly; the other checks need the user.
    void (async () => {
      const permissions = await unwrap(window.novi.checkPermissions());
      // A failure is recorded too, so Continue never sits disabled without a reason.
      if (!readReadiness()?.results.storage) record('storage', permissions.storage, permissions.storage ? 'Read and write access verified' : 'Novi can’t save to your user folder. Check its permissions.');
      const next = await refreshSetup();
      if (speechStatus(next).ready && !readReadiness()?.results.speech) record('speech', true, speechStatus(next).detail);
    })().catch(cause => { if (mounted.current) setError(errorText(cause)); });
    return () => { mounted.current = false; capture.current?.close(); };
  }, []);

  /** Speech files are ready when the chosen speech model AND the voice-detection model (silero-vad) are installed and usable. */
  function speechStatus(current: LocalAISetup | null) {
    const speech = current && selectedSpeechModel(current);
    const ready = Boolean(speech?.state === 'READY' && !speech.reason && current?.models.some(model => model.id === 'silero-vad' && model.state === 'READY' && !model.reason));
    return { ready, detail: ready ? `${speech!.name} and voice detection ready` : 'Speech files need installing' };
  }

  /**
   * Microphone or system audio test: captures for 3 seconds (microphone) or 4 seconds (system audio,
   * with the chime playing), shows a live level meter, and passes if any sound above silence arrived.
   *
   * @returns the success sentence for the row.
   * @throws DeviceError with a plain-language message when the device can't start or is blocked,
   *   or an Error saying no sound was detected.
   */
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
      await audio.start('permission-test', Date.now(), source === 'system' ? 'interviewer' : 'conversation', '', '', [source]).catch((cause: unknown) => {
        // Each row is already titled with its device, so drop the "Microphone:" prefix the capture adds.
        throw new DeviceError(errorText(cause).replace(/^(System audio|Microphone): /, ''), cause instanceof DeviceError ? cause.details : '');
      });
      if (source === 'system') stopChime = playChime();
      await new Promise(resolve => setTimeout(resolve, source === 'system' ? 4000 : 3000));
      if (peak < 0.001) throw new Error(source === 'system'
        ? 'No sound detected. Play a video or music, check the output device and OS privacy settings, then retry.'
        : 'No sound detected. Speak, check the input device and OS privacy settings, then retry.');
      return source === 'system' ? 'Novi can hear your computer’s sound' : 'Novi can hear you';
    } finally { stopChime(); await audio.stop(); capture.current = null; if (mounted.current) setLevel(0); }
  }
  /**
   * Screen capture test: opens a capture and checks it delivers a live video track.
   * The capture is stopped straight away; nothing is saved.
   */
  async function testScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).catch((cause: unknown) => { throw deviceError('screen', cause); });
    try {
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) throw new Error('Screen capture is unavailable. Check OS Screen Recording permissions and retry.');
      return 'Snapshots can capture your screen';
    } finally { stream.getTracks().forEach(track => track.stop()); }
  }
  /** Speech files test: downloads the chosen speech model and voice detection if missing, then verifies both are ready. */
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
  /**
   * AI connection test. If a model is already chosen, sends a tiny request to it. If not (the model
   * is picked on the next step), checks the key works by listing the provider's models instead.
   */
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
  /** App storage test: asks the main process to confirm Novi can read and write its data folder. */
  async function testStorage() {
    const next = await unwrap(window.novi.requestPermissions(['storage']));
    if (!next.storage) throw new Error('Novi can’t save to your user folder. Check its permissions.');
    return 'Read and write access verified';
  }
  // Which test function runs for each check id.
  const tests: Record<ReadinessCheck, () => Promise<string>> = {
    storage: testStorage, ai: testAI, speech: testSpeech,
    microphone: () => testAudio('microphone'), system: () => testAudio('system'), screen: testScreen,
  };

  /** Runs one check and records pass or fail. A DeviceError's browser text is kept for the row's Details. */
  async function runCheck(check: ReadinessCheck) {
    setRunning(check); setError('');
    try { record(check, true, await tests[check]()); }
    catch (cause) { record(check, false, errorText(cause), cause instanceof DeviceError ? cause.details : undefined); }
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

  const busy = Boolean(running) || runningAll;
  const ready = allReady(readiness);
  const storageReady = readiness?.results.storage?.ok === true;
  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const ranAt = readiness?.ranAt && time(readiness.ranAt);
  const failed = READINESS_CHECKS.filter(({ id }) => readiness?.results[id]?.ok === false).length;
  const unchecked = READINESS_CHECKS.filter(({ id }) => !readiness?.results[id]).length;
  const checked = READINESS_CHECKS.length - unchecked;
  const continueStatus = !storageReady ? readiness?.results.storage ? 'App storage failed: Novi can’t save to your user folder. Fix it before continuing.' : error ? 'Check App storage to continue.' : 'Checking app storage…'
    : ready ? `Everything passed${ranAt ? ` · checked at ${ranAt}` : ''}.`
    : [failed ? `${failed} failed` : '', unchecked ? `${unchecked} not checked` : ''].filter(Boolean).join(' · ');

  return <main className={`session-preflight get-ready ${ready ? 'is-ready' : ''}`}>
    <header className="get-ready-header">
      <ShieldCheck size={26} aria-hidden="true" />
      <div><h1>Get ready</h1><p>Check your connection and devices before starting.</p></div>
      <span className="get-ready-count">{checked} / {READINESS_CHECKS.length} checked</span>
    </header>
    <div className="get-ready-toolbar">
      <span className="get-ready-summary" role="status">
        {running ? PROMPTS[running]
          : readiness?.restored ? `Saved today · ${time(readiness.checkedAt)}`
          : ready ? `All checks passed${ranAt ? ` · ${ranAt}` : ''}` : ranAt ? `Checked · ${ranAt}` : 'Run the checks when you are ready.'}
      </span>
      {(running === 'microphone' || running === 'system') && <AudioMeter level={level} />}
      <button type="button" className="secondary" disabled={busy} onClick={() => void runAll()}>
        {runningAll ? <><Loader2 size={14} className="spin" />Checking…</> : readiness?.ranAt ? 'Run checks again' : 'Run all checks'}
      </button>
    </div>
    <progress className="get-ready-progress" aria-label="Readiness checks completed" max={READINESS_CHECKS.length} value={checked} />
    <section className="get-ready-checks" aria-label="Readiness checks" aria-busy={busy}>
      {READINESS_CHECKS.map(({ id, name }) => {
        const result = readiness?.results[id];
        const verb = !result ? 'Check' : result.ok ? 'Check again' : 'Retry';
        const Icon = CHECK_ICONS[id];
        return <article key={id} className={`get-ready-check ${running === id ? 'running' : result ? result.ok ? 'ok' : 'failed' : ''}`}>
          <span className="get-ready-icon" aria-hidden="true">
            {running === id ? <Loader2 size={18} className="spin" /> : result ? result.ok ? <Check size={18} /> : <X size={18} /> : <Icon size={18} />}
          </span>
          <div className="get-ready-check-body">
            <div className="get-ready-check-head"><strong>{name}</strong><span>{running === id ? 'Checking…' : result ? result.ok ? 'Ready' : 'Needs attention' : 'Not checked'}</span></div>
          <p role="status">{running === id ? PROMPTS[id] : result?.detail || 'Not checked yet'}</p>
          {running !== id && result && !result.ok && result.details && <details className="get-ready-details"><summary>Details</summary><code>{result.details}</code></details>}
          {id === 'ai' && result?.ok === false && <button type="button" className="text-button" disabled={busy || !storageReady} onClick={onChooseModel}>Choose another model</button>}
          </div>
          <button type="button" className="secondary" disabled={busy} aria-label={`${verb} ${name.toLowerCase()}`} onClick={() => void runCheck(id)}>{verb}</button>
        </article>;
      })}
    </section>

    {error && <p className="error" role="alert">{error}</p>}
    <div className="preflight-actions">
      <p role="status">{busy ? 'Checking…' : continueStatus}</p>
      <div><button className="secondary" disabled={busy} onClick={onSettings}>Settings and full tests</button>
        <button className="primary" disabled={busy || !storageReady} onClick={onContinue}>{ready ? 'Continue to session setup' : 'Continue anyway'}<ArrowRight size={16} /></button></div>
    </div>
  </main>;
}

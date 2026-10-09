import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, HardDrive, Mic, RefreshCw, ShieldCheck, Sliders, Square, Volume2 } from 'lucide-react';
import { selectedSpeechModel, type LocalAISetup as Setup, type LocalModelState } from '../../../shared/localAI';
import type { Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import type { AudioSource, InterviewEvent, InterviewSession, TranscriptSegment } from '../../../shared/interview';
import { updateTranscript } from '../../../shared/interview';
import { InterviewAudio } from '../services/interviewAudio';
import { AudioMeter } from './AudioMeter';

const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(0, Math.round(bytes / 1024))} KB`;
const speed = (bytes: number) => `${size(bytes)}/s`;
const stateLabels: Record<LocalModelState, string> = { NOT_INSTALLED: 'Not installed', DOWNLOADING: 'Downloading', DOWNLOADED: 'Downloaded', VERIFYING: 'Verifying', READY: 'Ready', CORRUPTED: 'Needs repair', FAILED: 'Download failed', DISABLED: 'Unavailable' };
const active = (state: string) => ['DOWNLOADING', 'DOWNLOADED', 'VERIFYING'].includes(state);

export function LocalAISetup({ onSettingsSaved }: { onSettingsSaved?: (snapshot: Snapshot, modelId: string) => void } = {}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [testSource, setTestSource] = useState<AudioSource>('microphone'), [testVad, setTestVad] = useState(true);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [testMicId, setTestMicId] = useState(''), [testSystemId, setTestSystemId] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<'mac' | 'windows' | 'linux'>(() => /Mac/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'windows' : 'linux');
  const [testSpeakers, setTestSpeakers] = useState(false);
  const [testPhase, setTestPhase] = useState<'idle' | 'starting' | 'recording' | 'stopping'>('idle');
  const testBusy = testPhase !== 'idle';
  const [testSession, setTestSession] = useState<InterviewSession | null>(null);
  const [testLevel, setTestLevel] = useState(0);
  const [testSegments, setTestSegments] = useState<TranscriptSegment[]>([]), [testWarning, setTestWarning] = useState('');
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const testAudio = useRef<InterviewAudio | null>(null), testSessionId = useRef('');
  const testStarting = useRef(false);
  const testScroller = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const cancelled = useRef(false);
  const refresh = useCallback(async () => {
    const next = await unwrap(window.novi.localAISetup());
    if (mounted.current) setSetup(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const loadAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        if (mounted.current) {
          setAudioDevices(inputs);
          const loopback = inputs.find(d => /blackhole|loopback|soundflower|stereo mix|virtual/i.test(d.label));
          if (loopback) setTestSystemId(prev => prev || loopback.deviceId);
        }
      } catch { /* ignore */ }
    };
    void loadAudioDevices();
    const handleDeviceChange = () => { void loadAudioDevices(); };
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    const unsubscribe = window.novi.onLocalModelProgress(status => {
      setSetup(current => current ? { ...current, models: current.models.map(model => model.id === status.id ? { ...model, ...status } : model) } : current);
    });
    const stopTranscriptEvents = window.novi.onInterview((event: InterviewEvent) => {
      if (event.type === 'transcript:partial' || event.type === 'transcript:final') {
        if (event.segment.sessionId === testSessionId.current) setTestSegments(current => updateTranscript(current, event.segment));
        return;
      }
      if (!('sessionId' in event) || event.sessionId !== testSessionId.current) return;
      if (event.type === 'warning') setTestWarning(event.message);
      if (event.type === 'metrics') setTestLatency(event.processingMs);
      if (event.type === 'status' && event.status !== 'recording') { setTestSession(current => current ? { ...current, status: event.status } : current); testAudio.current?.close(); testAudio.current = null; setTestPhase('idle'); setTestLevel(0); }
    });
    void refresh().catch(cause => { if (mounted.current) setError(errorText(cause)); });
    return () => { mounted.current = false; cancelled.current = true; navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange); unsubscribe(); stopTranscriptEvents(); testAudio.current?.close(); if (testSessionId.current || testStarting.current) void window.novi.stopInterview(); };
  }, [refresh]);
  useEffect(() => { if (testScroller.current) testScroller.current.scrollTop = testScroller.current.scrollHeight; }, [testSegments]);

  async function download(ids: string[]) {
    setBusy(true); setError(''); cancelled.current = false;
    try {
      for (const id of ids) {
        if (cancelled.current) break;
        await unwrap(window.novi.downloadLocalModel(id));
      }
      await refresh();
    } catch (cause) { if (mounted.current) setError(errorText(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function pause(id: string) {
    cancelled.current = true;
    try { await unwrap(window.novi.cancelLocalModelDownload(id)); }
    catch (cause) { setError(errorText(cause)); }
  }

  async function remove(id: string) {
    setBusy(true); setError('');
    try { await unwrap(window.novi.deleteLocalModel(id)); setDeleting(null); await refresh(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function selectASR(id: string) {
    setSavingModel(true); setError('');
    try {
      const snapshot = await unwrap(window.novi.selectLocalASR(id));
      setSetup(current => current ? { ...current, selectedASR: snapshot.settings?.localASRModelId || 'auto' } : current);
      onSettingsSaved?.(snapshot, id);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSavingModel(false); }
  }

  async function startTest() {
    if (!setup || !selectedASR || selectedASR.state !== 'READY' || testStarting.current || testBusy || savingModel || busy) return;
    testStarting.current = true;
    setTestPhase('starting'); setTestLevel(0); setTestSegments([]); setTestWarning(''); setTestLatency(null); testSessionId.current = '';
    try {
      const session = await unwrap(window.novi.startInterview({ mode: testSpeakers ? 'multiple' : 'conversation', vadThreshold: 0.006, diarization: testSpeakers, useVad: testVad }));
      if (!mounted.current) return;
      testSessionId.current = session.id; setTestSession(session);
      const capture = new InterviewAudio(frame => {
        let peak = 0;
        for (const sample of frame.samples) peak = Math.max(peak, Math.abs(sample));
        if (mounted.current) setTestLevel(Math.min(100, peak * 100));
        return unwrap(window.novi.interviewFrame(frame));
      }, message => { if (mounted.current) setTestWarning(message); }); testAudio.current = capture;
      await capture.start(session.id, session.startedAt, 'conversation', testMicId, testSystemId, [testSource]);
      if (mounted.current && testAudio.current === capture) setTestPhase('recording');
    } catch (cause) {
      if (!mounted.current) return;
      testAudio.current?.close(); testAudio.current = null; await window.novi.stopInterview();
      if (mounted.current) { setTestWarning(errorText(cause)); setTestPhase('idle'); setTestLevel(0); }
    } finally { testStarting.current = false; }
  }
  async function stopTest() {
    if (testPhase !== 'recording') return;
    setTestPhase('stopping');
    try { await testAudio.current?.stop(); testAudio.current = null; const session = await unwrap(window.novi.stopInterview()); if (session) setTestSession(session); }
    catch (cause) { setTestWarning(errorText(cause)); }
    finally { setTestPhase('idle'); setTestLevel(0); }
  }

  if (!setup) return <div className="local-ai-setup"><section className="local-ai-card"><h2>Local AI</h2><p role="status">{error || 'Checking your computer and installed models…'}</p>
    {error && <button type="button" className="secondary" onClick={() => void refresh().catch(cause => setError(errorText(cause)))}>Try again</button>}</section></div>;

  const inProgress = setup.models.some(model => active(model.state));
  const selectionValue = setup.selectedASR || 'auto';
  const selectedASR = selectedSpeechModel(setup);
  const required = setup.models.filter(model => !model.reason && (model.id === selectedASR?.id || (model.type === 'vad' && model.recommended)) && model.state !== 'READY');
  const requiredBytes = required.reduce((sum, model) => sum + model.totalBytes, 0);
  const enoughDisk = setup.device.diskFree === null || setup.device.diskFree >= requiredBytes + 256 * 1024 ** 2;
  const vadReady = setup.models.some(model => model.type === 'vad' && model.state === 'READY');
  const speakersReady = setup.models.some(model => model.type === 'diarization' && model.state === 'READY');
  const modelLocked = busy || inProgress || testBusy || savingModel;
  const ready = selectedASR?.state === 'READY' && !selectedASR.reason;
  const runningModel = setup.models.find(model => model.id === testSession?.modelId);
  const phaseLabel = { idle: 'Ready when you are', starting: 'Loading model & opening audio…', recording: 'Listening', stopping: 'Finishing transcription…' }[testPhase];

  const copyBrewCmd = async () => {
    try {
      await unwrap(window.novi.copyText('brew install blackhole-2ch'));
      setCopiedCmd(true);
    } catch (cause) { setTestWarning(errorText(cause)); }
  };

  function modelCard(model: Setup['models'][number]) {
    const isSelected = model.id === selectedASR?.id;
    const diskTooLow = setup!.device.diskFree !== null && setup!.device.diskFree < model.totalBytes + 256 * 1024 ** 2;
    return <section className={`local-model-card ${isSelected ? 'is-selected' : ''}`} key={model.id}>
      <div className="local-ai-row"><span className={`local-ai-badge ${model.state === 'READY' ? 'is-ready' : ''}`}>{stateLabels[model.state]}</span>{isSelected ? <span className="local-ai-eyebrow">Selected</span> : model.recommended && <span className="local-ai-eyebrow">Recommended</span>}</div>
      <h3>{model.name}</h3>
      <p>{model.type === 'asr' ? model.liveMode === 'simulated' ? 'Simulated streaming · Interim results may take longer' : 'Native streaming · Live partial results' : model.type === 'vad' ? 'Voice activity detection · Filters silence' : model.type === 'diarization' ? 'Speaker labels · System audio only' : 'Analysis weights · Analysis is not enabled yet'}</p>
      <div className="local-model-specs"><span><Download size={13} />{size(model.totalBytes)}</span><span>~{size(model.estimatedRamBytes)} RAM</span><span>{model.license}</span></div>
      {model.memoryWarning && <p className="local-ai-warning">{model.memoryWarning}</p>}
      {active(model.state) && <div className="local-model-progress">
        <div><strong>{stateLabels[model.state]}</strong><span>{Math.min(100, Math.floor(model.downloadedBytes / Math.max(1, model.totalBytes) * 100))}%</span></div>
        <progress aria-label={`${model.name} download`} max={model.totalBytes || 1} value={model.downloadedBytes} />
        <div><span>{size(model.downloadedBytes)} / {size(model.totalBytes)}</span><span>{model.speedBytesPerSecond ? speed(model.speedBytesPerSecond) : model.state === 'DOWNLOADING' ? 'Starting…' : 'Checking files…'}</span></div>
        {model.state === 'DOWNLOADING' && <button type="button" className="secondary" onClick={() => void pause(model.id)}>Pause download</button>}
      </div>}
      {model.reason && <p>{model.reason}</p>}
      {model.error && <p className="error" role="alert">{model.error}</p>}
      {!active(model.state) && <div className="local-model-actions">
        {model.type === 'asr' && !isSelected && <button type="button" className="secondary" disabled={modelLocked || Boolean(model.reason)} onClick={() => void selectASR(model.id)}>Select model</button>}
        {model.state !== 'READY' && <button type="button" className="secondary" disabled={modelLocked || Boolean(model.reason) || diskTooLow} title={diskTooLow ? 'Not enough free disk space' : undefined} onClick={() => void download([model.id])}><Download size={14} />{model.state === 'NOT_INSTALLED' ? 'Download' : 'Repair / resume'}</button>}
        {(model.state !== 'NOT_INSTALLED' || model.downloadedBytes > 0) && <button type="button" className="text-button" disabled={modelLocked} onClick={() => setDeleting(model.id)}>Delete files</button>}
      </div>}
      {deleting === model.id && <div className="local-ai-confirm" role="alert"><p>Delete {model.name} and its partial download? You can download it again.</p><div className="local-ai-actions"><button type="button" className="danger-button" disabled={modelLocked} onClick={() => void remove(model.id)}>Delete model</button><button type="button" className="text-button" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div></div>}
    </section>;
  }

  return <div className="local-ai-setup">
    <header className="local-ai-header">
      <div><span className="local-ai-eyebrow">YOUR PRIVATE WORKSPACE</span><h2>Local AI</h2><p>Choose a speech model, check your audio, and work on your own device.</p></div>
      <span className="local-ai-badge"><ShieldCheck size={15} />On-device transcription</span>
    </header>
    <div className="local-ai-hardware" aria-label="Device resources">
      <div><span>YOUR COMPUTER</span><strong title={setup.device.cpu}>{setup.device.cpu}</strong><small>{setup.device.platform} · {setup.device.arch} · {setup.device.cores} cores</small></div>
      <div><span>AVAILABLE MEMORY</span><strong>{size(setup.device.availableMemory)}</strong><small>of {size(setup.device.totalMemory)} RAM</small></div>
      <div><span>FREE STORAGE</span><strong>{setup.device.diskFree === null ? 'Unknown' : size(setup.device.diskFree)}</strong><small>Models remain installed across updates</small></div>
      <button type="button" className="icon-button" aria-label="Refresh hardware and models" title="Refresh hardware and models" disabled={modelLocked} onClick={() => void refresh().catch(cause => setError(errorText(cause)))}><RefreshCw size={17} /></button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {setup.device.availableMemory < 1024 ** 3 && <p className="local-ai-warning" role="status">Memory is low. Close other apps before starting transcription. Optional features may be disabled automatically.</p>}
    <div className="local-ai-workspace">
      <section className="local-ai-card">
        <div className="local-ai-section-heading"><span className="local-ai-icon"><Sliders size={19} /></span><div><h3>Speech recognition</h3><p>Your saved model for local transcription.</p></div></div>
        <label>Speech-to-text model<select value={selectionValue} disabled={modelLocked} onChange={event => void selectASR(event.target.value)}><option value="auto">Automatic · best available model</option>{setup.models.filter(model => model.type === 'asr').map(model => <option key={model.id} value={model.id} disabled={Boolean(model.reason)}>{model.name}{model.reason ? ' — unavailable' : ''}</option>)}</select></label>
        <div className="local-ai-selection" role="status">
          <div className="local-ai-row"><span className="local-ai-eyebrow">{savingModel ? 'SAVING SELECTION…' : selectionValue === 'auto' ? 'AUTOMATIC CHOICE' : 'SAVED SELECTION'}</span><span className={`local-ai-badge ${ready ? 'is-ready' : ''}`}>{ready ? <><Check size={13} />Ready</> : selectedASR ? stateLabels[selectedASR.state] : 'Unavailable'}</span></div>
          <strong>{selectedASR?.name || 'No supported speech model'}</strong>
          <p>{selectedASR ? `${size(selectedASR.estimatedRamBytes)} estimated RAM · ${selectedASR.languages.join(', ')} · ${selectedASR.liveMode === 'simulated' ? 'Simulated streaming' : 'Native streaming'}` : 'Refresh your device information or select another model.'}</p>
          {selectionValue === 'auto' && <p>Uses an installed model when available. The live test shows the model actually loaded.</p>}
        </div>
        {required.length > 0 && <><button type="button" className="primary" disabled={modelLocked || !enoughDisk} onClick={() => void download(required.map(model => model.id))}><Download size={16} />{inProgress ? 'Download in progress…' : `Download setup · ${size(requiredBytes)}`}</button><p className="local-ai-help">Includes {required.map(model => model.name).join(' and ')}.</p>{!enoughDisk && <p className="local-ai-warning">Free disk space is too low or could not be confirmed. Free space, then refresh.</p>}</>}
        <p className="local-ai-help">Use local transcription in chat to apply this choice. An explicitly selected model must be installed before it can run.</p>
        <div className="local-ai-note"><ShieldCheck size={17} /><p>Audio is processed on this computer. Downloads connect to Hugging Face for model files.</p></div>
      </section>
      <section className="local-ai-card" aria-label="Live transcription model test">
        <div className="local-ai-section-heading"><span className="local-ai-icon"><Mic size={19} /></span><div><h3>Try your setup</h3><p>Hear it. See it. Make sure it works.</p></div></div>
        <div className="local-ai-inputs">
          <label>Audio source<select value={testSource} disabled={testBusy} onChange={event => { setTestSource(event.target.value as AudioSource); setTestSpeakers(false); }}><option value="microphone">Microphone</option><option value="system">System audio</option></select></label>
          <label>{testSource === 'microphone' ? 'Microphone' : 'Loopback input'}<select value={testSource === 'microphone' ? testMicId : testSystemId} disabled={testBusy} onChange={event => testSource === 'microphone' ? setTestMicId(event.target.value) : setTestSystemId(event.target.value)}><option value="">{testSource === 'microphone' ? 'Default microphone' : 'Display capture / auto-detect'}</option>{audioDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}</select></label>
        </div>
        {testSource === 'system' && <details className="local-ai-details"><summary><Volume2 size={14} />Set up system audio</summary><div className="local-ai-details-content">
          <div className="local-ai-platforms" role="group" aria-label="System audio instructions">{(['mac', 'windows', 'linux'] as const).map(platform => <button type="button" key={platform} aria-pressed={activePlatformTab === platform} onClick={() => setActivePlatformTab(platform)}>{platform === 'mac' ? 'macOS' : platform === 'windows' ? 'Windows' : 'Linux'}</button>)}</div>
          {activePlatformTab === 'mac' && <><p>If display capture has no audio, install BlackHole 2ch and select it as the loopback input above.</p><code>brew install blackhole-2ch</code><div className="local-ai-actions"><button type="button" className="secondary" onClick={() => void copyBrewCmd()}>{copiedCmd ? <Check size={14} /> : <Copy size={14} />}{copiedCmd ? 'Copied' : 'Copy command'}</button><button type="button" className="text-button" onClick={() => void unwrap(window.novi.openExternal('https://existential.audio/blackhole/')).catch(cause => setTestWarning(errorText(cause)))}><ExternalLink size={13} />Download BlackHole</button></div><ol><li>Open Audio MIDI Setup and use + to create a Multi-Output Device.</li><li>Enable your headphones or speakers and BlackHole 2ch.</li><li>Choose the Multi-Output Device for playback in macOS Sound settings.</li><li>Select BlackHole 2ch in Novi. Allow microphone and screen recording access when prompted.</li></ol><button type="button" className="secondary" onClick={() => void unwrap(window.novi.openAudioMidiSetup()).catch(cause => setTestWarning(errorText(cause)))}><Sliders size={14} />Open Audio MIDI Setup</button></>}
          {activePlatformTab === 'windows' && <p>Use display capture with system audio sharing enabled, or select an enabled Stereo Mix / loopback input. If capture has no audio, check Windows sound input settings and choose the loopback device above.</p>}
          {activePlatformTab === 'linux' && <p>Select a PipeWire / PulseAudio monitor input. If no monitor appears, route playback to a loopback input using your sound controls or <code>pavucontrol</code>.</p>}
        </div></details>}
        <details className="local-ai-details"><summary>Detection options</summary><div className="local-ai-details-content">
          <label className="checkbox-label"><input type="checkbox" checked={testVad} disabled={testBusy} onChange={event => setTestVad(event.target.checked)} />Voice activity detection</label><p>{vadReady ? 'Silero VAD is installed.' : 'Uses lightweight detection until Silero VAD is installed.'}</p>
          <label className="checkbox-label"><input type="checkbox" checked={testSpeakers} disabled={testBusy || testSource !== 'system' || !speakersReady} onChange={event => setTestSpeakers(event.target.checked)} />Label speakers</label><p>Requires system audio and the speaker detection model.</p>
        </div></details>
        <div className={`local-ai-listening ${testPhase === 'recording' ? 'is-listening' : ''}`}><AudioMeter level={testLevel} /><div><strong role="status">{phaseLabel}</strong><span>{testBusy && testSession ? runningModel?.name || testSession.modelId : selectedASR?.name || 'Choose a model first'}</span></div></div>
        <button type="button" className={testPhase === 'recording' ? 'danger-button' : 'primary'} disabled={testPhase === 'starting' || testPhase === 'stopping' || (!testBusy && (!ready || modelLocked))} onClick={() => void (testPhase === 'recording' ? stopTest() : startTest())}>{testPhase === 'recording' ? <Square size={14} /> : <Mic size={16} />}{testPhase === 'recording' ? 'Stop test' : testPhase === 'starting' ? 'Starting…' : testPhase === 'stopping' ? 'Stopping…' : 'Start live test'}</button>
        {!ready && <p className="local-ai-help">Download your selected speech model to start a test.</p>}
        {testWarning && <p role="alert" className="local-ai-warning">{testWarning}</p>}
        <div className="local-test-transcript" ref={testScroller} role="log" aria-label="Live local transcription results" aria-live="off">
          {!testSegments.length && <p className="muted">{testPhase === 'recording' ? 'Listening for speech…' : 'Your live transcript will appear here.'}</p>}
          {testSegments.map(segment => <article key={segment.segmentId} className={segment.isFinal ? 'final' : 'partial'}><strong>{segment.role === 'candidate' ? 'MICROPHONE' : 'SYSTEM AUDIO'}{segment.isFinal ? '' : ' · LIVE'}</strong><p>{segment.text}{segment.isFinal ? '' : ' …'}</p></article>)}
        </div>
        {testLatency !== null && <p className="local-ai-help" role="status">{Math.round(testLatency)} ms processing / 100 ms audio · {testLatency > 100 ? 'Behind real time' : 'Keeping up'}</p>}
        <p className="local-ai-help">Test transcripts are saved locally in interview history. Raw audio is never saved.</p>
      </section>
    </div>
    <section className="local-ai-library" aria-labelledby="speech-library-title"><div className="local-ai-section-heading"><span className="local-ai-icon"><HardDrive size={19} /></span><div><h3 id="speech-library-title">Speech model library</h3><p>Choose the balance of speed, accuracy, and memory that fits your computer.</p></div></div><div className="local-model-list">{setup.models.filter(model => model.type === 'asr').map(modelCard)}</div></section>
    <details className="local-ai-card local-ai-details"><summary>Optional models <span className="local-ai-help">Voice detection, speaker labels & analysis</span></summary><div className="local-model-list local-ai-details-content">{setup.models.filter(model => model.type !== 'asr').map(modelCard)}</div></details>
    <details className="local-ai-card local-ai-details"><summary>Storage & capabilities</summary><div className="local-ai-details-content"><p>Models are stored outside the app and stay installed across updates.</p><code>{setup.directory}</code><p>GPU acceleration is unverified until the native runtime is installed and tested.</p><div className="local-ai-capabilities">{setup.features.map(feature => <div key={feature.name}><div className="local-ai-row"><strong>{feature.name}</strong><span className="local-ai-badge">{feature.state}</span></div><p>{feature.reason}</p></div>)}</div></div></details>
  </div>;
}

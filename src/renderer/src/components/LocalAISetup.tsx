import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalAISetup as Setup } from '../../../shared/localAI';
import type { Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import type { AudioSource, InterviewEvent, InterviewSession, TranscriptSegment } from '../../../shared/interview';
import { updateTranscript } from '../../../shared/interview';
import { InterviewAudio } from '../services/interviewAudio';

const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.ceil(bytes / 1024 ** 2)} MB`;
const active = (state: string) => ['DOWNLOADING', 'DOWNLOADED', 'VERIFYING'].includes(state);

export function LocalAISetup({ onSettingsSaved }: { onSettingsSaved?: (snapshot: Snapshot, modelId: string) => void } = {}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [includeAnalysis, setIncludeAnalysis] = useState(false);
  const [testSource, setTestSource] = useState<AudioSource>('microphone'), [testVad, setTestVad] = useState(true);
  const [testSpeakers, setTestSpeakers] = useState(false);
  const [testBusy, setTestBusy] = useState(false), [testSession, setTestSession] = useState<InterviewSession | null>(null);
  const [testSegments, setTestSegments] = useState<TranscriptSegment[]>([]), [testWarning, setTestWarning] = useState('');
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const testAudio = useRef<InterviewAudio | null>(null), testSessionId = useRef('');
  const mounted = useRef(false);
  const cancelled = useRef(false);
  const refresh = useCallback(async () => {
    const next = await unwrap(window.novi.localAISetup());
    if (mounted.current) setSetup(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
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
      if (event.type === 'status') { setTestSession(current => current ? { ...current, status: event.status } : current); testAudio.current?.close(); testAudio.current = null; setTestBusy(false); }
    });
    void refresh().catch(cause => { if (mounted.current) setError(errorText(cause)); });
    return () => { mounted.current = false; cancelled.current = true; unsubscribe(); stopTranscriptEvents(); testAudio.current?.close(); if (testSessionId.current) void window.novi.stopInterview(); };
  }, [refresh]);

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
    try {
      const snapshot = await unwrap(window.novi.selectLocalASR(id));
      setSetup(current => current ? { ...current, selectedASR: snapshot.settings?.localASRModelId || 'auto' } : current);
      onSettingsSaved?.(snapshot, id);
    } catch (cause) { setError(errorText(cause)); }
  }

  async function startTest() {
    if (!setup || !selectedASR || selectedASR.state !== 'READY' || (testVad && !setup.models.some(model => model.type === 'vad' && model.state === 'READY'))) return;
    setTestBusy(true); setTestSegments([]); setTestWarning(''); setTestLatency(null); testSessionId.current = '';
    try {
      const session = await unwrap(window.novi.startInterview({ mode: testSpeakers ? 'multiple' : 'conversation', vadThreshold: 0.006, diarization: testSpeakers, useVad: testVad }));
      if (!mounted.current) { await window.novi.stopInterview(); return; }
      testSessionId.current = session.id; setTestSession(session);
      const capture = new InterviewAudio(frame => unwrap(window.novi.interviewFrame(frame)), setTestWarning); testAudio.current = capture;
      await capture.start(session.id, session.startedAt, 'conversation', '', '', [testSource]);
    } catch (cause) {
      testAudio.current?.close(); testAudio.current = null; await window.novi.stopInterview();
      if (mounted.current) { setTestWarning(errorText(cause)); setTestBusy(false); }
    }
  }
  async function stopTest() {
    setTestBusy(true);
    try { await testAudio.current?.stop(); testAudio.current = null; const session = await unwrap(window.novi.stopInterview()); if (session) setTestSession(session); }
    catch (cause) { setTestWarning(errorText(cause)); }
    finally { setTestBusy(false); }
  }

  if (!setup) return <section className="settings-section"><h2>Local AI setup</h2><p role="status">{error || 'Checking this computer and installed models…'}</p>
    {error && <button type="button" className="secondary" onClick={() => void refresh().catch(cause => setError(errorText(cause)))}>Retry</button>}</section>;

  const inProgress = setup.models.some(model => active(model.state));
  const selectionValue = setup.selectedASR || 'auto';
  const selectedASR = setup.models.find(model => model.id === setup.selectedASR) || setup.models.find(model => model.type === 'asr' && model.recommended) || setup.models.find(model => model.type === 'asr');
  const selected = setup.models.filter(model => (model.id === selectedASR?.id || (model.type === 'vad' && model.recommended) || (includeAnalysis && model.type === 'llm' && !model.reason)) && model.state !== 'READY');
  const requiredBytes = selected.reduce((sum, model) => sum + model.totalBytes, 0);
  const enoughDisk = setup.device.diskFree !== null && setup.device.diskFree >= requiredBytes + 256 * 1024 ** 2;

  return <div className="local-ai-setup">
    <section className="settings-section">
      <div><h2>Local AI setup</h2><p>Prepare speech and analysis models on this computer.</p></div>
      <div className="settings-fields">
        <p>{setup.device.cpu} · {size(setup.device.totalMemory)} RAM · {setup.device.platform}/{setup.device.arch}</p>
        <p className="muted">Available memory: {size(setup.device.availableMemory)}. Free disk: {setup.device.diskFree === null ? 'unknown' : size(setup.device.diskFree)}.</p>
        <p className="muted">{setup.device.unifiedMemory ? 'Unified memory. ' : ''}GPU acceleration is unverified until the native inference runtime is installed and tested.</p>
        <p role="status">Open Local interview for streaming speech recognition on this computer. Optional AI analysis is not enabled yet. Existing chat audio still uses your configured cloud provider.</p>
        <label>Speech-to-text model<select value={selectionValue} disabled={busy || inProgress} onChange={event => void selectASR(event.target.value)}><option value="auto">Automatic (hardware recommendation)</option>{setup.models.filter(model => model.type === 'asr').map(model => <option key={model.id} value={model.id} disabled={Boolean(model.reason)}>{model.name}{model.reason ? ' — unavailable on this device' : ''}</option>)}</select></label>
        <p className="muted">Zipformer provides native streaming partials. Whisper tiny.en and Parakeet use Sherpa’s simulated streaming recognition; their interim updates may arrive later and need on-device speed testing. Parakeet needs substantially more memory. Model choice is saved to this account.</p>
        <label className="checkbox-label"><input type="checkbox" checked={includeAnalysis} disabled={busy || inProgress} onChange={event => setIncludeAnalysis(event.target.checked)} /> Also download optional lightweight analysis weights</label>
        <p>{size(requiredBytes)} download (estimate) · {selectedASR ? size(selectedASR.estimatedRamBytes) : 'unknown'} estimated speech model RAM. English speech models.</p>
        <button type="button" className="primary" disabled={busy || inProgress || !selected.length || !enoughDisk} onClick={() => void download(selected.map(model => model.id))}>Download required models</button>
        {!enoughDisk && selected.length > 0 && <p className="muted">Free disk space could not be confirmed or is too low. Refresh after freeing space.</p>}
        <button type="button" className="text-button" disabled={busy || inProgress} onClick={() => void refresh().catch(cause => setError(errorText(cause)))}>Refresh hardware and installed models</button>
        <p className="muted">Downloads contact Hugging Face for model files only. Files stay in <code>{setup.directory}</code>. No models load automatically.</p>
      </div>
    </section>
    <section className="settings-section" aria-label="Live transcription model test">
      <div><h2>Test live transcription</h2><p>Try each selected speech model with VAD on or off. Repeat once per combination and compare the live delay on this device.</p></div>
      <div className="settings-fields">
        <label>Audio input<select value={testSource} disabled={testBusy} onChange={event => setTestSource(event.target.value as AudioSource)}><option value="microphone">Microphone</option><option value="system">System audio (share a window or select a loopback input)</option></select></label>
        <label className="checkbox-label"><input type="checkbox" checked={testVad} disabled={testBusy} onChange={event => setTestVad(event.target.checked)} /> Use Silero VAD {setup.models.some(model => model.type === 'vad' && model.state === 'READY') ? '' : '(download it below first)'}</label>
        <label className="checkbox-label"><input type="checkbox" checked={testSpeakers} disabled={testBusy || testSource !== 'system' || !setup.models.some(model => model.type === 'diarization' && model.state === 'READY')} onChange={event => setTestSpeakers(event.target.checked)} /> Test optional system-audio speaker labeling {setup.models.some(model => model.type === 'diarization' && model.state === 'READY') ? '' : '(download speaker detection below first)'}</label>
        <p>Test configuration: <strong>{selectedASR?.name || 'No speech model selected'}</strong> · VAD {testVad ? 'on' : 'off'}</p>
        <p className="muted">Audio and test transcripts remain local. Test runs are saved with interview history. To compare combinations, switch the speech model above, then repeat with each input, VAD, and (for system audio) speaker-labeling setting.</p>
        <button type="button" className={testBusy ? 'danger-button' : 'primary'} disabled={!testBusy && (!selectedASR || selectedASR.state !== 'READY' || (testVad && !setup.models.some(model => model.type === 'vad' && model.state === 'READY')))} onClick={() => void (testBusy ? stopTest() : startTest())}>{testBusy ? 'Stop live test' : 'Start live test'}</button>
        {testLatency !== null && <p role="status">Recognition: {Math.round(testLatency)} ms per 100 ms audio frame · {testLatency > 100 ? 'behind real time' : 'keeping up so far'}</p>}
        {testWarning && <p role="alert" className="muted">{testWarning}</p>}
        {testSegments.map(segment => <p key={segment.segmentId}><strong>{segment.role === 'candidate' ? 'MICROPHONE' : 'SYSTEM AUDIO'}{segment.isFinal ? '' : ' · live'}</strong> {segment.text}</p>)}
      </div>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="local-model-list">
      {setup.models.map(model => <section className="local-model-card" key={model.id}>
        <div><h3>{model.name}{model.recommended ? ' · Recommended' : ''}</h3><p className="muted">{model.license} · {size(model.totalBytes)} download · ~{size(model.estimatedRamBytes)} RAM</p></div>
        <p role="status">{model.state.replaceAll('_', ' ')}{model.state === 'READY' ? ' — files verified' : ''}{model.id === selectedASR?.id ? ' · Selected speech model' : ''}</p>
        {active(model.state) && <><progress aria-label={`${model.name} download`} max={model.totalBytes || 1} value={model.downloadedBytes} /><span>{size(model.downloadedBytes)} / {size(model.totalBytes)}</span><button type="button" className="secondary" onClick={() => void pause(model.id)}>Pause download</button></>}
        {model.reason && <p className="muted">{model.reason}</p>}
        {model.error && <p className="error">{model.error}</p>}
        {!active(model.state) && <div className="local-model-actions">
          {model.state !== 'READY' && <button type="button" className="secondary" disabled={busy || inProgress || Boolean(model.reason)} onClick={() => void download([model.id])}>{model.state === 'NOT_INSTALLED' ? 'Download' : 'Repair / resume'}</button>}
          <button type="button" className="text-button" disabled={busy || inProgress} onClick={() => setDeleting(model.id)}>Delete local files</button>
        </div>}
        {deleting === model.id && <div role="alert"><p>Delete this model and its partial download? You can download it again.</p><button type="button" className="danger-button" disabled={busy} onClick={() => void remove(model.id)}>Delete model</button> <button type="button" className="text-button" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div>}
      </section>)}
    </div>
    <section className="settings-section"><div><h2>Feature availability</h2><p>Capabilities are shown explicitly as implementation proceeds.</p></div><div className="settings-fields">{setup.features.map(feature => <div key={feature.name}><strong>{feature.name} — {feature.state}</strong><p className="muted">{feature.reason}</p></div>)}</div></section>
  </div>;
}

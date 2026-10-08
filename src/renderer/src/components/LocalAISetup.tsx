import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Sliders, Volume2 } from 'lucide-react';
import type { LocalAISetup as Setup } from '../../../shared/localAI';
import type { Snapshot } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import type { AudioSource, InterviewEvent, InterviewSession, TranscriptSegment } from '../../../shared/interview';
import { updateTranscript } from '../../../shared/interview';
import { InterviewAudio } from '../services/interviewAudio';
import { useAppMode } from '../context/AppModeContext';

const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(0, Math.round(bytes / 1024))} KB`;
const speed = (bytes: number) => `${size(bytes)}/s`;
const active = (state: string) => ['DOWNLOADING', 'DOWNLOADED', 'VERIFYING'].includes(state);

export function LocalAISetup({ onSettingsSaved }: { onSettingsSaved?: (snapshot: Snapshot, modelId: string) => void } = {}) {
  const { setLocalTranscriptionActive } = useAppMode();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [includeAnalysis, setIncludeAnalysis] = useState(false);
  const [testSource, setTestSource] = useState<AudioSource>('microphone'), [testVad, setTestVad] = useState(true);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [testMicId, setTestMicId] = useState(''), [testSystemId, setTestSystemId] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<'mac' | 'windows' | 'linux'>(() => /Mac/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'windows' : 'linux');
  const [testSpeakers, setTestSpeakers] = useState(false);
  const [testBusy, setTestBusy] = useState(false), [testSession, setTestSession] = useState<InterviewSession | null>(null);
  const [testSegments, setTestSegments] = useState<TranscriptSegment[]>([]), [testWarning, setTestWarning] = useState('');
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const testAudio = useRef<InterviewAudio | null>(null), testSessionId = useRef('');
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
      if (event.type === 'status') { setTestSession(current => current ? { ...current, status: event.status } : current); testAudio.current?.close(); testAudio.current = null; setTestBusy(false); setLocalTranscriptionActive(false); }
    });
    void refresh().catch(cause => { if (mounted.current) setError(errorText(cause)); });
    return () => { mounted.current = false; cancelled.current = true; navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange); unsubscribe(); stopTranscriptEvents(); testAudio.current?.close(); setLocalTranscriptionActive(false); if (testSessionId.current) void window.novi.stopInterview(); };
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
    try {
      const snapshot = await unwrap(window.novi.selectLocalASR(id));
      setSetup(current => current ? { ...current, selectedASR: snapshot.settings?.localASRModelId || 'auto' } : current);
      onSettingsSaved?.(snapshot, id);
    } catch (cause) { setError(errorText(cause)); }
  }

  async function startTest() {
    if (!setup || !selectedASR || selectedASR.state !== 'READY') return;
    setTestBusy(true); setLocalTranscriptionActive(true); setTestSegments([]); setTestWarning(''); setTestLatency(null); testSessionId.current = '';
    try {
      const session = await unwrap(window.novi.startInterview({ mode: testSpeakers ? 'multiple' : 'conversation', vadThreshold: 0.006, diarization: testSpeakers, useVad: testVad }));
      if (!mounted.current) { await window.novi.stopInterview(); setLocalTranscriptionActive(false); return; }
      testSessionId.current = session.id; setTestSession(session);
      const capture = new InterviewAudio(frame => unwrap(window.novi.interviewFrame(frame)), setTestWarning); testAudio.current = capture;
      await capture.start(session.id, session.startedAt, 'conversation', testMicId, testSystemId, [testSource]);
    } catch (cause) {
      testAudio.current?.close(); testAudio.current = null; await window.novi.stopInterview();
      if (mounted.current) { setTestWarning(errorText(cause)); setTestBusy(false); setLocalTranscriptionActive(false); }
    }
  }
  async function stopTest() {
    setTestBusy(true);
    try { await testAudio.current?.stop(); testAudio.current = null; const session = await unwrap(window.novi.stopInterview()); if (session) setTestSession(session); }
    catch (cause) { setTestWarning(errorText(cause)); }
    finally { setTestBusy(false); setLocalTranscriptionActive(false); }
  }

  if (!setup) return <section className="settings-section"><h2>Local AI setup</h2><p role="status">{error || 'Checking this computer and installed models…'}</p>
    {error && <button type="button" className="secondary" onClick={() => void refresh().catch(cause => setError(errorText(cause)))}>Retry</button>}</section>;

  const inProgress = setup.models.some(model => active(model.state));
  const selectionValue = setup.selectedASR || 'auto';
  const selectedASR = setup.models.find(model => model.id === setup.selectedASR) || setup.models.find(model => model.type === 'asr' && model.recommended) || setup.models.find(model => model.type === 'asr');
  const selected = setup.models.filter(model => (model.id === selectedASR?.id || (model.type === 'vad' && model.recommended) || (includeAnalysis && model.type === 'llm' && !model.reason)) && model.state !== 'READY');
  const requiredBytes = selected.reduce((sum, model) => sum + model.totalBytes, 0);
  const enoughDisk = setup.device.diskFree !== null && setup.device.diskFree >= requiredBytes + 256 * 1024 ** 2;
  const vadReady = setup.models.some(model => model.type === 'vad' && model.state === 'READY');
  const lowAvailableMemory = setup.device.availableMemory < 1024 ** 3;

  const copyBrewCmd = async () => {
    try {
      await unwrap(window.novi.copyText('brew install blackhole-2ch'));
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
    } catch {
      void navigator.clipboard?.writeText('brew install blackhole-2ch');
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
    }
  };

  return <div className="local-ai-setup">
    <section className="settings-section">
      <div><h2>Local AI setup</h2><p>Prepare speech and analysis models on this computer.</p></div>
      <div className="settings-fields">
        <p>{setup.device.cpu} · {size(setup.device.totalMemory)} RAM · {setup.device.platform}/{setup.device.arch}</p>
        <p className="muted">Available memory: {size(setup.device.availableMemory)}. Free disk: {setup.device.diskFree === null ? 'unknown' : size(setup.device.diskFree)}.</p>
        {lowAvailableMemory && <p className="local-ai-warning" role="status">Memory is currently low. Model downloads are still available, but close other apps before starting transcription; optional features may be disabled automatically.</p>}
        <p className="muted">{setup.device.unifiedMemory ? 'Unified memory. ' : ''}GPU acceleration is unverified until the native inference runtime is installed and tested.</p>
        <p role="status">Use the live test below for streaming speech recognition on this computer. Optional AI analysis is not enabled yet. Existing chat audio still uses your configured cloud provider.</p>
        <label>Speech-to-text model<select value={selectionValue} disabled={busy || inProgress} onChange={event => void selectASR(event.target.value)}><option value="auto">Automatic (hardware recommendation)</option>{setup.models.filter(model => model.type === 'asr').map(model => <option key={model.id} value={model.id} disabled={Boolean(model.reason)}>{model.name}{model.reason ? ' — unavailable on this device' : ''}</option>)}</select></label>
        <p className="muted">Zipformer provides native streaming partials. Whisper tiny.en and Parakeet use Sherpa’s simulated streaming recognition; their interim updates may arrive later and need on-device speed testing. Parakeet needs substantially more memory. Model choice is saved to this account.</p>
        <label className="checkbox-label"><input type="checkbox" checked={includeAnalysis} disabled={busy || inProgress} onChange={event => setIncludeAnalysis(event.target.checked)} /> Also download optional lightweight analysis weights</label>
        <p>{size(requiredBytes)} download (estimate) · {selectedASR ? size(selectedASR.estimatedRamBytes) : 'unknown'} estimated speech model RAM. English speech models.</p>
        <button type="button" className="primary" disabled={busy || inProgress || !selected.length || !enoughDisk} onClick={() => void download(selected.map(model => model.id))}>Download required models</button>
        {!enoughDisk && selected.length > 0 && <p className="muted">Free disk space could not be confirmed or is too low. Refresh after freeing space.</p>}
        <button type="button" className="text-button" disabled={busy || inProgress} onClick={() => void refresh().catch(cause => setError(errorText(cause)))}>Refresh hardware and installed models</button>
        <p className="muted">Downloads contact Hugging Face for model files only. Models stay in <code>{setup.directory}</code>, outside the app bundle, and remain installed across app updates. Novi restarts automatically when an update requires it; you do not need to reinstall or re-download models.</p>
      </div>
    </section>
    <section className="settings-section" aria-label="Live transcription model test">
      <div><h2>Test live transcription</h2><p>Try each selected speech model with VAD on or off. Repeat once per combination and compare the live delay on this device.</p></div>
      <div className="settings-fields">
        <label>Audio input<select value={testSource} disabled={testBusy} onChange={event => setTestSource(event.target.value as AudioSource)}><option value="microphone">Microphone</option><option value="system">System audio (share a window or select a loopback input)</option></select></label>
        {testSource === 'microphone' && audioDevices.length > 0 && (
          <label>Microphone device<select value={testMicId} disabled={testBusy} onChange={event => setTestMicId(event.target.value)}><option value="">Default microphone</option>{audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone (${d.deviceId.slice(0, 8)})`}</option>)}</select></label>
        )}
        {testSource === 'system' && (
          <>
            <label>System audio / loopback device<select value={testSystemId} disabled={testBusy} onChange={event => setTestSystemId(event.target.value)}><option value="">{/Mac/.test(navigator.platform) ? 'Display capture / auto-detect loopback' : 'Default display capture loopback'}</option>{audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Audio device (${d.deviceId.slice(0, 8)})`}</option>)}</select></label>
            <div className="loopback-guide-card" style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                  <Volume2 size={16} color="var(--accent)" /> System Audio Loopback Setup Guide
                </div>
                <div className="duration-pill-group" style={{ margin: 0 }}>
                  <button
                    type="button"
                    className={`duration-pill-btn ${activePlatformTab === 'mac' ? 'active' : ''}`}
                    onClick={() => setActivePlatformTab('mac')}
                  >
                    macOS (BlackHole)
                  </button>
                  <button
                    type="button"
                    className={`duration-pill-btn ${activePlatformTab === 'windows' ? 'active' : ''}`}
                    onClick={() => setActivePlatformTab('windows')}
                  >
                    Windows (WASAPI)
                  </button>
                  <button
                    type="button"
                    className={`duration-pill-btn ${activePlatformTab === 'linux' ? 'active' : ''}`}
                    onClick={() => setActivePlatformTab('linux')}
                  >
                    Linux (PipeWire/Pulse)
                  </button>
                </div>
              </div>

              {activePlatformTab === 'mac' && (
                <div style={{ fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--muted)' }}>
                  <p style={{ margin: 0, color: 'var(--text)' }}>
                    macOS blocks apps from recording desktop playback directly without a virtual audio loopback driver like <strong>BlackHole 2ch</strong>.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--panel)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>Step 1: Install BlackHole (One click)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <code style={{ background: 'var(--surface)', padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'monospace', color: 'var(--text)' }}>
                        brew install blackhole-2ch
                      </code>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void copyBrewCmd()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', minHeight: 28, fontSize: 12 }}
                      >
                        {copiedCmd ? <><Check size={13} color="var(--accent)" /> Copied command!</> : <><Copy size={13} /> Copy brew command</>}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void window.novi.openExternal('https://existential.audio/blackhole/')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
                      >
                        <ExternalLink size={13} /> Direct .pkg download
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--panel)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>Step 2: Hear audio while capturing (Multi-Output Device)</div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void window.novi.openAudioMidiSetup()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', minHeight: 28, fontSize: 12 }}
                      >
                        <Sliders size={13} /> Open Audio MIDI Setup
                      </button>
                    </div>
                    <ol style={{ margin: '4px 0 0 18px', padding: 0 }}>
                      <li>In Audio MIDI Setup, click <strong>+</strong> at the bottom-left &gt; <em>Create Multi-Output Device</em>.</li>
                      <li>Check both your <strong>Headphones / Speakers</strong> AND <strong>BlackHole 2ch</strong>.</li>
                      <li>In macOS Sound settings, choose <strong>Multi-Output Device</strong> for playback.</li>
                      <li>In Novi above, select <strong>BlackHole 2ch</strong> in the device dropdown!</li>
                    </ol>
                  </div>
                </div>
              )}

              {activePlatformTab === 'windows' && (
                <div style={{ fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--muted)' }}>
                  <p style={{ margin: 0, color: 'var(--text)' }}>
                    <strong>Native WASAPI loopback:</strong> Windows captures desktop audio out of the box without extra software.
                  </p>
                  <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                    <li>Select <strong>Display audio / default loopback</strong> in the dropdown above, or choose <strong>Stereo Mix</strong> if enabled.</li>
                    <li>Click <strong>Start live test</strong> to begin transcribing system audio immediately.</li>
                  </ul>
                </div>
              )}

              {activePlatformTab === 'linux' && (
                <div style={{ fontSize: 12.5, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--muted)' }}>
                  <p style={{ margin: 0, color: 'var(--text)' }}>
                    <strong>PipeWire / PulseAudio monitors:</strong> Linux exposes desktop output monitor streams automatically.
                  </p>
                  <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                    <li>Select your <code>Monitor of Built-in Audio Analog Stereo</code> (or similar monitor device) in the dropdown above.</li>
                    <li>Volume and routing can be verified using <code>pavucontrol</code>.</li>
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
        <label className="checkbox-label"><input type="checkbox" checked={testVad} disabled={testBusy} onChange={event => setTestVad(event.target.checked)} /> Use Silero VAD {setup.models.some(model => model.type === 'vad' && model.state === 'READY') ? '' : '(download it below first)'}</label>
        <label className="checkbox-label"><input type="checkbox" checked={testSpeakers} disabled={testBusy || testSource !== 'system' || !setup.models.some(model => model.type === 'diarization' && model.state === 'READY')} onChange={event => setTestSpeakers(event.target.checked)} /> Test optional system-audio speaker labeling {setup.models.some(model => model.type === 'diarization' && model.state === 'READY') ? '' : '(download speaker detection below first)'}</label>
        <p>Test configuration: <strong>{selectedASR?.name || 'No speech model selected'}</strong> · VAD {testVad ? vadReady ? 'on' : 'requested (lightweight fallback; Silero is not installed)' : 'off'}</p>
        {testVad && !vadReady && <p className="muted">The test can start now with lightweight voice detection. Install Silero VAD to test neural VAD.</p>}
        <p className="muted">Live microphone/system audio is processed in memory; raw audio recordings are never saved. Test transcripts are saved locally with interview history. Choose a model above, then test microphone or system audio with VAD on/off; speaker labeling is available for system audio when its model is installed.</p>
        <button type="button" className={testBusy ? 'danger-button' : 'primary'} disabled={!testBusy && (!selectedASR || selectedASR.state !== 'READY')} onClick={() => void (testBusy ? stopTest() : startTest())}>{testBusy ? 'Stop live test' : 'Start live test'}</button>
        {testLatency !== null && <p role="status">Recognition: {Math.round(testLatency)} ms per 100 ms audio frame · {testLatency > 100 ? 'behind real time' : 'keeping up so far'}</p>}
        {testWarning && <p role="alert" className="muted">{testWarning}</p>}
        <div className="local-test-transcript" ref={testScroller} role="log" aria-label="Live local transcription results" aria-live="off">
          {!testSegments.length && <p className="muted">Your words will appear here while you speak.</p>}
          {testSegments.map(segment => <article key={segment.segmentId} className={segment.isFinal ? 'final' : 'partial'}><strong>{segment.role === 'candidate' ? 'MICROPHONE' : 'SYSTEM AUDIO'}{segment.isFinal ? '' : ' · LIVE'}</strong><p>{segment.text}{segment.isFinal ? '' : ' …'}</p></article>)}
        </div>
      </div>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="local-model-list">
      {setup.models.map(model => <section className="local-model-card" key={model.id}>
        <div><h3>{model.name}{model.recommended ? ' · Recommended' : ''}</h3><p className="muted">{model.license} · {size(model.totalBytes)} download · ~{size(model.estimatedRamBytes)} RAM</p></div>
        <p role="status">{model.state.replaceAll('_', ' ')}{model.state === 'READY' ? ' — files verified' : ''}{model.id === selectedASR?.id ? ' · Selected speech model' : ''}</p>
        {model.memoryWarning && <p className="local-ai-warning">{model.memoryWarning}</p>}
        {active(model.state) && <div className="local-model-progress"><div><strong>{model.state === 'DOWNLOADING' ? 'Downloading' : model.state === 'VERIFYING' ? 'Verifying files' : 'Download complete'}</strong><span>{Math.min(100, Math.floor(model.downloadedBytes / Math.max(1, model.totalBytes) * 100))}%</span></div><progress aria-label={`${model.name} download`} max={model.totalBytes || 1} value={model.downloadedBytes} /><div><span>{size(model.downloadedBytes)} of {size(model.totalBytes)}</span><span>{model.state === 'DOWNLOADING' && model.speedBytesPerSecond ? speed(model.speedBytesPerSecond) : model.state === 'DOWNLOADING' ? 'Starting…' : model.state === 'VERIFYING' ? 'Checking integrity…' : 'Finishing…'}</span></div><button type="button" className="secondary" onClick={() => void pause(model.id)}>Pause download</button></div>}
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

import { useEffect, useRef, useState } from 'react';
import type { InterviewEvent, InterviewMode, InterviewSession } from '../../../shared/interview';
import { updateTranscript } from '../../../shared/interview';
import { InterviewAudio } from '../services/interviewAudio';
import { unwrap, errorText } from '../services/api';
import { LocalAISetup } from '../components/LocalAISetup';
import { useAppMode } from '../context/AppModeContext';

export function InterviewPage({ onBack }: { onBack: () => void }) {
  const { setLocalInterviewOpen } = useAppMode();
  useEffect(() => { setLocalInterviewOpen(true); return () => setLocalInterviewOpen(false); }, [setLocalInterviewOpen]);
  const [mode, setMode] = useState<InterviewMode>('conversation');
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [history, setHistory] = useState<Array<Omit<InterviewSession, 'segments'>>>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [warning, setWarning] = useState('');
  const [setup, setSetup] = useState(false), [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState(''), [systemId, setSystemId] = useState('');
  const [threshold, setThreshold] = useState(0.006);
  const [diarization, setDiarization] = useState(false), [speakerThreshold, setSpeakerThreshold] = useState(0.6);
  const [levels, setLevels] = useState({ system: 0, microphone: 0 });
  const [metrics, setMetrics] = useState<Extract<InterviewEvent, { type: 'metrics' }> | null>(null);
  const audio = useRef<InterviewAudio | null>(null), sessionId = useRef(''), mounted = useRef(true);
  const scroller = useRef<HTMLDivElement>(null), atBottom = useRef(true);
  const recording = session?.status === 'recording';
  async function refresh() { const rows = await unwrap(window.novi.listInterviews()); if (mounted.current) setHistory(rows); }
  async function inputs() { const rows = await navigator.mediaDevices.enumerateDevices(); if (mounted.current) setDevices(rows.filter(device => device.kind === 'audioinput')); }

  useEffect(() => {
    mounted.current = true;
    void refresh().catch(cause => setError(errorText(cause)));
    void inputs().catch(() => {});
    navigator.mediaDevices.addEventListener('devicechange', inputs);
    const unsubscribe = window.novi.onInterview(event => {
      const id = 'sessionId' in event ? event.sessionId : event.segment.sessionId;
      if (event.type === 'warning' && !sessionId.current) { setWarning(event.message); return; }
      if (id !== sessionId.current) return;
      if (event.type === 'transcript:partial' || event.type === 'transcript:final') setSession(current => current ? { ...current, segments: updateTranscript(current.segments, event.segment) } : current);
      else if (event.type === 'audio:level') setLevels(current => ({ ...current, [event.source]: event.level }));
      else if (event.type === 'speaker:update') setSession(current => current ? { ...current, speakers: event.speakers } : current);
      else if (event.type === 'warning') setWarning(event.message);
      else if (event.type === 'metrics') setMetrics(event);
      else if (event.type === 'status') {
        audio.current?.close(); audio.current = null; setLevels({ system: 0, microphone: 0 });
        setSession(current => current ? { ...current, status: event.status, segments: current.segments.filter(segment => segment.isFinal) } : current);
        void refresh().catch(() => {});
      }
    });
    return () => { mounted.current = false; unsubscribe(); navigator.mediaDevices.removeEventListener('devicechange', inputs); audio.current?.close(); if (sessionId.current) void window.novi.stopInterview(); };
  }, []);
  useEffect(() => { if (atBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [session?.segments]);

  async function start() {
    setBusy(true); setError(''); setWarning(''); setMetrics(null);
    sessionId.current = '';
    try {
      const next = await unwrap(window.novi.startInterview({ mode, vadThreshold: threshold, diarization, speakerThreshold }));
      if (!mounted.current) { await window.novi.stopInterview(); return; }
      sessionId.current = next.id; setSession(next);
      const capture = new InterviewAudio(frame => unwrap(window.novi.interviewFrame(frame)), message => { if (mounted.current) setWarning(message); });
      audio.current = capture;
      await capture.start(next.id, next.startedAt, mode, microphoneId, systemId);
    } catch (cause) {
      audio.current?.close(); audio.current = null;
      const stopped = await window.novi.stopInterview();
      if (mounted.current) { setError(errorText(cause)); if (stopped.ok && stopped.value) setSession(stopped.value); }
    } finally { if (mounted.current) setBusy(false); }
  }
  async function stop() {
    setBusy(true);
    try { await audio.current?.stop(); audio.current = null; const next = await unwrap(window.novi.stopInterview()); if (next) setSession(next); await refresh(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function recover(id: string) {
    setBusy(true); setError('');
    try { const next = await unwrap(window.novi.readInterview(id)); sessionId.current = next.id; setSession(next); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function rename(speakerId: string, name: string) {
    if (!session || !name.trim() || session.speakers[speakerId] === name.trim()) return;
    try { const next = await unwrap(window.novi.renameInterviewSpeaker({ sessionId: session.id, speakerId, name })); setSession(current => current ? { ...current, speakers: next.speakers } : current); }
    catch (cause) { setError(errorText(cause)); }
  }

  return <main className="interview-page">
    <header className="interview-toolbar"><button type="button" className="text-button" disabled={busy || recording} onClick={onBack}>Back</button><h1>Interview</h1><button type="button" className="text-button" disabled={busy || recording} onClick={() => setSetup(value => !value)}>{setup ? 'Transcript' : 'Local AI setup'}</button></header>
    {setup ? <LocalAISetup /> : <>
      <p className="muted">Audio and transcripts in this interview stay on this computer. Existing account access still requires an internet connection.</p>
      <fieldset disabled={busy || recording} className="interview-options">
        <label>Interview audio<select value={mode} onChange={event => setMode(event.target.value as InterviewMode)}><option value="interviewer">Interviewer only</option><option value="conversation">Interviewer + Me</option><option value="multiple">Multiple interviewers</option></select></label>
        <label>System audio input<select value={systemId} onChange={event => setSystemId(event.target.value)}><option value="">System audio sharing</option>{devices.map((device, i) => <option key={device.deviceId || i} value={device.deviceId}>{device.label || `Input ${i + 1}`}</option>)}</select></label>
        {mode !== 'interviewer' && <label>My microphone<select value={microphoneId} onChange={event => setMicrophoneId(event.target.value)}><option value="">Default microphone</option>{devices.map((device, i) => <option key={device.deviceId || i} value={device.deviceId}>{device.label || `Input ${i + 1}`}</option>)}</select></label>}
        <label>Lightweight voice threshold<input type="number" min="0.001" max="0.05" step="0.001" value={threshold} onChange={event => setThreshold(Number(event.target.value))} /><small>Lower values detect quieter speech. Neural VAD uses its own threshold when installed.</small></label>
        <button type="button" className="text-button" onClick={() => void inputs().catch(cause => setError(errorText(cause)))}>Refresh inputs</button>
        {mode === 'multiple' && <><label><span><input type="checkbox" checked={diarization} onChange={event => setDiarization(event.target.checked)} /> Lite speaker detection</span><small>Requires the optional speaker model in Local AI setup.</small></label><label>Speaker similarity<input type="number" min="0.3" max="0.9" step="0.05" value={speakerThreshold} onChange={event => setSpeakerThreshold(Number(event.target.value))} /><small>Higher values separate more voices, but may split one person into multiple labels.</small></label></>}
      </fieldset>
      {mode === 'multiple' && <p className="muted">Lite detection labels completed turns, not overlapping voices or changes within a turn. Short or uncertain turns retain the generic interviewer label. Speaker names are editable.</p>}
      <div className="interview-toolbar"><button type="button" className={recording ? 'danger-button' : 'primary'} disabled={busy} onClick={() => void (recording ? stop() : start())}>{busy ? 'Please wait…' : recording ? 'Stop interview' : 'Start local interview'}</button>
        <label>System <meter min={0} max={1} value={levels.system} /></label>{mode !== 'interviewer' && <label>Microphone <meter min={0} max={1} value={levels.microphone} /></label>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}{warning && <p role="status">{warning}</p>}
      {metrics && <p className="muted">ASR: {Math.round(metrics.processingMs)} ms/frame · Queue: {metrics.queueDepth} · Dropped: {metrics.droppedFrames} · Speech memory: {Math.round(metrics.memoryBytes / 1024 ** 2)} MB</p>}
      {session && <div className="interview-speakers">{Object.entries(session.speakers).map(([id, name]) => <label key={`${session.id}-${id}-${name}`}>Speaker name<input aria-label={`Rename ${name}`} defaultValue={name} maxLength={60} onBlur={event => void rename(id, event.target.value)} /></label>)}</div>}
      <div className="interview-transcript" ref={scroller} role="log" aria-label="Live interview transcript" aria-live="off" onScroll={() => { const div = scroller.current; if (div) atBottom.current = div.scrollHeight - div.scrollTop - div.clientHeight < 80; }}>
        {!session?.segments.length && <p className="muted">Speech will appear here as it is recognized. Final segments save automatically.</p>}
        {session?.segments.map(segment => <article key={segment.segmentId} className={`transcript-segment ${segment.isFinal ? 'final' : 'partial'}`}><strong>{session.speakers[segment.speakerId] || segment.role}</strong><span className="muted"> {Math.floor(segment.startTime / 60000)}:{String(Math.floor(segment.startTime / 1000) % 60).padStart(2, '0')}</span><p>{segment.text}{!segment.isFinal && <span aria-label="Still speaking"> …</span>}</p></article>)}
      </div>
      {!recording && history.length > 0 && <section><h2>Saved interviews</h2>{history.map(item => <button type="button" className="text-button" disabled={busy} key={item.id} onClick={() => void recover(item.id)}>{item.status === 'interrupted' ? 'Recover previous interview' : 'Open interview'} · {new Date(item.startedAt).toLocaleString()}</button>)}</section>}
    </>}
  </main>;
}

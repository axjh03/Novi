import { useCallback, useEffect, useRef, useState } from 'react';
import type { InterviewEvent, ListeningSource, TranscriptSegment } from '../../../shared/interview';
import { listeningSources, updateTranscript } from '../../../shared/interview';
import { errorText, unwrap } from '../services/api';
import { CloudListening } from '../services/cloudListening';
import { InterviewAudio } from '../services/interviewAudio';

export type ListeningEngine = 'local' | 'cloud';

/** Everything a view needs to show and drive listening. Shared by the Classic composer and the Modern windows. */
export interface ListeningController {
  active: boolean;
  starting: boolean;
  stopping: boolean;
  /** Starting or stopping: controls that would race the change are disabled. */
  transitioning: boolean;
  /** Current input level, 0 to 100, for meters. */
  level: number;
  warning: string;
  setWarning: (warning: string) => void;
  source: ListeningSource;
  setSource: (source: ListeningSource) => void;
  engine: ListeningEngine;
  setEngine: (engine: ListeningEngine) => void;
  /** The local speech model in use, once a local session has started. */
  modelId: string;
  /** The transcript of this listening session, newest segment last; partial segments are replaced as they finalise. */
  transcript: TranscriptSegment[];
  clearTranscript: () => void;
  toggle: (source?: ListeningSource) => Promise<void>;
  stop: () => Promise<void>;
}

let lastWarm = 0;
/** A send is likely soon: let main open the provider connection ahead of it (main throttles too). */
export function warmConnection() {
  const now = Date.now();
  if (now - lastWarm < 1000) return;
  lastWarm = now;
  void window.novi.warmConnection().catch(() => {});
}

/**
 * Owns one listening session: the capture, the local or cloud transcription, the transcript, the
 * hotkey (Alt+A) and the remote companion's listening actions. Views decide what to do with each
 * segment through `onSegment` (the Classic box writes it into the draft; Modern only keeps the transcript).
 *
 * @param suspended stops listening while true (for example while Settings cover the chat).
 * @param onSegment called for every partial or final transcript segment.
 * @param onStart   called when a session is about to start, before any audio is captured.
 * @param onStarted called once capture is running.
 */
export function useListening({ suspended = false, onSegment, onStart, onStarted }: {
  suspended?: boolean; onSegment?: (segment: TranscriptSegment) => void; onStart?: () => void; onStarted?: () => void;
} = {}): ListeningController {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [source, setSource] = useState<ListeningSource>(() => {
    const saved = localStorage.getItem('novi_listening_source');
    return saved === 'both' || saved === 'microphone' ? saved : 'system';
  });
  const [engine, setEngine] = useState<ListeningEngine>(() => localStorage.getItem('novi_listening_engine') === 'cloud' ? 'cloud' : 'local');
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [level, setLevel] = useState(0);
  const [modelId, setModelId] = useState('');
  const [warning, setWarning] = useState('');
  const cloud = useRef<CloudListening | null>(null);
  const transition = useRef(false);
  const mounted = useRef(true);
  const sessionId = useRef('');
  const timing = useRef(new Map<string, { captured: number; partial: boolean; final: boolean }>());
  const audio = useRef<InterviewAudio | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onSegment, onStart, onStarted });
  callbacks.current = { onSegment, onStart, onStarted };

  useEffect(() => { localStorage.setItem('novi_listening_source', source); }, [source]);
  useEffect(() => { localStorage.setItem('novi_listening_engine', engine); }, [engine]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      unsubscribe.current?.();
      audio.current?.close();
      if (!cloud.current && (sessionId.current || transition.current)) void window.novi.stopInterview();
      // Finish bounded cloud requests already accepted; unmounted views receive no callbacks.
      if (cloud.current) void cloud.current.stop(sessionId.current);
    };
  }, []);

  const segment = useCallback((next: TranscriptSegment) => {
    if (!mounted.current || next.sessionId !== sessionId.current) return;
    setTranscript(current => updateTranscript(current, next));
    const entry = timing.current.get(next.source);
    const stage = next.isFinal ? 'final' : 'partial';
    if (entry && !entry[stage]) {
      entry[stage] = true;
      console.info('[Novi latency]', { stage: `listening-first-${stage}`, source: next.source, captureToTranscriptMs: performance.now() - entry.captured });
    }
    callbacks.current.onSegment?.(next);
  }, []);

  const stop = useCallback(async () => {
    warmConnection();
    setStopping(true);
    try {
      await audio.current?.stop();
      if (cloud.current) await cloud.current.stop(sessionId.current);
      else {
        const session = await unwrap(window.novi.stopInterview());
        if (session && mounted.current) for (const item of session.segments) segment(item);
      }
    } finally {
      audio.current?.close();
      audio.current = null;
      cloud.current = null;
      unsubscribe.current?.();
      unsubscribe.current = null;
      sessionId.current = '';
      if (mounted.current) { setActive(false); setStopping(false); setLevel(0); }
    }
  }, [segment]);

  const toggle = useCallback(async (selected: ListeningSource = source) => {
    if (transition.current) return;
    transition.current = true;
    if (sessionId.current) {
      try { await stop(); }
      catch (cause) { setWarning(errorText(cause)); }
      finally { transition.current = false; }
      return;
    }
    setStarting(true);
    setWarning('');
    timing.current.clear();
    callbacks.current.onStart?.();
    try {
      let id: string, startedAt: number;
      const mode = selected === 'system' ? 'interviewer' : 'conversation';
      if (engine === 'local') {
        unsubscribe.current = window.novi.onInterview((event: InterviewEvent) => {
          if (!mounted.current) return;
          if (event.type === 'transcript:partial' || event.type === 'transcript:final') segment(event.segment);
          else if ('sessionId' in event && (event.sessionId === sessionId.current || !sessionId.current)) {
            if (event.type === 'warning') setWarning(event.message);
            if (event.type === 'status' && event.sessionId === sessionId.current && event.status !== 'recording') {
              audio.current?.close();
              sessionId.current = '';
              unsubscribe.current?.();
              unsubscribe.current = null;
              setActive(false); setLevel(0);
            }
          }
        });
        const session = await unwrap(window.novi.startInterview({ mode, vadThreshold: 0.006, diarization: selected === 'both', useVad: true }));
        if (!mounted.current) return;
        id = session.id; startedAt = session.startedAt;
        setModelId(session.modelId);
      } else {
        id = crypto.randomUUID(); startedAt = Date.now();
        cloud.current = new CloudListening(async wav => {
          let binary = '';
          for (const byte of wav) binary += String.fromCharCode(byte);
          const result = await unwrap(window.novi.transcribeAudio({ base64: btoa(binary), mimeType: 'audio/wav' }));
          return result.text;
        }, segment, message => { if (mounted.current) setWarning(message); });
      }
      sessionId.current = id;
      const capture = new InterviewAudio(async frame => {
        if (!mounted.current || frame.sessionId !== sessionId.current) return;
        if (!timing.current.has(frame.source)) {
          timing.current.set(frame.source, { captured: performance.now(), partial: false, final: false });
          console.info('[Novi latency]', { stage: 'listening-first-frame', source: frame.source, captureElapsedMs: frame.startTime });
        }
        setLevel(Math.min(1, Math.sqrt(frame.samples.reduce((sum, value) => sum + value * value, 0) / frame.samples.length) * 8) * 100);
        if (cloud.current) cloud.current.frame(frame);
        else await unwrap(window.novi.interviewFrame(frame));
      }, message => { if (mounted.current) setWarning(message); });
      audio.current = capture;
      await capture.start(id, startedAt, mode, '', '', listeningSources(selected));
      if (!mounted.current) { capture.close(); return; }
      setActive(true);
      callbacks.current.onStarted?.();
    } catch (cause) {
      if (!mounted.current) return;
      try { await stop(); } catch { /* Keep the original startup error. */ }
      if (mounted.current) setWarning(errorText(cause));
    } finally {
      transition.current = false;
      if (mounted.current) setStarting(false);
    }
  }, [engine, segment, source, stop]);

  // Alt+A listens and stops from anywhere in the window; the floating windows forward it here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        if (!event.repeat) void toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  // Covered by Settings or another page: stop rather than keep capturing unseen.
  useEffect(() => {
    if (suspended && active && !transition.current) void toggle();
  }, [suspended, active, starting, stopping, toggle]);

  // The remote companion and global hotkeys choose the source and start or stop.
  useEffect(() => window.novi.onGlobalAction((action) => {
    if (suspended) return;
    if (action.type === 'toggle-audio-record' || action.type === 'toggle-listening') {
      const next = action.payload === 'both' || action.payload === 'microphone' || action.payload === 'system' ? action.payload : source;
      if (!sessionId.current && !transition.current) setSource(next);
      void toggle(next);
    } else if (action.type === 'set-listening-mode' && !sessionId.current && !transition.current && ['system', 'both', 'microphone'].includes(action.payload)) {
      setSource(action.payload);
    }
  }), [suspended, source, toggle]);

  const clearTranscript = useCallback(() => setTranscript([]), []);
  return { active, starting, stopping, transitioning: starting || stopping, level, warning, setWarning, source, setSource, engine, setEngine, modelId, transcript, clearTranscript, toggle, stop };
}

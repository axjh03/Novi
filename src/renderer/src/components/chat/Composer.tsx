import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ArrowUp, Brain, Camera, ImagePlus, Mic, Square, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import type { InterviewEvent, ListeningSource, TranscriptSegment } from '../../../../shared/interview';
import { LiveTranscriptDraft, listeningSources } from '../../../../shared/interview';
import { errorText, unwrap } from '../../services/api';
import { ImagePreview } from './Message';
import { useAppMode } from '../../context/AppModeContext';
import { AudioMeter } from '../AudioMeter';
import { DRAW_DIAGRAM_PROMPT } from '../../../../shared/sessionModes';
import { CloudListening } from '../../services/cloudListening';
import { InterviewAudio } from '../../services/interviewAudio';

interface Props {
  busy: boolean;
  speechModelId?: string;
  onSend: (content: string, images: ImageAttachment[]) => Promise<boolean>;
}

export function Composer({ busy, onSend, speechModelId = 'auto' }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [localActive, setLocalActive] = useState(false);
  const [source, setSource] = useState<ListeningSource>(() => {
    const saved = localStorage.getItem('novi_listening_source');
    return saved === 'both' || saved === 'microphone' ? saved : 'system';
  });
  const [engine, setEngine] = useState<'local' | 'cloud'>(() => localStorage.getItem('novi_listening_engine') === 'cloud' ? 'cloud' : 'local');
  const cloud = useRef<CloudListening | null>(null);
  const draft = useRef(new LiveTranscriptDraft());
  const [localStarting, setLocalStarting] = useState(false);
  const [localStopping, setLocalStopping] = useState(false);
  const [localLevel, setLocalLevel] = useState(0);
  const [activeModel, setActiveModel] = useState('');
  const localTransition = useRef(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  const [localWarning, setLocalWarning] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const sessionId = useRef('');
  const listeningTiming = useRef(new Map<string, { captured: number; partial: boolean; final: boolean }>());
  const localAudio = useRef<InterviewAudio | null>(null);
  const unsubscribeInterview = useRef<(() => void) | null>(null);
  const depth = useRef(0);
  const lastWarm = useRef(0);

  const {
    pendingAttachment,
    consumePendingAttachment,
    captureScreenshot,
    appMode,
  } = useAppMode();

  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { localStorage.setItem('novi_listening_source', source); }, [source]);
  useEffect(() => { localStorage.setItem('novi_listening_engine', engine); }, [engine]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      unsubscribeInterview.current?.();
      localAudio.current?.close();
      if (!cloud.current && (sessionId.current || localTransition.current)) void window.novi.stopInterview();
      // Finish bounded cloud requests already accepted; unmounted drafts receive no callbacks.
      if (cloud.current) void cloud.current.stop(sessionId.current);
    };
  }, []);

  // A send is likely soon: let main open the provider connection ahead of it (main throttles too).
  function warmConnection() {
    const now = Date.now();
    if (now - lastWarm.current < 1000) return;
    lastWarm.current = now;
    void window.novi.warmConnection().catch(() => {});
  }

  function updateDraft(segment: TranscriptSegment) {
    if (!mounted.current || segment.sessionId !== sessionId.current) return;
    const timing = listeningTiming.current.get(segment.source);
    const stage = segment.isFinal ? 'final' : 'partial';
    if (timing && !timing[stage]) {
      timing[stage] = true;
      console.info('[Novi latency]', { stage: `listening-first-${stage}`, source: segment.source, captureToTranscriptMs: performance.now() - timing.captured });
    }
    textRef.current = draft.current.update(segment);
    setText(textRef.current);
    if (textarea.current) {
      textarea.current.style.height = 'auto';
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
    }
  }

  async function stopListening() {
    warmConnection();
    setLocalStopping(true);
    try {
      await localAudio.current?.stop();
      if (cloud.current) await cloud.current.stop(sessionId.current);
      else {
        const session = await unwrap(window.novi.stopInterview());
        if (session && mounted.current) for (const segment of session.segments) {
          textRef.current = draft.current.update(segment);
          setText(textRef.current);
        }
      }
    } finally {
      localAudio.current?.close();
      localAudio.current = null;
      cloud.current = null;
      unsubscribeInterview.current?.();
      unsubscribeInterview.current = null;
      sessionId.current = '';
      if (mounted.current) { setLocalActive(false); setLocalStopping(false); setLocalLevel(0); }
    }
  }

  async function toggleListening(selectedSource: ListeningSource = source) {
    if (localTransition.current) return;
    localTransition.current = true;
    if (sessionId.current) {
      try { await stopListening(); }
      catch (cause) { setLocalWarning(errorText(cause)); }
      finally { localTransition.current = false; }
      return;
    }
    setLocalStarting(true);
    setLocalWarning('');
    listeningTiming.current.clear();
    draft.current = new LiveTranscriptDraft();
    draft.current.edit(textRef.current);
    try {
      let id: string, startedAt: number;
      const mode = selectedSource === 'system' ? 'interviewer' : 'conversation';
      if (engine === 'local') {
        unsubscribeInterview.current = window.novi.onInterview((event: InterviewEvent) => {
          if (!mounted.current) return;
          if (event.type === 'transcript:partial' || event.type === 'transcript:final') updateDraft(event.segment);
          else if ('sessionId' in event && (event.sessionId === sessionId.current || !sessionId.current)) {
            if (event.type === 'warning') setLocalWarning(event.message);
            if (event.type === 'status' && event.sessionId === sessionId.current && event.status !== 'recording') {
              localAudio.current?.close();
              sessionId.current = '';
              unsubscribeInterview.current?.();
              unsubscribeInterview.current = null;
              setLocalActive(false); setLocalLevel(0);
            }
          }
        });
        const session = await unwrap(window.novi.startInterview({ mode, vadThreshold: 0.006, diarization: selectedSource === 'both', useVad: true }));
        if (!mounted.current) return;
        id = session.id; startedAt = session.startedAt;
        setActiveModel(session.modelId);
      } else {
        id = crypto.randomUUID(); startedAt = Date.now();
        cloud.current = new CloudListening(async wav => {
          let binary = '';
          for (const byte of wav) binary += String.fromCharCode(byte);
          const result = await unwrap(window.novi.transcribeAudio({ base64: btoa(binary), mimeType: 'audio/wav' }));
          return result.text;
        }, updateDraft, warning => { if (mounted.current) setLocalWarning(warning); });
      }
      sessionId.current = id;
      const capture = new InterviewAudio(async frame => {
        if (!mounted.current || frame.sessionId !== sessionId.current) return;
        if (!listeningTiming.current.has(frame.source)) {
          listeningTiming.current.set(frame.source, { captured: performance.now(), partial: false, final: false });
          console.info('[Novi latency]', { stage: 'listening-first-frame', source: frame.source, captureElapsedMs: frame.startTime });
        }
        setLocalLevel(Math.min(1, Math.sqrt(frame.samples.reduce((sum, value) => sum + value * value, 0) / frame.samples.length) * 8) * 100);
        if (cloud.current) {
          cloud.current.frame(frame);
        } else await unwrap(window.novi.interviewFrame(frame));
      }, warning => { if (mounted.current) setLocalWarning(warning); });
      localAudio.current = capture;
      await capture.start(id, startedAt, mode, '', '', listeningSources(selectedSource));
      if (!mounted.current) { capture.close(); return; }
      setLocalActive(true);
      textarea.current?.focus();
    } catch (cause) {
      if (!mounted.current) return;
      try { await stopListening(); } catch { /* Keep the original startup error. */ }
      if (mounted.current) setLocalWarning(errorText(cause));
    } finally {
      localTransition.current = false;
      if (mounted.current) setLocalStarting(false);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        if (!event.repeat) void toggleListening();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleListening]);

  // Consume any newly captured screenshot
  useEffect(() => {
    if (pendingAttachment) {
      const attachment = consumePendingAttachment();
      if (attachment) {
        setImages((prev) => (prev.some((img) => img.id === attachment.id) ? prev : [...prev, attachment]));
        textarea.current?.focus();
      }
    }
  }, [pendingAttachment, consumePendingAttachment]);

  // Listen for remote companion actions
  useEffect(() => {
    const cleanup = window.novi.onGlobalAction((action) => {
      if (action.type === 'toggle-audio-record' || action.type === 'toggle-listening') {
        const next = action.payload === 'both' || action.payload === 'microphone' || action.payload === 'system' ? action.payload : source;
        if (!sessionId.current && !localTransition.current) setSource(next);
        void toggleListening(next);
      } else if (action.type === 'set-listening-mode' && !sessionId.current && !localTransition.current && ['system', 'both', 'microphone'].includes(action.payload)) {
        setSource(action.payload);
      } else if (action.type === 'submit-prompt') {
        void submit();
      } else if (action.type === 'delete-last-snapshot') {
        setImages((prev) => prev.slice(0, -1));
      } else if (action.type === 'stop-generation') {
        void window.novi.stop();
      } else if (action.type === 'quick-prompt' && typeof action.payload === 'string') {
        if (busy || sending.current) return;
        draft.current.edit(action.payload); textRef.current = action.payload; setText(action.payload);
        void submit();
      }
    });
    return cleanup;
  }, [submit, onSend, images]);

  async function attach(files?: File[]) {
    if (busy || attaching) return;
    setError('');
    setAttaching(true);
    try {
      if (files?.some((file) => !/\.(png|jpe?g|webp)$/i.test(file.name)))
        throw new Error('Only PNG, JPG, JPEG, and WEBP images are supported.');
      if (files && images.length + files.length > 6) throw new Error('Attach up to 6 images per message.');
      const added = await unwrap(files ? window.novi.dropImages(files) : window.novi.pickImages());
      if (images.length + added.length > 6) throw new Error('Attach up to 6 images per message.');
      setImages((current) => [...current, ...added]);
      textarea.current?.focus();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setAttaching(false);
    }
  }

  async function handleQuickScreenshot() {
    if (busy || attaching) return;
    setAttaching(true);
    try {
      await captureScreenshot();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAttaching(false);
    }
  }

  async function submit(event?: FormEvent, draw = false) {
    event?.preventDefault();
    if (busy || attaching || sending.current || localTransition.current) return;
    sending.current = true;
    try {
      const rawText = textRef.current;
      if (!draw && !rawText.trim() && !images.length) return;
      const sentText = draw ? `${DRAW_DIAGRAM_PROMPT}\n\nLatest transcript / question:\n${rawText.trim()}` : rawText.trim();
      const sentImages = images;
      setError('');
      draft.current.take(); textRef.current = ''; setText('');
      setImages([]);
      const success = await onSend(sentText, sentImages);
      if (!success) {
        textRef.current = draft.current.restore(rawText); setText(textRef.current);
        setImages(sentImages);
      }
    } catch (cause) { setError(errorText(cause)); }
    finally { sending.current = false; textarea.current?.focus(); }
  }

  function drag(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div className="composer-wrap">
      <form
        className={`composer ${dragging ? 'dragging' : ''}`}
        onSubmit={submit}
        onDragEnter={(e) => {
          drag(e);
          if (e.dataTransfer.types.includes('Files')) {
            depth.current++;
            setDragging(true);
          }
        }}
        onDragOver={drag}
        onDragLeave={(e) => {
          drag(e);
          if (--depth.current <= 0) {
            depth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(e) => {
          drag(e);
          depth.current = 0;
          setDragging(false);
          void attach(Array.from(e.dataTransfer.files));
        }}
      >
        {dragging && (
          <div className="drop-overlay">
            <ImagePlus size={24} />
            Drop images here
          </div>
        )}

        {/* Attachments Tray */}
        {!!images.length && (
          <div className="attachment-tray">
            {images.map((image) => (
              <div className="attachment" key={image.id}>
                <ImagePreview image={image} />
                <button
                  type="button"
                  aria-label={`Remove ${image.name}`}
                  onClick={() => setImages(images.filter((item) => item.id !== image.id))}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Area */}
        <textarea
          ref={textarea}
          aria-label="Message Novi"
          placeholder="Ask Novi anything…"
          rows={1}
          value={text}
          maxLength={100000}
          disabled={busy || localStarting || localStopping}
          onChange={(e) => {
            draft.current.edit(e.target.value);
            textRef.current = e.target.value;
            setText(e.target.value);
            if (e.target.value.trim()) warmConnection();
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />

        {/* Controls Toolbar */}
        <div className="composer-controls">
          <div className="attach-control">
            <button className="composer-quick-btn" type="button" disabled={busy || attaching}
              onClick={() => void attach()} aria-label="Attach image" title="Attach image">
              <ImagePlus size={14} />
            </button>
            <button className="composer-quick-btn" type="button" disabled={busy || attaching}
              onClick={() => void handleQuickScreenshot()} title="Snap entire screen (Alt+3)">
              <Camera size={14} /><span>Snapshot</span>
            </button>

            {appMode === 'system-design' && <button type="button" className="composer-quick-btn" disabled={busy || attaching || localStarting || localStopping} onClick={() => void submit(undefined, true)}>Draw / update diagram</button>}
            <div className="composer-audio-source composer-local-control">
              <button type="button" className={`composer-quick-btn ${localActive ? 'recording' : ''}`} onClick={() => void toggleListening()}
                disabled={localStarting || localStopping}>
                <Mic size={14} /><span>{localStarting ? 'Starting…' : localStopping ? 'Stopping…' : localActive ? 'Stop listening' : 'Start listening'}</span>
                {localActive && <AudioMeter level={localLevel} />}
              </button>
              <select aria-label="Audio input" value={source} disabled={localActive || localStarting || localStopping}
                onChange={(event) => setSource(event.target.value as ListeningSource)}>
                <option value="system">System audio</option>
                <option value="both">Mic + system audio</option>
                <option value="microphone">Mic only</option>
              </select>
              <label className="transcription-engine" title="Audio transcription engine"><Brain size={15} />
                <select aria-label="Audio transcription engine" value={engine} disabled={localActive || localStarting || localStopping}
                  onChange={(event) => setEngine(event.target.value as 'local' | 'cloud')}>
                  <option value="local">Local</option><option value="cloud">Cloud</option>
                </select>
              </label>
            </div>
          </div>

          {busy ? (
            <button
              type="button"
              className="send-button stop"
              aria-label="Stop generation"
              onClick={() => {
                unwrap(window.novi.stop()).catch((error) => setError(errorText(error)));
              }}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="send-button"
              aria-label="Send message"
              disabled={attaching || localStarting || localStopping || (!localActive && !text.trim() && !images.length)}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </form>

      {(error || localWarning) && (
        <div className="error composer-error" role="alert">
          {error || localWarning}
        </div>
      )}

    </div>
  );
}

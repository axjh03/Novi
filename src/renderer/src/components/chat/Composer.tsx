import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, Brain, Camera, ChevronUp, ImagePlus, Keyboard, Loader2, Mic, Network, SlidersHorizontal, Square, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import type { InterviewEvent, ListeningSource, TranscriptSegment } from '../../../../shared/interview';
import { LiveTranscriptDraft, listeningSources, updateTranscript } from '../../../../shared/interview';
import { errorText, unwrap } from '../../services/api';
import { ImagePreview } from './Message';
import { useAppMode } from '../../context/AppModeContext';
import { AudioMeter } from '../AudioMeter';
import { TrayMenu } from '../TrayMenu';
import { DRAW_DIAGRAM_PROMPT, SESSION_MODES } from '../../../../shared/sessionModes';
import { CloudListening } from '../../services/cloudListening';
import { InterviewAudio } from '../../services/interviewAudio';
import { LiveInsights } from '../LiveInsights';

interface Props {
  compact?: boolean;
  insights?: ReactNode;
  onEnd?: () => void;
  suspended?: boolean;
  busy: boolean;
  speechModelId?: string;
  onSend: (content: string, images: ImageAttachment[]) => Promise<boolean>;
  /** Called when listening starts or stops, with the message box text at that moment. */
  onListeningChange?: (active: boolean, text: string) => void;
  /** Replaces the message box text each time its id changes. */
  prefill?: { id: number; text: string };
  /** Called once a prefill is in the box, so it is not applied again by a later remount. */
  onPrefillApplied?: () => void;
  placeholder?: string;
  toolbar?: ReactNode;
  smartControl?: ReactNode;
}

export function Composer({ busy, onSend, compact = false, suspended = false, speechModelId = 'auto', onListeningChange, prefill, onPrefillApplied, placeholder, toolbar, insights, onEnd, smartControl }: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [insightMode, setInsightMode] = useState('Interview');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
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
    setAppMode,
    allows,
  } = useAppMode();

  useEffect(() => {
    void window.novi.reportCompanionState(suspended ? null : { mode: appMode, availableModes: SESSION_MODES.filter(mode => allows(mode.id)).map(mode => mode.id), busy, listening: localActive, source }).catch(() => {});
  }, [appMode, allows, busy, localActive, source, suspended]);
  useEffect(() => () => { void window.novi.reportCompanionState(null).catch(() => {}); }, []);

  useEffect(() => { textRef.current = text; }, [text]);
  // Fit the box to its text, including text set by code (sending clears it; transcripts and restores fill it).
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [text, compact, editorOpen]);
  useEffect(() => { if (compact && (text || images.length)) setEditorOpen(true); }, [compact, Boolean(text), Boolean(images.length)]);
  const listeningChange = useRef(onListeningChange);
  listeningChange.current = onListeningChange;
  // Stopping applies the final transcript before listening turns off, so the text here is complete.
  useEffect(() => { listeningChange.current?.(localActive, textRef.current); }, [localActive]);
  useEffect(() => {
    if (!prefill) return;
    draft.current.edit(prefill.text); textRef.current = prefill.text; setText(prefill.text);
    textarea.current?.focus();
    onPrefillApplied?.();
  }, [prefill?.id]);
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
    setTranscript(current => updateTranscript(current, segment));
    const timing = listeningTiming.current.get(segment.source);
    const stage = segment.isFinal ? 'final' : 'partial';
    if (timing && !timing[stage]) {
      timing[stage] = true;
      console.info('[Novi latency]', { stage: `listening-first-${stage}`, source: segment.source, captureToTranscriptMs: performance.now() - timing.captured });
    }
    textRef.current = draft.current.update(segment);
    setText(textRef.current);
  }

  async function stopListening() {
    warmConnection();
    setLocalStopping(true);
    try {
      await localAudio.current?.stop();
      if (cloud.current) await cloud.current.stop(sessionId.current);
      else {
        const session = await unwrap(window.novi.stopInterview());
        if (session && mounted.current) for (const segment of session.segments) updateDraft(segment);
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
    if (suspended && localActive && !localTransition.current) void toggleListening();
  }, [suspended, localActive, localStarting, localStopping]);

  useEffect(() => {
    const cleanup = window.novi.onGlobalAction((action) => {
      if (suspended) return;
      if (action.type === 'toggle-audio-record' || action.type === 'toggle-listening') {
        const next = action.payload === 'both' || action.payload === 'microphone' || action.payload === 'system' ? action.payload : source;
        if (!sessionId.current && !localTransition.current) setSource(next);
        void toggleListening(next);
      } else if (action.type === 'set-listening-mode' && !sessionId.current && !localTransition.current && ['system', 'both', 'microphone'].includes(action.payload)) {
        setSource(action.payload);
      } else if (action.type === 'submit-prompt') {
        void submit();
      } else if (action.type === 'capture-and-send') {
        if (!busy && !attaching && !sending.current) void unwrap(window.novi.captureScreen()).then((image) => submit(undefined, false, image)).catch((cause) => setError(errorText(cause)));
      } else if (action.type === 'delete-last-snapshot') {
        setImages((prev) => prev.slice(0, -1));
      } else if (action.type === 'stop-generation') {
        void window.novi.stop();
      } else if ((action.type === 'set-prompt' || action.type === 'quick-prompt') && typeof action.payload === 'string') {
        if (action.type === 'quick-prompt' && (busy || sending.current)) return;
        draft.current.edit(action.payload); textRef.current = action.payload; setText(action.payload);
        if (action.type === 'quick-prompt') void submit();
      }
    });
    return cleanup;
  }, [submit, onSend, images, suspended]);

  // Attaching and snapshots stay available while an answer streams, so the next question can be prepared.
  async function attach(files?: File[]) {
    if (attaching) return;
    setError('');
    setAttaching(true);
    try {
      if (files?.some((file) => !/\.(png|jpe?g|webp)$/i.test(file.name)))
        throw new Error('Only PNG, JPG, JPEG, and WEBP images are supported.');
      const added = await unwrap(files ? window.novi.dropImages(files) : window.novi.pickImages());
      setImages((current) => [...current, ...added]);
      textarea.current?.focus();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setAttaching(false);
    }
  }

  async function handleQuickScreenshot() {
    if (attaching) return;
    setAttaching(true);
    try {
      if (!await captureScreenshot()) setError('Screen capture failed. Check screen recording permission and the screenshot folder in Pictures.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAttaching(false);
    }
  }

  async function submit(event?: FormEvent, draw = false, addedImage?: ImageAttachment) {
    event?.preventDefault();
    if (busy || attaching || sending.current) {
      if (addedImage) setImages((current) => [...current, addedImage]);
      return;
    }
    sending.current = true;
    try {
      const rawText = textRef.current;
      if (!draw && !rawText.trim() && !images.length && !addedImage) return;
      const sentText = draw ? `${DRAW_DIAGRAM_PROMPT}\n\nLatest transcript / question:\n${rawText.trim()}` : rawText.trim() || (addedImage ? 'Analyze this screenshot.' : '');
      const sentImages = addedImage ? [...images, addedImage] : images;
      setError('');
      draft.current.take(); textRef.current = ''; setText('');
      setImages([]);
      // The box stays usable while the answer streams; keep the cursor there for the next question.
      textarea.current?.focus();
      const success = await onSend(compact ? `${insightMode} assistance. ${sentText}` : sentText, sentImages).catch((cause) => { setError(errorText(cause)); return false; });
      if (!success) {
        // Put the unsent message back ahead of anything typed or attached since.
        textRef.current = draft.current.restore(rawText); setText(textRef.current);
        setImages((current) => [...sentImages, ...current.filter((image) => !sentImages.some((sent) => sent.id === image.id))]);
        textarea.current?.focus();
      }
    } catch (cause) { setError(errorText(cause)); }
    finally { sending.current = false; }
  }

  function drag(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  const sendButton = busy ? <button type="button" className="send-button stop" aria-label="Stop generation" onClick={() => {
    unwrap(window.novi.stop()).catch(error => setError(errorText(error)));
    textarea.current?.focus();
  }}><Square size={15} fill="currentColor" /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={attaching || (!text.trim() && !images.length)}>{compact && onEnd ? <>Submit <span aria-hidden="true">↵</span></> : <ArrowUp size={20} />}</button>;

  const composerForm = (
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

        {/* All tools stay above the message box. */}
        <div className="composer-toolbar" id="composer-tools" hidden={compact && Boolean(onEnd) && !toolsOpen}>

          <div className="attach-control">
            <button className="composer-quick-btn composer-attach" type="button" disabled={attaching}
              onClick={() => void attach()} aria-label="Attach image" title="Attach image">
              <ImagePlus size={14} />
            </button>
            <button className="composer-quick-btn composer-snapshot" type="button" disabled={attaching}
              onClick={() => void handleQuickScreenshot()} aria-label="Snapshot" title="Snapshot: capture your working monitor (Alt+3)">
              <Camera size={14} />
            </button>

            {appMode === 'system-design' && <button type="button" className="composer-quick-btn composer-diagram" disabled={busy || attaching} onClick={() => void submit(undefined, true)} aria-label="Draw / update diagram" title="Draw / update diagram"><Network size={14} /></button>}
            <div className="composer-audio-source composer-local-control">
              <button type="button" className={`composer-quick-btn composer-mic ${localActive ? 'recording' : ''}`} onClick={() => void toggleListening()}
                disabled={localStarting || localStopping} aria-pressed={localActive}
                aria-label={localStarting ? 'Starting listening' : localStopping ? 'Stopping listening' : localActive ? 'Stop listening' : 'Start listening'}
                title={`${localStarting ? 'Starting…' : localStopping ? 'Stopping…' : localActive ? 'Stop listening' : 'Start listening'} (Alt+A)`}>
                {localStarting || localStopping ? <Loader2 size={14} className="spin" /> : <Mic size={14} />}
                {localActive && <AudioMeter level={localLevel} />}
              </button>
              <TrayMenu className="tray-audio-menu" label="Audio settings" title={<SlidersHorizontal size={14} />}>
              <div className="tray-menu-heading">Listening settings</div>
              <label className="tray-audio-input">Audio input
              <select className="composer-source" aria-label="Audio input" value={source} disabled={localActive || localStarting || localStopping}
                onChange={(event) => setSource(event.target.value as ListeningSource)}>
                <option value="system">System audio</option>
                <option value="both">Mic + system</option>
                <option value="microphone">Mic only</option>
              </select>
              </label>
              <label className="transcription-engine composer-engine" title="Audio transcription engine"><Brain size={15} /> Transcription
                <select aria-label="Audio transcription engine" value={engine} disabled={localActive || localStarting || localStopping}
                  onChange={(event) => setEngine(event.target.value as 'local' | 'cloud')}>
                  <option value="local">Local</option><option value="cloud">Cloud</option>
                </select>
              </label>
              </TrayMenu>
            </div>
          </div>
          {toolbar}
          {compact && !onEnd && <><button type="button" className="composer-quick-btn modern-editor-toggle" aria-label={editorOpen ? 'Collapse message box' : 'Write a message'} title={editorOpen ? 'Collapse message box' : 'Write a message'} aria-expanded={editorOpen}
            onClick={() => { setEditorOpen(value => !value); if (!editorOpen) window.setTimeout(() => textarea.current?.focus(), 0); }}>{editorOpen ? <ChevronUp size={16} /> : <Keyboard size={16} />}</button>{sendButton}</>}
        </div>

        {/* Attachments Tray */}
        {!!images.length && (
          <div className="attachment-tray">
            {images.map((image) => (
              <div className="attachment" key={image.id}>
                <ImagePreview image={image} />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${image.name}`}
                  onClick={() => setImages(images.filter((item) => item.id !== image.id))}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="composer-input" hidden={compact && !onEnd && !editorOpen}>
        <textarea
          ref={textarea}
          aria-label="Message Novi"
          placeholder={busy ? 'Type your next message… you can send it when Novi is ready' : placeholder || 'Ask Novi anything…'}
          rows={1}
          value={text}
          maxLength={100000}
          // Typing stays possible while an answer streams; submit() blocks sending until it finishes.
          onChange={(e) => {
            draft.current.edit(e.target.value);
            textRef.current = e.target.value;
            setText(e.target.value);
            if (e.target.value.trim()) warmConnection();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />

          {!compact && sendButton}
        </div>
        {compact && onEnd && <div className="live-composer-footer">{smartControl}
          <button type="button" className="composer-quick-btn live-tools-toggle" aria-label="Session tools" title="Models, audio, history and settings" aria-expanded={toolsOpen} aria-controls="composer-tools" onClick={() => setToolsOpen(value => !value)}><SlidersHorizontal size={15} /></button>
          {sendButton}
        </div>}
      </form>
  );

  return (
    <div className="composer-wrap" onKeyDown={event => {
      if (compact && (event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.defaultPrevented && !event.nativeEvent.isComposing) {
        event.preventDefault(); void submit(undefined, event.shiftKey && appMode === 'system-design');
      }
    }}>
      {compact && onEnd && <LiveInsights footer={composerForm} mode={insightMode} onMode={mode => { setInsightMode(mode); if (mode !== 'Interview') setAppMode('normal'); }} transcript={transcript} listening={localActive} transitioning={localStarting || localStopping} busy={busy || attaching}
        onAudio={() => void toggleListening()} onEnd={onEnd}
        onWindow={action => void unwrap(window.novi.workspaceAction(action)).catch(cause => setError(errorText(cause)))}
        onAsk={async action => {
          if (busy || sending.current) return;
          sending.current = true;
          try { await onSend(`${insightMode} assistance. ${action}\n\nUse only known conversation context; state uncertainty and do not invent facts.\n${transcript.map(segment => `${segment.source === 'microphone' ? 'You' : 'Speaker'}: ${segment.text}`).join('\n')}`, []); }
          catch (cause) { setError(errorText(cause)); }
          finally { sending.current = false; }
        }}>{insights}</LiveInsights>}
      {!(compact && onEnd) && composerForm}

      {(error || localWarning) && (
        <div className="error composer-error" role="alert">
          {error || localWarning}
        </div>
      )}

    </div>
  );
}

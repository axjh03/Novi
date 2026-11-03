import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, Brain, Camera, ImagePlus, Loader2, Mic, Network, SlidersHorizontal, Square, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import type { ListeningSource } from '../../../../shared/interview';
import { LiveTranscriptDraft } from '../../../../shared/interview';
import { errorText, unwrap } from '../../services/api';
import { ImagePreview } from './Message';
import { useAppMode } from '../../context/AppModeContext';
import { AudioMeter } from '../AudioMeter';
import { TrayMenu } from '../TrayMenu';
import { DRAW_DIAGRAM_PROMPT, SESSION_MODES } from '../../../../shared/sessionModes';
import { useListening, warmConnection } from '../../hooks/useListening';

interface Props {
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
}

/** The Classic message box: tools above, the text with its send button below, and the transcript written into the text as it arrives. */
export function Composer({ busy, onSend, suspended = false, onListeningChange, prefill, onPrefillApplied, placeholder, toolbar }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const draft = useRef(new LiveTranscriptDraft());
  const sending = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const depth = useRef(0);
  const { pendingAttachment, consumePendingAttachment, captureScreenshot, appMode, allows } = useAppMode();

  const listening = useListening({
    suspended,
    onSegment: segment => { textRef.current = draft.current.update(segment); setText(textRef.current); },
    onStart: () => { draft.current = new LiveTranscriptDraft(); draft.current.edit(textRef.current); },
    onStarted: () => textarea.current?.focus(),
  });

  useEffect(() => {
    void window.novi.reportCompanionState(suspended ? null : { mode: appMode, availableModes: SESSION_MODES.filter(mode => allows(mode.id)).map(mode => mode.id), busy, listening: listening.active, source: listening.source }).catch(() => {});
  }, [appMode, allows, busy, listening.active, listening.source, suspended]);
  useEffect(() => () => { void window.novi.reportCompanionState(null).catch(() => {}); }, []);

  useEffect(() => { textRef.current = text; }, [text]);
  // Fit the box to its text, including text set by code (sending clears it; transcripts and restores fill it).
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [text]);
  const listeningChange = useRef(onListeningChange);
  listeningChange.current = onListeningChange;
  // Stopping applies the final transcript before listening turns off, so the text here is complete.
  useEffect(() => { listeningChange.current?.(listening.active, textRef.current); }, [listening.active]);
  useEffect(() => {
    if (!prefill) return;
    draft.current.edit(prefill.text); textRef.current = prefill.text; setText(prefill.text);
    textarea.current?.focus();
    onPrefillApplied?.();
  }, [prefill?.id]);

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

  // Remote companion and global hotkey actions that concern the message itself.
  useEffect(() => {
    const cleanup = window.novi.onGlobalAction((action) => {
      if (suspended) return;
      if (action.type === 'submit-prompt') {
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
      if (!await captureScreenshot()) setError('Screen capture failed. Check screen recording permission.');
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
      const success = await onSend(sentText, sentImages).catch((cause) => { setError(errorText(cause)); return false; });
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
  }}><Square size={15} fill="currentColor" /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={attaching || (!text.trim() && !images.length)}><ArrowUp size={20} /></button>;

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

        {/* All tools stay above the message box. */}
        <div className="composer-toolbar" id="composer-tools">
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
              <button type="button" className={`composer-quick-btn composer-mic ${listening.active ? 'recording' : ''}`} onClick={() => void listening.toggle()}
                disabled={listening.transitioning} aria-pressed={listening.active}
                aria-label={listening.starting ? 'Starting listening' : listening.stopping ? 'Stopping listening' : listening.active ? 'Stop listening' : 'Start listening'}
                title={`${listening.starting ? 'Starting…' : listening.stopping ? 'Stopping…' : listening.active ? 'Stop listening' : 'Start listening'} (Alt+A)`}>
                {listening.transitioning ? <Loader2 size={14} className="spin" /> : <Mic size={14} />}
                {listening.active && <AudioMeter level={listening.level} />}
              </button>
              <TrayMenu className="tray-audio-menu" label="Audio settings" title={<SlidersHorizontal size={14} />}>
                <div className="tray-menu-heading">Listening settings</div>
                <label className="tray-audio-input">Audio input
                  <select className="composer-source" aria-label="Audio input" value={listening.source} disabled={listening.active || listening.transitioning}
                    onChange={(event) => listening.setSource(event.target.value as ListeningSource)}>
                    <option value="system">System audio</option>
                    <option value="both">Mic + system</option>
                    <option value="microphone">Mic only</option>
                  </select>
                </label>
                <label className="transcription-engine composer-engine" title="Audio transcription engine"><Brain size={15} /> Transcription
                  <select aria-label="Audio transcription engine" value={listening.engine} disabled={listening.active || listening.transitioning}
                    onChange={(event) => listening.setEngine(event.target.value as 'local' | 'cloud')}>
                    <option value="local">Local</option><option value="cloud">Cloud</option>
                  </select>
                </label>
              </TrayMenu>
            </div>
          </div>
          {toolbar}
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

        <div className="composer-input">
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
          {sendButton}
        </div>
      </form>

      {(error || listening.warning) && (
        <div className="error composer-error" role="alert">
          {error || listening.warning}
        </div>
      )}
    </div>
  );
}

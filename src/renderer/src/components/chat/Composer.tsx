import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ArrowUp, Camera, ChevronDown, ImagePlus, Mic, Radio, Square, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import type { AudioSource, InterviewEvent, InterviewMode, TranscriptSegment } from '../../../../shared/interview';
import { updateTranscript } from '../../../../shared/interview';
import { errorText, unwrap } from '../../services/api';
import { ImagePreview } from './Message';
import { useAppMode } from '../../context/AppModeContext';
import { AudioMeter } from '../AudioMeter';
import { InterviewAudio } from '../../services/interviewAudio';

interface Props {
  busy: boolean;
  onSend: (content: string, images: ImageAttachment[]) => Promise<boolean>;
}

export function Composer({ busy, onSend }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [localActive, setLocalActive] = useState(false);
  const [localMode, setLocalMode] = useState<InterviewMode>('interviewer');
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [localWarning, setLocalWarning] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const sessionId = useRef('');
  const localAudio = useRef<InterviewAudio | null>(null);
  const unsubscribeInterview = useRef<(() => void) | null>(null);
  const transcriptPrefix = useRef('');
  const depth = useRef(0);

  const {
    pendingTranscript,
    consumePendingTranscript,
    pendingAttachment,
    consumePendingAttachment,
    isRecordingAudio,
    isAudioStarting,
    isAudioProcessing,
    audioLevel,
    audioError,
    recordingSeconds,
    toggleAudioRecording,
    audioSource,
    setAudioSource,
    localTranscriptionActive,
    setLocalTranscriptionActive,
    captureScreenshot,
    appMode,
    behavioralFramework,
  } = useAppMode();

  useEffect(() => { textRef.current = text; }, [text]);

  useEffect(() => () => {
    unsubscribeInterview.current?.();
    localAudio.current?.close();
    if (sessionId.current) void window.novi.stopInterview();
    setLocalTranscriptionActive(false);
  }, [setLocalTranscriptionActive]);

  async function toggleLocalTranscription() {
    if (localActive) {
      localAudio.current?.stop().catch(() => {});
      localAudio.current = null;
      unsubscribeInterview.current?.();
      unsubscribeInterview.current = null;
      try { await unwrap(window.novi.stopInterview()); }
      catch (cause) { setLocalWarning(errorText(cause)); }
      sessionId.current = '';
      setLocalActive(false);
      setLocalTranscriptionActive(false);
      return;
    }
    if (isRecordingAudio || isAudioStarting || isAudioProcessing) {
      setLocalWarning('Stop the cloud audio recording before starting local transcription.');
      return;
    }
    setLocalWarning('');
    setSegments([]);
    segmentsRef.current = [];
    transcriptPrefix.current = textRef.current.trim();
    setLocalTranscriptionActive(true);
    try {
      const mode: InterviewMode = localMode === 'interviewer' ? 'interviewer' : 'conversation';
      const session = await unwrap(window.novi.startInterview({ mode, vadThreshold: 0.006, diarization: false, useVad: true }));
      sessionId.current = session.id;
      setLocalActive(true);
      unsubscribeInterview.current = window.novi.onInterview((event: InterviewEvent) => {
        if (event.type === 'transcript:partial' || event.type === 'transcript:final') {
          if (event.segment.sessionId !== session.id) return;
          const next = updateTranscript(segmentsRef.current, event.segment);
          segmentsRef.current = next;
          setSegments(next);
          const transcript = next.map(segment => segment.text).join(' ').trim();
          const prefix = transcriptPrefix.current;
          const updated = [prefix, transcript].filter(Boolean).join(prefix ? '\n' : '');
          textRef.current = updated;
          setText(updated);
        } else if ('sessionId' in event && event.sessionId === session.id) {
          if (event.type === 'warning') setLocalWarning(event.message);
          if (event.type === 'status') {
            localAudio.current?.close();
            localAudio.current = null;
            sessionId.current = '';
            setLocalActive(false);
            setLocalTranscriptionActive(false);
          }
        }
      });
      const capture = new InterviewAudio(frame => unwrap(window.novi.interviewFrame(frame)), setLocalWarning);
      localAudio.current = capture;
      await capture.start(session.id, session.startedAt, mode, '', '');
      textarea.current?.focus();
    } catch (cause) {
      localAudio.current?.close();
      localAudio.current = null;
      unsubscribeInterview.current?.();
      unsubscribeInterview.current = null;
      if (sessionId.current) await window.novi.stopInterview();
      sessionId.current = '';
      setLocalActive(false);
      setLocalTranscriptionActive(false);
      setLocalWarning(errorText(cause));
    }
  }

  // Consume any newly transcribed text
  useEffect(() => {
    if (pendingTranscript) {
      const transcript = consumePendingTranscript();
      if (transcript) {
        setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
        if (textarea.current) {
          textarea.current.focus();
          textarea.current.style.height = 'auto';
          textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
        }
      }
    }
  }, [pendingTranscript, consumePendingTranscript]);

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

  function getBehavioralPrefix(framework: string): string {
    switch (framework) {
      case 'star':
        return '[Behavioral Mode - STAR Method: Structure your spoken interview response using Situation, Task, Action, Result. Quantify measurable impact and keep it conversational for spoken delivery.]\n\n';
      case 'car':
        return '[Behavioral Mode - CAR Method: Structure your spoken interview response using Context, Action, Result. Keep it concise, punchy, and highlight measurable outcomes.]\n\n';
      case 'par':
        return '[Behavioral Mode - PAR Method: Structure your spoken interview response using Problem, Action, Resolution. Emphasize technical problem-solving and root cause resolution.]\n\n';
      case 'soar':
        return '[Behavioral Mode - SOAR Method: Structure your spoken interview response using Situation, Obstacle, Action, Result. Highlight navigating roadblocks, resilience, and final outcomes.]\n\n';
      case 'smart':
      default:
        return '[Behavioral Mode - SMART Auto-Detect: Analyze this interview question. Automatically select the optimal framework (STAR, CAR, or PAR). Respond with a structured, persuasive, authentic spoken response.]\n\n';
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || attaching || localActive || (!text.trim() && !images.length)) return;
    const rawText = text;
    let sentText = rawText.trim();
    if (appMode === 'behavioral' && sentText && !sentText.startsWith('[Behavioral Mode')) {
      sentText = `${getBehavioralPrefix(behavioralFramework)}${sentText}`;
    }
    const sentImages = images;
    setError('');
    setText('');
    setImages([]);
    if (textarea.current) textarea.current.style.height = '';
    const success = await onSend(sentText, sentImages);
    if (!success) {
      setText(rawText);
      setImages(sentImages);
    }
    textarea.current?.focus();
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
          disabled={busy || localActive}
          onChange={(e) => {
            setText(e.target.value);
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
              onClick={() => void handleQuickScreenshot()} title="Snap entire screen (Alt+3)">
              <Camera size={14} /><span>Snapshot</span>
            </button>

            {appMode !== 'behavioral' && <>
              {!localTranscriptionActive && <div className="composer-audio-source">
                <button type="button" className={`composer-quick-btn ${isRecordingAudio ? 'recording' : ''}`} onClick={toggleAudioRecording}
                  disabled={(busy && !isRecordingAudio) || isAudioStarting || isAudioProcessing}
                  title={isRecordingAudio ? `Stop ${audioSource} audio capture` : `Capture ${audioSource} audio (${audioSource === 'system' ? 'Alt+A' : 'microphone'})`}>
                  {audioSource === 'system' ? <Radio size={14} /> : <Mic size={14} />}
                  <span>{isRecordingAudio ? `${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}` : isAudioStarting ? 'Starting…' : isAudioProcessing ? 'Processing…' : audioSource === 'system' ? 'System audio' : 'Microphone'}</span>
                  {isRecordingAudio && <AudioMeter level={audioLevel} />}
                </button>
                <button type="button" className="composer-quick-btn composer-audio-menu-trigger" aria-label="Choose audio source" aria-expanded={audioMenuOpen} onClick={() => setAudioMenuOpen(open => !open)}><ChevronDown size={14} /></button>
                {audioMenuOpen && <div className="composer-audio-menu" role="menu">
                  {(['system', 'microphone'] as AudioSource[]).map(source => <button type="button" role="menuitemradio" aria-checked={audioSource === source} key={source} onClick={() => { setAudioSource(source); setAudioMenuOpen(false); }}>{source === 'system' ? <Radio size={14} /> : <Mic size={14} />}{source === 'system' ? 'System audio' : 'Microphone'}{audioSource === source ? ' ✓' : ''}</button>)}
                </div>}
              </div>}
              <div className="composer-audio-source composer-local-control">
                <button type="button" className={`composer-quick-btn ${localActive ? 'recording' : ''}`} onClick={() => void toggleLocalTranscription()} disabled={busy || isRecordingAudio || isAudioStarting || isAudioProcessing} title={localActive ? 'Stop local live transcription' : 'Start local live transcription'}>
                  <Mic size={14} /><span>{localActive ? 'Local listening' : 'Local'}</span>{localActive && <AudioMeter level={0} />}
                </button>
                <button type="button" className="composer-quick-btn composer-audio-menu-trigger" aria-label="Choose local transcription settings" aria-expanded={localMenuOpen} onClick={() => setLocalMenuOpen(open => !open)}><ChevronDown size={14} /></button>
                {localMenuOpen && <div className="composer-audio-menu composer-local-menu" role="group" aria-label="Local transcription settings">
                  <strong>Transcription mode</strong>
                  <button type="button" aria-pressed={localMode === 'interviewer'} onClick={() => { setLocalMode('interviewer'); setLocalMenuOpen(false); }}>System audio only{localMode === 'interviewer' ? ' ✓' : ''}</button>
                  <button type="button" aria-pressed={localMode === 'conversation'} onClick={() => { setLocalMode('conversation'); setLocalMenuOpen(false); }}>Interviewer + you{localMode === 'conversation' ? ' ✓' : ''}</button>
                  <strong>Chat response model</strong>
                  <button type="button" aria-pressed>Cloud LLM · configured provider ✓</button>
                  <button type="button" disabled title="Local LLM inference runtime is not integrated yet">Local LLM · unavailable</button>
                  <small>Live speech recognition stays on this device. Press Stop, review the draft, then press Enter to send it.</small>
                </div>}
              </div>
            </>}
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
              disabled={attaching || localActive || (!text.trim() && !images.length)}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </form>

      {(error || audioError || localWarning) && (
        <div className="error composer-error" role="alert">
          {error || audioError || localWarning}
        </div>
      )}

    </div>
  );
}

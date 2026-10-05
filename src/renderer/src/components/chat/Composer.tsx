import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ArrowUp, Camera, ImagePlus, Plus, Square, Volume2, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import { errorText, unwrap } from '../../services/api';
import { ImagePreview } from './Message';
import { useAppMode } from '../../context/AppModeContext';
import { AudioMeter } from '../AudioMeter';

interface Props {
  busy: boolean;
  onSend: (content: string, images: ImageAttachment[]) => Promise<boolean>;
}

export function Composer({ busy, onSend }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
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
    captureScreenshot,
    pendingAutoSend,
    consumePendingAutoSend,
    appMode,
    behavioralFramework,
  } = useAppMode();

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

  useEffect(() => {
    if (!pendingAutoSend || busy) return;
    const item = consumePendingAutoSend();
    if (item) {
      const content = appMode === 'behavioral' ? `${getBehavioralPrefix(behavioralFramework)}${item.text}` : item.text;
      void onSend(content, []).then((sent) => { if (!sent) setText(item.text); });
    }
  }, [pendingAutoSend, busy, consumePendingAutoSend, onSend, appMode, behavioralFramework]);

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
    setMenu(false);
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
    setMenu(false);
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
    if (busy || attaching || (!text.trim() && !images.length)) return;
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
          rows={2}
          value={text}
          maxLength={100000}
          disabled={busy}
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
          <div className="attach-control" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Plus / Attach Menu */}
            <button
              className="icon-button attach-button"
              aria-label="Add attachment"
              aria-expanded={menu}
              type="button"
              disabled={busy || attaching}
              onClick={() => setMenu(!menu)}
            >
              <Plus size={20} />
            </button>

            {menu && (
              <div className="attach-menu">
                <button type="button" onClick={() => void handleQuickScreenshot()}>
                  <Camera size={17} />
                  <span>Snap entire screen</span>
                  <span className="menu-key-tag">Alt+3</span>
                </button>
                <button type="button" onClick={() => void attach()}>
                  <ImagePlus size={17} />
                  <span>Attach image file</span>
                  <span>PNG, JPG, WEBP</span>
                </button>
              </div>
            )}

            {/* Quick Audio Recording Button */}
            {appMode !== 'behavioral' && <button
              type="button"
              className={`composer-quick-btn ${isRecordingAudio ? 'recording' : ''}`}
              onClick={toggleAudioRecording}
              disabled={(busy && !isRecordingAudio) || isAudioStarting || isAudioProcessing}
              title={isRecordingAudio ? 'Stop system audio capture' : 'Capture system audio (Alt+A)'}
            >
              <Volume2 size={14} />
              <span>
                {isRecordingAudio
                  ? `${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}`
                  : isAudioStarting ? 'Starting…' : isAudioProcessing ? 'Processing…' : 'System audio'}
              </span>
              {isRecordingAudio && <AudioMeter level={audioLevel} />}
            </button>}
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
              disabled={attaching || (!text.trim() && !images.length)}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </form>

      {(error || audioError) && (
        <div className="error composer-error" role="alert">
          {error || audioError}
        </div>
      )}

      <div className="composer-footnote">
        <span>
          Alt+3: Snap · Alt+A: Audio · Alt+C: Code · Alt+B: Interview
        </span>
        <span>
          ↵ Send <span className="shortcut-divider">/</span> Shift ↵ New line
        </span>
      </div>
    </div>
  );
}

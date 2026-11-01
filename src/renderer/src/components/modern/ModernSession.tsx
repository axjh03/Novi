import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { ImageAttachment, Snapshot } from '../../../../shared/types';
import { SESSION_MODES } from '../../../../shared/sessionModes';
import { insightQuestion } from '../../../../shared/liveInsights';
import { useAppMode } from '../../context/AppModeContext';
import { useListening, warmConnection } from '../../hooks/useListening';
import { errorText, unwrap } from '../../services/api';
import { TrayPortal } from '../TrayPortal';
import { AnswerStage, type StageTab } from './AnswerStage';
import { AppearanceBar } from './AppearanceBar';
import { ModernButton, useListeningClock } from './ModernKit';
import { SessionBar, type SessionHistory, type SessionLocal, type SessionModel } from './SessionBar';

export interface ModernSessionProps {
  state: Snapshot;
  /** The conversation for the Answer tab: the messages, or the empty state. */
  conversation: ReactNode;
  /** Anything that blocks sending: an answer streaming, context loading, the session ending. */
  busy: boolean;
  /** An answer is streaming right now, so the box offers Stop. */
  streaming: boolean;
  error: string; onDismissError: () => void;
  contextError: boolean; onRetryContext: () => void; retryingContext: boolean;
  onSend: (content: string, images: ImageAttachment[]) => Promise<boolean>;
  prefill?: { id: number; text: string }; onPrefillApplied?: () => void;
  placeholder?: string;
  model: SessionModel;
  history: SessionHistory;
  local: SessionLocal & { setup: ReactNode; binding: boolean };
  tools: ReactNode; debug: ReactNode; practice: ReactNode; ready: ReactNode;
  onDiagrams?: () => void;
  onEnd: () => void; ending: boolean;
  settingsOpen: boolean; onOpenSettings: () => void; onCloseSettings: () => void; settingsPanel: ReactNode;
  onSwitchToClassic: () => void;
  onClosed: () => void;
  listenKey: string;
}

/**
 * A Modern session: three floating windows sharing one listening session and one message box.
 *
 * Answer sends the question the other side just asked, or asks what to say next, with the
 * transcript attached; the transcript itself never lands in the message box. The box at the foot
 * of the stage is for your own questions and is always there.
 */
export function ModernSession(props: ModernSessionProps) {
  const { state, busy, streaming, onSend, local, settingsOpen, onOpenSettings, onCloseSettings, onClosed } = props;
  const { appMode, allows, captureScreenshot, pendingAttachment, consumePendingAttachment, overlayHost } = useAppMode();
  const listening = useListening();
  const elapsed = useListeningClock(listening.active);
  const [tab, setTab] = useState<StageTab>('answer');
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(''); textRef.current = text;
  const sending = useRef(false);
  const question = insightQuestion(listening.transcript);
  const shownError = props.error || error || listening.warning;

  useEffect(() => {
    void window.novi.reportCompanionState({ mode: appMode, availableModes: SESSION_MODES.filter(mode => allows(mode.id)).map(mode => mode.id), busy, listening: listening.active, source: listening.source }).catch(() => {});
  }, [appMode, allows, busy, listening.active, listening.source]);
  useEffect(() => () => { void window.novi.reportCompanionState(null).catch(() => {}); }, []);
  useEffect(() => {
    if (!props.prefill) return;
    setText(props.prefill.text); textarea.current?.focus(); props.onPrefillApplied?.();
  }, [props.prefill?.id]);
  useEffect(() => {
    if (!pendingAttachment) return;
    const attachment = consumePendingAttachment();
    if (attachment) setImages(current => current.some(image => image.id === attachment.id) ? current : [...current, attachment]);
  }, [pendingAttachment, consumePendingAttachment]);
  // Whenever the transcript brings a new question, the Answer tab is where the reply will land.
  useEffect(() => { if (question) setCollapsed(false); }, [question]);

  const transcriptBlock = () => listening.transcript.map(segment => `${segment.source === 'microphone' ? 'You' : segment.speakerId || 'Speaker'}: ${segment.text}`).join('\n');
  async function ask(action: string) {
    if (busy || sending.current) return;
    sending.current = true;
    setError('');
    try {
      const lines = transcriptBlock();
      await onSend(`${action}\n\nUse only what the conversation below says; state uncertainty and never invent facts.${lines ? `\n\nConversation so far:\n${lines}` : ''}`, []);
      setTab('answer'); setCollapsed(false);
    } catch (cause) { setError(errorText(cause)); }
    finally { sending.current = false; }
  }
  const answer = () => void ask(question ? `Answer this question from the other side: "${question}"` : 'What should I say next?');
  async function send(addedImage?: ImageAttachment) {
    if (busy || attaching || sending.current) { if (addedImage) setImages(current => [...current, addedImage]); return; }
    const raw = textRef.current.trim();
    const sentImages = addedImage ? [...images, addedImage] : images;
    if (!raw && !sentImages.length) return;
    sending.current = true;
    setError('');
    setText(''); setImages([]);
    textarea.current?.focus();
    try {
      const ok = await onSend(raw || 'Analyze this screenshot.', sentImages);
      if (!ok) { setText(current => [raw, current].filter(Boolean).join('\n')); setImages(current => [...sentImages, ...current.filter(image => !sentImages.some(sent => sent.id === image.id))]); }
      else { setTab('answer'); setCollapsed(false); }
    } catch (cause) { setError(errorText(cause)); }
    finally { sending.current = false; }
  }
  async function attach(files?: File[]) {
    if (attaching) return;
    setError(''); setAttaching(true);
    try {
      if (files?.some(file => !/\.(png|jpe?g|webp)$/i.test(file.name))) throw new Error('Only PNG, JPG, JPEG, and WEBP images are supported.');
      const added = await unwrap(files ? window.novi.dropImages(files) : window.novi.pickImages());
      setImages(current => [...current, ...added]);
      textarea.current?.focus();
    } catch (cause) { setError(errorText(cause)); }
    finally { setAttaching(false); }
  }
  async function snapshot() {
    if (attaching) return;
    setAttaching(true);
    try { if (!await captureScreenshot()) setError('Screen capture failed. Check screen recording permission and the screenshot folder in Pictures.'); }
    catch (cause) { setError(errorText(cause)); }
    finally { setAttaching(false); }
  }
  async function snapAndSend() {
    if (snapping || busy || sending.current) return;
    setSnapping(true); setError('');
    try { await send(await unwrap(window.novi.captureScreen())); }
    catch (cause) { setError(errorText(cause)); }
    finally { setSnapping(false); }
  }

  // The remote companion and global hotkeys act on the box the same way as in Classic.
  useEffect(() => window.novi.onGlobalAction(action => {
    if (action.type === 'submit-prompt') void send();
    else if (action.type === 'capture-and-send') void snapAndSend();
    else if (action.type === 'delete-last-snapshot') setImages(current => current.slice(0, -1));
    else if (action.type === 'stop-generation') void window.novi.stop();
    else if ((action.type === 'set-prompt' || action.type === 'quick-prompt') && typeof action.payload === 'string') {
      if (action.type === 'quick-prompt' && (busy || sending.current)) return;
      setText(action.payload); textRef.current = action.payload;
      if (action.type === 'quick-prompt') void send();
    }
  }), [busy, attaching, images, onSend]);

  const modeName = SESSION_MODES.find(mode => mode.id === appMode)?.name ?? 'Chat';
  const modelName = local.active ? local.model || 'Local Coding' : props.model.connection?.model || 'No model';
  const notices = <>
    {props.practice}
    {props.ready}
    {props.contextError && <div className="mod-error" role="alert"><span>Session setup could not finish. Your documents and instructions are still loaded.</span>
      <ModernButton icon={<RefreshCw />} label={props.retryingContext ? 'Retrying setup…' : 'Retry setup'} showLabel disabled={props.retryingContext} onClick={props.onRetryContext} /></div>}
    {shownError && <div className="mod-error" role="alert"><span>{shownError}</span><button type="button" className="mod-btn" aria-label="Dismiss" onClick={() => { props.onDismissError(); setError(''); listening.setWarning(''); }}><X size={13} /></button></div>}
  </>;

  return <>
    <TrayPortal detached modern role="left" onClosed={onClosed}>
      <SessionBar listening={listening} onSnapSend={() => void snapAndSend()} snapping={snapping} busy={busy} model={props.model} history={props.history} local={local} state={state}
        tools={props.tools} debug={props.debug} onOpenSettings={() => settingsOpen ? onCloseSettings() : onOpenSettings()} settingsOpen={settingsOpen} onEnd={props.onEnd} ending={props.ending}
        onDiagrams={props.onDiagrams} onSwitchToClassic={props.onSwitchToClassic} onError={setError} />
    </TrayPortal>
    <TrayPortal detached modern role="center" onClosed={onClosed} panel={settingsOpen ? props.settingsPanel : local.active && !local.binding ? local.setup : undefined} onPanelClose={settingsOpen ? onCloseSettings : undefined}>
      <div className="mod-stage-wrap" onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.defaultPrevented && !event.nativeEvent.isComposing) { event.preventDefault(); if (textRef.current.trim() || images.length) void send(); else answer(); }
      }}>
        <AnswerStage listening={listening} elapsed={elapsed} question={question} onAnswer={answer} busy={busy} onEnd={props.onEnd} ending={props.ending}
          onHide={() => void unwrap(window.novi.workspaceAction('hide')).catch(cause => setError(errorText(cause)))}
          tab={tab} setTab={setTab} collapsed={collapsed} setCollapsed={setCollapsed} conversation={props.conversation} transcript={listening.transcript} onAsk={action => void ask(action)}
          meta={<><b>{modeName}</b><span aria-hidden="true">·</span><span>{modelName}</span></>} notices={notices}
          composer={{ text, setText: value => { setText(value); if (value.trim()) warmConnection(); }, images, removeImage: id => setImages(current => current.filter(image => image.id !== id)), attach: files => void attach(files), snapshot: () => void snapshot(), attaching, send: () => void send(), streaming, stop: () => void unwrap(window.novi.stop()).catch(cause => setError(errorText(cause))), textareaRef: textarea, placeholder: props.placeholder }} />
      </div>
    </TrayPortal>
    <TrayPortal detached modern role="right" onClosed={onClosed}>
      <AppearanceBar onSwitchToClassic={props.onSwitchToClassic} onError={setError} />
    </TrayPortal>
    {/* Dialogs from the chat page portal into the center window through overlayHost. */}
    {overlayHost ? null : null}
  </>;
}

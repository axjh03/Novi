import { useLayoutEffect, useRef, type DragEvent, type ReactNode, type RefObject } from 'react';
import { ArrowUp, BadgeCheck, Camera, ChevronDown, ImagePlus, MessageSquareMore, RotateCcw, Sparkles, Square, Text, UserRound, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import type { TranscriptSegment } from '../../../../shared/interview';
import { formatSessionTime } from '../../../../shared/liveInsights';
import { ImagePreview } from '../chat/Message';
import type { ListeningController } from '../../hooks/useListening';
import { LiveMeter, ModernBar, ModernButton, ModernSegmented, clockText, modifierKey } from './ModernKit';

/** The one-tap questions under the answer; each sends with the transcript attached. */
export const QUICK_ACTIONS = [
  { label: 'What should I say next?', icon: Text },
  { label: 'Follow-up questions', icon: MessageSquareMore },
  { label: 'Who am I talking to?', icon: UserRound },
  { label: 'Fact check', icon: BadgeCheck },
  { label: 'Recap', icon: RotateCcw },
];

export type StageTab = 'answer' | 'transcript';

export interface StageComposer {
  text: string; setText: (text: string) => void;
  images: ImageAttachment[]; removeImage: (id: string) => void;
  attach: (files?: File[]) => void; snapshot: () => void; attaching: boolean;
  send: () => void; streaming: boolean; stop: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
}

/**
 * The answer stage (top center): a bar with the live clock, the one Answer action and the red stop,
 * and under it the panel: the answer or the transcript, quick questions, and the message box, which
 * is always there.
 */
export function AnswerStage({ listening, elapsed, question, onAnswer, busy, onEnd, ending, onHide, tab, setTab, collapsed, setCollapsed, conversation, transcript, onAsk, composer, meta, notices, children }: {
  listening: ListeningController; elapsed: number; question?: string; onAnswer: () => void; busy: boolean;
  onEnd: () => void; ending: boolean; onHide: () => void;
  tab: StageTab; setTab: (tab: StageTab) => void; collapsed: boolean; setCollapsed: (collapsed: boolean) => void;
  conversation: ReactNode; transcript: TranscriptSegment[]; onAsk: (action: string) => void;
  composer: StageComposer; meta: ReactNode; notices?: ReactNode; children?: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const dragDepth = useRef(0);
  const dragging = useRef(false);
  useLayoutEffect(() => { if (atBottom.current && content.current) content.current.scrollTop = content.current.scrollHeight; }, [conversation, transcript, tab]);
  useLayoutEffect(() => {
    const element = composer.textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [composer.text]);
  const listenState = listening.transitioning ? 'Connecting' : listening.active ? 'Listening' : elapsed ? 'Paused' : 'Ready';
  const drag = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); };
  const setDragging = (on: boolean) => { dragging.current = on; content.current?.closest('.mod-stage')?.querySelector('.mod-composer')?.classList.toggle('is-dragging', on); };
  return <>
    <ModernBar label="Answer controls" className="mod-stage-bar">
      <ModernButton icon={<LiveMeter level={listening.level} active={listening.active} connecting={listening.transitioning} />} label={listening.active ? 'Pause listening' : 'Start listening'} showLabel tone="live" pressed={listening.active} disabled={listening.transitioning} className="mod-shrink"
        title={`${listening.active ? 'Pause' : 'Start'} listening (Alt+A)`} onClick={() => void listening.toggle()} />
      <span className="mod-chip-status mod-clock" role="status" aria-label={`${listenState}, ${clockText(elapsed)} listened`} title={`${listenState} · time spent listening`}>{clockText(elapsed)}</span>
      <span className="mod-spacer" />
      <ModernButton icon={<Sparkles />} label="Answer" showLabel tone="primary" disabled={busy} kbd={`${modifierKey} ↵`} title={question ? `Answer: ${question}` : `Answer the latest question in the conversation (${modifierKey}+Enter)`} onClick={onAnswer} />
      <button type="button" className="mod-btn mod-stop" aria-label="End session" title="End the session" disabled={ending} onClick={onEnd}><i aria-hidden="true" /></button>
      <ModernButton icon={<X />} label="Hide Novi; the session continues" title={`Hide · ${modifierKey} + \\ brings it back`} tone="quiet" onClick={onHide} />
    </ModernBar>
    <section className={`mod-stage ${collapsed ? 'is-collapsed' : ''}`} aria-label="Live answers">
      <header className="mod-stage-head">
        <span className="mod-stage-meta">{meta}</span>
        <ModernSegmented tabs idPrefix="mod-stage" label="Panel view" value={tab} onChange={value => { setTab(value); setCollapsed(false); }}
          options={[{ id: 'answer', label: 'Answer' }, { id: 'transcript', label: 'Transcript', dot: transcript.length > 0 }]} />
        {busy && <span className="mod-thinking" role="status" aria-label="Novi is answering"><i /><i /><i /></span>}
        <button type="button" className="mod-collapse" aria-label={collapsed ? 'Expand the panel' : 'Collapse the panel'} aria-expanded={!collapsed} aria-controls="mod-stage-body" onClick={() => setCollapsed(!collapsed)}><ChevronDown size={15} /></button>
      </header>
      <div className="mod-stage-body" id="mod-stage-body" inert={collapsed}>
        <div className="mod-stage-inner">
          {notices}
          {question && <button type="button" className="mod-question" disabled={busy} onClick={onAnswer} title="Answer what they just asked"><Sparkles size={13} aria-hidden="true" /><span>{question}</span><b>Answer</b></button>}
          <div ref={content} onScroll={event => { const element = event.currentTarget; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }}
            id={`mod-stage-panel-${tab}`} role="tabpanel" tabIndex={0} aria-labelledby={`mod-stage-${tab}`} className="mod-scroll mod-tab-panel" key={tab}>
            {tab === 'answer' ? <div className="mod-answer">{conversation}</div> : <div className="mod-transcript">{transcript.length ? transcript.map(segment => <article key={`${segment.sessionId}:${segment.segmentId}`}><header><strong>{segment.source === 'microphone' ? 'You' : segment.speakerId || 'Speaker'}</strong><time>{formatSessionTime(segment.startTime)}</time></header><p className={segment.isFinal ? '' : 'partial'}>{segment.text}</p></article>) : <p className="mod-empty">Start listening to see the conversation here.</p>}</div>}
          </div>
          <div className="mod-chips" aria-label="Quick questions">{QUICK_ACTIONS.map(({ label, icon: Icon }, index) => <button type="button" className="mod-chip" key={label} disabled={busy} style={{ '--i': index } as React.CSSProperties} onClick={() => onAsk(label)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>
          <form className="mod-composer" onSubmit={event => { event.preventDefault(); composer.send(); }}
            onDragEnter={event => { drag(event); if (event.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }}
            onDragOver={drag}
            onDragLeave={event => { drag(event); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
            onDrop={event => { drag(event); dragDepth.current = 0; setDragging(false); composer.attach(Array.from(event.dataTransfer.files)); }}>
            {composer.images.length > 0 && <div className="mod-attachments">{composer.images.map(image => <span className="mod-attachment" key={image.id}><ImagePreview image={image} /><button type="button" className="mod-btn" aria-label={`Remove ${image.name}`} onClick={() => composer.removeImage(image.id)}><X size={11} /></button></span>)}</div>}
            <textarea ref={composer.textareaRef} aria-label="Message Novi" rows={1} maxLength={100000} value={composer.text}
              placeholder={busy ? 'Type the next question; it sends when Novi is ready' : composer.placeholder || 'Ask anything, or just press Answer'}
              onChange={event => composer.setText(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); composer.send(); } }} />
            <div className="mod-composer-foot">
              <ModernButton icon={<ImagePlus />} label="Attach image" disabled={composer.attaching} onClick={() => composer.attach()} />
              <ModernButton icon={<Camera />} label="Snapshot" title="Snapshot your working monitor (Alt+3)" disabled={composer.attaching} onClick={composer.snapshot} />
              {composer.streaming
                ? <ModernButton icon={<Square size={11} fill="currentColor" />} label="Stop generating" showLabel tone="quiet" className="mod-send" onClick={composer.stop} />
                : <ModernButton type="submit" icon={<ArrowUp />} label="Send" showLabel tone="primary" className="mod-send" disabled={composer.attaching || (!composer.text.trim() && !composer.images.length)} />}
            </div>
          </form>
          {children}
        </div>
      </div>
    </section>
  </>;
}

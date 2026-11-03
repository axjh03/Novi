import { useLayoutEffect, useRef, type DragEvent, type ReactNode, type RefObject } from 'react';
import { ArrowUp, BadgeCheck, Camera, ChevronDown, EyeOff, ImagePlus, MessageSquareMore, Mic, Pause, Plus, RotateCcw, SlidersHorizontal, Sparkles, Square, Text, UserRound, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import type { ListeningSource, TranscriptSegment } from '../../../../shared/interview';
import { formatSessionTime } from '../../../../shared/liveInsights';
import { ImagePreview } from '../chat/Message';
import type { ListeningController } from '../../hooks/useListening';
import { Cluster, Deck, MenuGroup, MenuItem, MenuTitle, Spacer, SplitTool, StatusStrip, Tabs, Tool, ToolMenu, closeMenu, modifierKey } from './DeckKit';

/** The questions beside Answer; each sends with the transcript attached. */
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
  snapshotKey: string;
}

/**
 * The live stage (top center): the only place that listens, snaps, answers, ends and hides.
 * A status strip reads the state; the row under it holds Listen with its audio choices, Snap,
 * the Answer split with the quick questions, the red End and Hide. The panel below shows the
 * answer or the transcript, with the message box always at its foot.
 */
export function LiveStage({ listening, elapsed, question, onAnswer, onAsk, onSnapSend, snapping, busy, onEnd, ending, onHide, tab, setTab, collapsed, setCollapsed, conversation, transcript, composer, meta, notices, children }: {
  listening: ListeningController; elapsed: number; question?: string; onAnswer: () => void; onAsk: (action: string) => void; onSnapSend: () => void; snapping: boolean; busy: boolean;
  onEnd: () => void; ending: boolean; onHide: () => void;
  tab: StageTab; setTab: (tab: StageTab) => void; collapsed: boolean; setCollapsed: (collapsed: boolean) => void;
  conversation: ReactNode; transcript: TranscriptSegment[];
  composer: StageComposer; meta: ReactNode; notices?: ReactNode; children?: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const dragDepth = useRef(0);
  useLayoutEffect(() => { if (atBottom.current && content.current) content.current.scrollTop = content.current.scrollHeight; }, [conversation, transcript, tab]);
  useLayoutEffect(() => {
    const element = composer.textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [composer.text]);
  const state = listening.transitioning ? 'Connecting' : listening.active ? 'Live' : elapsed ? 'Paused' : 'Ready';
  const drag = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); };
  const setDragging = (on: boolean) => { content.current?.closest('.deck-panel')?.querySelector('.deck-composer')?.classList.toggle('is-dragging', on); };
  const audioLocked = listening.active || listening.transitioning;
  return <>
    <Deck label="Live" className="deck-live" strip={<StatusStrip state={state} live={listening.active} connecting={listening.transitioning} level={listening.level} elapsed={elapsed} meta={meta} />}>
      <Cluster label="Listening">
        <Tool icon={listening.active ? <Pause /> : <Mic />} label={listening.transitioning ? 'Connecting' : listening.active ? 'Pause' : 'Listen'} showLabel tone="live" pressed={listening.active} disabled={listening.transitioning}
          title={`${listening.active ? 'Pause' : 'Start'} listening (Alt+A)`} onClick={() => void listening.toggle()} />
        <ToolMenu label="Audio settings" icon={<SlidersHorizontal />} width={256} chevron={false}>
          <MenuTitle>Listen to</MenuTitle>
          <MenuGroup role="radiogroup" aria-label="Audio input">
            {([['system', 'System audio', 'The call or video playing on this computer.'], ['both', 'Mic and system', 'You and them, with speakers told apart.'], ['microphone', 'Microphone only', 'Only you.']] as const).map(([id, label, description]) => <MenuItem key={id} label={label} description={description} selected={listening.source === id} disabled={audioLocked} onClick={() => listening.setSource(id as ListeningSource)} />)}
          </MenuGroup>
          <MenuTitle>Transcription</MenuTitle>
          <MenuGroup role="radiogroup" aria-label="Transcription engine">
            <MenuItem label="On this computer" description={listening.modelId ? `Private · ${listening.modelId}` : 'Private. Nothing leaves the device.'} selected={listening.engine === 'local'} disabled={audioLocked} onClick={() => listening.setEngine('local')} />
            <MenuItem label="Cloud" description="Your provider transcribes short clips." selected={listening.engine === 'cloud'} disabled={audioLocked} onClick={() => listening.setEngine('cloud')} />
          </MenuGroup>
          {audioLocked && <MenuTitle>Pause listening to change these.</MenuTitle>}
        </ToolMenu>
      </Cluster>
      <Tool icon={<Camera />} label={snapping ? 'Sending a snapshot' : 'Snap and send'} title="Snapshot your working monitor and send it now (Alt+Shift+3)" disabled={snapping || busy} onClick={onSnapSend} />
      <Spacer />
      <SplitTool icon={<Sparkles />} label="Answer" tone="primary" disabled={busy} kbd={`${modifierKey} ↵`} title={question ? `Answer: ${question}` : `Answer the latest question in the conversation (${modifierKey}+Enter)`} onClick={onAnswer} menuLabel="Quick questions" width={260}>
        <MenuTitle>Ask with the conversation attached</MenuTitle>
        <MenuGroup>{QUICK_ACTIONS.map(({ label, icon: Icon }) => <MenuItem key={label} icon={<Icon />} label={label} disabled={busy} onClick={event => { closeMenu(event.currentTarget); onAsk(label); }} />)}</MenuGroup>
      </SplitTool>
      <Cluster label="Session">
        <button type="button" className="deck-tool deck-end" aria-label="End session" title="End the session" disabled={ending} onClick={onEnd}><i aria-hidden="true" /></button>
        <Tool icon={<EyeOff />} label="Hide Novi; the session continues" title={`Hide · ${modifierKey} + \\ brings it back`} tone="quiet" onClick={onHide} />
      </Cluster>
    </Deck>
    <section className={`deck-panel ${collapsed ? 'is-collapsed' : ''}`} aria-label="Live answers">
      <header className="deck-panel-head">
        <Tabs idPrefix="deck-stage" label="Panel view" value={tab} onChange={value => { setTab(value); setCollapsed(false); }}
          options={[{ id: 'answer', label: 'Answer', busy }, { id: 'transcript', label: 'Transcript', count: transcript.length }]} />
        <Spacer />
        <button type="button" className="deck-collapse" aria-label={collapsed ? 'Expand the panel' : 'Collapse the panel'} aria-expanded={!collapsed} aria-controls="deck-stage-body" onClick={() => setCollapsed(!collapsed)}><ChevronDown size={15} /></button>
      </header>
      <div className="deck-panel-body" id="deck-stage-body" inert={collapsed}>
        <div className="deck-panel-inner">
          {notices}
          {question && <button type="button" className="deck-question" disabled={busy} onClick={onAnswer} title="Answer what they just asked"><span className="deck-question-who">They asked</span><span className="deck-question-text">{question}</span><b>Answer</b></button>}
          {/* Both panels stay mounted, so switching tabs never re-renders the whole conversation. */}
          {(['answer', 'transcript'] as const).map(panel => <div key={panel} ref={panel === tab ? content : undefined} hidden={panel !== tab}
            onScroll={event => { const element = event.currentTarget; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }}
            id={`deck-stage-panel-${panel}`} role="tabpanel" tabIndex={0} aria-labelledby={`deck-stage-${panel}`} className="deck-scroll deck-tab-panel">
            {panel === 'answer' ? <div className="deck-answer">{conversation}</div> : <div className="deck-transcript">{transcript.length ? transcript.map(segment => <article key={`${segment.sessionId}:${segment.segmentId}`}><header><strong>{segment.source === 'microphone' ? 'You' : segment.speakerId || 'Speaker'}</strong><time>{formatSessionTime(segment.startTime)}</time></header><p className={segment.isFinal ? '' : 'partial'}>{segment.text}</p></article>) : <p className="deck-empty">Press Listen to see the conversation here.</p>}</div>}
          </div>)}
          <form className="deck-composer" onSubmit={event => { event.preventDefault(); composer.send(); }}
            onDragEnter={event => { drag(event); if (event.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }}
            onDragOver={drag}
            onDragLeave={event => { drag(event); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
            onDrop={event => { drag(event); dragDepth.current = 0; setDragging(false); composer.attach(Array.from(event.dataTransfer.files)); }}>
            {composer.images.length > 0 && <div className="deck-attachments">{composer.images.map(image => <span className="deck-attachment" key={image.id}><ImagePreview image={image} /><button type="button" className="deck-tool" aria-label={`Remove ${image.name}`} onClick={() => composer.removeImage(image.id)}><X size={11} /></button></span>)}</div>}
            <div className="deck-field-row deck-composer-row">
              <ToolMenu label="Attach" icon={<Plus />} up chevron={false} width={250} className="deck-attach">
                <MenuGroup>
                  <MenuItem icon={<ImagePlus />} label="Image from this computer" description="PNG, JPG or WEBP" disabled={composer.attaching} onClick={event => { closeMenu(event.currentTarget); composer.attach(); }} />
                  <MenuItem icon={<Camera />} label="Snapshot of your monitor" description={`Attached, not sent · ${composer.snapshotKey}`} disabled={composer.attaching} onClick={event => { closeMenu(event.currentTarget); composer.snapshot(); }} />
                </MenuGroup>
              </ToolMenu>
              <textarea ref={composer.textareaRef} aria-label="Message Novi" rows={1} maxLength={100000} value={composer.text}
                placeholder={busy ? 'Type your next question; send it when this answer finishes' : composer.placeholder || 'Ask anything, or just press Answer'}
                onChange={event => composer.setText(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); composer.send(); } }} />
              {composer.streaming
                ? <Tool icon={<Square size={11} fill="currentColor" />} label="Stop generating" tone="danger" className="deck-send" onClick={composer.stop} />
                : <Tool type="submit" icon={<ArrowUp />} label="Send" tone="primary" className="deck-send" disabled={composer.attaching || (!composer.text.trim() && !composer.images.length)} />}
            </div>
          </form>
          {children}
        </div>
      </div>
    </section>
  </>;
}

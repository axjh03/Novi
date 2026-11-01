import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, Check, ChevronDown, GripVertical, MessageSquareMore, RotateCcw, Sparkles, Square, Text, UserRound, X } from 'lucide-react';
import type { TranscriptSegment } from '../../../shared/interview';
import { Brand } from './Brand';
import { TrayMenu } from './TrayMenu';
import { formatSessionTime, insightQuestion } from '../../../shared/liveInsights';

// The smart actions: one tap sends the question with the live transcript attached.
const actions = [
  { label: 'What should I say next?', icon: Text },
  { label: 'Follow-up questions', icon: MessageSquareMore },
  { label: 'Who am I talking to?', icon: UserRound },
  { label: 'Fact check', icon: BadgeCheck },
  { label: 'Recap', icon: RotateCcw },
];
const modifier = /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

/** Time spent listening in this session: runs while audio is captured, holds while paused. */
function useListeningClock(listening: boolean) {
  const [held, setHeld] = useState(0);
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (listening) { setSince(Date.now()); return; }
    setSince(current => { if (current) setHeld(value => value + Date.now() - current); return null; });
  }, [listening]);
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return held + (since ? Math.max(0, now - since) : 0);
}

export function LiveInsights({ children, footer, transcript, listening, transitioning, busy, onAudio, onAsk, onEnd, onWindow, mode, onMode }: {
  mode: string; onMode: (mode: string) => void;
  children: ReactNode; footer: ReactNode; transcript: TranscriptSegment[]; listening: boolean; transitioning: boolean; busy: boolean;
  onAudio: () => void; onAsk: (text: string) => void; onEnd: () => void; onWindow: (action: 'dashboard' | 'hide') => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const atBottom = useRef(true);
  const [tab, setTab] = useState('insights');
  const [collapsed, setCollapsed] = useState(false);
  const elapsed = useListeningClock(listening);
  const question = insightQuestion(transcript);
  useLayoutEffect(() => { if (atBottom.current && content.current) content.current.scrollTop = content.current.scrollHeight; }, [children, transcript, tab]);
  // "Ask AI" opens the panel on Insights and puts the cursor in the box.
  const ask = () => {
    setTab('insights'); setCollapsed(false);
    window.setTimeout(() => panel.current?.querySelector('textarea')?.focus(), 0);
  };
  return <>
    <header className="live-navbar" aria-label="Session controls">
      <span className="live-drag" title="Drag to move Novi" aria-hidden="true"><GripVertical size={15} /></span>
      <button type="button" className="live-logo" aria-label="Toggle dashboard" title="Show or hide the main window" onClick={() => onWindow('dashboard')}><Brand compact /></button>
      <button type="button" className={`live-listen ${listening ? 'listening' : ''}`} disabled={transitioning} aria-pressed={listening} aria-label={listening ? 'Pause audio capture' : 'Start audio capture'} title={`${listening ? 'Pause' : 'Start'} listening (Alt+A)`} onClick={onAudio}>
        <span className="live-wave" aria-hidden="true"><i /><i /><i /><i /></span>
        <span className="live-listen-label" role="status">{transitioning ? 'Connecting' : listening ? 'Listening' : 'Listen'}</span>
      </button>
      <button type="button" className="live-ask" onClick={ask} title={`Ask AI (${modifier}+Enter sends)`}><Sparkles size={13} aria-hidden="true" /><span>Ask AI</span><kbd aria-hidden="true">{modifier} ↵</kbd></button>
      <button type="button" className="live-timer" onClick={onEnd} title="End the session"><Square size={9} fill="currentColor" aria-hidden="true" /><span>{formatSessionTime(elapsed)} · End</span></button>
      <button type="button" className="live-close" aria-label="Hide widget; session continues" title={`Hide · ${modifier} + \\`} onClick={() => onWindow('hide')}><X size={15} /></button>
    </header>
    <section ref={panel} className={`live-insights ${collapsed ? 'is-collapsed' : ''} ${busy ? 'is-busy' : ''}`} aria-label="Live Insights">
      <header className="live-heading">
        <TrayMenu className="live-mode-menu" label="Assistant mode" title={<span>{mode}</span>}>
          <div role="group" aria-label="Assistant mode">{['Interview', 'Meeting', 'General', 'Sales'].map(value => <button type="button" key={value} disabled={busy} aria-pressed={mode === value} onClick={event => {
            onMode(value); const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
          }}>{value}{mode === value && <Check size={13} />}</button>)}</div>
        </TrayMenu>
        <div className="live-tabs" role="tablist" aria-label="Session view">{['insights', 'transcript'].map(name => <button type="button" role="tab" id={`live-tab-${name}`} aria-controls={`live-${name}`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} key={name} onClick={() => { setTab(name); setCollapsed(false); }} onKeyDown={event => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = name === 'insights' ? 'transcript' : 'insights'; setTab(next); setCollapsed(false); event.currentTarget.ownerDocument.getElementById(`live-tab-${next}`)?.focus(); }
        }}>{name === 'insights' ? 'Insights' : 'Transcript'}{name === 'transcript' && transcript.length > 0 && <i className="live-tab-dot" aria-hidden="true" />}</button>)}</div>
        {busy && <span className="live-thinking" role="status" aria-label="Novi is answering"><i /><i /><i /></span>}
        <button type="button" className="live-collapse" aria-label={collapsed ? 'Expand Live Insights' : 'Collapse Live Insights'} aria-expanded={!collapsed} aria-controls="live-panel-body" onClick={() => setCollapsed(value => !value)}><ChevronDown size={15} /></button>
      </header>
      <div className="live-panel-expander" id="live-panel-body" inert={collapsed}>
        <div className="live-panel-inner">
          {question && <button type="button" className="live-question" disabled={busy} onClick={() => onAsk(question)} title="Answer the question they just asked"><Sparkles size={13} aria-hidden="true" /><span>{question}</span><b>Answer</b></button>}
          <div ref={content} onScroll={event => { const element = event.currentTarget; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }} id={`live-${tab}`} role="tabpanel" tabIndex={0} aria-labelledby={`live-tab-${tab}`} className="live-content" key={tab}>
            {tab === 'insights' ? <div className="live-answer">{children}</div> : <div className="live-transcript">{transcript.length ? transcript.map(segment => <article key={`${segment.sessionId}:${segment.segmentId}`}><header><strong>{segment.source === 'microphone' ? 'You' : segment.speakerId || 'Speaker'}</strong><time>{formatSessionTime(segment.startTime)}</time></header><p className={segment.isFinal ? '' : 'partial'}>{segment.text}</p></article>) : <p className="live-empty">Turn on Listen to see the conversation here.</p>}</div>}
          </div>
          <div className="live-actions" aria-label="Suggested actions">{actions.map(({ label, icon: Icon }, index) => <button type="button" key={label} disabled={busy} style={{ '--i': index } as React.CSSProperties} onClick={() => onAsk(label)}><Icon size={13} aria-hidden="true" /><span>{label}</span></button>)}</div>
          {footer}
        </div>
      </div>
    </section>
  </>;
}

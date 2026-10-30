import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, BadgeCheck, Check, Eye, EyeOff, GripVertical, MessageSquareMore, RotateCcw, Square, Text, UserRound, X } from 'lucide-react';
import type { TranscriptSegment } from '../../../shared/interview';
import { Brand } from './Brand';
import { TrayMenu } from './TrayMenu';
import { formatSessionTime, insightQuestion } from '../../../shared/liveInsights';

const actions = [
  { label: 'What should I say next?', icon: Text },
  { label: 'Follow-up questions', icon: MessageSquareMore },
  { label: 'Who am I talking to?', icon: UserRound },
  { label: 'Fact check', icon: BadgeCheck },
  { label: 'Recap', icon: RotateCcw },
];

export function LiveInsights({ children, footer, transcript, listening, transitioning, busy, onAudio, onAsk, onEnd, onWindow, mode, onMode }: {
  mode: string; onMode: (mode: string) => void;
  children: ReactNode; footer: ReactNode; transcript: TranscriptSegment[]; listening: boolean; transitioning: boolean; busy: boolean;
  onAudio: () => void; onAsk: (text: string) => void; onEnd: () => void; onWindow: (action: 'dashboard' | 'hide') => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [tab, setTab] = useState('insights');
  const [collapsed, setCollapsed] = useState(false);
  const [started] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setElapsed(Date.now() - started), 1000); return () => window.clearInterval(timer); }, [started]);
  const question = insightQuestion(transcript);
  useLayoutEffect(() => { if (atBottom.current && content.current) content.current.scrollTop = content.current.scrollHeight; }, [children, transcript, tab]);
  return <>
    <header className="live-navbar" aria-label="Session controls">
      <span className="live-drag live-orb" title="Drag to move Novi"><GripVertical size={16} /></span>
      <div className="live-capsule">
        <button type="button" className="live-logo" aria-label="Toggle dashboard" onClick={() => onWindow('dashboard')}><Brand compact /></button>
        <span className="live-listening" role="status">{transitioning ? 'Connecting…' : listening ? 'Listening' : 'Not listening'}</span>
        <button type="button" className={`live-audio ${listening ? 'listening' : ''}`} disabled={transitioning} aria-pressed={listening} aria-label={listening ? 'Pause audio capture' : 'Start audio capture'} onClick={onAudio}><span><AudioLines size={14} /></span></button>
        <button type="button" className="live-timer" onClick={onEnd}><Square size={10} fill="currentColor" /><span>{formatSessionTime(elapsed)} · End</span></button>
      </div>
      <button type="button" className="live-close live-orb" aria-label="Hide widget; session continues" title="Hide · Ctrl/Cmd + \\" onClick={() => onWindow('hide')}><X size={17} /></button>
    </header>
    <section className={`live-insights ${collapsed ? 'is-collapsed' : ''}`} aria-label="Live Insights">
      <header className="live-heading">
        <button type="button" className="live-collapse" aria-label={collapsed ? 'Expand Live Insights' : 'Collapse Live Insights'} aria-expanded={!collapsed} aria-controls="live-panel-body" onClick={() => setCollapsed(value => !value)}>{collapsed ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        <TrayMenu className="live-mode-menu" label="Assistant mode" title={<span>{mode}</span>}>
          <div role="group" aria-label="Assistant mode">{['Interview', 'Meeting', 'General', 'Sales'].map(value => <button type="button" key={value} disabled={busy} aria-pressed={mode === value} onClick={event => {
            onMode(value); const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
          }}>{value}{mode === value && <Check size={13} />}</button>)}</div>
        </TrayMenu>
        <div className="live-tabs" role="tablist" aria-label="Session view">{['insights', 'transcript'].map(name => <button type="button" role="tab" id={`live-tab-${name}`} aria-controls={`live-${name}`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} key={name} onClick={() => { setTab(name); setCollapsed(false); }} onKeyDown={event => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = name === 'insights' ? 'transcript' : 'insights'; setTab(next); setCollapsed(false); event.currentTarget.ownerDocument.getElementById(`live-tab-${next}`)?.focus(); }
        }}>{name === 'insights' ? 'Insights' : 'Transcript'}</button>)}</div>
      </header>
      <div className="live-panel-expander" id="live-panel-body" inert={collapsed}>
        <div className="live-panel-inner">
          <div ref={content} onScroll={event => { const element = event.currentTarget; atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }} id={`live-${tab}`} role="tabpanel" tabIndex={0} aria-labelledby={`live-tab-${tab}`} className="live-content" key={tab}>
            {tab === 'insights' ? <div className="live-answer">{children}</div> : <div className="live-transcript">{transcript.length ? transcript.map(segment => <article key={`${segment.sessionId}:${segment.segmentId}`}><header><strong>{segment.source === 'microphone' ? 'You' : segment.speakerId || 'Speaker'}</strong><time>{formatSessionTime(segment.startTime)}</time></header><p className={segment.isFinal ? '' : 'partial'}>{segment.text}</p></article>) : <p>Turn on audio to see the conversation here.</p>}</div>}
          </div>
          <div className="live-actions" aria-label="Suggested actions">{actions.map(({ label, icon: Icon }) => <button type="button" key={label} disabled={busy} onClick={() => onAsk(label)}><Icon size={14} /><span>{label}</span></button>)}</div>
          {footer}
        </div>
      </div>
    </section>
    {question && !collapsed && <button type="button" className="live-question" disabled={busy} onClick={() => onAsk(question)}><Text size={14} /><span>{question}</span></button>}
  </>;
}

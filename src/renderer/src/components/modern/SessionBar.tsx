import type { ReactNode } from 'react';
import { Award, Brain, Camera, Code2, Download, Ellipsis, Eye, FolderCode, History, Lock, MessageSquare, Network, Pencil, Phone, Plus, Settings, SlidersHorizontal, Sparkles, Trash2, Video, Zap, type LucideIcon } from 'lucide-react';
import type { AppMode, BehavioralFramework, Conversation, ImageAttachment, ModelOption, ProviderConnection, Snapshot } from '../../../../shared/types';
import type { ListeningSource } from '../../../../shared/interview';
import { SESSION_MODES } from '../../../../shared/sessionModes';
import { ANSWER_STYLES } from '../../../../shared/interviewProfile';
import { lockedMessage } from '../../../../shared/plans';
import { useAppMode } from '../../context/AppModeContext';
import type { ListeningController } from '../../hooks/useListening';
import { ImagePreview } from '../chat/Message';
import { PlanLock } from '../PlanLock';
import { LiveMeter, MenuItem, MenuTitle, ModernBar, ModernButton, ModernMenu, closeMenu } from './ModernKit';

const MODE_ICONS: Record<AppMode, LucideIcon> = { normal: MessageSquare, recruiter: Phone, coding: Code2, technical: Video, 'system-design': Network, behavioral: Award, 'local-coding': FolderCode };
const FRAMEWORKS: Array<{ id: BehavioralFramework; label: string; description: string }> = [
  { id: 'smart', label: 'Smart', description: 'Picks STAR, CAR or PAR from the question.' },
  { id: 'star', label: 'STAR', description: 'Situation, task, actions, measurable results.' },
  { id: 'car', label: 'CAR', description: 'Context, actions, results. Short and punchy.' },
  { id: 'par', label: 'PAR', description: 'Problem, actions, results.' },
  { id: 'soar', label: 'SOAR', description: 'Situation, obstacles, actions, results.' },
];

export interface SessionModel {
  connection?: ProviderConnection; connections: ProviderConnection[]; options: Array<{ id: string; name: string }>;
  roles?: { fast?: string; deep?: string }; available: ModelOption[]; loading: boolean; syncing: boolean;
  change: (connectionId: string, model?: string) => void;
}
export interface SessionHistory {
  conversations: Conversation[]; selectedId: string | null; displayName: string; busy: boolean;
  select: (id: string) => void; create: () => void; rename: (id: string) => void; remove: (id: string) => void; save: (id: string) => void;
  attachments: ImageAttachment[];
}
export interface SessionLocal { active: boolean; name?: string; engine?: string; model?: string }

/**
 * The session bar (top left): listening, a snapshot that sends itself, audio, the session mode,
 * the answer style, the model, history and settings, with everything else under More.
 */
export function SessionBar({ listening, onSnapSend, snapping, busy, model, history, local, state, tools, debug, onOpenSettings, settingsOpen, onEnd, ending, onDiagrams, onSwitchToClassic, onError }: {
  listening: ListeningController; onSnapSend: () => void; snapping: boolean; busy: boolean;
  model: SessionModel; history: SessionHistory; local: SessionLocal; state: Snapshot;
  tools: ReactNode; debug: ReactNode; onOpenSettings: () => void; settingsOpen: boolean; onEnd: () => void; ending: boolean;
  onDiagrams?: () => void; onSwitchToClassic: () => void; onError: (message: string) => void;
}) {
  const { appMode, setAppMode, allows, answerStyle, setAnswerStyle, behavioralFramework, setBehavioralFramework } = useAppMode();
  const ModeIcon = MODE_ICONS[appMode];
  const modeLabel = SESSION_MODES.find(mode => mode.id === appMode)?.name ?? 'Chat';
  const styles = ANSWER_STYLES.filter(style => style.id !== 'custom' || state.contextSession?.interview?.customAnswerStyle || state.settings?.customAnswerStyle);
  const roles = model.roles;
  const smartOn = Boolean(roles?.deep && model.connection?.model === roles.deep);
  return <ModernBar label="Session controls" className="mod-session-bar">
    <ModernButton icon={<LiveMeter level={listening.level} active={listening.active} connecting={listening.transitioning} />} label={listening.transitioning ? 'Connecting' : listening.active ? 'Listening' : 'Listen'} showLabel tone="live" pressed={listening.active} disabled={listening.transitioning} className="mod-shrink"
      title={`${listening.active ? 'Pause' : 'Start'} listening (Alt+A)`} onClick={() => void listening.toggle()} />
    <ModernButton icon={<Camera />} label={snapping ? 'Sending a snapshot' : 'Snap and send'} title="Snapshot your working monitor and send it (Alt+3 captures, Alt+Shift+3 sends)" disabled={snapping || busy} onClick={onSnapSend} />
    <ModernMenu label="Audio settings" icon={<SlidersHorizontal />} width={250}>
      <MenuTitle>Listen to</MenuTitle>
      <div className="mod-menu-group" role="radiogroup" aria-label="Audio input">
        {([['system', 'System audio', 'The call or video playing on this computer.'], ['both', 'Mic and system', 'You and them, with speakers told apart.'], ['microphone', 'Microphone only', 'Only you.']] as const).map(([id, label, description]) => <MenuItem key={id} label={label} description={description} selected={listening.source === id} disabled={listening.active || listening.transitioning} onClick={() => listening.setSource(id as ListeningSource)} />)}
      </div>
      <MenuTitle>Transcription</MenuTitle>
      <div className="mod-menu-group" role="radiogroup" aria-label="Transcription engine">
        <MenuItem label="On this computer" description={listening.modelId ? `Private · ${listening.modelId}` : 'Private. Nothing leaves the device.'} selected={listening.engine === 'local'} disabled={listening.active || listening.transitioning} onClick={() => listening.setEngine('local')} />
        <MenuItem label="Cloud" description="Your provider transcribes short clips." selected={listening.engine === 'cloud'} disabled={listening.active || listening.transitioning} onClick={() => listening.setEngine('cloud')} />
      </div>
    </ModernMenu>
    <span className="mod-sep" aria-hidden="true" />
    <ModernMenu label="Session mode" icon={<ModeIcon />} text={<span className="mod-hide-narrow">{modeLabel}</span>} width={280}>
      <MenuTitle>Session mode</MenuTitle>
      <div className="mod-menu-group">
        {SESSION_MODES.map(mode => {
          const Icon = MODE_ICONS[mode.id];
          const locked = !allows(mode.id);
          return <MenuItem key={mode.id} icon={<Icon />} label={<>{mode.name}{locked && <PlanLock feature={mode.id} />}</>} description={locked ? lockedMessage(mode.id) : mode.description} selected={appMode === mode.id}
            onClick={event => { if (locked) onError(lockedMessage(mode.id)); else { setAppMode(mode.id); closeMenu(event.currentTarget); } }} trailing={locked ? <Lock size={12} aria-hidden="true" /> : undefined} />;
        })}
      </div>
      {appMode === 'behavioral' && <>
        <MenuTitle>Story framework</MenuTitle>
        <div className="mod-menu-group">{FRAMEWORKS.map(framework => <MenuItem key={framework.id} label={framework.label} description={framework.description} selected={behavioralFramework === framework.id} onClick={() => void setBehavioralFramework(framework.id)} />)}</div>
      </>}
    </ModernMenu>
    <ModernMenu label="Answer style" icon={<MessageSquare />} width={270}>
      <MenuTitle>Answer style · change any time</MenuTitle>
      <div className="mod-menu-group">{styles.map(style => <MenuItem key={style.id} label={style.name} description={style.description} selected={answerStyle === style.id} onClick={event => { setAnswerStyle(style.id); closeMenu(event.currentTarget); }} />)}</div>
    </ModernMenu>
    <ModernMenu label="Model" icon={<Brain />} width={290} badge={smartOn ? <i className="mod-dot is-on" aria-hidden="true" /> : undefined}>
      {local.active ? <>
        <MenuTitle>Local Coding</MenuTitle>
        <div className="mod-menu-group">
          <MenuItem icon={<FolderCode />} label={local.name || 'Choose a working folder in the panel'} description={local.name ? [local.engine, local.model, 'Read-only'].filter(Boolean).join(' · ') : 'Answers explain the code; changes come back as proposals.'} />
        </div>
      </> : <>
        <MenuTitle>Model for this session</MenuTitle>
        {model.connections.length > 1 && <label className="mod-field">Connection
          <select aria-label="Provider connection" disabled={busy || model.syncing} value={model.connection?.id || ''} onChange={event => model.change(event.target.value)}>
            {model.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
          </select></label>}
        <label className="mod-field">{model.connection?.name || 'Model'}
          <select aria-label="Session model" disabled={busy || model.syncing} value={model.connection?.model || ''} onChange={event => model.change(model.connection?.id || '', event.target.value)}>
            {model.options.map(option => <option key={option.id} value={option.id}>{option.name === option.id ? option.id : `${option.name} (${option.id})`}</option>)}
          </select></label>
        {(roles?.fast || roles?.deep) && <>
          <MenuTitle>Saved roles</MenuTitle>
          <div className="mod-menu-group">
            {(['fast', 'deep'] as const).filter(role => roles?.[role]).map(role => <MenuItem key={role} icon={role === 'fast' ? <Zap /> : <Sparkles />} label={role === 'fast' ? 'Fast model' : 'Deep model'} description={roles![role]} selected={model.connection?.model === roles![role]}
              disabled={busy || model.syncing || model.loading || !model.available.some(item => item.id === roles![role])} onClick={() => model.change(model.connection!.id, roles![role])} />)}
          </div>
        </>}
        {model.syncing && <div className="mod-menu-foot">Saving model selection…</div>}
      </>}
    </ModernMenu>
    <ModernMenu label="Sessions and history" icon={<History />} width={300}>
      <div className="mod-menu-group">
        <MenuItem icon={<Plus />} label="New session" description="Ends this one. Conversations stay saved." disabled={history.busy} onClick={event => { closeMenu(event.currentTarget); history.create(); }} />
      </div>
      <MenuTitle>Saved conversations{history.conversations.length ? ` · ${history.conversations.length}` : ''}</MenuTitle>
      <div className="mod-menu-group mod-history">
        {!history.conversations.length && <div className="mod-menu-foot">A clean slate. Your conversations will live here.</div>}
        {history.conversations.map(conversation => <div className={`mod-history-row ${history.selectedId === conversation.id ? 'is-selected' : ''}`} key={conversation.id}>
          <button type="button" className="mod-menu-item" aria-current={history.selectedId === conversation.id ? 'page' : undefined} disabled={history.busy} title={conversation.title} onClick={event => { closeMenu(event.currentTarget); history.select(conversation.id); }}><span className="mod-menu-icon"><MessageSquare /></span><span className="mod-menu-text"><span>{conversation.title}</span></span></button>
          <span className="mod-history-actions">
            <button type="button" className="mod-btn" aria-label={`Rename ${conversation.title}`} disabled={history.busy} onClick={event => { closeMenu(event.currentTarget); history.rename(conversation.id); }}><Pencil /></button>
            <button type="button" className="mod-btn" aria-label={`Save a copy of ${conversation.title}`} disabled={history.busy} onClick={() => history.save(conversation.id)}><Download /></button>
            <button type="button" className="mod-btn tone-danger" aria-label={`Delete ${conversation.title}`} disabled={history.busy} onClick={event => { closeMenu(event.currentTarget); history.remove(conversation.id); }}><Trash2 /></button>
          </span>
        </div>)}
      </div>
      {history.attachments.length > 0 && <><MenuTitle>Images in this conversation</MenuTitle><div className="mod-gallery">{history.attachments.map(image => <ImagePreview key={image.id} image={image} readOnly />)}</div></>}
      <div className="mod-menu-foot">{history.displayName}</div>
    </ModernMenu>
    <span className="mod-spacer" />
    <ModernButton icon={<Settings />} label="Settings" pressed={settingsOpen} onClick={onOpenSettings} />
    <ModernMenu label="More" icon={<Ellipsis />} align="end" width={320}>
      <MenuTitle><span className="mod-inline"><Eye size={13} aria-hidden="true" />Eye tracking and screen HUD</span></MenuTitle>
      <div className="mod-tools">{tools}</div>
      {debug && <><MenuTitle>Diagnostics</MenuTitle><div className="mod-tools">{debug}</div></>}
      <div className="mod-menu-group">
        {onDiagrams && <MenuItem icon={<Network />} label="Open diagrams" description="Saved with this conversation." onClick={event => { closeMenu(event.currentTarget); onDiagrams(); }} />}
        <MenuItem icon={<MessageSquare />} label="Switch to Classic" description="Everything in one window." onClick={event => { closeMenu(event.currentTarget); onSwitchToClassic(); }} />
        <MenuItem danger icon={<Trash2 />} label="End session" description="Conversations and attachments stay saved." disabled={ending} onClick={event => { closeMenu(event.currentTarget); onEnd(); }} />
      </div>
    </ModernMenu>
  </ModernBar>;
}

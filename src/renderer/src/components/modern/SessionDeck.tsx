import type { ReactNode } from 'react';
import { Award, Brain, Code2, Download, Eye, FolderCode, History, Lock, MessageSquare, MessageSquareQuote, Network, Pencil, Phone, Plus, Settings, Sparkles, Trash2, Video, Wand2, Zap, type LucideIcon } from 'lucide-react';
import type { AppMode, BehavioralFramework, Conversation, ImageAttachment, ModelOption, ProviderConnection, Snapshot } from '../../../../shared/types';
import { SESSION_MODES } from '../../../../shared/sessionModes';
import { ANSWER_STYLES } from '../../../../shared/interviewProfile';
import { lockedMessage } from '../../../../shared/plans';
import { useAppMode } from '../../context/AppModeContext';
import { ImagePreview } from '../chat/Message';
import { PlanLock } from '../PlanLock';
import { Cluster, Deck, MenuFoot, MenuGroup, MenuItem, MenuTitle, Spacer, Tool, ToolMenu, closeMenu } from './DeckKit';

const MODE_ICONS: Record<AppMode, LucideIcon> = { normal: MessageSquare, recruiter: Phone, coding: Code2, technical: Video, 'system-design': Network, behavioral: Award, 'local-coding': FolderCode };
/** The mode's name as the deck shows it; the menu keeps the full name. */
const SHORT_MODE: Record<AppMode, string> = { normal: 'Chat', recruiter: 'Recruiter', coding: 'Code', technical: 'Technical', 'system-design': 'System design', behavioral: 'Behavioral', 'local-coding': 'Local code' };
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
 * The session deck (top left): what answers. The mode, the answer style and the model on one plate;
 * history and tools on another; Settings at the end. Listening, snapshots and ending the session
 * live on the live stage, and how Novi sits on screen lives on the screen deck, so nothing repeats.
 */
export function SessionDeck({ busy, model, history, local, state, tools, debug, onOpenSettings, settingsOpen, onDiagrams, onError }: {
  busy: boolean; model: SessionModel; history: SessionHistory; local: SessionLocal; state: Snapshot;
  tools: ReactNode; debug: ReactNode; onOpenSettings: () => void; settingsOpen: boolean; onDiagrams?: () => void; onError: (message: string) => void;
}) {
  const { appMode, setAppMode, allows, answerStyle, setAnswerStyle, behavioralFramework, setBehavioralFramework } = useAppMode();
  const ModeIcon = MODE_ICONS[appMode];
  const styles = ANSWER_STYLES.filter(style => style.id !== 'custom' || state.contextSession?.interview?.customAnswerStyle || state.settings?.customAnswerStyle);
  const styleName = styles.find(style => style.id === answerStyle)?.name ?? 'Answer style';
  const roles = model.roles;
  const smartOn = Boolean(roles?.deep && model.connection?.model === roles.deep);
  const modelName = local.active ? local.model || 'Local' : model.connection?.model || 'No model';
  return <Deck label="Session" className="deck-session">
    <Cluster label="What answers">
      <ToolMenu label="Session mode" icon={<ModeIcon />} text={SHORT_MODE[appMode]} width={290}>
        <MenuTitle>Session mode</MenuTitle>
        <MenuGroup>
          {SESSION_MODES.map(mode => {
            const Icon = MODE_ICONS[mode.id];
            const locked = !allows(mode.id);
            return <MenuItem key={mode.id} icon={<Icon />} label={<>{mode.name}{locked && <PlanLock feature={mode.id} />}</>} description={locked ? lockedMessage(mode.id) : mode.description} selected={appMode === mode.id}
              onClick={event => { if (locked) onError(lockedMessage(mode.id)); else { setAppMode(mode.id); closeMenu(event.currentTarget); } }} trailing={locked ? <Lock size={12} aria-hidden="true" /> : undefined} />;
          })}
        </MenuGroup>
        {appMode === 'behavioral' && <>
          <MenuTitle>Story framework</MenuTitle>
          <MenuGroup>{FRAMEWORKS.map(framework => <MenuItem key={framework.id} label={framework.label} description={framework.description} selected={behavioralFramework === framework.id} onClick={() => void setBehavioralFramework(framework.id)} />)}</MenuGroup>
        </>}
      </ToolMenu>
      <ToolMenu label={`Answer style: ${styleName}`} icon={<MessageSquareQuote />} width={270} chevron={false}>
        <MenuTitle>Answer style · change any time</MenuTitle>
        <MenuGroup>{styles.map(style => <MenuItem key={style.id} label={style.name} description={style.description} selected={answerStyle === style.id} onClick={event => { setAnswerStyle(style.id); closeMenu(event.currentTarget); }} />)}</MenuGroup>
      </ToolMenu>
      <ToolMenu label={`Model: ${modelName}`} icon={<Brain />} width={300} chevron={false} badge={smartOn ? <i className="deck-dot is-on" aria-hidden="true" /> : undefined}>
        {local.active ? <>
          <MenuTitle>Local Coding</MenuTitle>
          <MenuGroup>
            <MenuItem icon={<FolderCode />} label={local.name || 'Choose a working folder in the panel'} description={local.name ? [local.engine, local.model, 'Read-only'].filter(Boolean).join(' · ') : 'Answers explain the code; changes come back as proposals.'} />
          </MenuGroup>
        </> : <>
          <MenuTitle>Model for this session</MenuTitle>
          {model.connections.length > 1 && <label className="deck-field">Connection
            <select aria-label="Provider connection" disabled={busy || model.syncing} value={model.connection?.id || ''} onChange={event => model.change(event.target.value)}>
              {model.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
            </select></label>}
          <label className="deck-field">{model.connection?.name || 'Model'}
            <select aria-label="Session model" disabled={busy || model.syncing} value={model.connection?.model || ''} onChange={event => model.change(model.connection?.id || '', event.target.value)}>
              {model.options.map(option => <option key={option.id} value={option.id}>{option.name === option.id ? option.id : `${option.name} (${option.id})`}</option>)}
            </select></label>
          {(roles?.fast || roles?.deep) && <>
            <MenuTitle>Saved roles</MenuTitle>
            <MenuGroup>
              {(['fast', 'deep'] as const).filter(role => roles?.[role]).map(role => <MenuItem key={role} icon={role === 'fast' ? <Zap /> : <Sparkles />} label={role === 'fast' ? 'Fast model' : 'Deep model'} description={roles![role]} selected={model.connection?.model === roles![role]}
                disabled={busy || model.syncing || model.loading || !model.available.some(item => item.id === roles![role])} onClick={() => model.change(model.connection!.id, roles![role])} />)}
            </MenuGroup>
          </>}
          {model.syncing && <MenuFoot>Saving model selection…</MenuFoot>}
        </>}
      </ToolMenu>
    </Cluster>
    <Cluster label="This session">
      <ToolMenu label="Sessions and history" icon={<History />} width={300} chevron={false}>
        <MenuGroup>
          <MenuItem icon={<Plus />} label="New session" description="Ends this one. Conversations stay saved." disabled={history.busy} onClick={event => { closeMenu(event.currentTarget); history.create(); }} />
        </MenuGroup>
        <MenuTitle>Saved conversations{history.conversations.length ? ` · ${history.conversations.length}` : ''}</MenuTitle>
        <MenuGroup className="deck-history">
          {!history.conversations.length && <MenuFoot>A clean slate. Your conversations will live here.</MenuFoot>}
          {history.conversations.map(conversation => <div className={`deck-history-row ${history.selectedId === conversation.id ? 'is-selected' : ''}`} key={conversation.id}>
            <button type="button" className="deck-menu-item" aria-current={history.selectedId === conversation.id ? 'page' : undefined} disabled={history.busy} title={conversation.title} onClick={event => { closeMenu(event.currentTarget); history.select(conversation.id); }}><span className="deck-menu-icon"><MessageSquare /></span><span className="deck-menu-text"><span>{conversation.title}</span></span></button>
            <span className="deck-history-actions">
              <button type="button" className="deck-tool" aria-label={`Rename ${conversation.title}`} disabled={history.busy} onClick={event => { closeMenu(event.currentTarget); history.rename(conversation.id); }}><Pencil /></button>
              <button type="button" className="deck-tool" aria-label={`Save a copy of ${conversation.title}`} disabled={history.busy} onClick={() => history.save(conversation.id)}><Download /></button>
              <button type="button" className="deck-tool tone-danger" aria-label={`Delete ${conversation.title}`} disabled={history.busy} onClick={event => { closeMenu(event.currentTarget); history.remove(conversation.id); }}><Trash2 /></button>
            </span>
          </div>)}
        </MenuGroup>
        {history.attachments.length > 0 && <><MenuTitle>Images in this conversation</MenuTitle><div className="deck-gallery">{history.attachments.map(image => <ImagePreview key={image.id} image={image} readOnly />)}</div></>}
        <MenuFoot>{history.displayName}</MenuFoot>
      </ToolMenu>
      <ToolMenu label="Tools" icon={<Wand2 />} width={320} chevron={false}>
        <MenuTitle><span className="deck-inline"><Eye size={13} aria-hidden="true" />Eye tracking and screen HUD</span></MenuTitle>
        <div className="deck-tools">{tools}</div>
        {debug && <><MenuTitle>Diagnostics</MenuTitle><div className="deck-tools">{debug}</div></>}
        {onDiagrams && <MenuGroup>
          <MenuItem icon={<Network />} label="Open diagrams" description="Saved with this conversation." onClick={event => { closeMenu(event.currentTarget); onDiagrams(); }} />
        </MenuGroup>}
      </ToolMenu>
    </Cluster>
    <Spacer />
    <Tool icon={<Settings />} label="Settings" pressed={settingsOpen} onClick={onOpenSettings} />
  </Deck>;
}

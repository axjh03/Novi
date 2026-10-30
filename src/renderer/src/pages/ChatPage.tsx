import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, Brain, Code2, ExternalLink, FolderCode, History, Image, Lock, Menu, MessageSquare, Network, PanelBottom, Phone, Settings, Video, X, Zap, type LucideIcon } from 'lucide-react';
import type { AppMode, ModelOption, Snapshot } from '../../../shared/types';
import { Sidebar } from '../components/chat/Sidebar';
import { Composer } from '../components/chat/Composer';
import { ImagePreview, LocalCodingResult, Message } from '../components/chat/Message';
import { useChat } from '../hooks/useChat';
import { activeConnection } from '../../../shared/providers';
import { SettingsPage } from './SettingsPage';
import { useEyeTracking } from '../hooks/useEyeTracking';
import { EyeTrackingPanel } from '../components/EyeTrackingPanel';
import { unwrap, errorText } from '../services/api';
import { useAppMode } from '../context/AppModeContext';
import { codeFromMessages } from '../components/CodingModeHUD';
import { hudResponse, SESSION_MODES } from '../../../shared/sessionModes';
import { diagramBlocks } from '../../../shared/diagrams';
import { BehavioralModeHUD } from '../components/BehavioralModeHUD';
import { TrayPortal } from '../components/TrayPortal';
import { TrayMenu } from '../components/TrayMenu';
import { ReadyCard } from '../components/ReadyCard';
import { DebugPanel } from '../components/DebugPanel';
import { PracticeCoach } from '../components/PracticeCoach';
import { usePracticeRun } from '../hooks/usePracticeRun';
import { useStealthState } from '../hooks/useStealth';
import { LocalCodingSetup } from '../components/LocalCodingSetup';
import { LocalCodingHistory, type ReconcileRequest } from '../components/LocalCodingHistory';
import { useLocalCodingProject } from '../hooks/useLocalCodingProject';
import { ENGINES, type LocalCodingMessage } from '../../../shared/localCoding';
import { lockedMessage } from '../../../shared/plans';
import { PlanLock } from '../components/PlanLock';
import { ANSWER_STYLES } from '../../../shared/interviewProfile';
import { ModernWindowMenu } from '../components/ModernWindowMenu';
import { SurfacePortal } from '../components/SurfacePortal';

// Each mode has its own icon so the tray can show only the active mode's name.
const MODE_ICONS: Record<AppMode, LucideIcon> = {
  normal: MessageSquare, recruiter: Phone, coding: Code2, technical: Video, 'system-design': Network, behavioral: Award, 'local-coding': FolderCode,
};
const WELCOME_MESSAGES = [
  'What’s up?', 'Hey there.', 'Hello.', 'Good to see you.', 'Hey, welcome back.', 'How’s it going?',
];

export function ChatPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const chat = useChat(state.conversations), [settings, setSettings] = useState(false), [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null), [conversationName, setConversationName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const renameDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (renaming) renameDialog.current?.showModal(); }, [renaming]);
  const [composerKey, setComposerKey] = useState(0);
  const [welcomeIndex] = useState(() => Math.floor(Math.random() * WELCOME_MESSAGES.length));
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [trayDetached, setTrayDetached] = useState(false);
  const [settingsHost, setSettingsHost] = useState<HTMLDivElement | null>(null);
  const [settingsCloseRequest, setSettingsCloseRequest] = useState(0);
  const [{ transparent, clickThrough, clickThroughShortcut }] = useStealthState();
  // The ready check shows until it is dismissed or the first message is sent.
  const [readyDismissed, setReadyDismissed] = useState(false), [sentInSession, setSentInSession] = useState(false);
  const {
    interfaceStyle, setInterfaceStyle, overlayHost,
    appMode,
    setAppMode,
    answerStyle,
    setAnswerStyle,
    allows,
    behavioralFramework,
    setBehavioralFramework,
    setWorkingMonitor,
  } = useAppMode();
  const modern = interfaceStyle === 'modern';
  useEffect(() => {
    void unwrap(window.novi.setWorkspaceDocked(true, interfaceStyle)).catch(console.error);
  }, [interfaceStyle]);
  useEffect(() => () => { void unwrap(window.novi.setWorkspaceDocked(false)).catch(console.error); }, []);
  const scroll = useRef<HTMLDivElement>(null), atBottom = useRef(true);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); }, [deleting]);
  const config = state.settings!;
  const welcome = WELCOME_MESSAGES[welcomeIndex];
  const connection = state.contextSession?.connection ?? activeConnection(config);
  const [pinnedContext, setPinnedContext] = useState('');
  useEffect(() => { setPinnedContext(chat.selected?.pinnedContext || ''); }, [chat.selectedId, chat.selected?.pinnedContext]);
  const streamingMessageId = chat.busy && chat.activeId === chat.selectedId ? chat.selected?.messages.at(-1)?.id : undefined;
  const contextBusy = Boolean(state.contextSession && state.contextSession.status !== 'ready');
  const [ending, setEnding] = useState(false);
  const [retryingContext, setRetryingContext] = useState(false);
  const sidebarBusy = chat.busy || ending || (contextBusy && state.contextSession?.status !== 'error');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const sessionId = state.contextSession?.id;
  const practice = usePracticeRun({ appMode, chatBusy: chat.busy, chatError: chat.error, conversationId: chat.selectedId });
  // One prefill channel for the message box: practice runs and requests from the review viewer.
  const [prefill, setPrefill] = useState<{ id: number; text: string } | undefined>();
  const prefillId = useRef(0);
  useEffect(() => { if (practice.prefill) setPrefill({ id: ++prefillId.current, text: practice.prefill.text }); }, [practice.prefill?.id]);
  // ── Local Coding ──────────────────────────────────────────────────────────
  const localMode = appMode === 'local-coding';
  const localBinding = chat.selected?.localCoding;
  const local = useLocalCodingProject(localBinding, chat.busy, chat.selected?.messages, chat.setError);
  useEffect(() => window.novi.onGlobalAction((action) => {
    if (action.type === 'scroll-conversation-to' && typeof action.payload === 'number') {
      const element = scroll.current;
      if (element) element.scrollTo({ top: action.payload * (element.scrollHeight - element.clientHeight), behavior: 'instant' });
      return;
    }
    if (action.type === 'scroll-conversation' && typeof action.payload === 'number') {
      scroll.current?.scrollBy({ top: action.payload, behavior: 'smooth' });
      return;
    }
    if (action.type !== 'review-action' || typeof action.payload?.text !== 'string') return;
    setPrefill({ id: ++prefillId.current, text: action.payload.text });
  }), []);
  const openLocalFile = useCallback((result: LocalCodingMessage, fileId: string) => {
    if (!result.resultingVersionId) return;
    void unwrap(window.novi.openReview({ projectId: result.projectId, fromVersionId: result.baseVersionId, toVersionId: result.resultingVersionId, fileId })).catch((error) => chat.setError(errorText(error)));
  }, [chat.setError]);
  function sendLocal(content: string, imageIds: string[], reconcile?: ReconcileRequest) {
    if (!localBinding || !local.project || local.project.projectId !== localBinding.projectId) { chat.setError('Wait for the selected Local Coding project to load, or choose a working folder first.'); return Promise.resolve(false); }
    const baseVersionId = reconcile?.baseVersionId ?? local.project.selectedVersionId;
    return chat.send({ content, imageIds, pinnedContext, localCoding: { baseVersionId, ...(reconcile ? { reconcile: { fromVersionId: reconcile.fromVersionId, fileIds: reconcile.fileIds } } : {}) } });
  }
  const listenKey = config.audioRecordShortcut || 'Alt+A';
  function startPractice() {
    if (contextBusy || chat.busy || ending) return;
    chat.setError('');
    // A fresh conversation, so the practice answer is easy to find and to remove.
    chat.setSelectedId(null);
    practice.start();
  }
  async function removePractice() {
    const id = practice.state.conversationId;
    practice.cancel();
    if (id) await chat.remove(id);
  }
  useEffect(() => {
    if (!sessionId || state.contextSession?.status === 'ready' || state.contextSession?.status === 'error' || state.contextSession?.isEmpty) return;
    let mounted = true;
    void unwrap(window.novi.initializeContext()).then((snapshot) => { if (mounted) onSaved(snapshot); })
      .catch((error) => {
        if (mounted) chat.setError(errorText(error));
        void unwrap(window.novi.session()).then((snapshot) => { if (mounted) onSaved(snapshot); }).catch(() => {});
      });
    return () => { mounted = false; };
  }, [sessionId, state.contextSession?.status, state.contextSession?.isEmpty]);
  async function retryContext() {
    setRetryingContext(true); chat.setError('');
    try { onSaved(await unwrap(window.novi.initializeContext(true))); }
    catch (error) { chat.setError(errorText(error)); }
    finally { setRetryingContext(false); }
  }
  async function endSession() {
    setEnding(true); et.stop();
    try { onSaved(await unwrap(window.novi.endContext())); }
    catch (error) { chat.setError(errorText(error)); setEnding(false); }
  }
  useEffect(() => { if (atBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [chat.selected?.messages]);
  useEffect(() => { atBottom.current = true; if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [chat.selectedId]);
  useEffect(() => {
    const element = scroll.current;
    let timer = 0;
    const report = () => {
      timer = 0;
      const extent = element ? element.scrollHeight - element.clientHeight : 0;
      void window.novi.reportConversationScroll(extent > 0 ? Math.max(0, Math.min(1, element!.scrollTop / extent)) : 1, extent > 0).catch(() => {});
    };
    const schedule = () => { if (!timer) timer = window.setTimeout(report, 100); };
    const observer = new ResizeObserver(schedule);
    if (element) { observer.observe(element); if (element.firstElementChild) observer.observe(element.firstElementChild); element.addEventListener('scroll', schedule, { passive: true }); }
    report();
    return () => { window.clearTimeout(timer); observer.disconnect(); element?.removeEventListener('scroll', schedule); void window.novi.reportConversationScroll(1, false).catch(() => {}); };
  }, [chat.selectedId, settings]);
  useEffect(() => {
    if (appMode !== 'coding' && appMode !== 'system-design') return;
    void unwrap(window.novi.updateCodeViewer(appMode === 'system-design' ? diagramBlocks(chat.selected?.messages || [], streamingMessageId) : codeFromMessages(chat.selected?.messages || []))).catch(console.error);
  }, [appMode, chat.selected?.messages, chat.selectedId, streamingMessageId]);

  // ── Eye tracking ──────────────────────────────────────────────────────────
  const et = useEyeTracking();
  const [showDebugDot, setShowDebugDot] = useState(false);

  // Mirror the actual reply, including streamed text; clear the prior conversation's answer.
  useEffect(() => {
    const response = hudResponse(appMode, chat.selected?.messages || []);
    if (response === null) return;
    et.sendStickyToOverlay(response, SESSION_MODES.find(mode => mode.id === appMode)?.name);
  }, [appMode, chat.selected?.messages, et.sendStickyToOverlay, et.state, et.overlayActive]);

  const handleEyeToggle = useCallback(async () => {
    if (et.state === 'idle' || et.state === 'error') {
      // The lock only blocks turning it on; turning it off always works.
      if (!allows('eye-tracking')) { chat.setError(lockedMessage('eye-tracking')); return; }
      // Reset error state first
      if (et.state === 'error') et.stop();
      await et.start(et.selectedCameraId);
    } else {
      et.stop();
    }
  }, [et, allows, chat.setError]);


  // ──────────────────────────────────────────────────────────────────────────

  const [syncingModel, setSyncingModel] = useState(false);

  async function handleModelChange(connId: string, modelName?: string) {
    if (sidebarBusy || syncingModel) return;
    setSyncingModel(true);
    chat.setError('');
    try {
      const updatedState = await unwrap(window.novi.selectConnection(connId, modelName));
      onSaved(updatedState);
    } catch (err) {
      chat.setError(errorText(err));
    } finally {
      setSyncingModel(false);
    }
  }

  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const roles = connection ? config.modelRoles?.[connection.id] : undefined;
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    setAvailableModels([]);
    setLoadingModels(true);
    void unwrap(window.novi.listModels({ id: connection.id, name: connection.name, ai: connection }))
      .then((models) => {
        if (!cancelled && Array.isArray(models) && models.length > 0) {
          setAvailableModels(models);
        }
      })
      .catch((err) => {
        if (!cancelled) chat.setError(errorText(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => { cancelled = true; };
  }, [connection?.id, connection?.provider, connection?.baseUrl]);

  const ModeIcon = MODE_ICONS[appMode];
  const enabledConnections = config.connections.filter((c) => c.enabled !== false);

  const modelOptions = (() => {
    const map = new Map<string, string>();
    if (connection?.model) {
      map.set(connection.model, connection.model);
    }
    for (const m of availableModels) {
      map.set(m.id, m.name || m.id);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  })();

  const sidebar = <Sidebar
        collapsed={!modern && sidebarCollapsed}
        popover={modern}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        conversations={chat.conversations}
        selectedId={chat.selectedId}
        displayName={config.displayName}
        busy={sidebarBusy || syncingModel}
        onNew={() => { setConfirmEnd(true); setSidebarCollapsed(true); }}
        onSelect={(id) => {
          if (id !== chat.selectedId) setComposerKey(key => key + 1);
          if (chat.conversations.find((item) => item.id === id)?.localCoding) setAppMode('local-coding');
          chat.setSelectedId(id); setSettings(false); setSidebarCollapsed(true); chat.setError('');
        }}
        onDelete={setDeleting}
        onRename={(id) => { chat.setError(''); setConversationName(chat.conversations.find(item => item.id === id)?.title || ''); setRenaming(id); }}
        onSave={(id) => { void unwrap(window.novi.saveConversation(id)).catch(error => chat.setError(errorText(error))); }}
        onSettings={() => { practice.cancel(); setSettings(true); setSidebarCollapsed(true); }}
      />;
  const settingsPage = <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={chat.clear} onDebugEnabledChange={setDebugEnabled} closeRequest={settingsCloseRequest} />;
  const localSetup = <LocalCodingSetup state={state} onStarted={(snapshot, conversationId) => { onSaved(snapshot); setComposerKey((key) => key + 1); chat.setSelectedId(conversationId); chat.setError(''); }} />;
  const localHistory = localMode && localBinding && local.project && <LocalCodingHistory state={state} project={local.project} busy={chat.busy || contextBusy || ending}
    onProject={local.setProject} onSnapshot={onSaved} onError={chat.setError}
    onReconcile={(request) => void sendLocal(`Reconcile the proposed ${request.fromLabel} changes into the refreshed local files: ${request.files.join(', ')}.`, [], request)}
    readyNotice={local.notice} onDismissNotice={local.clearNotice} />;
  const readyCard = !readyDismissed && !sentInSession && !practice.active && !localMode && <ReadyCard transparent={transparent} listenKey={listenKey} snapshotKey={config.screenshotShortcut || 'Alt+3'}
    practiceDisabled={contextBusy || chat.busy || ending} onPractice={startPractice} onDismiss={() => setReadyDismissed(true)} />;

  const conversation = <>
{localMode && !localBinding ? (
            contextBusy ? <div className="empty-state"><p>Local Coding is available once the session finishes loading.</p></div>
              : !modern && localSetup
          ) : chat.selected ? (
            <div className="conversation-scroll" ref={scroll} onScroll={() => { const el = scroll.current!; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
              <div className="messages">
                {localMode && localBinding && !chat.selected.messages.length && <p className="lc-empty">Ask about {localBinding.name} in the message box. Answers explain the code; changes come back as proposals you can open, compare and copy. Your files are never changed.</p>}
                {chat.selected.messages.map((message) => (
                  <Message key={message.id} message={message} onOpenFile={openLocalFile} debugEnabled={!modern && debugEnabled} readOnly={modern}
                    generating={chat.busy && chat.activeId === chat.selectedId && message.id === chat.selected!.messages.at(-1)?.id} />
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h1>{modern ? contextBusy ? 'Preparing your session…' : 'Ready when you are.' : welcome}</h1>
            </div>
          )}
  </>;

  return (
    <div className={`chat-layout ${modern ? 'modern-layout' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {!modern && sidebar}

      {settings && !modern && <div className="settings-surface" ref={setSettingsHost} />}
        <main className={`chat-main ${!chat.selected ? 'empty' : ''}`} hidden={settings && !modern}>
          {!modern && <header className="chat-header">
            <div className="header-title-area">
              <span className="header-title">{chat.selected?.title || 'A new conversation'}</span>
            </div>
            <div className="session-controls"><span title="Temporary session context">{state.contextSession?.isEmpty ? 'Empty session' : state.contextSession?.summaryReady ? 'Ready' : state.contextSession?.status === 'error' ? 'Context error' : 'Loading context…'}</span><button className="danger-button" disabled={ending} onClick={() => setConfirmEnd(true)}>End session</button></div>
          </header>}
          {!modern && <DebugPanel compact conversationId={chat.selectedId} onEnabledChange={setDebugEnabled} />}
          {!modern && readyCard}
          {!modern && localHistory}
          {!modern && appMode === 'system-design' && <button type="button" className="secondary" onClick={() => void unwrap(window.novi.setCodeViewerVisible(true)).then(() => unwrap(window.novi.updateCodeViewer(diagramBlocks(chat.selected?.messages || [])))).catch((error) => chat.setError(errorText(error)))}>Open diagrams · saved with this conversation</button>}
          {!modern && conversation}
          {modern && <div className="modern-dashboard">{sidebar}<button type="button" className="primary" onClick={() => void window.novi.workspaceAction('show')}>Show Live Insights</button></div>}
        <TrayPortal detached={modern || (trayDetached && !settings)} modern={modern} panel={settings ? <div ref={setSettingsHost} /> : localMode && !localBinding && !contextBusy ? localSetup : undefined}
          onPanelClose={settings ? () => setSettingsCloseRequest(value => value + 1) : undefined}
          onClosed={() => { setTrayDetached(false); if (modern) setInterfaceStyle('classic'); }}>
          {transparent && clickThrough && <p className="tray-input-hint" role="status">Clicks pass through · Press <kbd>{clickThroughShortcut}</kbd> to type</p>}
          {practice.active && <PracticeCoach state={practice.state} voiced={practice.voiced} listenKey={listenKey}
            onTypeInstead={practice.typeInstead} onRemove={() => void removePractice()} onEnd={practice.cancel} />}
          {syncingModel && <div className="tray-status" role="status">Saving model selection…</div>}
          {state.contextSession?.status === 'error' && <div className="error" role="alert">
            <p>Session setup could not finish. Your documents and instructions are still loaded.</p>
            <button type="button" className="secondary" disabled={retryingContext} onClick={() => void retryContext()}>{retryingContext ? 'Retrying setup…' : 'Retry session setup'}</button>
          </div>}
          {chat.error && (
            <div className="error dismissible" role="alert">
              {chat.error}
              <button className="icon-button" onClick={() => chat.setError('')} aria-label="Dismiss error"><X size={14} /></button>
            </div>
          )}
          <Composer
            compact={modern}
            insights={conversation}
            onEnd={modern ? () => setConfirmEnd(true) : undefined}
            suspended={settings && !modern}
            smartControl={modern && !localMode && <button type="button" className="composer-quick-btn" aria-label="Smart mode" aria-pressed={Boolean(roles?.deep && connection?.model === roles.deep)}
              disabled={sidebarBusy || syncingModel || !roles?.deep || !roles?.fast}
              title={roles?.deep && roles?.fast ? 'Switch between configured Deep and Fast models' : 'Configure Fast and Deep models in Model roles to enable Smart mode'}
              onClick={() => void handleModelChange(connection!.id, connection?.model === roles?.deep ? roles!.fast : roles!.deep)}><Zap size={14} />Smart</button>}
            toolbar={<>

            <TrayMenu className="tray-mode-menu" label="Change conversation mode" title={<><ModeIcon size={14} /><span>{SESSION_MODES.find(mode => mode.id === appMode)?.name}</span></>}>
            <nav className="chat-mode-tabs" aria-label="Conversation mode">
              {SESSION_MODES.map(({ id: mode, name: label }) => {
                const Icon = MODE_ICONS[mode];
                // Modes the plan doesn't include stay listed with a lock; choosing one explains why instead of switching.
                const locked = !allows(mode);
                return (
                <button key={mode} type="button" className={`mode-tab-btn ${appMode === mode ? 'active' : ''} ${locked ? 'plan-locked' : ''}`}
                  aria-label={locked ? `${label} (locked)` : label} title={locked ? lockedMessage(mode) : label} aria-pressed={appMode === mode} aria-disabled={locked || undefined}
                  onClick={(event) => { if (locked) chat.setError(lockedMessage(mode)); else setAppMode(mode); const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); } }}>
                  <Icon size={14} /><span>{label}</span>{locked && <PlanLock feature={mode} />}
                </button>
              ); })}
            </nav>
            {appMode === 'behavioral' && <BehavioralModeHUD framework={behavioralFramework} onSelectFramework={setBehavioralFramework} />}
            </TrayMenu>
            <TrayMenu className="tray-answer-menu" label="Answer style" title={<MessageSquare size={14} />}>
              <div className="tray-menu-heading">Answer style · change any time</div>
              <div className="chat-mode-tabs" role="group" aria-label="Answer style">
                {ANSWER_STYLES.filter(style => style.id !== 'custom' || state.contextSession?.interview?.customAnswerStyle || config.customAnswerStyle).map(style => <button type="button" key={style.id} className="mode-tab-btn" aria-pressed={answerStyle === style.id} title={style.description}
                  onClick={event => { setAnswerStyle(style.id); const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); } }}><span>{style.name}</span></button>)}
              </div>
            </TrayMenu>
            <TrayMenu className="tray-model-menu" label="Model settings" title={<Brain size={14} />}>
            {localMode ? (
              <div className="lc-session-bar" aria-label="Local Coding session">
                {localBinding ? <><span className="lc-project" title={local.project?.roots.map((root) => root.canonicalLocalPath).join('\n')}>{localBinding.name}</span><span className="lc-engine">{ENGINES.find((item) => item.id === localBinding.engine)?.label}</span><span className="lc-model" title={local.project?.reasoningEffort ? `Reasoning ${local.project.reasoningEffort}` : localBinding.model}>{localBinding.model}</span><span className="lc-readonly-pill" title="Read-only"><Lock size={11} aria-hidden="true" /><span className="lc-readonly-text">Read-only</span></span></>
                  : <span>Local Coding · choose a working folder in the panel</span>}
              </div>
            ) : <>
              <div className="tray-menu-heading">Model & provider</div>
              <div className="header-model-select-wrapper">
              <span className="status-dot" />
              {enabledConnections.length > 1 && (
                <select
                  aria-label="Change provider connection"
                  className="header-model-picker header-conn-picker"
                  disabled={sidebarBusy || syncingModel}
                  value={connection?.id || ''}
                  onChange={(e) => void handleModelChange(e.target.value)}
                  title={`Connection: ${connection?.name || 'None'}`}
                >
                  {enabledConnections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Change session model"
                className="header-model-picker"
                disabled={sidebarBusy || syncingModel}
                value={connection?.model || ''}
                onChange={(e) => void handleModelChange(connection?.id || '', e.target.value)}
                title={`Active model: ${connection?.model || 'None'}`}
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name === m.id ? m.id : `${m.name} (${m.id})`}
                  </option>
                ))}
              </select>
              {/* Shown once a model is chosen for the role in Model roles and context. */}
              {(['fast', 'deep'] as const).filter(role => roles?.[role]).map(role => <button type="button" key={role}
                className="text-button" disabled={sidebarBusy || syncingModel || loadingModels || !availableModels.some(model => model.id === roles?.[role])}
                aria-pressed={connection?.model === roles![role]}
                title={`${role === 'fast' ? 'Fast' : 'Deep'}: ${roles![role]}`}
                onClick={() => void handleModelChange(connection!.id, roles![role])}>{role === 'fast' ? 'Fast' : 'Deep'}</button>)}
            </div></>}
            </TrayMenu>
            <TrayMenu className="tray-tools" label="More controls" title={<><Menu size={16} />{(et.state !== 'idle' || et.overlayActive) && <span className={`tray-tool-status ${et.state === 'error' ? 'has-error' : ''}`} aria-label={et.state === 'error' ? 'Eye tracking error' : 'Eye tracking or HUD active'} />}</>}>
              <div className="tray-menu-heading">Eye tracking & screen HUD</div>
              <EyeTrackingPanel
                state={et.state}
                error={et.error}
                isCalibrated={et.isCalibrated}
                showDebugDot={showDebugDot}
                sensitivity={et.sensitivity}
                onSetSensitivity={et.setSensitivity}
                cameras={et.cameras}
                selectedCameraId={et.selectedCameraId}
                monitors={et.monitors}
                selectedDisplayId={et.selectedDisplayId}
                overlayActive={et.overlayActive}
                onToggle={() => void handleEyeToggle()}
                onToggleDebug={() => setShowDebugDot((v) => !v)}
                onListCameras={et.listCameras}
                onSwitchCamera={et.switchCamera}
                onListMonitors={et.listMonitors}
                onOpenOverlay={et.openOverlay}
                onCloseOverlay={et.closeOverlay}
                onSetMonitor={setWorkingMonitor}
                onSendSticky={['coding', 'system-design', 'local-coding'].includes(appMode) ? et.sendStickyToOverlay : undefined}
                locked={!allows('eye-tracking')}
              />
            </TrayMenu>
            {modern && <>
              <TrayMenu label="Sessions & history" title={<History size={16} />} className="modern-session-menu">
                {sidebar}{readyCard}{localHistory}
                {chat.selected?.messages.filter(message => message.localCoding).map(message => <LocalCodingResult key={message.id} result={message.localCoding!} onOpenFile={openLocalFile} />)}
                <DebugPanel compact conversationId={chat.selectedId} onEnabledChange={setDebugEnabled} />
                {appMode === 'system-design' && <button type="button" className="text-button" onClick={() => void unwrap(window.novi.setCodeViewerVisible(true)).catch(error => chat.setError(errorText(error)))}>Open diagrams</button>}
                <button type="button" className="danger-button" disabled={ending} onClick={() => setConfirmEnd(true)}>End session</button>
              </TrayMenu>
              {chat.selected?.messages.some(message => message.images?.length) && <TrayMenu label="Conversation attachments" title={<Image size={16} />} className="modern-attachments-menu"><div className="message-images">{chat.selected.messages.flatMap(message => message.images?.map(image => <ImagePreview key={`${message.id}:${image.id}`} image={image} />) || [])}</div></TrayMenu>}
              <button type="button" className="composer-quick-btn" aria-label="Settings" title="Settings" aria-pressed={settings} onClick={() => settings ? setSettingsCloseRequest(value => value + 1) : setSettings(true)}><Settings size={16} /></button>
              <ModernWindowMenu />
            </>}
            {!modern && <button type="button" className="composer-quick-btn tray-dock-toggle"
              aria-label={trayDetached ? 'Attach controls' : 'Detach controls'}
              title={trayDetached ? 'Attach controls to chat' : 'Detach controls into a floating window'}
              onClick={() => setTrayDetached(value => !value)}>
              {trayDetached ? <PanelBottom size={16} /> : <ExternalLink size={16} />}
            </button>}
            </>}
            key={composerKey}
            speechModelId={config.localASRModelId}
            busy={chat.busy || contextBusy || ending || syncingModel}
            onSend={(content, images) => {
              setSentInSession(true);
              if (localMode) return sendLocal(content, images.map((image) => image.id));
              return chat.send({ content, imageIds: images.map((image) => image.id), pinnedContext });
            }}
            onListeningChange={practice.onListeningChange}
            prefill={prefill}
            onPrefillApplied={() => setPrefill(undefined)}
            placeholder={localMode ? localBinding && local.project ? `Ask about ${localBinding.name}. Next request uses ${local.project.versions.find((version) => version.id === local.project!.selectedVersionId)?.label ?? 'the selected version'}` : 'Start Local Coding in the panel first' : undefined}
          />
        </TrayPortal>
        </main>

      {createPortal(<>
      {/* Every way to end a session asks first; focus starts on Keep session and Escape keeps it. */}
      {confirmEnd && <div className="session-confirm" role="alertdialog" aria-modal="true" aria-label="End context session" onKeyDown={(event) => { if (event.key === 'Escape' && !ending) setConfirmEnd(false); }}><div><h2>End this session?</h2><p>Your conversations and attachments stay saved. The temporary AI Context.md file will be removed; source folders stay in place.</p><button className="text-button" autoFocus disabled={ending} onClick={() => setConfirmEnd(false)}>Keep session</button><button className="danger-button" disabled={ending} onClick={() => void endSession()}>{ending ? 'Ending…' : 'End session'}</button></div></div>}
      {renaming && <dialog ref={renameDialog} className="dialog" aria-labelledby="rename-title" onCancel={() => setRenaming(null)}>
        <form onSubmit={async (event) => {
          event.preventDefault(); chat.setError(''); setSavingName(true);
          try { if (await chat.rename(renaming, conversationName)) setRenaming(null); }
          finally { setSavingName(false); }
        }}>
          <h2 id="rename-title">Rename conversation</h2>
          <label>Conversation name<input autoFocus value={conversationName} maxLength={100} required
            onFocus={(event) => event.target.select()} onChange={(event) => setConversationName(event.target.value)} /></label>
          {chat.error && <p className="error" role="alert">{chat.error}</p>}
          <div className="conversation-dialog-actions">
            <button type="button" className="text-button" disabled={savingName} onClick={() => setRenaming(null)}>Cancel</button>
            <button type="submit" className="primary" disabled={savingName || !conversationName.trim()}>{savingName ? 'Saving…' : 'Save name'}</button>
          </div>
        </form>
      </dialog>}
      {/* Delete dialog */}
      {deleting && (
        <dialog ref={deleteDialog} className="dialog" aria-labelledby="delete-title" onCancel={() => setDeleting(null)}>
          <h2 id="delete-title">Delete this conversation?</h2>
          <p>Its messages and local images will be removed. This cannot be undone.</p>
          <div>
            <button autoFocus className="text-button" onClick={() => setDeleting(null)}>Keep it</button>
            <button className="danger-button" onClick={() => { void chat.remove(deleting); setDeleting(null); }}>Delete conversation</button>
          </div>
        </dialog>
      )}
      </>, overlayHost || document.body)}
      <SurfacePortal target={settingsHost}>{settings && settingsPage}</SurfacePortal>

    </div>
  );
}

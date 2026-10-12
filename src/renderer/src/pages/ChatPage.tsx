import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Code2, GripVertical, MessageSquare, Network, PanelTop, Phone, Settings2, Video, X, type LucideIcon } from 'lucide-react';
import type { AppMode, ModelOption, Snapshot } from '../../../shared/types';
import { Sidebar } from '../components/chat/Sidebar';
import { Composer } from '../components/chat/Composer';
import { Message } from '../components/chat/Message';
import { Brand } from '../components/Brand';
import { useChat } from '../hooks/useChat';
import { activeConnection } from '../../../shared/providers';
import { SettingsPage } from './SettingsPage';
import { useEyeTracking } from '../hooks/useEyeTracking';
import { EyeTrackingPanel } from '../components/EyeTrackingPanel';
import { unwrap, errorText } from '../services/api';
import { useAppMode } from '../context/AppModeContext';
import { codeFromMessages } from '../components/CodingModeHUD';
import { SESSION_MODES } from '../../../shared/sessionModes';
import { diagramBlocks } from '../../../shared/diagrams';
import { BehavioralModeHUD } from '../components/BehavioralModeHUD';
import { TrayPortal } from '../components/TrayPortal';
import { ReadyCard } from '../components/ReadyCard';
import { PracticeCoach } from '../components/PracticeCoach';
import { usePracticeRun } from '../hooks/usePracticeRun';
import { useStealthState } from '../hooks/useStealth';

// Each mode has its own icon so the tray can show only the active mode's name.
const MODE_ICONS: Record<AppMode, LucideIcon> = {
  normal: MessageSquare, recruiter: Phone, coding: Code2, technical: Video, 'system-design': Network, behavioral: Award,
};

export function ChatPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const chat = useChat(state.conversations), [settings, setSettings] = useState(false), [deleting, setDeleting] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  // The input controls live in a floating tray window; this window docks on the right as the output panel.
  const [trayOpen, setTrayOpen] = useState(true), [trayKey, setTrayKey] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  useEffect(() => {
    void unwrap(window.novi.setWorkspaceDocked(true)).catch(console.error);
    return () => { void unwrap(window.novi.setWorkspaceDocked(false)).catch(console.error); };
  }, []);
  // Chosen in Get ready or Settings: start hidden from screen sharing, exactly as if Transparency were pressed.
  useEffect(() => {
    if (state.settings?.transparentOnStart) void unwrap(window.novi.setTransparent(true)).catch(console.error);
  }, []);
  const [{ transparent }] = useStealthState();
  // The ready check shows until it is dismissed or the first message is sent.
  const [readyDismissed, setReadyDismissed] = useState(false), [sentInSession, setSentInSession] = useState(false);
  const {
    appMode,
    setAppMode,
    behavioralFramework,
    setBehavioralFramework,
    setWorkingMonitor,
  } = useAppMode();
  const scroll = useRef<HTMLDivElement>(null), atBottom = useRef(true);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); }, [deleting]);
  const config = state.settings!;
  const connection = state.contextSession?.connection ?? activeConnection(config);
  const [compactContext, setCompactContext] = useState(false);
  const [pinnedContext, setPinnedContext] = useState('');
  useEffect(() => { setPinnedContext(chat.selected?.pinnedContext || ''); }, [chat.selectedId, chat.selected?.pinnedContext]);
  const streamingMessageId = chat.busy && chat.activeId === chat.selectedId ? chat.selected?.messages.at(-1)?.id : undefined;
  const contextBusy = Boolean(state.contextSession && state.contextSession.status !== 'ready');
  const [ending, setEnding] = useState(false);
  const sidebarBusy = chat.busy || ending || (contextBusy && state.contextSession?.status !== 'error');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const sessionId = state.contextSession?.id;
  const practice = usePracticeRun({ appMode, chatBusy: chat.busy, chatError: chat.error, conversationId: chat.selectedId });
  const listenKey = config.audioRecordShortcut || 'Alt+A';
  function startPractice() {
    if (contextBusy || chat.busy || ending) return;
    chat.setError('');
    // A fresh conversation, so the practice answer is easy to find and to remove.
    chat.setSelectedId(null);
    if (!trayOpen) { setTrayKey((key) => key + 1); setTrayOpen(true); }
    practice.start();
  }
  async function removePractice() {
    const id = practice.state.conversationId;
    practice.cancel();
    if (id) await chat.remove(id);
  }
  useEffect(() => {
    if (!sessionId || state.contextSession?.status === 'ready' || state.contextSession?.isEmpty) return;
    let mounted = true;
    void unwrap(window.novi.initializeContext()).then((snapshot) => { if (mounted) onSaved(snapshot); })
      .catch((error) => {
        if (mounted) chat.setError(errorText(error));
        void unwrap(window.novi.session()).then((snapshot) => { if (mounted) onSaved(snapshot); }).catch(() => {});
      });
    return () => { mounted = false; };
  }, [sessionId, state.contextSession?.status, state.contextSession?.isEmpty]);
  async function endSession() {
    setEnding(true); et.stop();
    try { onSaved(await unwrap(window.novi.endContext())); }
    catch (error) { chat.setError(errorText(error)); setEnding(false); }
  }
  useEffect(() => { if (atBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [chat.selected?.messages]);
  useEffect(() => { atBottom.current = true; if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [chat.selectedId]);
  useEffect(() => {
    if (appMode !== 'coding' && appMode !== 'system-design') return;
    void unwrap(window.novi.updateCodeViewer(appMode === 'system-design' ? diagramBlocks(chat.selected?.messages || [], streamingMessageId) : codeFromMessages(chat.selected?.messages || []))).catch(console.error);
  }, [appMode, chat.selected?.messages, chat.selectedId, streamingMessageId]);

  // ── Eye tracking ──────────────────────────────────────────────────────────
  const et = useEyeTracking();
  const [showDebugDot, setShowDebugDot] = useState(false);

  // In behavioral mode, automatically route assistant answers into the HUD.
  // Depend on stable fields: `et` is a new object on every gaze update (up to 30/s).
  useEffect(() => {
    if (!['behavioral', 'recruiter', 'technical'].includes(appMode)) return;
    const messages = chat.selected?.messages || [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant && lastAssistant.content.trim()) {
      et.sendStickyToOverlay(
        lastAssistant.content,
        `${SESSION_MODES.find((mode) => mode.id === appMode)?.name} ${appMode === 'behavioral' ? `(${behavioralFramework.toUpperCase()})` : ''}`
      );
    }
  }, [appMode, chat.selected?.messages, behavioralFramework, et.sendStickyToOverlay, et.state, et.overlayActive]);

  const handleEyeToggle = useCallback(async () => {
    if (et.state === 'idle' || et.state === 'error') {
      // Reset error state first
      if (et.state === 'error') et.stop();
      await et.start(et.selectedCameraId);
    } else {
      et.stop();
    }
  }, [et]);


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
  async function setRole(role: 'fast' | 'deep', model: string) {
    if (!connection || !model || sidebarBusy || syncingModel) return;
    setSyncingModel(true);
    try { onSaved(await unwrap(window.novi.setModelRole(connection.id, role, model))); }
    catch (error) { chat.setError(errorText(error)); }
    finally { setSyncingModel(false); }
  }

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

  return (
    <div className={`chat-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        conversations={chat.conversations}
        selectedId={chat.selectedId}
        displayName={config.displayName}
        busy={sidebarBusy || syncingModel}
        onNew={() => void endSession()}
        onSelect={(id) => { if (id !== chat.selectedId) setComposerKey(key => key + 1); chat.setSelectedId(id); setSettings(false); chat.setError(''); }}
        onDelete={setDeleting}
        onSettings={() => { practice.cancel(); setSettings(true); }}
      />

      {settings ? (
        <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={chat.clear} />
      ) : (
        <main className={`chat-main ${!chat.selected ? 'empty' : ''}`}>
          <header className="chat-header">
            <div className="header-title-area">
              <span className="header-title">{chat.selected?.title || 'A new conversation'}</span>
            </div>
            {!trayOpen && <button type="button" className="text-button tray-reopen" onClick={() => { setTrayKey((key) => key + 1); setTrayOpen(true); }}><PanelTop size={14} />Show tray</button>}
            <div className="session-controls"><span title="Temporary session context">{state.contextSession?.isEmpty ? 'Empty session' : state.contextSession?.summaryReady ? 'Ready' : state.contextSession?.status === 'error' ? 'Context error' : 'Loading context…'}</span><button className="danger-button" disabled={ending} onClick={() => setConfirmEnd(true)}>End session</button></div>
          </header>
          {/* Errors normally show in the tray; keep them visible here while it is closed. */}
          {!trayOpen && chat.error && (
            <div className="error dismissible" role="alert">
              {chat.error}
              <button className="icon-button" onClick={() => chat.setError('')} aria-label="Dismiss error"><X size={14} /></button>
            </div>
          )}

          {!readyDismissed && !sentInSession && !practice.active && (
            <ReadyCard transparent={transparent} listenKey={listenKey} snapshotKey={config.screenshotShortcut || 'Alt+3'}
              practiceDisabled={contextBusy || chat.busy || ending} onPractice={startPractice} onDismiss={() => setReadyDismissed(true)} />
          )}
          {appMode === 'system-design' && <button type="button" className="secondary" onClick={() => void unwrap(window.novi.setCodeViewerVisible(true)).then(() => unwrap(window.novi.updateCodeViewer(diagramBlocks(chat.selected?.messages || [])))).catch((error) => chat.setError(errorText(error)))}>Open diagrams · saved with this conversation</button>}
          {chat.selected ? (
            <div className="conversation-scroll" ref={scroll} onScroll={() => { const el = scroll.current!; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
              <div className="messages">
                {chat.selected.messages.map((message, index) => (
                  <Message key={message.id} message={message} displayName={config.displayName}
                    generating={chat.busy && chat.activeId === chat.selectedId && index === chat.selected!.messages.length - 1} />
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <Brand compact />
              <h1>What would you like to work on?</h1>
              <p>Type in the tray at the top of your screen, share an image, or choose a focused mode there.</p>
            </div>
          )}
        </main>
      )}

      {!settings && trayOpen && (
        <TrayPortal key={trayKey} onClosed={() => { practice.cancel(); setTrayOpen(false); }}>
          <div className="tray-row">
            <span className="tray-grip" title="Drag to move the tray" aria-hidden="true"><GripVertical size={15} /></span>
            <nav className="chat-mode-tabs" aria-label="Conversation mode">
              {SESSION_MODES.map(({ id: mode, name: label }) => {
                const Icon = MODE_ICONS[mode];
                return (
                <button key={mode} type="button" className={`mode-tab-btn ${appMode === mode ? 'active' : ''}`}
                  aria-label={label} title={label} aria-pressed={appMode === mode} onClick={() => setAppMode(mode)}>
                  <Icon size={14} />{appMode === mode && <span>{label}</span>}
                </button>
              ); })}
            </nav>
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
            </div>
            {/* Eye tracking opens the screen HUD, and the effect above sends it the latest answer in interview modes. */}
            {appMode === 'behavioral' && (
              <BehavioralModeHUD framework={behavioralFramework} onSelectFramework={setBehavioralFramework} />
            )}
            <div className="tray-tools">
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
                onSendSticky={et.sendStickyToOverlay}
              />
              <button type="button" className={`tray-icon-btn ${optionsOpen ? 'active' : ''}`} aria-label="Model roles and context"
                title="Model roles and context" aria-expanded={optionsOpen} aria-controls="tray-options" onClick={() => setOptionsOpen((open) => !open)}>
                <Settings2 size={15} />
              </button>
            </div>
          </div>
          {practice.active && <PracticeCoach state={practice.state} voiced={practice.voiced} listenKey={listenKey}
            onTypeInstead={practice.typeInstead} onRemove={() => void removePractice()} onEnd={practice.cancel} />}
          {syncingModel && <div className="tray-status" role="status">Saving model selection…</div>}
          {chat.error && (
            <div className="error dismissible" role="alert">
              {chat.error}
              <button className="icon-button" onClick={() => chat.setError('')} aria-label="Dismiss error"><X size={14} /></button>
            </div>
          )}
          <Composer
            key={composerKey}
            speechModelId={config.localASRModelId}
            busy={chat.busy || contextBusy || ending || syncingModel}
            onSend={(content, images) => { setSentInSession(true); return chat.send({ content, imageIds: images.map((image) => image.id), compactContext, pinnedContext }); }}
            onListeningChange={practice.onListeningChange}
            prefill={practice.prefill}
          />
          {optionsOpen && <section id="tray-options" className="request-options tray-options" aria-label="Model roles and context">
            <p>Fast for short follow-ups; Deep for new code, debugging, and design. You choose which model answers.</p>
            {(['fast', 'deep'] as const).map(role => <label key={role}>{role === 'fast' ? 'Fast' : 'Deep'} model
              <select value={roles?.[role] || ''} disabled={loadingModels || sidebarBusy || syncingModel} onChange={event => void setRole(role, event.target.value)}>
                <option value="" disabled>{loadingModels ? 'Loading models…' : 'Choose a model'}</option>
                {roles?.[role] && !availableModels.some(model => model.id === roles[role]) && <option value={roles[role]}>{roles[role]} (refresh availability)</option>}
                {availableModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </label>)}
            <label>Pinned constraints<textarea value={pinnedContext} maxLength={8000} disabled={chat.busy} onChange={event => setPinnedContext(event.target.value)} placeholder="Requirements to include verbatim in every request in this conversation" /></label>
            <label><input type="checkbox" checked={compactContext} disabled={chat.busy} onChange={event => setCompactContext(event.target.checked)} />Use compact context (experimental)</label>
            <small>{compactContext ? 'Sends the original problem, pinned constraints, recent turns, and matching older turns/source excerpts. Uncheck for full context if a detail is missing.' : 'Sends full saved conversation and source context.'} Conversations and sources stay saved locally.</small>
          </section>}
        </TrayPortal>
      )}

      {/* Delete dialog */}
      {confirmEnd && <div className="session-confirm" role="alertdialog" aria-modal="true" aria-label="End context session"><div><h2>End this session?</h2><p>Your conversations and attachments stay saved. The temporary AI Context.md file will be removed; source folders stay in place.</p><button className="text-button" disabled={ending} onClick={() => setConfirmEnd(false)}>Keep session</button><button className="danger-button" disabled={ending} onClick={() => void endSession()}>{ending ? 'Ending…' : 'End session'}</button></div></div>}
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

    </div>
  );
}

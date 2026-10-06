import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Code2, MessageSquare, X } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { Sidebar } from '../components/chat/Sidebar';
import { Composer } from '../components/chat/Composer';
import { Message } from '../components/chat/Message';
import { Brand } from '../components/Brand';
import { useChat } from '../hooks/useChat';
import { activeConnection, getFastInterviewModel } from '../../../shared/providers';
import { SettingsPage } from './SettingsPage';
import { useEyeTracking } from '../hooks/useEyeTracking';
import { EyeTrackingPanel } from '../components/EyeTrackingPanel';
import { GazeCalibration } from '../components/GazeCalibration';
import { unwrap, errorText } from '../services/api';
import { useAppMode } from '../context/AppModeContext';
import { codeFromMessages } from '../components/CodingModeHUD';
import { BehavioralModeHUD } from '../components/BehavioralModeHUD';

export function ChatPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const chat = useChat(state.conversations), [settings, setSettings] = useState(false), [deleting, setDeleting] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const {
    appMode,
    setAppMode,
    isRecordingAudio,
    audioLevel,
    isAudioStarting,
    isAudioProcessing,
    recordingSeconds,
    toggleAudioRecording,
    fastInterviewModel,
    toggleFastInterviewModel,
    behavioralFramework,
    setBehavioralFramework,
    setWorkingMonitor,
  } = useAppMode();
  const scroll = useRef<HTMLDivElement>(null), atBottom = useRef(true);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); }, [deleting]);
  const config = state.settings!;
  const connection = state.contextSession?.connection ?? activeConnection(config);
  const contextBusy = Boolean(state.contextSession && state.contextSession.status !== 'ready');
  const [ending, setEnding] = useState(false);
  const sidebarBusy = chat.busy || ending || (contextBusy && state.contextSession?.status !== 'error');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const sessionId = state.contextSession?.id;
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;
    void unwrap(window.novi.initializeContext()).then((snapshot) => { if (mounted) onSaved(snapshot); })
      .catch((error) => {
        if (mounted) chat.setError(errorText(error));
        void unwrap(window.novi.session()).then((snapshot) => { if (mounted) onSaved(snapshot); }).catch(() => {});
      });
    return () => { mounted = false; };
  }, [sessionId]);
  async function endSession() {
    setEnding(true); et.stop();
    try { onSaved(await unwrap(window.novi.endContext())); }
    catch (error) { chat.setError(errorText(error)); setEnding(false); }
  }
  useEffect(() => { if (atBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [chat.selected?.messages]);
  useEffect(() => { atBottom.current = true; if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [chat.selectedId]);
  useEffect(() => {
    if (appMode !== 'coding') return;
    void unwrap(window.novi.updateCodeViewer(codeFromMessages(chat.selected?.messages || []))).catch(console.error);
  }, [appMode, chat.selected?.messages, chat.selectedId]);

  // ── Eye tracking ──────────────────────────────────────────────────────────
  const et = useEyeTracking();
  const [showDebugDot, setShowDebugDot] = useState(false);

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
  const [syncedModel, setSyncedModel] = useState<string | null>(null);

  async function handleModelChange(connId: string, modelName?: string) {
    if (sidebarBusy || syncingModel) return;
    setSyncingModel(true);
    setSyncedModel(null);
    chat.setError('');
    try {
      const updatedState = await unwrap(window.novi.selectConnection(connId, modelName));
      onSaved(updatedState);
      const newConn = activeConnection(updatedState.settings!);
      const targetModel = newConn?.model || modelName || 'new model';
      
      // If inside an active conversation or context session, send context sync prompt to the new model
      if (chat.selectedId || state.contextSession) {
        await chat.send({
          content: `[System Notice: The session model has been changed to ${newConn?.name} / ${targetModel}. Read and verify the conversation history and context above. Reply ONLY with the single word UNDERSTOOD once you have ingested the context and are ready.]`,
          imageIds: []
        });
      }
      setSyncedModel(`${newConn?.name} / ${targetModel}`);
    } catch (err) {
      chat.setError(errorText(err));
    } finally {
      setSyncingModel(false);
    }
  }

  return (
    <div className={`chat-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        conversations={chat.conversations}
        selectedId={chat.selectedId}
        displayName={config.displayName}
        busy={sidebarBusy || syncingModel}
        onNew={() => { chat.setSelectedId(null); setSettings(false); chat.setError(''); }}
        onSelect={(id) => { chat.setSelectedId(id); setSettings(false); chat.setError(''); }}
        onDelete={setDeleting}
        onSettings={() => setSettings(true)}
      />

      {settings ? (
        <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={chat.clear} />
      ) : (
        <main className={`chat-main ${!chat.selected ? 'empty' : ''}`}>
          <header className="chat-header">
            <div className="header-title-area">
              <span className="header-title">{chat.selected?.title || 'A new conversation'}</span>
              <div className="header-model-select-wrapper">
                <span className="status-dot" />
                <select
                  aria-label="Change session model"
                  className="header-model-picker"
                  disabled={sidebarBusy || syncingModel}
                  value={connection?.id || ''}
                  onChange={(e) => void handleModelChange(e.target.value)}
                >
                  {config.connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.model})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <nav className="chat-mode-tabs" aria-label="Conversation mode">
              {([
                ['normal', 'Chat', MessageSquare],
                ['coding', 'Code', Code2],
                ['behavioral', 'Interview', Award],
              ] as const).map(([mode, label, Icon]) => (
                <button key={mode} type="button" className={`mode-tab-btn ${appMode === mode ? 'active' : ''}`}
                  aria-label={label} title={label} aria-pressed={appMode === mode} onClick={() => setAppMode(mode)}>
                  <Icon size={14} /><span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="session-controls"><span title="Temporary session context">{state.contextSession?.summaryReady ? 'Ready' : state.contextSession?.status === 'error' ? 'Context error' : 'Loading context…'}</span><button className="danger-button" disabled={ending} onClick={() => setConfirmEnd(true)}>End session</button></div>
            {/* Eye tracking controls in header */}
            <EyeTrackingPanel
              state={et.state}
              error={et.error}
              isCalibrated={et.isCalibrated}
              showDebugDot={showDebugDot}
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
          </header>

          {/* Integrated Behavioral Mode Copilot Bar (All in One Right Side - No Left Tab) */}
          {appMode === 'behavioral' && (
            <BehavioralModeHUD
              framework={behavioralFramework}
              onSelectFramework={setBehavioralFramework}
              isRecordingAudio={isRecordingAudio}
              audioLevel={audioLevel}
              isAudioStarting={isAudioStarting}
              isAudioProcessing={isAudioProcessing}
              recordingSeconds={recordingSeconds}
              onToggleRecording={toggleAudioRecording}
              fastModelActive={fastInterviewModel}
              onToggleFastModel={async () => {
                const willBeActive = !fastInterviewModel;
                toggleFastInterviewModel();
                if (willBeActive && connection) {
                  const fastM = getFastInterviewModel(connection.provider, connection.model);
                  await handleModelChange(connection.id, fastM);
                }
              }}
              fastModelName={connection ? getFastInterviewModel(connection.provider, connection.model) : 'Fast Flash'}
              busy={sidebarBusy || syncingModel}
            />
          )}

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
              <p>Ask a question, share an image, or choose a focused mode above.</p>
            </div>
          )}

          <div className="composer-area">
            {syncingModel && <div className="model-sync-badge">Ingesting context with {connection?.name} / {connection?.model}… (takes a moment)</div>}
            {syncedModel && !syncingModel && <div className="model-sync-confirmed">✓ {syncedModel} ingested context (UNDERSTOOD)</div>}
            {chat.error && (
              <div className="error dismissible" role="alert">
                {chat.error}
                <button className="icon-button" onClick={() => chat.setError('')} aria-label="Dismiss error"><X size={14} /></button>
              </div>
            )}
            <Composer
              key={chat.selectedId || 'new'}
              busy={chat.busy || contextBusy || ending || syncingModel}
              onSend={(content, images) => chat.send({ content, imageIds: images.map((image) => image.id) })}
            />
          </div>
        </main>
      )}

      {/* Delete dialog */}
      {confirmEnd && <div className="session-confirm" role="alertdialog" aria-modal="true" aria-label="End context session"><div><h2>End this session?</h2><p>Your conversations and attachments stay saved. The temporary AI Context.md file will be removed; source folders stay in place.</p><button className="text-button" disabled={ending} onClick={() => setConfirmEnd(false)}>Keep session</button><button className="danger-button" disabled={ending} onClick={() => void endSession()}>{ending ? 'Ending…' : 'End session'}</button></div></div>}
      {et.state === 'calibrating' && (
        <GazeCalibration key={`${et.selectedCameraId}:${et.selectedDisplayId}`} onAddSample={et.addCalibrationSample} onFinish={et.finishCalibration} onCancel={et.stop} />
      )}
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

      {/* ── Eye tracking overlays (portaled above everything) ── */}
    </div>
  );
}

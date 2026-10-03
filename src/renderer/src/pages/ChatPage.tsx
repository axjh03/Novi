import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Leaf, X } from 'lucide-react';
import type { Snapshot } from '../../../shared/types';
import { Sidebar } from '../components/chat/Sidebar';
import { Composer } from '../components/chat/Composer';
import { Message } from '../components/chat/Message';
import { Brand } from '../components/Brand';
import { useChat } from '../hooks/useChat';
import { activeConnection } from '../../../shared/providers';
import { SettingsPage } from './SettingsPage';
import { useEyeTracking } from '../hooks/useEyeTracking';
import { EyeTrackingPanel } from '../components/EyeTrackingPanel';
import { GazeCalibration } from '../components/GazeCalibration';
import { unwrap, errorText } from '../services/api';

export function ChatPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const chat = useChat(state.conversations), [settings, setSettings] = useState(false), [deleting, setDeleting] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null), atBottom = useRef(true);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); }, [deleting]);
  const config = state.settings!;
  const connection = state.contextSession?.connection ?? activeConnection(config);
  const contextBusy = state.contextSession?.status !== 'ready';
  const [ending, setEnding] = useState(false);
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

  return (
    <div className="chat-layout">
      <Sidebar
        conversations={chat.conversations}
        selectedId={chat.selectedId}
        displayName={config.displayName}
        busy={chat.busy || contextBusy || ending}
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
            <div className="session-controls"><span>{state.contextSession?.summaryReady ? 'Context ready · temporary session' : state.contextSession?.status === 'error' ? 'Context loading failed' : 'Reading your context…'}</span><button className="danger-button" disabled={ending} onClick={() => setConfirmEnd(true)}>End session</button></div>
            <div>
              <span className="header-title">{chat.selected?.title || 'A new conversation'}</span>
              <span className="provider-badge">
                <span className="status-dot" />
                {connection?.name}<span> / </span>{connection?.model}
              </span>
            </div>
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
              onSetMonitor={(id) => et.setMonitor(id)}
              onSendSticky={et.sendStickyToOverlay}
            />
            <span className="local-badge"><Leaf size={14} />Made for your own pace</span>
          </header>

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
              <div className="greeting-mark"><Brand compact /><span className="greeting-spark">✦</span></div>
              <span className="eyebrow">A LITTLE CLARITY STARTS HERE</span>
              <h1>Hey {config.displayName},<br /><span>what's on your mind?</span></h1>
              <p>Big ideas, small questions. Let's think it through.</p>
              <div className="empty-cues">
                <span>Find a fresh perspective <ArrowUpRight size={13} /></span>
                <i />
                <span>Make something good <ArrowUpRight size={13} /></span>
              </div>
            </div>
          )}

          <div className="composer-area">
            <p className="context-hint">Session model: {connection?.name} / {connection?.model}. End this session to choose another model.</p>
            {chat.selected && <small className="routing-note">Your next message and this conversation will go to {connection?.name}.</small>}
            {chat.error && (
              <div className="error dismissible" role="alert">
                {chat.error}
                <button className="icon-button" onClick={() => chat.setError('')} aria-label="Dismiss error"><X size={14} /></button>
              </div>
            )}
            <Composer key={chat.selectedId || 'new'} busy={chat.busy || contextBusy || ending} model={connection?.model || 'Choose a provider'}
              onSend={(content, images) => chat.send({ content, imageIds: images.map((image) => image.id) })} />
          </div>
        </main>
      )}

      {/* Delete dialog */}
      {confirmEnd && <div className="session-confirm" role="alertdialog" aria-modal="true" aria-label="End context session"><div><h2>End this session?</h2><p>This deletes this session’s local conversations, image copies, and AI Context.md. Source folders and unrelated history are kept.</p><button className="text-button" disabled={ending} onClick={() => setConfirmEnd(false)}>Keep session</button><button className="danger-button" disabled={ending} onClick={() => void endSession()}>{ending ? 'Ending…' : 'End & delete session'}</button></div></div>}
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

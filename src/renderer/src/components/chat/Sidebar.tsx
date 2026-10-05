import { MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Settings, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Conversation } from '../../../../shared/types';
import { Brand } from '../Brand';

interface Props { conversations: Conversation[]; selectedId: string | null; displayName: string; busy: boolean; onNew: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void; onSettings: () => void }
export function Sidebar({ conversations, selectedId, displayName, busy, onNew, onSelect, onDelete, onSettings }: Props) {
  const compactQuery = '(max-width: 1050px), (max-height: 700px)';
  const [automatic, setAutomatic] = useState(() => matchMedia(compactQuery).matches);
  const [manual, setManual] = useState<boolean | null>(null);
  const collapsed = manual ?? automatic;
  useEffect(() => {
    const media = matchMedia(compactQuery);
    const update = () => { setAutomatic(media.matches); setManual(null); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.querySelector('.chat-layout')?.classList.toggle('sidebar-collapsed', collapsed);
  }, [collapsed]);

  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-brand">
      <Brand compact={collapsed} />
      {!collapsed && <span className="desktop-label">DESKTOP</span>}
      <button className="icon-button sidebar-toggle" onClick={() => setManual(!collapsed)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
    </div>

    <button className="new-chat" onClick={onNew} disabled={busy} title="New conversation">
      <Plus size={17} className="new-icon" />
      {!collapsed && <><span>New conversation</span><span className="new-arrow">↗</span></>}
    </button>

    {!collapsed && <div className="history-heading">YOUR CONVERSATIONS<span>{conversations.length || ''}</span></div>}

    <nav className="history" aria-label="Conversation history">
      {!conversations.length && !collapsed && <p className="history-empty">A clean slate.<br />Your conversations will live here.</p>}
      {conversations.map((conversation) => (
        <div key={conversation.id} className={`history-item ${selectedId === conversation.id ? 'selected' : ''}`}>
          <button className="history-open" disabled={busy} title={conversation.title} aria-current={selectedId === conversation.id ? 'page' : undefined} onClick={() => onSelect(conversation.id)}>
            <MessageSquare size={14} />
            {!collapsed && <span>{conversation.title}</span>}
          </button>
          {!collapsed && <button className="history-delete icon-button" disabled={busy} onClick={() => onDelete(conversation.id)} aria-label={`Delete ${conversation.title}`}><Trash2 size={13} /></button>}
        </div>
      ))}
    </nav>

    <div className="sidebar-bottom">
      <button className="settings-link" onClick={onSettings} disabled={busy} title="Settings">
        <Settings size={17} />
        {!collapsed && <span>Settings</span>}
      </button>
      <div className="profile" title={displayName}>
        <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
        {!collapsed && <div><strong>{displayName}</strong><small><span className="status-dot" />Your personal space</small></div>}
      </div>
    </div>
  </aside>;
}

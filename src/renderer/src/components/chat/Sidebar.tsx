import { Download, MessageSquare, Pencil, PanelLeftClose, PanelLeftOpen, Plus, Settings, Trash2 } from 'lucide-react';
import type { Conversation } from '../../../../shared/types';

interface Props { conversations: Conversation[]; selectedId: string | null; displayName: string; busy: boolean; collapsed: boolean; onToggle: () => void; onNew: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void; onRename: (id: string) => void; onSave: (id: string) => void; onSettings: () => void }
export function Sidebar({ conversations, selectedId, displayName, busy, collapsed, onToggle, onNew, onSelect, onDelete, onRename, onSave, onSettings }: Props) {
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-brand">
      <button className="icon-button sidebar-toggle" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
    </div>

    <button className="new-chat" onClick={onNew} disabled={busy} title="New session" aria-label="New session">
      <Plus size={17} className="new-icon" />
      {!collapsed && <><span>New session</span><span className="new-arrow">↗</span></>}
    </button>

    {!collapsed && <div className="history-heading">SAVED CONVERSATIONS<span>{conversations.length || ''}</span></div>}

    <nav className="history" aria-label="Conversation history">
      {!conversations.length && !collapsed && <p className="history-empty">A clean slate.<br />Your conversations will live here.</p>}
      {conversations.map((conversation) => (
        <div key={conversation.id} className={`history-item ${selectedId === conversation.id ? 'selected' : ''}`}>
          <button className="history-open" disabled={busy} title={conversation.title} aria-current={selectedId === conversation.id ? 'page' : undefined} onClick={() => onSelect(conversation.id)}>
            <MessageSquare size={14} />
            {!collapsed && <span>{conversation.title}</span>}
          </button>
          {!collapsed && <div className="history-actions">
            <button className="icon-button" disabled={busy} onClick={() => onRename(conversation.id)} title="Rename conversation" aria-label={`Rename ${conversation.title}`}><Pencil size={14} /></button>
            <button className="icon-button" disabled={busy} onClick={() => onSave(conversation.id)} title="Save a copy" aria-label={`Save a copy of ${conversation.title}`}><Download size={14} /></button>
            <button className="history-delete icon-button" disabled={busy} onClick={() => onDelete(conversation.id)} title="Delete conversation" aria-label={`Delete ${conversation.title}`}><Trash2 size={15} /></button></div>}
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

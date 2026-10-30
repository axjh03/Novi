import { Download, MessageSquare, Pencil, PanelLeftClose, PanelLeftOpen, Plus, Settings, Trash2 } from 'lucide-react';
import type { Conversation } from '../../../../shared/types';

interface Props { conversations: Conversation[]; selectedId: string | null; displayName: string; busy: boolean; collapsed: boolean; popover?: boolean; onToggle: () => void; onNew: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void; onRename: (id: string) => void; onSave: (id: string) => void; onSettings: () => void }
export function Sidebar({ conversations, selectedId, displayName, busy, collapsed, popover = false, onToggle, onNew, onSelect, onDelete, onRename, onSave, onSettings }: Props) {
  return <>
    {!popover && <button type="button" className={`icon-button sidebar-toggle ${collapsed ? 'sidebar-reopen' : ''}`} onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
      {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
    </button>}
    {!collapsed && <aside className={`sidebar ${popover ? 'popover-sidebar' : ''}`}>
    <div className="sidebar-brand">
      <div className="sidebar-heading"><strong>Novi</strong><span>Your conversations</span></div>
    </div>

    <button className="new-chat" onClick={event => { onNew(); event.currentTarget.closest('details')?.removeAttribute('open'); }} disabled={busy} title="New session" aria-label="New session">
      <Plus size={17} className="new-icon" />
      <span>New session</span><span className="new-arrow">↗</span>
    </button>

    <div className="history-heading">SAVED CONVERSATIONS<span>{conversations.length || ''}</span></div>

    <nav className="history" aria-label="Conversation history">
      {!conversations.length && <p className="history-empty">A clean slate.<br />Your conversations will live here.</p>}
      {conversations.map((conversation) => (
        <div key={conversation.id} className={`history-item ${selectedId === conversation.id ? 'selected' : ''}`}>
          <button className="history-open" disabled={busy} title={conversation.title} aria-label={conversation.title} aria-current={selectedId === conversation.id ? 'page' : undefined} onClick={event => { onSelect(conversation.id); event.currentTarget.closest('details')?.removeAttribute('open'); }}>
            <MessageSquare size={14} />
            <span>{conversation.title}</span>
          </button>
          <div className="history-actions">
            <button className="icon-button" disabled={busy} onClick={() => onRename(conversation.id)} title="Rename conversation" aria-label={`Rename ${conversation.title}`}><Pencil size={14} /></button>
            <button className="icon-button" disabled={busy} onClick={() => onSave(conversation.id)} title="Save a copy" aria-label={`Save a copy of ${conversation.title}`}><Download size={14} /></button>
            <button className="history-delete icon-button" disabled={busy} onClick={() => onDelete(conversation.id)} title="Delete conversation" aria-label={`Delete ${conversation.title}`}><Trash2 size={15} /></button></div>
        </div>
      ))}
    </nav>

    <div className="sidebar-bottom">
      <button className="settings-link" onClick={event => { onSettings(); event.currentTarget.closest('details')?.removeAttribute('open'); }} title="Settings" aria-label="Settings">
        <Settings size={17} />
        <span>Settings</span>
      </button>
      <div className="profile" title={displayName}>
        <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
        <div><strong>{displayName}</strong><small><span className="status-dot" />Your personal space</small></div>
      </div>
    </div>
  </aside>}
  </>;
}

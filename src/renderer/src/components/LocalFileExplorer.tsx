import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, File, Folder, FolderOpen, Link2, Loader2, Search, X } from 'lucide-react';
import type { BrowseEntry, BrowseResult } from '../../../shared/localCoding';
import { errorText, unwrap } from '../services/api';

// Novi's own explorer. Browsing never grants the engine anything; only the selection the user confirms is used.

type Mode = 'folder' | 'files';

export function LocalFileExplorer({ mode, initialPath, onCancel, onUseFolder, onAddPaths }: {
  mode: Mode; initialPath?: string;
  onCancel: () => void; onUseFolder?: (path: string) => void; onAddPaths?: (paths: string[]) => void;
}) {
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [pathInput, setPathInput] = useState(initialPath || '');
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, BrowseEntry[] | 'loading' | string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const list = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDivElement>(null);
  const attempt = useRef(0);

  async function open(path?: string) {
    const current = ++attempt.current;
    setLoading(true); setError('');
    try {
      const next = await unwrap(window.novi.browseLocalDirectory(path));
      if (current !== attempt.current) return;
      setResult(next); setPathInput(next.path); setExpanded({}); setFilter(''); setActive(null);
    } catch (cause) { if (current === attempt.current) setError(errorText(cause)); }
    finally { if (current === attempt.current) setLoading(false); }
  }
  useEffect(() => { void open(initialPath || undefined); dialog.current?.focus(); }, []);

  async function toggle(entry: BrowseEntry) {
    if (expanded[entry.path] && expanded[entry.path] !== 'loading') { setExpanded(({ [entry.path]: _removed, ...rest }) => rest); return; }
    setExpanded((current) => ({ ...current, [entry.path]: 'loading' }));
    try {
      const next = await unwrap(window.novi.browseLocalDirectory(entry.path));
      setExpanded((current) => ({ ...current, [entry.path]: next.entries }));
    } catch (cause) { setExpanded((current) => ({ ...current, [entry.path]: errorText(cause) })); }
  }

  function pick(entry: BrowseEntry) {
    if (entry.unavailable) return;
    if (mode === 'folder') { if (entry.kind === 'directory') setActive(entry.path); return; }
    setSelected((current) => current.includes(entry.path) ? current.filter((item) => item !== entry.path) : current.length >= 8 ? current : [...current, entry.path]);
  }

  // Arrow keys move between rows; Right expands, Left collapses, Enter opens a folder, Space selects.
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const rows = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button[data-row]') ?? []);
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); rows[event.key === 'Home' ? 0 : rows.length - 1]?.focus(); }
  }

  const visible = (entries: BrowseEntry[]) => filter ? entries.filter((entry) => entry.name.toLowerCase().includes(filter.toLowerCase())) : entries;
  const row = (entry: BrowseEntry, depth: number): ReactElement => {
    const children = expanded[entry.path];
    const isSelected = mode === 'folder' ? active === entry.path : selected.includes(entry.path);
    const Icon = entry.kind === 'link' ? Link2 : entry.kind === 'directory' ? (children && children !== 'loading' && typeof children !== 'string' ? FolderOpen : Folder) : File;
    const label = `${entry.kind === 'directory' ? 'Folder' : entry.kind === 'file' ? 'File' : entry.kind === 'link' ? 'Link' : 'Special file'} ${entry.name}${entry.unavailable ? `, unavailable: ${entry.unavailable}` : ''}`;
    const selectable = !entry.unavailable && (mode === 'files' || entry.kind === 'directory');
    return <li key={entry.path}>
      <div className={`explorer-row ${isSelected ? 'selected' : ''} ${entry.unavailable ? 'unavailable' : ''}`} style={{ paddingLeft: 8 + depth * 18 }}>
        {entry.kind === 'directory'
          ? <button type="button" className="explorer-twisty" tabIndex={-1} aria-label={`${children ? 'Collapse' : 'Expand'} ${entry.name}`} onClick={() => void toggle(entry)}>{children ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          : <span className="explorer-twisty" />}
        <button type="button" data-row aria-label={label} aria-pressed={selectable ? isSelected : undefined} title={entry.unavailable || entry.path}
          onClick={() => pick(entry)}
          onDoubleClick={() => { if (entry.kind === 'directory') void open(entry.path); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && entry.kind === 'directory') { event.preventDefault(); void open(entry.path); }
            else if (event.key === ' ') { event.preventDefault(); pick(entry); }
            else if (event.key === 'ArrowRight' && entry.kind === 'directory' && !children) { event.preventDefault(); void toggle(entry); }
            else if (event.key === 'ArrowLeft' && children) { event.preventDefault(); void toggle(entry); }
          }}>
          {mode === 'files' && selectable && <input type="checkbox" tabIndex={-1} readOnly checked={isSelected} aria-hidden="true" />}
          <Icon size={15} aria-hidden="true" /><span className="explorer-name">{entry.name}</span>
          {entry.kind === 'file' && entry.size !== undefined && <small>{entry.size < 1024 ? `${entry.size} B` : entry.size < 1024 * 1024 ? `${Math.round(entry.size / 1024)} KB` : `${(entry.size / 1024 / 1024).toFixed(1)} MB`}</small>}
          {entry.unavailable && <small className="explorer-reason">{entry.unavailable}</small>}
        </button>
      </div>
      {children === 'loading' && <p className="explorer-state" style={{ paddingLeft: 34 + depth * 18 }}><Loader2 size={13} className="spin" />Loading…</p>}
      {typeof children === 'string' && children !== 'loading' && <p className="explorer-state error-text" style={{ paddingLeft: 34 + depth * 18 }}>{children}</p>}
      {Array.isArray(children) && (children.length ? <ul>{visible(children).map((child) => row(child, depth + 1))}</ul> : <p className="explorer-state" style={{ paddingLeft: 34 + depth * 18 }}>Empty folder</p>)}
    </li>;
  };

  const target = mode === 'folder' ? active || result?.path || '' : '';
  return <div className="explorer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="explorer-dialog" role="dialog" aria-modal="true" aria-label={mode === 'folder' ? 'Choose a working folder' : 'Add files or folders'} tabIndex={-1} ref={dialog}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}>
      <header className="explorer-header">
        <strong>{mode === 'folder' ? 'Choose a working folder' : 'Add files or folders'}</strong>
        <button type="button" className="icon-button" aria-label="Close explorer" onClick={onCancel}><X size={15} /></button>
      </header>
      <form className="explorer-path" onSubmit={(event) => { event.preventDefault(); void open(pathInput); }}>
        <button type="button" className="icon-button" aria-label="Up one folder" disabled={!result?.parent || loading} onClick={() => result?.parent && void open(result.parent)}><ArrowUp size={15} /></button>
        <input aria-label="Folder path" value={pathInput} spellCheck={false} onChange={(event) => setPathInput(event.target.value)} placeholder="Type a folder path" />
        <button type="submit" className="secondary" disabled={loading || !pathInput.trim()}>Open</button>
      </form>
      {result && <nav className="explorer-crumbs" aria-label="Breadcrumbs">{result.breadcrumbs.map((crumb, index) => <span key={crumb.path}>{index > 0 && <ChevronRight size={12} aria-hidden="true" />}<button type="button" className="text-button" onClick={() => void open(crumb.path)}>{crumb.name || crumb.path}</button></span>)}</nav>}
      <div className="explorer-body">
        <nav className="explorer-places" aria-label="Places">
          {result?.locations.map((location) => <button type="button" key={location.path} className={result.path === location.path ? 'active' : ''} onClick={() => void open(location.path)} title={location.path}>{location.name}</button>)}
        </nav>
        <div className="explorer-main">
          <label className="explorer-filter"><Search size={13} aria-hidden="true" /><input aria-label="Filter this folder" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter this folder" /></label>
          <div className="explorer-list" ref={list} onKeyDown={onKey}>
            {loading && <p className="explorer-state" role="status"><Loader2 size={14} className="spin" />Loading…</p>}
            {!loading && error && <p className="explorer-state error-text" role="alert">{error}</p>}
            {!loading && !error && result && (result.entries.length
              ? <ul aria-label={`Contents of ${result.path}`}>{visible(result.entries).map((entry) => row(entry, 0))}</ul>
              : <p className="explorer-state">This folder is empty.</p>)}
            {!loading && result?.truncated && <p className="explorer-state">Showing the first 5,000 items. Type a more specific path to see others.</p>}
          </div>
        </div>
      </div>
      <footer className="explorer-footer">
        <p className="explorer-selection" title={mode === 'folder' ? target : selected.join('\n')}>
          {mode === 'folder' ? <>Selected: <strong>{target || 'none'}</strong></> : selected.length ? <>Selected ({selected.length}): <strong>{selected.map((item) => item.split(/[\\/]/).pop()).join(', ')}</strong></> : 'Select files or folders to add.'}
        </p>
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
        {mode === 'folder'
          ? <button type="button" className="primary" disabled={!target || loading} onClick={() => onUseFolder?.(target)}>Use this folder</button>
          : <button type="button" className="primary" disabled={!selected.length} onClick={() => onAddPaths?.(selected)}>Add selected</button>}
      </footer>
      <small className="explorer-note">Browsing does not share anything. Only the folder and files you confirm are captured, and the coding engine reads them read-only.</small>
    </div>
  </div>;
}

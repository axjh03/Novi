import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Columns2, Copy, File, FileMinus2, FilePen, FilePlus2, Folder, FolderOpen, MessageSquare, PencilLine, Rows3, X } from 'lucide-react';
import type { DiffLine, FileReview, ReviewTree, ReviewTreeFile, TreeOperation } from '../../../shared/localCoding';
import type { ReviewTarget } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import { languageForPath, tokenizeCode } from './CodingModeHUD';

// Read-only review window: a file tree of the whole project on the left (edited files green, new files blue,
// deleted files red and struck through), the selected file on the right as a GitHub-style diff.
// There is no Apply. Nothing here touches the project.

const CONTEXT = 3;
type Segment = { kind: 'lines'; lines: DiffLine[]; hunk: number } | { kind: 'gap'; lines: DiffLine[]; id: number };
const OPS: Record<TreeOperation, { label: string; Icon: typeof FilePen; note: string }> = {
  edit: { label: 'EDITED', Icon: FilePen, note: 'Proposed edit. The file on disk is unchanged.' },
  create: { label: 'NEW', Icon: FilePlus2, note: 'Proposed new file. It is not created on disk.' },
  delete: { label: 'DELETED', Icon: FileMinus2, note: 'Proposed deletion. The file is not deleted on disk.' },
  unchanged: { label: 'UNCHANGED', Icon: File, note: 'This file is not part of the proposal.' },
};

/** Splits a diff into hunks with three lines of context; longer unchanged runs collapse into expandable gaps. */
export function segments(lines: DiffLine[]): Segment[] {
  const near = new Array(lines.length).fill(false);
  lines.forEach((line, index) => { if (line.type !== 'context') for (let k = Math.max(0, index - CONTEXT); k <= Math.min(lines.length - 1, index + CONTEXT); k++) near[k] = true; });
  const out: Segment[] = [];
  let hunk = 0, gap = 0;
  for (let index = 0; index < lines.length;) {
    const keep = near[index];
    let end = index;
    while (end < lines.length && near[end] === keep) end++;
    const run = lines.slice(index, end);
    out.push(keep ? { kind: 'lines', lines: run, hunk: hunk++ } : { kind: 'gap', lines: run, id: gap++ });
    index = end;
  }
  return out;
}

export function unifiedDiff(review: FileReview): string {
  const path = `${review.rootName}/${review.relativePath}`;
  const header = `--- ${review.operation === 'create' ? '/dev/null' : `a/${path}`}\n+++ ${review.operation === 'delete' ? '/dev/null' : `b/${path}`}\n`;
  return header + segments(review.lines).filter((segment) => segment.kind === 'lines').map((segment) => {
    const oldLines = segment.lines.filter((line) => line.type !== 'add'), newLines = segment.lines.filter((line) => line.type !== 'remove');
    const oldStart = oldLines[0]?.oldNumber ?? 0, newStart = newLines[0]?.newNumber ?? 0;
    return `@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@\n${segment.lines.map((line) => `${line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}${line.text}`).join('\n')}`;
  }).join('\n') + '\n';
}

// ── File tree ──────────────────────────────────────────────────────────────

export interface TreeNode { name: string; path: string; folders: TreeNode[]; files: ReviewTreeFile[]; changed: number }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
const fileName = (file: ReviewTreeFile) => file.path.slice(file.path.lastIndexOf('/') + 1);

/** Nests the flat file list the way an editor's explorer shows it: folders first, then files, both alphabetical. */
export function buildTree(files: ReviewTreeFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', folders: [], files: [], changed: 0 };
  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    const changed = file.operation !== 'unchanged';
    if (changed) root.changed++;
    for (const part of parts.slice(0, -1)) {
      let next = node.folders.find((folder) => folder.name === part);
      if (!next) { next = { name: part, path: node.path ? `${node.path}/${part}` : part, folders: [], files: [], changed: 0 }; node.folders.push(next); }
      if (changed) next.changed++;
      node = next;
    }
    node.files.push(file);
  }
  const sort = (node: TreeNode) => { node.folders.sort(byName); node.folders.forEach(sort); node.files.sort((a, b) => byName({ name: fileName(a) }, { name: fileName(b) })); };
  sort(root);
  return root;
}

type Row = { kind: 'folder'; node: TreeNode; depth: number } | { kind: 'file'; file: ReviewTreeFile; depth: number };

/** The visible rows: collapsed folders hide their contents; "changed only" hides untouched files and folders. */
export function treeRows(root: TreeNode, collapsed: ReadonlySet<string>, changedOnly: boolean): Row[] {
  const rows: Row[] = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const folder of node.folders) {
      if (changedOnly && !folder.changed) continue;
      rows.push({ kind: 'folder', node: folder, depth });
      if (!collapsed.has(folder.path)) walk(folder, depth + 1);
    }
    for (const file of node.files) if (!changedOnly || file.operation !== 'unchanged') rows.push({ kind: 'file', file, depth });
  };
  walk(root, 0);
  return rows;
}

function Code({ text, language }: { text: string; language: string }) {
  return <>{tokenizeCode(text, language).map((token, index) => token.kind === 'plain' ? token.text : <span className={`syntax-${token.kind}`} key={index}>{token.text}</span>)}</>;
}

export function RepositoryReview({ target, onClose }: { target: ReviewTarget; onClose: () => void }) {
  const [tree, setTree] = useState<ReviewTree | null>(null);
  const [fileId, setFileId] = useState<string | null>(target.fileId);
  const [review, setReview] = useState<FileReview | null>(null);
  const [error, setError] = useState(''), [treeError, setTreeError] = useState('');
  const [expanded, setExpanded] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [changedOnly, setChangedOnly] = useState(false);
  const [split, setSplit] = useState(() => window.innerWidth >= 1100);
  const [copied, setCopied] = useState('');
  const auto = useRef(true);
  useEffect(() => { setFileId(target.fileId); }, [target]);
  useEffect(() => {
    const onResize = () => { if (auto.current) setSplit(window.innerWidth >= 1100); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // A new proposal replaces the tree; the selection follows the target.
  useEffect(() => {
    let alive = true;
    setTreeError('');
    void unwrap(window.novi.getReviewTree()).then((next) => { if (alive) setTree(next); }).catch((cause) => { if (alive) setTreeError(errorText(cause)); });
    return () => { alive = false; };
  }, [target.projectId, target.fromVersionId, target.toVersionId]);
  useEffect(() => {
    let alive = true;
    setReview(null); setError(''); setExpanded([]);
    if (!fileId) return;
    void unwrap(window.novi.getReviewDiff({ projectId: target.projectId, fromVersionId: target.fromVersionId, toVersionId: target.toVersionId, fileId }))
      .then((next) => { if (alive) setReview(next); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, [fileId, target]);

  const root = useMemo(() => buildTree(tree?.files ?? []), [tree]);
  const rows = useMemo(() => treeRows(root, collapsed, changedOnly), [root, collapsed, changedOnly]);
  const parts = useMemo(() => review ? review.operation === 'unchanged' ? [{ kind: 'lines' as const, lines: review.lines, hunk: 0 }] : segments(review.lines) : [], [review]);
  const language = review ? languageForPath(review.relativePath) : 'code';
  async function copy(label: string, text: string) {
    try { await unwrap(window.novi.copyText(text)); setCopied(label); setTimeout(() => setCopied((current) => current === label ? '' : current), 1800); }
    catch (cause) { setError(errorText(cause)); }
  }
  const toggleFolder = (path: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  const path = review ? `${review.rootName}/${review.relativePath}` : '';
  const op = review ? OPS[review.operation] : null;

  const row = (line: DiffLine, key: string) => <div key={key} className={`diff-line ${line.type}`}>
    <span className="diff-num" aria-label={line.oldNumber ? `original line ${line.oldNumber}` : undefined}>{line.oldNumber ?? ''}</span>
    <span className="diff-num" aria-label={line.newNumber ? `proposed line ${line.newNumber}` : undefined}>{line.newNumber ?? ''}</span>
    <span className="diff-sign" aria-label={line.type === 'add' ? 'added' : line.type === 'remove' ? 'removed' : undefined}>{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</span>
    <code><Code text={line.text} language={language} /></code>
  </div>;

  // Side by side: within each change block, removed lines face added lines.
  const splitRows = (lines: DiffLine[], key: string) => {
    const out: Array<[DiffLine | null, DiffLine | null]> = [];
    for (let index = 0; index < lines.length;) {
      if (lines[index].type === 'context') { out.push([lines[index], lines[index]]); index++; continue; }
      const removed: DiffLine[] = [], added: DiffLine[] = [];
      while (index < lines.length && lines[index].type !== 'context') { (lines[index].type === 'remove' ? removed : added).push(lines[index]); index++; }
      for (let k = 0; k < Math.max(removed.length, added.length); k++) out.push([removed[k] ?? null, added[k] ?? null]);
    }
    return out.map(([left, right], index) => <div className="diff-split-row" key={`${key}-${index}`}>
      <div className={`diff-cell ${left?.type === 'remove' ? 'remove' : left ? 'context' : 'empty'}`}><span className="diff-num">{left?.oldNumber ?? ''}</span><span className="diff-sign">{left?.type === 'remove' ? '−' : ' '}</span><code>{left && <Code text={left.text} language={language} />}</code></div>
      <div className={`diff-cell ${right?.type === 'add' ? 'add' : right ? 'context' : 'empty'}`}><span className="diff-num">{right?.newNumber ?? ''}</span><span className="diff-sign">{right?.type === 'add' ? '+' : ' '}</span><code>{right && <Code text={right.text} language={language} />}</code></div>
    </div>);
  };

  const changed = tree?.changed ?? 0;
  return <section className="code-viewer review-viewer" aria-label="Proposal review">
    <header className="code-viewer-header">
      <strong>Proposed changes</strong>
      <span className="review-summary">{tree ? `${changed} file${changed === 1 ? '' : 's'} changed · compared with your local files` : 'Loading…'}</span>
      <button className="code-viewer-close" type="button" aria-label="Close review" onClick={onClose}><X size={15} /></button>
    </header>
    <div className="review-layout">
      <nav className="review-tree" aria-label="Project files">
        <div className="review-tree-head">
          <span>{tree ? `${tree.files.length.toLocaleString()} files` : ''}</span>
          <label className="review-filter"><input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />Changed only</label>
        </div>
        {treeError && <p className="error" role="alert">{treeError}</p>}
        {tree && !rows.length && <p className="review-empty">{changedOnly ? 'No changed files.' : 'No files.'}</p>}
        <ul role="tree" aria-label="Files">
          {rows.map((item) => item.kind === 'folder'
            ? <li key={`d:${item.node.path}`} role="treeitem" aria-expanded={!collapsed.has(item.node.path)}>
              <button type="button" className="tree-row folder" style={{ '--depth': item.depth } as React.CSSProperties} onClick={() => toggleFolder(item.node.path)} title={item.node.path}>
                {collapsed.has(item.node.path) ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                {collapsed.has(item.node.path) ? <Folder size={13} aria-hidden="true" /> : <FolderOpen size={13} aria-hidden="true" />}
                <span className="tree-name">{item.node.name}</span>
                {item.node.changed > 0 && <span className="tree-dot" aria-label={`${item.node.changed} changed inside`} />}
              </button>
            </li>
            : <li key={`f:${item.file.fileId}`} role="treeitem" aria-selected={item.file.fileId === fileId}>
              <button type="button" className={`tree-row ${item.file.operation}`} style={{ '--depth': item.depth } as React.CSSProperties} aria-current={item.file.fileId === fileId ? 'true' : undefined} onClick={() => setFileId(item.file.fileId)} title={`${item.file.path} · ${OPS[item.file.operation].label.toLowerCase()}`}>
                <span className="tree-indent" aria-hidden="true" />
                <OPS.unchanged.Icon size={13} aria-hidden="true" />
                <span className="tree-name">{fileName(item.file)}</span>
              </button>
            </li>)}
        </ul>
      </nav>
      <div className="review-pane">
        {!fileId && <p className="review-empty">Select a file to view it.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {review && op && <>
          <div className="review-file-head">
            <span className={`lc-op ${review.operation}`}><op.Icon size={13} aria-hidden="true" />{op.label}</span>
            <strong title={path}>{review.relativePath}</strong>
            <span className="lc-counts">{review.additions > 0 && <span className="lc-add">+{review.additions}</span>}{review.deletions > 0 && <span className="lc-del">−{review.deletions}</span>}</span>
            <button type="button" className="icon-button" aria-label={split ? 'Unified view' : 'Side-by-side view'} title={split ? 'Unified view' : 'Side-by-side view'} onClick={() => { auto.current = false; setSplit((value) => !value); }}>{split ? <Rows3 size={14} /> : <Columns2 size={14} />}</button>
          </div>
          <div className="review-actions">
            <span>{op.note}</span>
            {review.proposedText !== null && <button type="button" className="text-button" onClick={() => void copy('file', review.proposedText!)}>{copied === 'file' ? <Check size={13} /> : <Copy size={13} />}{review.operation === 'create' ? 'Copy new file' : review.operation === 'unchanged' ? 'Copy file' : 'Copy proposed file'}</button>}
            {review.operation !== 'unchanged' && <button type="button" className="text-button" onClick={() => void copy('diff', unifiedDiff(review))}>{copied === 'diff' ? <Check size={13} /> : <Copy size={13} />}Copy diff</button>}
            <button type="button" className="text-button" onClick={() => void window.novi.sendReviewAction({ kind: 'ask', text: `About ${path}: ` })}><MessageSquare size={13} />Ask about this file</button>
            {review.operation !== 'unchanged' && <button type="button" className="text-button" onClick={() => void window.novi.sendReviewAction({ kind: 'revise', text: `Revise the proposed change to ${path}: ` })}><PencilLine size={13} />Request a revision</button>}
          </div>
          <div className="code-viewer-scroll review-scroll" tabIndex={0} role="region" aria-label={`${op.label.toLowerCase()} ${path}`}>
            {!review.lines.length && <p className="review-empty">This file is empty.</p>}
            {parts.map((segment) => segment.kind === 'gap' && !expanded.includes(segment.id)
              ? <button type="button" key={`gap-${segment.id}`} className="diff-gap" onClick={() => setExpanded((current) => [...current, segment.id])}>Show {segment.lines.length} unchanged line{segment.lines.length === 1 ? '' : 's'}</button>
              : <div key={segment.kind === 'gap' ? `gap-${segment.id}` : `hunk-${segment.hunk}`} className={`diff-hunk ${split ? 'split' : 'unified'}`}>
                {segment.kind === 'lines' && segment.lines.some((line) => line.type === 'add') && <button type="button" className="text-button diff-copy" onClick={() => void copy(`hunk-${segment.hunk}`, segment.lines.filter((line) => line.type !== 'remove').map((line) => line.text).join('\n'))}>{copied === `hunk-${segment.hunk}` ? <Check size={12} /> : <Copy size={12} />}Copy replacement</button>}
                {split && review.operation === 'edit' ? splitRows(segment.lines, `s-${segment.kind}-${segment.kind === 'gap' ? segment.id : segment.hunk}`) : segment.lines.map((line, index) => row(line, `${segment.kind}-${index}`))}
              </div>)}
          </div>
        </>}
      </div>
    </div>
  </section>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Columns2, Copy, FileMinus2, FilePen, FilePlus2, MessageSquare, PencilLine, Rows3, X } from 'lucide-react';
import type { ChangeOperation, DiffLine, FileReview } from '../../../shared/localCoding';
import type { ReviewTarget } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';
import { languageForPath, tokenizeCode } from './CodingModeHUD';

// Read-only review: there is no Apply. NEW and DELETE describe proposals; nothing here touches the project.

const CONTEXT = 3;
type Segment = { kind: 'lines'; lines: DiffLine[]; hunk: number } | { kind: 'gap'; lines: DiffLine[]; id: number };
const OPS: Record<ChangeOperation | 'unchanged', { label: string; Icon: typeof FilePen }> = {
  edit: { label: 'EDIT', Icon: FilePen }, create: { label: 'NEW', Icon: FilePlus2 }, delete: { label: 'DELETE', Icon: FileMinus2 }, unchanged: { label: 'SAME', Icon: FilePen },
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

function Code({ text, language }: { text: string; language: string }) {
  return <>{tokenizeCode(text, language).map((token, index) => token.kind === 'plain' ? token.text : <span className={`syntax-${token.kind}`} key={index}>{token.text}</span>)}</>;
}

export function RepositoryReview({ target, onClose }: { target: ReviewTarget; onClose: () => void }) {
  const [compare, setCompare] = useState<string | null>(target.fromVersionId);
  const [fileId, setFileId] = useState(target.fileId);
  const [files, setFiles] = useState<Array<{ fileId: string; operation: ChangeOperation; rootName: string; relativePath: string }>>([]);
  const [review, setReview] = useState<FileReview | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number[]>([]);
  const [split, setSplit] = useState(() => window.innerWidth >= 900);
  const [copied, setCopied] = useState('');
  const auto = useRef(true);
  useEffect(() => { setCompare(target.fromVersionId); setFileId(target.fileId); }, [target]);
  useEffect(() => {
    const onResize = () => { if (auto.current) setSplit(window.innerWidth >= 900); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    let alive = true;
    void unwrap(window.novi.getReviewChanges(compare ?? target.toVersionId)).then((list) => { if (alive) setFiles(list); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, [compare, target]);
  useEffect(() => {
    let alive = true;
    setReview(null); setError(''); setExpanded([]);
    void unwrap(window.novi.getReviewDiff({ projectId: target.projectId, fromVersionId: compare, toVersionId: target.toVersionId, fileId }))
      .then((next) => { if (alive) setReview(next); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, [compare, fileId, target]);

  const parts = useMemo(() => review ? segments(review.lines) : [], [review]);
  const language = review ? languageForPath(review.relativePath) : 'code';
  async function copy(label: string, text: string) {
    try { await unwrap(window.novi.copyText(text)); setCopied(label); setTimeout(() => setCopied((current) => current === label ? '' : current), 1800); }
    catch (cause) { setError(errorText(cause)); }
  }
  const path = review ? `${review.rootName}/${review.relativePath}` : '';
  const toLabel = target.labels[target.toVersionId] ?? 'proposal';
  const fromLabel = compare ? target.labels[compare] ?? 'earlier version' : null;
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

  return <section className="code-viewer review-viewer" aria-label="Proposal review">
    <header className="code-viewer-header">
      {op && <span className={`lc-op ${review!.operation}`}><op.Icon size={13} aria-hidden="true" />{op.label}</span>}
      <strong title={path}>{review ? review.relativePath : 'Loading…'}</strong>
      <span className="review-compare-label">{fromLabel ? `${toLabel} compared with ${fromLabel}` : toLabel}</span>
      <button className="code-viewer-close" type="button" aria-label="Close review" onClick={onClose}><X size={15} /></button>
    </header>
    <div className="review-toolbar">
      <div role="group" aria-label="Compare against">
        {target.parentVersionId && <button type="button" className="text-button" aria-pressed={compare === target.parentVersionId} onClick={() => setCompare(target.parentVersionId)}>Against parent{target.labels[target.parentVersionId] ? ` (${target.labels[target.parentVersionId]})` : ''}</button>}
        {target.localSnapshotId && target.localSnapshotId !== target.parentVersionId && <button type="button" className="text-button" aria-pressed={compare === target.localSnapshotId} onClick={() => setCompare(target.localSnapshotId)}>Against local snapshot ({target.labels[target.localSnapshotId]})</button>}
      </div>
      <button type="button" className="icon-button" aria-label={split ? 'Unified view' : 'Side-by-side view'} title={split ? 'Unified view' : 'Side-by-side view'} onClick={() => { auto.current = false; setSplit((value) => !value); }}>{split ? <Rows3 size={14} /> : <Columns2 size={14} />}</button>
    </div>
    {files.length > 1 && <nav className="review-files" aria-label="Files in this proposal">{files.map((file) => { const meta = OPS[file.operation]; return <button type="button" key={file.fileId} aria-current={file.fileId === fileId ? 'true' : undefined} className={`review-file ${file.operation}`} onClick={() => setFileId(file.fileId)} title={`${file.rootName}/${file.relativePath}`}><span className={`lc-op ${file.operation}`}>{meta.label}</span>{file.relativePath}</button>; })}</nav>}
    {error && <p className="error" role="alert">{error}</p>}
    {review && <>
      <div className="review-actions">
        <span>{review.additions > 0 && <span className="lc-add">+{review.additions}</span>} {review.deletions > 0 && <span className="lc-del">−{review.deletions}</span>} {review.operation === 'delete' ? 'Proposed deletion: the file is not deleted on disk.' : review.operation === 'create' ? 'Proposed new file: it is not created on disk.' : review.operation === 'unchanged' ? 'No differences.' : 'Proposed edit.'}</span>
        {review.proposedText !== null && <button type="button" className="text-button" onClick={() => void copy('file', review.proposedText!)}>{copied === 'file' ? <Check size={13} /> : <Copy size={13} />}{review.operation === 'create' ? 'Copy new file' : 'Copy proposed file'}</button>}
        <button type="button" className="text-button" onClick={() => void copy('diff', unifiedDiff(review))}>{copied === 'diff' ? <Check size={13} /> : <Copy size={13} />}Copy diff</button>
        <button type="button" className="text-button" onClick={() => void window.novi.sendReviewAction({ kind: 'ask', text: `About ${path} in ${toLabel}: ` })}><MessageSquare size={13} />Ask about this file</button>
        <button type="button" className="text-button" onClick={() => void window.novi.sendReviewAction({ kind: 'revise', text: `Revise ${path} (${toLabel}): ` })}><PencilLine size={13} />Request a revision</button>
      </div>
      <div className="code-viewer-scroll review-scroll" tabIndex={0} role="region" aria-label={`Diff of ${path}`}>
        {!review.lines.length && <p className="review-empty">This file is empty.</p>}
        {parts.map((segment) => segment.kind === 'gap' && !expanded.includes(segment.id)
          ? <button type="button" key={`gap-${segment.id}`} className="diff-gap" onClick={() => setExpanded((current) => [...current, segment.id])}>Show {segment.lines.length} unchanged line{segment.lines.length === 1 ? '' : 's'}</button>
          : <div key={segment.kind === 'gap' ? `gap-${segment.id}` : `hunk-${segment.hunk}`} className={`diff-hunk ${split ? 'split' : 'unified'}`}>
            {segment.kind === 'lines' && segment.lines.some((line) => line.type === 'add') && <button type="button" className="text-button diff-copy" onClick={() => void copy(`hunk-${segment.hunk}`, segment.lines.filter((line) => line.type !== 'remove').map((line) => line.text).join('\n'))}>{copied === `hunk-${segment.hunk}` ? <Check size={12} /> : <Copy size={12} />}Copy replacement</button>}
            {split ? splitRows(segment.lines, `s-${segment.kind}-${segment.kind === 'gap' ? segment.id : segment.hunk}`) : segment.lines.map((line, index) => row(line, `${segment.kind}-${index}`))}
          </div>)}
      </div>
    </>}
  </section>;
}

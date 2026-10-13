import { diffArrays } from 'diff';
import { LOCAL_CODING_LIMITS, type ChangeOperation, type ChangeSummary, type DiffLine, type FileEntry, type FileReview, type LineEdit, type ProjectVersion, type ProposalResponse, type ProposedChange } from '../../shared/localCoding';
import { fileId as makeFileId, textMetadata } from './localCodingFiles';
import { entryKey, type LocalCodingStore, type ProjectMeta } from './localCodingVersions';
import { UserError } from './validation';

// Model output is untrusted. Nothing becomes an iteration until every check here passes.

export class ProposalInvalid extends Error {
  constructor(readonly issues: string[]) { super(`The proposal failed validation:\n${issues.map((issue) => `- ${issue}`).join('\n')}`); }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[], where: string, issues: string[]) => {
  for (const key of keys) if (!(key in value)) issues.push(`${where}: missing "${key}".`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push(`${where}: unexpected field "${key}".`);
};
const stringArray = (value: unknown, where: string, issues: string[]) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) { issues.push(`${where} must be an array of strings.`); return false; }
  return true;
};

/** Steps 1–2: bounded parse and schema check. */
export function parseProposal(raw: unknown): ProposalResponse {
  let value = raw;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw) > LOCAL_CODING_LIMITS.maxProposalBytes) throw new ProposalInvalid([`The answer is larger than ${LOCAL_CODING_LIMITS.maxProposalBytes / 1024 / 1024} MiB. Ask for a narrower change.`]);
    try { value = JSON.parse(raw); }
    catch { throw new ProposalInvalid(['The answer is not complete JSON.']); }
  } else if (Buffer.byteLength(JSON.stringify(raw) ?? '') > LOCAL_CODING_LIMITS.maxProposalBytes) {
    throw new ProposalInvalid(['The answer is too large. Ask for a narrower change.']);
  }
  const issues: string[] = [];
  if (!isObject(value)) throw new ProposalInvalid(['The answer must be a JSON object.']);
  exactKeys(value, ['schemaVersion', 'summary', 'approach', 'evidence', 'assumptions', 'questions', 'changes', 'suggestedChecks'], 'answer', issues);
  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1.');
  for (const field of ['summary', 'approach'] as const) if (typeof value[field] !== 'string') issues.push(`${field} must be a string.`);
  for (const field of ['evidence', 'assumptions', 'questions', 'suggestedChecks'] as const) stringArray(value[field], field, issues);
  if (!Array.isArray(value.changes)) issues.push('changes must be an array.');
  else value.changes.forEach((change, index) => {
    const where = `changes[${index}]`;
    if (!isObject(change)) { issues.push(`${where} must be an object.`); return; }
    if (change.operation === 'edit') {
      exactKeys(change, ['operation', 'sourceFileId', 'reason', 'edits'], where, issues);
      if (!Array.isArray(change.edits) || !change.edits.length) issues.push(`${where}.edits must be a non-empty array.`);
      else change.edits.forEach((edit, editIndex) => {
        const at = `${where}.edits[${editIndex}]`;
        if (!isObject(edit)) { issues.push(`${at} must be an object.`); return; }
        exactKeys(edit, ['startLine', 'before', 'after'], at, issues);
        if (!Number.isSafeInteger(edit.startLine) || (edit.startLine as number) < 1) issues.push(`${at}.startLine must be a whole number from 1.`);
        for (const side of ['before', 'after'] as const) {
          if (stringArray(edit[side], `${at}.${side}`, issues) && (edit[side] as string[]).some((line) => /[\r\n]/.test(line))) issues.push(`${at}.${side}: each item is one line and must not contain line breaks.`);
        }
      });
    } else if (change.operation === 'create') {
      exactKeys(change, ['operation', 'destinationRootId', 'relativePath', 'reason', 'content'], where, issues);
      for (const field of ['destinationRootId', 'relativePath', 'content'] as const) if (typeof change[field] !== 'string') issues.push(`${where}.${field} must be a string.`);
    } else if (change.operation === 'delete') {
      exactKeys(change, ['operation', 'sourceFileId', 'reason'], where, issues);
    } else { issues.push(`${where}.operation must be "edit", "create", or "delete".`); return; }
    if (typeof change.reason !== 'string') issues.push(`${where}.reason must be a string.`);
    if ('sourceFileId' in change && typeof change.sourceFileId !== 'string') issues.push(`${where}.sourceFileId must be a string.`);
  });
  if (issues.length) throw new ProposalInvalid(issues);
  return value as unknown as ProposalResponse;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/** Why a model-supplied relative path is unsafe or invalid on any supported platform, or null. */
export function pathProblem(path: string): string | null {
  if (!path || path.length > 500) return 'must be 1–500 characters';
  if (/[\x00-\x1f]/.test(path)) return 'contains control characters';
  if (path.includes('\\')) return 'must use "/" between folders';
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return 'must be relative to its source root';
  for (const segment of path.split('/')) {
    if (!segment) return 'has an empty folder name';
    if (segment === '.' || segment === '..') return 'must not contain "." or ".." segments';
    if (/[<>:"|?*]/.test(segment)) return 'contains a character not allowed in file names on Windows';
    if (WINDOWS_RESERVED.test(segment)) return `uses a reserved Windows name ("${segment}")`;
    if (/[. ]$/.test(segment)) return 'has a name ending in a dot or space';
    if (Buffer.byteLength(segment) > 255) return 'has a name longer than 255 bytes';
  }
  return null;
}

interface Line { text: string; eol: string }
function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  const pattern = /\r\n|\n/g;
  let last = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) { lines.push({ text: text.slice(last, match.index), eol: match[0] }); last = match.index + match[0].length; }
  if (last < text.length) lines.push({ text: text.slice(last), eol: '' });
  return lines;
}

/** Applies edits that all refer to the original text. Line endings and the final newline are preserved. */
export function applyEdits(original: string, edits: LineEdit[], where: string, issues: string[]): string | null {
  const lines = splitLines(original);
  const crlf = lines.filter((line) => line.eol === '\r\n').length, lf = lines.filter((line) => line.eol === '\n').length;
  const newline = crlf > lf ? '\r\n' : '\n';
  const finalNewline = lines.length === 0 ? true : lines[lines.length - 1].eol !== '';
  const before = issues.length;
  const ranges = edits.map((edit, index) => ({ edit, index, start: edit.startLine, end: edit.startLine + edit.before.length }));
  for (const { edit, index, start, end } of ranges) {
    const at = `${where}.edits[${index}]`;
    if (!edit.before.length && !edit.after.length) { issues.push(`${at} changes nothing.`); continue; }
    if (start > lines.length + 1 || end - 1 > lines.length) { issues.push(`${at} refers to lines ${start}–${Math.max(start, end - 1)}, but the file has ${lines.length} lines.`); continue; }
    edit.before.forEach((text, offset) => {
      const actual = lines[start - 1 + offset]?.text;
      if (actual !== text) issues.push(`${at}: line ${start + offset} is ${JSON.stringify(actual)}, not ${JSON.stringify(text)}. Copy "before" exactly from read_file.`);
    });
  }
  // Insertions touching a replaced range, or two insertions at one point, have no unambiguous order.
  for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length; j++) {
    const a = ranges[i], b = ranges[j];
    const aPoint = a.start === a.end, bPoint = b.start === b.end;
    const overlap = aPoint && bPoint ? a.start === b.start
      : aPoint ? a.start >= b.start && a.start <= b.end
      : bPoint ? b.start >= a.start && b.start <= a.end
      : a.start < b.end && b.start < a.end;
    if (overlap) issues.push(`${where}.edits[${a.index}] and edits[${b.index}] overlap or touch at the same point. Combine them into one edit.`);
  }
  if (issues.length > before) return null;
  const result = [...lines];
  for (const { edit, start } of [...ranges].sort((a, b) => b.start - a.start)) {
    result.splice(start - 1, edit.before.length, ...edit.after.map((text) => ({ text, eol: newline })));
  }
  for (let index = 0; index < result.length - 1; index++) if (!result[index].eol) result[index].eol = newline;
  if (result.length) result[result.length - 1].eol = finalNewline ? (result[result.length - 1].eol || newline) : '';
  return result.map((line) => line.text + line.eol).join('');
}

const encode = (text: string, bom: boolean) => Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(text, 'utf8')]);
const plainLines = (text: string | null) => text ? splitLines(text).map((line) => line.text) : [];

/** Line-level diff with numbers on both sides, computed by Novi. */
export function diffText(before: string | null, after: string | null): { lines: DiffLine[]; additions: number; deletions: number } {
  const lines: DiffLine[] = [];
  let oldNumber = 1, newNumber = 1, additions = 0, deletions = 0;
  for (const part of diffArrays(plainLines(before), plainLines(after))) {
    for (const text of part.value) {
      if (part.added) { lines.push({ type: 'add', oldNumber: null, newNumber: newNumber++, text }); additions++; }
      else if (part.removed) { lines.push({ type: 'remove', oldNumber: oldNumber++, newNumber: null, text }); deletions++; }
      else lines.push({ type: 'context', oldNumber: oldNumber++, newNumber: newNumber++, text });
    }
  }
  return { lines, additions, deletions };
}

export interface ValidatedProposal { files: FileEntry[]; changes: ChangeSummary[] }

/** Steps 3–11: resolve, check paths and ranges, build every proposed file in memory, and summarize the diff. */
export function validateProposal(store: LocalCodingStore, meta: ProjectMeta, base: ProjectVersion, response: ProposalResponse): ValidatedProposal {
  const issues: string[] = [];
  const byId = new Map(base.files.map((entry) => [entry.fileId, entry]));
  const rootName = (rootId: string) => base.roots.find((root) => root.id === rootId)?.displayName ?? rootId;
  const touched = new Map<string, number>();
  response.changes.forEach((change, index) => {
    const id = change.operation === 'create' ? `create:${change.destinationRootId}/${change.relativePath}` : change.sourceFileId;
    if (touched.has(id)) issues.push(`changes[${index}] and changes[${touched.get(id)}] both change the same file. Combine them.`);
    else touched.set(id, index);
  });
  const deleted = new Set(response.changes.filter((change): change is Extract<ProposedChange, { operation: 'delete' }> => change.operation === 'delete').map((change) => change.sourceFileId));
  // Paths that will remain after deletions, for collision checks (case-insensitive, files and folders).
  const remaining = base.files.filter((entry) => !deleted.has(entry.fileId)).map((entry) => ({ rootId: entry.rootId, path: entry.relativePath.toLowerCase() }));
  const replaced = new Map<string, FileEntry>(), removed = new Set<string>(), created: FileEntry[] = [], changes: ChangeSummary[] = [];
  const pending: Array<{ entry: FileEntry; bytes: Buffer }> = [];
  response.changes.forEach((change, index) => {
    const where = `changes[${index}]`;
    if (change.operation === 'create') {
      const root = base.roots.find((item) => item.id === change.destinationRootId);
      if (!root) { issues.push(`${where}.destinationRootId "${change.destinationRootId}" is not a source root. Use one of: ${base.roots.filter((item) => item.sourceKind !== 'file').map((item) => item.id).join(', ')}.`); return; }
      if (root.sourceKind === 'file') { issues.push(`${where}: ${root.id} is a single attached file, not a folder; new files cannot be created in it.`); return; }
      const problem = pathProblem(change.relativePath);
      if (problem) { issues.push(`${where}.relativePath "${change.relativePath}" ${problem}.`); return; }
      const lower = change.relativePath.toLowerCase();
      const clash = remaining.find((item) => item.rootId === root.id && (item.path === lower || item.path.startsWith(`${lower}/`) || lower.startsWith(`${item.path}/`)));
      if (clash) { issues.push(`${where}: "${change.relativePath}" collides with existing "${clash.path}" (names are compared without case, and a file cannot share a name with a folder).`); return; }
      if (change.content.includes('\0')) { issues.push(`${where}.content must be text.`); return; }
      const bytes = Buffer.from(change.content, 'utf8');
      if (bytes.length > LOCAL_CODING_LIMITS.maxFileBytes) { issues.push(`${where}.content is larger than ${LOCAL_CODING_LIMITS.maxFileBytes / 1024 / 1024} MiB.`); return; }
      remaining.push({ rootId: root.id, path: lower });
      const entry: FileEntry = { fileId: makeFileId(root.id, change.relativePath), rootId: root.id, relativePath: change.relativePath, contentId: '', bytes: bytes.length, ...textMetadata(bytes) };
      pending.push({ entry, bytes }); created.push(entry);
      const counts = diffText(null, change.content);
      changes.push({ fileId: entry.fileId, operation: 'create', rootId: root.id, rootName: root.displayName, relativePath: change.relativePath, reason: change.reason, additions: counts.additions, deletions: 0 });
      return;
    }
    const entry = byId.get(change.sourceFileId);
    if (!entry) { issues.push(`${where}.sourceFileId "${change.sourceFileId}" is not in ${base.label}. Use a fileId from list_files or search_files.`); return; }
    const original = store.text(meta.ownerId, meta.id, entry);
    if (change.operation === 'delete') {
      removed.add(entry.fileId);
      changes.push({ fileId: entry.fileId, operation: 'delete', rootId: entry.rootId, rootName: rootName(entry.rootId), relativePath: entry.relativePath, reason: change.reason, additions: 0, deletions: diffText(original, null).deletions });
      return;
    }
    const next = applyEdits(original, change.edits, where, issues);
    if (next === null) return;
    if (next === original) { issues.push(`${where} leaves ${entry.relativePath} unchanged.`); return; }
    const bytes = encode(next, entry.bom);
    if (bytes.length > LOCAL_CODING_LIMITS.maxFileBytes) { issues.push(`${where} makes ${entry.relativePath} larger than ${LOCAL_CODING_LIMITS.maxFileBytes / 1024 / 1024} MiB.`); return; }
    const updated: FileEntry = { ...entry, contentId: '', bytes: bytes.length, ...textMetadata(bytes) };
    pending.push({ entry: updated, bytes }); replaced.set(entry.fileId, updated);
    const counts = diffText(original, next);
    changes.push({ fileId: entry.fileId, operation: 'edit', rootId: entry.rootId, rootName: rootName(entry.rootId), relativePath: entry.relativePath, reason: change.reason, additions: counts.additions, deletions: counts.deletions });
  });
  if (issues.length) throw new ProposalInvalid(issues);
  // Only now, with every check passed, store the new contents.
  for (const item of pending) item.entry.contentId = store.putContent(meta.ownerId, meta.id, item.bytes);
  const files = [...base.files.filter((entry) => !removed.has(entry.fileId)).map((entry) => replaced.get(entry.fileId) ?? entry), ...created];
  return { files, changes };
}

/** One file compared between two versions (or created/deleted between them). */
export function reviewFile(store: LocalCodingStore, meta: ProjectMeta, from: ProjectVersion | null, to: ProjectVersion, fileId: string): FileReview {
  const before = from?.files.find((entry) => entry.fileId === fileId) ?? null;
  const after = to.files.find((entry) => entry.fileId === fileId) ?? null;
  const sample = after ?? before;
  if (!sample) throw new UserError('This file is not in either version.');
  const beforeText = before ? store.text(meta.ownerId, meta.id, before) : null;
  const afterText = after ? store.text(meta.ownerId, meta.id, after) : null;
  const operation: FileReview['operation'] = !before ? 'create' : !after ? 'delete' : before.contentId === after.contentId ? 'unchanged' : 'edit';
  const diff = diffText(beforeText, afterText);
  const roots = after ? to.roots : from!.roots;
  return {
    fileId, operation, rootName: roots.find((root) => root.id === sample.rootId)?.displayName ?? sample.rootId, relativePath: sample.relativePath,
    fromVersionId: from?.id ?? null, toVersionId: to.id, fromLabel: from?.label ?? null, toLabel: to.label,
    lines: diff.lines, additions: diff.additions, deletions: diff.deletions, proposedText: afterText,
  };
}

/** Files that differ between two versions, for a review's file list. */
export function changedFiles(from: ProjectVersion, to: ProjectVersion): Array<{ fileId: string; operation: ChangeOperation; rootId: string; relativePath: string }> {
  const before = new Map(from.files.map((entry) => [entryKey(entry), entry]));
  const after = new Map(to.files.map((entry) => [entryKey(entry), entry]));
  const out: Array<{ fileId: string; operation: ChangeOperation; rootId: string; relativePath: string }> = [];
  for (const [path, entry] of after) {
    const old = before.get(path);
    if (!old) out.push({ fileId: entry.fileId, operation: 'create', rootId: entry.rootId, relativePath: entry.relativePath });
    else if (old.contentId !== entry.contentId) out.push({ fileId: entry.fileId, operation: 'edit', rootId: entry.rootId, relativePath: entry.relativePath });
  }
  for (const [path, entry] of before) if (!after.has(path)) out.push({ fileId: entry.fileId, operation: 'delete', rootId: entry.rootId, relativePath: entry.relativePath });
  return out.sort((a, b) => a.rootId.localeCompare(b.rootId) || a.relativePath.localeCompare(b.relativePath));
}

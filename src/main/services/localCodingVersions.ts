import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_CODING_LIMITS, type EngineId, type FileEntry, type ProjectVersion, type Proposal, type RefreshConflict, type SourceRoot, type VersionKind, type VersionSummary } from '../../shared/localCoding';
import { atomicJSON } from './storage';
import { UserError } from './validation';

// Versions are immutable manifests over content-addressed blobs. Nothing here ever touches a source project.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT = /^[0-9a-f]{64}$/;
const OWNER = /^[A-Za-z0-9_-]{1,128}$/;

export interface ProjectMeta {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  conversationId: string | null;
  name: string;
  createdAt: number;
  roots: SourceRoot[];
  engine: EngineId;
  connectionId: string;
  model: string;
  versions: VersionSummary[];
  selectedVersionId: string;
  nextIteration: number;
  nextSnapshot: number;
}

const key = (rootId: string, relativePath: string) => `${rootId}\0${relativePath}`;
export const entryKey = (entry: { rootId: string; relativePath: string }) => key(entry.rootId, entry.relativePath);

export class LocalCodingStore {
  // Most recently used decoded texts, bounded by total characters.
  private texts = new Map<string, string>();
  private textCharacters = 0;
  private versions = new Map<string, ProjectVersion>();
  constructor(readonly base: string) { mkdirSync(base, { recursive: true, mode: 0o700 }); }

  private ownerDir(owner: string) {
    if (!OWNER.test(owner)) throw new UserError('Invalid account.');
    return join(this.base, owner);
  }
  dir(owner: string, projectId: string) {
    if (!UUID.test(projectId)) throw new UserError('Invalid project.');
    return join(this.ownerDir(owner), projectId);
  }

  create(owner: string, init: Pick<ProjectMeta, 'name' | 'roots' | 'engine' | 'connectionId' | 'model'>): ProjectMeta {
    const id = randomUUID();
    const dir = this.dir(owner, id);
    for (const sub of ['objects', 'versions', 'proposals']) mkdirSync(join(dir, sub), { recursive: true, mode: 0o700 });
    return { schemaVersion: 1, id, ownerId: owner, conversationId: null, createdAt: Date.now(), versions: [], selectedVersionId: '', nextIteration: 1, nextSnapshot: 0, ...init };
  }

  load(owner: string, projectId: unknown): ProjectMeta {
    if (typeof projectId !== 'string') throw new UserError('Invalid project.');
    const file = join(this.dir(owner, projectId), 'project.json');
    if (!existsSync(file)) throw new UserError('This Local Coding project is no longer available.');
    let meta: ProjectMeta;
    try { meta = JSON.parse(readFileSync(file, 'utf8')); }
    catch { throw new UserError('This Local Coding project could not be read.'); }
    if (meta.schemaVersion !== 1 || meta.id !== projectId || meta.ownerId !== owner) throw new UserError('This Local Coding project belongs to another account.');
    return meta;
  }

  /** Publishing point: the project file references only artifacts already on disk. */
  save(meta: ProjectMeta) { atomicJSON(join(this.dir(meta.ownerId, meta.id), 'project.json'), meta); }

  list(owner: string): string[] {
    const dir = this.ownerDir(owner);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => UUID.test(name) && existsSync(join(dir, name, 'project.json')));
  }

  putContent(owner: string, projectId: string, bytes: Buffer): string {
    const id = createHash('sha256').update(bytes).digest('hex');
    const file = join(this.dir(owner, projectId), 'objects', id);
    if (!existsSync(file)) {
      const temp = `${file}.${randomUUID()}.tmp`;
      writeFileSync(temp, bytes, { mode: 0o600 });
      renameSync(temp, file);
    }
    return id;
  }

  content(owner: string, projectId: string, contentId: string): Buffer {
    if (!CONTENT.test(contentId)) throw new UserError('Invalid content reference.');
    const bytes = readFileSync(join(this.dir(owner, projectId), 'objects', contentId));
    if (createHash('sha256').update(bytes).digest('hex') !== contentId) throw new UserError('Stored source content is damaged. Refresh the local files to capture them again.');
    return bytes;
  }

  /** Decoded text without a byte-order mark. */
  text(owner: string, projectId: string, entry: Pick<FileEntry, 'contentId' | 'bom'>): string {
    const cacheKey = `${projectId}:${entry.contentId}`;
    const cached = this.texts.get(cacheKey);
    if (cached !== undefined) { this.texts.delete(cacheKey); this.texts.set(cacheKey, cached); return cached; }
    const bytes = this.content(owner, projectId, entry.contentId);
    const text = bytes.toString('utf8', entry.bom ? 3 : 0);
    this.texts.set(cacheKey, text);
    this.textCharacters += text.length;
    for (const [oldest, value] of this.texts) {
      if (this.textCharacters <= 64 * 1024 * 1024 || oldest === cacheKey) break;
      this.texts.delete(oldest); this.textCharacters -= value.length;
    }
    return text;
  }

  saveVersion(owner: string, version: ProjectVersion, projectId: string) {
    atomicJSON(join(this.dir(owner, projectId), 'versions', `${version.id}.json`), version);
    this.versions.set(`${projectId}:${version.id}`, version);
  }

  version(meta: ProjectMeta, versionId: unknown): ProjectVersion {
    if (typeof versionId !== 'string' || !meta.versions.some((item) => item.id === versionId)) throw new UserError('This version is not part of the project.');
    const cacheKey = `${meta.id}:${versionId}`;
    const cached = this.versions.get(cacheKey);
    if (cached) return cached;
    const version = JSON.parse(readFileSync(join(this.dir(meta.ownerId, meta.id), 'versions', `${versionId}.json`), 'utf8')) as ProjectVersion;
    this.versions.set(cacheKey, version);
    return version;
  }

  saveProposal(owner: string, projectId: string, proposal: Proposal) { atomicJSON(join(this.dir(owner, projectId), 'proposals', `${proposal.id}.json`), proposal); }
  proposal(meta: ProjectMeta, proposalId: unknown): Proposal {
    if (typeof proposalId !== 'string' || !UUID.test(proposalId)) throw new UserError('Invalid proposal.');
    const file = join(this.dir(meta.ownerId, meta.id), 'proposals', `${proposalId}.json`);
    if (!existsSync(file)) throw new UserError('This proposal is no longer available.');
    return JSON.parse(readFileSync(file, 'utf8')) as Proposal;
  }

  /**
   * Writes the version (and proposal) first, then publishes it in the project file.
   * A crash between the two leaves an unreferenced artifact for cleanup, never a dangling reference.
   */
  publish(meta: ProjectMeta, version: ProjectVersion, proposal?: Proposal): ProjectMeta {
    this.saveVersion(meta.ownerId, version, meta.id);
    if (proposal) this.saveProposal(meta.ownerId, meta.id, proposal);
    const summary: VersionSummary = {
      id: version.id, kind: version.kind, label: version.label, parentVersionId: version.parentVersionId, localSnapshotId: version.localSnapshotId,
      createdAt: version.createdAt, requestMessageId: version.requestMessageId, proposalId: version.proposalId, fileCount: version.files.length,
    };
    const next: ProjectMeta = { ...meta, versions: [...meta.versions, summary] };
    this.save(next);
    return next;
  }

  /** Removes temporary files, unpublished versions/proposals, and blobs no published version references. */
  cleanup(meta: ProjectMeta) {
    const dir = this.dir(meta.ownerId, meta.id);
    const published = new Set(meta.versions.map((version) => version.id));
    const proposals = new Set(meta.versions.map((version) => version.proposalId).filter(Boolean));
    const referenced = new Set<string>();
    for (const summary of meta.versions) for (const file of this.version(meta, summary.id).files) referenced.add(file.contentId);
    const sweep = (sub: string, keep: (name: string) => boolean) => {
      const path = join(dir, sub);
      if (!existsSync(path)) return;
      for (const name of readdirSync(path)) if (name.endsWith('.tmp') || !keep(name)) { try { unlinkSync(join(path, name)); } catch { /* retried next cleanup */ } }
    };
    sweep('versions', (name) => published.has(name.replace(/\.json$/, '')));
    sweep('proposals', (name) => proposals.has(name.replace(/\.json$/, '')));
    sweep('objects', (name) => referenced.has(name));
    for (const name of readdirSync(dir)) if (name.endsWith('.tmp')) { try { unlinkSync(join(dir, name)); } catch { /* ignore */ } }
  }

  remove(owner: string, projectId: string) {
    const dir = this.dir(owner, projectId);
    for (const cacheKey of [...this.versions.keys()]) if (cacheKey.startsWith(`${projectId}:`)) this.versions.delete(cacheKey);
    for (const [cacheKey, value] of [...this.texts]) if (cacheKey.startsWith(`${projectId}:`)) { this.texts.delete(cacheKey); this.textCharacters -= value.length; }
    rmSync(dir, { recursive: true, force: true });
  }

  size(owner: string, projectId: string): number {
    const objects = join(this.dir(owner, projectId), 'objects');
    return existsSync(objects) ? readdirSync(objects).reduce((sum, name) => sum + statSync(join(objects, name)).size, 0) : 0;
  }
}

export function newVersion(input: { kind: VersionKind; label: string; parentVersionId: string | null; localSnapshotId?: string; requestMessageId?: string | null; proposalId?: string | null; roots: SourceRoot[]; files: FileEntry[] }): ProjectVersion {
  const id = randomUUID();
  const files = [...input.files].sort((a, b) => a.rootId.localeCompare(b.rootId) || a.relativePath.localeCompare(b.relativePath));
  return {
    id, kind: input.kind, label: input.label, parentVersionId: input.parentVersionId, localSnapshotId: input.localSnapshotId ?? id,
    createdAt: Date.now(), requestMessageId: input.requestMessageId ?? null, proposalId: input.proposalId ?? null,
    fileCount: files.length, roots: input.roots, files,
  };
}

/** The selected version and its ancestors, oldest first. */
export function ancestry(meta: ProjectMeta, versionId: string): VersionSummary[] {
  const byId = new Map(meta.versions.map((version) => [version.id, version]));
  const chain: VersionSummary[] = [];
  let current = byId.get(versionId);
  while (current && chain.length <= meta.versions.length) { chain.unshift(current); current = current.parentVersionId ? byId.get(current.parentVersionId) : undefined; }
  return chain;
}

// ── The three read-only tools, always served from one pinned version ─────────

const displayPath = (version: ProjectVersion, entry: FileEntry) => {
  const root = version.roots.find((item) => item.id === entry.rootId);
  // A single attached file is shown by its own name, not as "name/name".
  return root?.sourceKind === 'file' ? root.displayName : `${root?.displayName ?? entry.rootId}/${entry.relativePath}`;
};
const inScope = (version: ProjectVersion, entry: FileEntry, scope: unknown) => {
  if (scope === undefined || scope === null || scope === '') return true;
  if (typeof scope !== 'string' || scope.length > 500) throw new UserError('scope must be a path prefix.');
  const path = displayPath(version, entry).toLowerCase(), prefix = scope.replace(/^\/+/, '').toLowerCase();
  return path.startsWith(prefix) || entry.relativePath.toLowerCase().startsWith(prefix);
};
const cursorOf = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new UserError('cursor must be a number from a previous call.');
  return number;
};

export class VersionReader {
  constructor(private store: LocalCodingStore, private meta: ProjectMeta, private version: ProjectVersion) {}
  get versionId() { return this.version.id; }

  overview(): string {
    const roots = this.version.roots.map((root) => `- ${root.id}: ${root.displayName}${root.sourceKind === 'working-folder' ? ' (working folder)' : ''}`).join('\n');
    return `Version: ${this.version.label}\nSource roots:\n${roots}\nFiles: ${this.version.files.length}`;
  }

  list(input: { scope?: unknown; cursor?: unknown }): string {
    const matches = this.version.files.filter((entry) => inScope(this.version, entry, input.scope));
    const start = cursorOf(input.cursor);
    const page = matches.slice(start, start + LOCAL_CODING_LIMITS.maxListEntries);
    const lines = page.map((entry) => `${entry.fileId}\t${displayPath(this.version, entry)}\t${entry.lines} lines`);
    const next = start + page.length < matches.length ? `\nMore files: call list_files with cursor ${start + page.length}.` : '';
    return `${matches.length} files in ${this.version.label}${input.scope ? ` under "${input.scope}"` : ''}.\nfileId\tpath\tsize\n${lines.join('\n')}${next}`;
  }

  async search(input: { query?: unknown; scope?: unknown; cursor?: unknown; caseSensitive?: unknown }): Promise<string> {
    if (typeof input.query !== 'string' || !input.query || input.query.length > LOCAL_CODING_LIMITS.maxSearchQuery) throw new UserError(`query must be 1–${LOCAL_CODING_LIMITS.maxSearchQuery} characters of literal text.`);
    const caseSensitive = input.caseSensitive === true;
    const needle = caseSensitive ? input.query : input.query.toLowerCase();
    const skip = cursorOf(input.cursor);
    const results: string[] = [];
    let seen = 0, scanned = 0, more = false;
    for (const entry of this.version.files) {
      if (!inScope(this.version, entry, input.scope)) continue;
      // Yield regularly so large searches never stall the app or audio.
      if (++scanned % 200 === 0) await new Promise((resolve) => setImmediate(resolve));
      const lines = this.store.text(this.meta.ownerId, this.meta.id, entry).split('\n');
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index].replace(/\r$/, '');
        if (!(caseSensitive ? line : line.toLowerCase()).includes(needle)) continue;
        if (seen++ < skip) continue;
        if (results.length >= LOCAL_CODING_LIMITS.maxSearchMatches) { more = true; break; }
        results.push(`${entry.fileId}\t${displayPath(this.version, entry)}:${index + 1}\t${line.length > 300 ? `${line.slice(0, 300)}…` : line}`);
      }
      if (more) break;
    }
    const next = more ? `\nMore matches: call search_files with cursor ${skip + results.length}.` : '';
    return results.length ? `Matches for "${input.query}" in ${this.version.label}:\n${results.join('\n')}${next}` : `No matches for "${input.query}" in ${this.version.label}${skip ? ' after that cursor' : ''}.`;
  }

  read(input: { fileId?: unknown; startLine?: unknown; endLine?: unknown }): string {
    const entry = this.version.files.find((item) => item.fileId === input.fileId);
    if (!entry) throw new UserError('fileId is not in this version. Use list_files or search_files to find it.');
    const text = this.store.text(this.meta.ownerId, this.meta.id, entry);
    const lines = text === '' ? [] : text.split('\n');
    if (entry.finalNewline) lines.pop();
    const start = input.startLine === undefined || input.startLine === null ? 1 : Number(input.startLine);
    if (!Number.isSafeInteger(start) || start < 1) throw new UserError('startLine must be a positive whole number.');
    let end = input.endLine === undefined || input.endLine === null ? start + LOCAL_CODING_LIMITS.maxReadLines - 1 : Number(input.endLine);
    if (!Number.isSafeInteger(end) || end < start) throw new UserError('endLine must be a whole number at or after startLine.');
    end = Math.min(end, lines.length, start + LOCAL_CODING_LIMITS.maxReadLines - 1);
    const out: string[] = [];
    let characters = 0, last = start - 1;
    for (let number = start; number <= end; number++) {
      const line = `${number}\t${lines[number - 1].replace(/\r$/, '')}`;
      if (characters + line.length > LOCAL_CODING_LIMITS.maxReadCharacters && out.length) break;
      out.push(line); characters += line.length + 1; last = number;
    }
    const header = `${displayPath(this.version, entry)} (fileId ${entry.fileId}, ${lines.length} lines, ${entry.eol === 'crlf' ? 'CRLF' : entry.eol === 'mixed' ? 'mixed line endings' : 'LF'}${entry.finalNewline ? '' : ', no final newline'})`;
    if (!lines.length) return `${header}\n(empty file)`;
    if (start > lines.length) return `${header}\nstartLine ${start} is past the end of the file.`;
    const more = last < lines.length ? `\nMore lines: call read_file with startLine ${last + 1}.` : '';
    return `${header}\n${out.join('\n')}${more}`;
  }
}

// ── Refresh: combine new local files with a selected iteration ───────────────

export interface MergeInput { base: FileEntry[]; local: FileEntry[]; proposed: FileEntry[] }
export interface MergeResult { files: FileEntry[]; conflicts: Array<{ key: string; base?: FileEntry; local?: FileEntry; proposed?: FileEntry }> }

/**
 * Per path, with absence as a value: P = B → take L; L = B → take P; L = P → take it; otherwise a conflict.
 * Conflicting paths are left out of `files` until the user decides.
 */
export function threeWay({ base, local, proposed }: MergeInput): MergeResult {
  const B = new Map(base.map((entry) => [entryKey(entry), entry]));
  const L = new Map(local.map((entry) => [entryKey(entry), entry]));
  const P = new Map(proposed.map((entry) => [entryKey(entry), entry]));
  const files: FileEntry[] = [], conflicts: MergeResult['conflicts'] = [];
  for (const path of new Set([...B.keys(), ...L.keys(), ...P.keys()])) {
    const b = B.get(path), l = L.get(path), p = P.get(path);
    const bc = b?.contentId, lc = l?.contentId, pc = p?.contentId;
    const chosen = pc === bc ? l : lc === bc ? p : lc === pc ? l : 'conflict';
    if (chosen === 'conflict') conflicts.push({ key: path, base: b, local: l, proposed: p });
    else if (chosen) files.push(chosen);
  }
  return { files, conflicts };
}

export function describeConflict(roots: SourceRoot[], conflict: MergeResult['conflicts'][number]): RefreshConflict {
  const sample = conflict.local ?? conflict.proposed ?? conflict.base!;
  return {
    fileId: sample.fileId, relativePath: sample.relativePath,
    rootName: roots.find((root) => root.id === sample.rootId)?.displayName ?? sample.rootId,
    base: conflict.base ? 'present' : 'absent', local: conflict.local ? 'present' : 'absent', proposed: conflict.proposed ? 'present' : 'absent',
  };
}

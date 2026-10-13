import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, relative, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { LOCAL_CODING_LIMITS, type BrowseEntry, type BrowseResult, type ExcludedEntry, type FileEntry, type LineEnding, type SourcePreview, type SourceRoot } from '../../shared/localCoding';
import { UserError } from './validation';

// Browsing is navigation only. It never grants an engine access; only a confirmed, captured selection does.

const MiB = 1024 * 1024;
const SKIPPED_DIRECTORIES = new Map<string, string>([
  ...['.git', '.hg', '.svn'].map((name) => [name, 'version control internals'] as [string, string]),
  ...['node_modules', 'bower_components', 'Pods', '.venv', 'venv', '.tox', '.gradle'].map((name) => [name, 'dependencies'] as [string, string]),
  ...['dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.turbo', '.parcel-cache', '.cache', 'coverage', '.nyc_output', '__pycache__', '.pytest_cache', '.mypy_cache', 'target', 'DerivedData', '.terraform'].map((name) => [name, 'generated output'] as [string, string]),
  ['.idea', 'editor settings'],
]);
const CREDENTIAL_NAMES = new Set(['.npmrc', '.pypirc', '.netrc', '.git-credentials', '.htpasswd', 'credentials', 'credentials.json', 'secrets.json', 'terraform.tfvars']);
const SAFE_ENV_EXAMPLES = /^\.env\.(example|sample|template|defaults)$/i;

/** Why a file is excluded by name alone, or null when it is eligible. */
export function excludedByName(name: string): string | null {
  if (name === '.DS_Store' || name === 'Thumbs.db' || name === 'desktop.ini') return 'system file';
  if (/^\.env(\..+)?$/i.test(name) && !SAFE_ENV_EXAMPLES.test(name)) return 'credential file';
  if (CREDENTIAL_NAMES.has(name) || /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i.test(name) || /^service-account.*\.json$/i.test(name)) return 'credential file';
  if (/\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk|gpg|tfstate)$/i.test(name) || /\.tfstate\.backup$/i.test(name)) return 'credential file';
  if (/\.min\.(js|css)$/i.test(name) || /\.(js|css)\.map$/i.test(name)) return 'generated output';
  return null;
}

function assertLocalPath(path: unknown, label = 'path'): string {
  if (typeof path !== 'string' || !path.trim() || path.length > 4096 || path.includes('\0')) throw new UserError(`Enter a valid ${label}.`);
  const value = path.trim();
  // Network locations can disappear or change identity mid-session; the first release keeps sources on this computer.
  if (value.startsWith('\\\\') || value.startsWith('//')) throw new UserError('Network locations are not supported. Choose a folder on this computer.');
  if (/^\\\\\?\\|^\\\\\.\\/.test(value)) throw new UserError('Device paths are not supported.');
  if (!isAbsolute(value)) throw new UserError('Enter a full path, starting from the drive or root folder.');
  return value;
}

function fsMessage(error: unknown, path: string): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return `“${path}” does not exist.`;
  if (code === 'EACCES' || code === 'EPERM') return `Novi does not have permission to open “${path}”.`;
  if (code === 'ENOTDIR') return `“${path}” is not a folder.`;
  return `“${path}” could not be opened.`;
}

export function startingLocations(): Array<{ name: string; path: string }> {
  const home = homedir();
  const locations = [{ name: 'Home', path: home }];
  for (const name of ['Desktop', 'Documents', 'Downloads', 'Projects', 'projects', 'src', 'code', 'dev']) {
    const path = join(home, name);
    if (existsSync(path) && !locations.some((item) => item.path === path)) locations.push({ name, path });
  }
  if (process.platform === 'win32') {
    for (let code = 65; code <= 90; code++) {
      const drive = `${String.fromCharCode(code)}:\\`;
      if (existsSync(drive)) locations.push({ name: `${String.fromCharCode(code)}:`, path: drive });
    }
  } else locations.push({ name: 'Computer', path: '/' });
  return locations;
}

function breadcrumbs(path: string) {
  const { root } = parse(path);
  const parts = path.slice(root.length).split(sep).filter(Boolean);
  const crumbs = [{ name: root.replace(/[\\/]+$/, '') || root, path: root }];
  let current = root;
  for (const part of parts) { current = join(current, part); crumbs.push({ name: part, path: current }); }
  return crumbs;
}

/** One directory level for Novi's explorer. Bounded, sorted, and never follows links. */
export async function browseDirectory(input: unknown): Promise<BrowseResult> {
  const requested = input === undefined || input === null || input === '' ? homedir() : assertLocalPath(input);
  let path: string;
  try {
    const stat = await lstat(requested);
    if (stat.isSymbolicLink()) throw new UserError(`“${requested}” is a link. Open the folder it points to directly.`);
    if (!stat.isDirectory()) throw new UserError(`“${requested}” is a file, not a folder.`);
    path = await realpath(requested);
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(fsMessage(error, requested));
  }
  let names: import('node:fs').Dirent[];
  try { names = await readdir(path, { withFileTypes: true }); }
  catch (error) { throw new UserError(fsMessage(error, path)); }
  const entries: BrowseEntry[] = [];
  for (const entry of names) {
    const full = join(path, entry.name);
    if (entry.isSymbolicLink()) entries.push({ name: entry.name, path: full, kind: 'link', unavailable: 'Links are not followed.' });
    else if (entry.isDirectory()) entries.push({ name: entry.name, path: full, kind: 'directory' });
    else if (entry.isFile()) entries.push({ name: entry.name, path: full, kind: 'file' });
    else entries.push({ name: entry.name, path: full, kind: 'special', unavailable: 'Special files cannot be selected.' });
  }
  entries.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const truncated = entries.length > LOCAL_CODING_LIMITS.maxBrowseEntries;
  const shown = entries.slice(0, LOCAL_CODING_LIMITS.maxBrowseEntries);
  await Promise.all(shown.filter((entry) => entry.kind === 'file').map(async (entry) => {
    try { entry.size = (await lstat(entry.path)).size; } catch { entry.unavailable = 'This file cannot be read.'; }
  }));
  const parent = dirname(path) === path ? null : dirname(path);
  return { path, parent, breadcrumbs: breadcrumbs(path), entries: shown, truncated, locations: startingLocations() };
}

// ── Source selection ───────────────────────────────────────────────────────

interface PlannedFile { root: SourceRoot; absolute: string; relativePath: string; size: number }
interface Plan { roots: SourceRoot[]; files: PlannedFile[]; excluded: ExcludedEntry[]; excludedCount: number; blocking: string | null }

/** Validates the chosen roots: absolute, local, not links, not overlapping. The working folder comes first. */
export async function resolveRoots(input: { workingFolder: unknown; extra?: unknown }): Promise<SourceRoot[]> {
  const extra = input.extra === undefined ? [] : input.extra;
  if (!Array.isArray(extra) || extra.length > LOCAL_CODING_LIMITS.maxRoots - 1) throw new UserError(`Add up to ${LOCAL_CODING_LIMITS.maxRoots - 1} extra files or folders.`);
  const requested = [assertLocalPath(input.workingFolder, 'working folder'), ...extra.map((path) => assertLocalPath(path))];
  const roots: SourceRoot[] = [];
  for (const [index, path] of requested.entries()) {
    let canonical: string, isDirectory: boolean;
    try {
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new UserError(`“${path}” is a link. Choose the folder or file it points to directly.`);
      if (!stat.isDirectory() && !stat.isFile()) throw new UserError(`“${path}” is not a regular file or folder.`);
      isDirectory = stat.isDirectory();
      canonical = await realpath(path);
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(fsMessage(error, path));
    }
    if (index === 0 && !isDirectory) throw new UserError('The working folder must be a folder.');
    for (const other of roots) {
      const inside = (a: string, b: string) => { const rel = relative(a, b); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
      if (inside(other.canonicalLocalPath, canonical) || inside(canonical, other.canonicalLocalPath)) {
        throw new UserError(`“${basename(canonical)}” overlaps “${other.displayName}”. Each file can belong to only one source.`);
      }
    }
    const base = basename(canonical) || canonical;
    let displayName = base, suffix = 2;
    while (roots.some((root) => root.displayName.toLowerCase() === displayName.toLowerCase())) displayName = `${base} (${suffix++})`;
    roots.push({ id: `r${index + 1}`, displayName, canonicalLocalPath: canonical, sourceKind: index === 0 ? 'working-folder' : isDirectory ? 'folder' : 'file' });
  }
  return roots;
}

async function readGitignore(directory: string): Promise<string | null> {
  const path = join(directory, '.gitignore');
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    const handle = await open(path, 'r');
    try { return (await handle.readFile()).toString('utf8'); } finally { await handle.close(); }
  } catch { return null; }
}

/** Lists eligible regular files without reading their contents. Links and special files are reported, never followed. */
async function plan(roots: SourceRoot[]): Promise<Plan> {
  const files: PlannedFile[] = [], excluded: ExcludedEntry[] = [];
  let excludedCount = 0, total = 0, visited = 0;
  const exclude = (path: string, reason: string) => { excludedCount++; if (excluded.length < 500) excluded.push({ path, reason }); };
  for (const root of roots) {
    const shown = (rel: string) => rel ? `${root.displayName}/${rel}` : root.displayName;
    if (root.sourceKind === 'file') {
      const stat = await lstat(root.canonicalLocalPath);
      const reason = stat.size > LOCAL_CODING_LIMITS.maxFileBytes ? `larger than ${LOCAL_CODING_LIMITS.maxFileBytes / MiB} MiB` : null;
      if (reason) exclude(root.displayName, reason);
      else { files.push({ root, absolute: root.canonicalLocalPath, relativePath: basename(root.canonicalLocalPath), size: stat.size }); total += stat.size; }
      continue;
    }
    // Each directory's .gitignore applies to paths below it, as Git does.
    const walk = async (directory: string, rel: string, rules: Array<{ base: string; ig: Ignore }>, depth: number): Promise<void> => {
      if (depth > 40) { exclude(shown(rel), 'nested too deeply'); return; }
      const text = await readGitignore(directory);
      const scoped = text ? [...rules, { base: rel, ig: ignore().add(text) }] : rules;
      let entries: import('node:fs').Dirent[];
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch { exclude(rel ? `${shown(rel)}/` : shown(rel), 'folder could not be read'); return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (++visited > 200_000) throw new UserError('This folder has too many entries to scan. Choose a narrower working folder.');
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        const ignored = scoped.some(({ base, ig }) => {
          const local = base ? childRel.slice(base.length + 1) : childRel;
          return ig.ignores(entry.isDirectory() ? `${local}/` : local);
        });
        if (entry.isSymbolicLink()) { exclude(shown(childRel), 'link, not followed'); continue; }
        if (entry.isDirectory()) {
          const reason = SKIPPED_DIRECTORIES.get(entry.name) ?? (ignored ? 'ignored by .gitignore' : null);
          if (reason) { exclude(`${shown(childRel)}/`, reason); continue; }
          await walk(join(directory, entry.name), childRel, scoped, depth + 1);
          continue;
        }
        if (!entry.isFile()) { exclude(shown(childRel), 'special file'); continue; }
        const reason = excludedByName(entry.name) ?? (ignored ? 'ignored by .gitignore' : null);
        if (reason) { exclude(shown(childRel), reason); continue; }
        let size: number;
        try { size = (await lstat(join(directory, entry.name))).size; }
        catch { exclude(shown(childRel), 'file could not be read'); continue; }
        if (size > LOCAL_CODING_LIMITS.maxFileBytes) { exclude(shown(childRel), `larger than ${LOCAL_CODING_LIMITS.maxFileBytes / MiB} MiB`); continue; }
        files.push({ root, absolute: join(directory, entry.name), relativePath: childRel, size });
        total += size;
      }
    };
    await walk(root.canonicalLocalPath, '', [], 0);
  }
  let blocking: string | null = null;
  if (!files.length) blocking = 'No eligible source files were found. Choose a folder that contains source code.';
  else if (files.length > LOCAL_CODING_LIMITS.maxFiles) blocking = `${files.length.toLocaleString()} eligible files exceed the limit of ${LOCAL_CODING_LIMITS.maxFiles.toLocaleString()}. Choose a narrower working folder, or add a .gitignore for generated folders.`;
  else if (total > LOCAL_CODING_LIMITS.maxTotalBytes) blocking = `${(total / MiB).toFixed(1)} MiB of eligible files exceed the limit of ${LOCAL_CODING_LIMITS.maxTotalBytes / MiB} MiB. Choose a narrower working folder.`;
  return { roots, files, excluded, excludedCount, blocking };
}

const pending = new Map<string, { owner: string; roots: SourceRoot[]; createdAt: number }>();

/** Previews a selection. The returned id is needed to capture exactly these roots; it expires after 30 minutes. */
export async function previewSources(owner: string, input: { workingFolder: unknown; extra?: unknown }): Promise<SourcePreview> {
  const roots = await resolveRoots(input);
  const result = await plan(roots);
  for (const [id, item] of pending) if (Date.now() - item.createdAt > 30 * 60_000) pending.delete(id);
  const selectionId = randomUUID();
  pending.set(selectionId, { owner, roots, createdAt: Date.now() });
  let binary = 0, includedBytes = 0;
  const excluded = [...result.excluded], includedPaths: string[] = [];
  // Binary and non-UTF-8 files are found by content; check them so the preview matches what capture keeps.
  for (const file of result.files) {
    const shown = file.root.sourceKind === 'file' ? file.root.displayName : `${file.root.displayName}/${file.relativePath}`;
    const problem = await contentProblem(file.absolute);
    if (problem) { binary++; if (excluded.length < 500) excluded.push({ path: shown, reason: problem }); continue; }
    includedBytes += file.size;
    if (includedPaths.length < 2000) includedPaths.push(shown);
  }
  return {
    selectionId, roots, included: result.files.length - binary, includedBytes, includedPaths,
    excluded, excludedCount: result.excludedCount + binary, blocking: result.blocking,
  };
}

export function takeSelection(owner: string, selectionId: unknown): SourceRoot[] {
  const item = typeof selectionId === 'string' ? pending.get(selectionId) : undefined;
  if (!item || item.owner !== owner || Date.now() - item.createdAt > 30 * 60_000) throw new UserError('This source selection expired. Review the folder again.');
  pending.delete(selectionId as string);
  return item.roots;
}

async function contentProblem(path: string): Promise<string | null> {
  try {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return classify(buffer.subarray(0, bytesRead), true);
    } finally { await handle.close(); }
  } catch { return 'file could not be read'; }
}

/** Why bytes are not usable source text, or null for UTF-8 text. `partial` allows a cut-off final character. */
function classify(bytes: Buffer, partial = false): string | null {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return 'unsupported encoding (UTF-16/32)';
  if (bytes.includes(0)) return 'binary file';
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: partial }); }
  catch { return 'not UTF-8 text'; }
  return null;
}

export function fileId(rootId: string, relativePath: string): string {
  return `f_${createHash('sha256').update(`${rootId}\0${relativePath}`).digest('hex').slice(0, 16)}`;
}

export function textMetadata(bytes: Buffer): { lines: number; eol: LineEnding; finalNewline: boolean; bom: boolean } {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = bytes.toString('utf8', bom ? 3 : 0);
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  const eol: LineEnding = crlf && lf ? 'mixed' : crlf ? 'crlf' : lf ? 'lf' : 'none';
  const finalNewline = text.endsWith('\n');
  const lines = text === '' ? 0 : text.split('\n').length - (finalNewline ? 1 : 0);
  return { lines, eol, finalNewline, bom };
}

export interface CapturedFile { entry: Omit<FileEntry, 'contentId'>; bytes: Buffer }

interface Identity { size: number; mtimeMs: number; ino: number; dev: number }
const identity = (stat: import('node:fs').Stats): Identity => ({ size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino, dev: stat.dev });
const same = (a: Identity, b: Identity) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino && a.dev === b.dev;

/**
 * Reads every eligible file with before/after identity checks, then rechecks the whole set.
 * A directory that keeps changing is reported rather than captured as if it were one moment in time.
 */
export async function captureFiles(roots: SourceRoot[], store: (bytes: Buffer) => string): Promise<{ files: FileEntry[]; excluded: ExcludedEntry[]; excludedCount: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const planned = await plan(roots);
    if (planned.blocking) throw new UserError(planned.blocking);
    const excluded = [...planned.excluded];
    let excludedCount = planned.excludedCount;
    const captured: Array<{ file: PlannedFile; entry: FileEntry; seen: Identity }> = [];
    let changing: string | null = null;
    for (const file of planned.files) {
      let bytes: Buffer | null = null, seen: Identity | null = null;
      for (let read = 0; read < 3 && !bytes; read++) {
        try {
          const before = await lstat(file.absolute);
          if (!before.isFile()) break;
          const handle = await open(file.absolute, 'r');
          let data: Buffer;
          try { data = await handle.readFile(); } finally { await handle.close(); }
          const after = await lstat(file.absolute);
          if (same(identity(before), identity(after)) && data.length === after.size) { bytes = data; seen = identity(after); }
        } catch { break; }
      }
      const shown = file.root.sourceKind === 'file' ? file.root.displayName : `${file.root.displayName}/${file.relativePath}`;
      if (!bytes || !seen) { changing = shown; break; }
      if (bytes.length > LOCAL_CODING_LIMITS.maxFileBytes) { excludedCount++; excluded.push({ path: shown, reason: `larger than ${LOCAL_CODING_LIMITS.maxFileBytes / MiB} MiB` }); continue; }
      const problem = classify(bytes);
      if (problem) { excludedCount++; if (excluded.length < 500) excluded.push({ path: shown, reason: problem }); continue; }
      const contentId = store(bytes);
      captured.push({ file, seen, entry: { fileId: fileId(file.root.id, file.relativePath), rootId: file.root.id, relativePath: file.relativePath, contentId, bytes: bytes.length, ...textMetadata(bytes) } });
    }
    if (changing) continue;
    // Recheck after the full pass: same eligible set, same identities.
    const again = await plan(roots);
    const keys = new Set(planned.files.map((file) => file.absolute));
    if (again.files.length !== planned.files.length || again.files.some((file) => !keys.has(file.absolute))) continue;
    let stable = true;
    for (const item of captured) {
      try { if (!same(item.seen, identity(await lstat(item.file.absolute)))) { stable = false; break; } }
      catch { stable = false; break; }
    }
    if (!stable) continue;
    if (!captured.length) throw new UserError('No readable text source files were found. Binary and non-UTF-8 files are excluded.');
    return { files: captured.map((item) => item.entry).sort((a, b) => a.rootId.localeCompare(b.rootId) || a.relativePath.localeCompare(b.relativePath)), excluded, excludedCount };
  }
  throw new UserError('Files kept changing while Novi read them. Wait for builds or saves to finish, then try again.');
}

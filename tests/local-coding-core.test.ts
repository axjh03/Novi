import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { browseDirectory, captureFiles, excludedByName, previewSources, resolveRoots, takeSelection, textMetadata } from '../src/main/services/localCodingFiles';
import { LocalCodingStore, VersionReader, ancestry, newVersion, threeWay, type ProjectMeta } from '../src/main/services/localCodingVersions';
import { ProposalInvalid, applyEdits, changedFiles, diffText, parseProposal, pathProblem, reviewFile, validateProposal } from '../src/main/services/localCodingProposals';
import type { FileEntry, ProjectVersion, ProposalResponse } from '../src/shared/localCoding';

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'novi-local-coding-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'interview-app');
  const write = (path: string, text: string | Buffer) => { mkdirSync(join(project, path, '..'), { recursive: true }); writeFileSync(join(project, path), text); };
  write('src/Login.jsx', 'export function Login() {\n  submitLogin(values);\n}\n');
  write('src/api.js', 'export const api = 1;\r\nexport const other = 2;\r\n');
  write('README.md', '# App');
  write('.env', 'SECRET=1');
  write('.env.example', 'SECRET=');
  write('node_modules/lib/index.js', 'x');
  write('dist/out.js', 'x');
  write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
  write('notes/.gitignore', '*.log\n');
  write('notes/today.log', 'skip');
  write('notes/plan.txt', 'keep');
  write('legacy.txt', Buffer.from([0xff, 0xfe, 0x41, 0]));
  return { root, project, write, store: new LocalCodingStore(join(root, 'data')) };
}

async function session(t: { after: (fn: () => void) => void }) {
  const f = fixture(t);
  const roots = await resolveRoots({ workingFolder: f.project });
  let meta: ProjectMeta = f.store.create('acct', { name: 'interview-app', roots, engine: 'codex', connectionId: 'c', model: 'm' });
  const captured = await captureFiles(roots, (bytes) => f.store.putContent('acct', meta.id, bytes));
  const s0 = newVersion({ kind: 'local', label: 'Local S0', parentVersionId: null, roots, files: captured.files });
  meta = f.store.publish({ ...meta, selectedVersionId: s0.id, nextSnapshot: 1 }, s0);
  return { ...f, roots, meta, s0, captured };
}

const find = (version: ProjectVersion, path: string) => version.files.find((entry) => entry.relativePath === path)!;
const answer = (changes: ProposalResponse['changes']): ProposalResponse => ({ schemaVersion: 1, summary: 's', approach: 'a', evidence: [], assumptions: [], questions: [], changes, suggestedChecks: [] });

test('capture keeps source text, excludes credentials, dependencies, generated, binary and ignored files', async (t) => {
  const { captured, s0, project } = await session(t);
  const paths = s0.files.map((entry) => entry.relativePath);
  assert.deepEqual(paths.sort(), ['.env.example', 'README.md', 'notes/.gitignore', 'notes/plan.txt', 'src/Login.jsx', 'src/api.js']);
  const reasons = Object.fromEntries(captured.excluded.map((item) => [item.path, item.reason]));
  assert.equal(reasons['interview-app/.env'], 'credential file');
  assert.equal(reasons['interview-app/node_modules/'], 'dependencies');
  assert.equal(reasons['interview-app/dist/'], 'generated output');
  assert.equal(reasons['interview-app/logo.png'], 'binary file');
  assert.equal(reasons['interview-app/notes/today.log'], 'ignored by .gitignore');
  assert.equal(reasons['interview-app/legacy.txt'], 'unsupported encoding (UTF-16/32)');
  const api = find(s0, 'src/api.js');
  assert.deepEqual([api.eol, api.finalNewline, api.lines], ['crlf', true, 2]);
  assert.deepEqual([find(s0, 'README.md').finalNewline, find(s0, 'README.md').lines], [false, 1]);
  // Capturing never writes to the project.
  assert.equal(readFileSync(join(project, 'src/Login.jsx'), 'utf8'), 'export function Login() {\n  submitLogin(values);\n}\n');
});

test('links, special entries, overlaps, relative and network paths are refused', async (t) => {
  const f = fixture(t);
  const outside = join(f.root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE');
  // Windows without Developer Mode cannot create symbolic links; junctions are tested there instead.
  symlinkSync(outside, join(f.project, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  try { symlinkSync(join(outside, 'secret.txt'), join(f.project, 'secret-link.txt')); } catch { /* file links need privileges on Windows */ }
  const roots = await resolveRoots({ workingFolder: f.project });
  const meta = f.store.create('acct', { name: 'x', roots, engine: 'codex', connectionId: 'c', model: 'm' });
  const captured = await captureFiles(roots, (bytes) => f.store.putContent('acct', meta.id, bytes));
  assert(!captured.files.some((entry) => entry.relativePath.startsWith('linked') || entry.relativePath === 'secret-link.txt'));
  assert(captured.excluded.some((item) => item.path.endsWith('linked') && item.reason === 'link, not followed'));
  await assert.rejects(resolveRoots({ workingFolder: join(f.project, 'linked') }), /is a link/);
  await assert.rejects(resolveRoots({ workingFolder: 'relative/path' }), /full path/);
  await assert.rejects(resolveRoots({ workingFolder: '\\\\server\\share' }), /Network locations/);
  await assert.rejects(resolveRoots({ workingFolder: f.project, extra: [join(f.project, 'src')] }), /overlaps/);
  await assert.rejects(resolveRoots({ workingFolder: join(f.project, 'README.md') }), /must be a folder/);
  const browse = await browseDirectory(f.project);
  assert.equal(browse.entries.find((entry) => entry.name === 'linked')?.kind, 'link');
  assert(browse.entries.find((entry) => entry.name === 'linked')?.unavailable);
  await assert.rejects(browseDirectory(join(f.project, 'missing')), /does not exist/);
});

test('extra roots keep identically named files distinct; selections are owner-bound and single-use', async (t) => {
  const f = fixture(t);
  const other = join(f.root, 'other', 'interview-app'); mkdirSync(join(other, 'src'), { recursive: true }); writeFileSync(join(other, 'src/api.js'), 'other');
  const preview = await previewSources('acct', { workingFolder: f.project, extra: [other] });
  assert.deepEqual(preview.roots.map((root) => [root.id, root.displayName]), [['r1', 'interview-app'], ['r2', 'interview-app (2)']]);
  assert.equal(preview.blocking, null);
  assert.equal(preview.included, 7);
  assert.throws(() => takeSelection('someone-else', preview.selectionId), /expired/);
  const roots = takeSelection('acct', preview.selectionId);
  assert.throws(() => takeSelection('acct', preview.selectionId), /expired/);
  const meta = f.store.create('acct', { name: 'x', roots, engine: 'codex', connectionId: 'c', model: 'm' });
  const { files } = await captureFiles(roots, (bytes) => f.store.putContent('acct', meta.id, bytes));
  const apis = files.filter((entry) => entry.relativePath === 'src/api.js');
  assert.equal(apis.length, 2);
  assert.notEqual(apis[0].fileId, apis[1].fileId);
});

test('limits block with a narrowing message instead of truncating', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.project, 'big.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
  const roots = await resolveRoots({ workingFolder: f.project });
  const preview = await previewSources('acct', { workingFolder: f.project });
  assert(preview.excluded.some((item) => item.path.endsWith('big.txt') && /larger than 2 MiB/.test(item.reason)));
  const empty = join(f.root, 'empty'); mkdirSync(empty);
  await assert.rejects(captureFiles(await resolveRoots({ workingFolder: empty }), () => 'x'), /No eligible source files/);
  assert(roots.length === 1);
  assert.equal(excludedByName('id_ed25519'), 'credential file');
  assert.equal(excludedByName('app.min.js'), 'generated output');
  assert.equal(excludedByName('.env.local'), 'credential file');
  assert.equal(excludedByName('index.ts'), null);
});

test('a file that keeps changing during capture is reported', async (t) => {
  const f = fixture(t);
  const roots = await resolveRoots({ workingFolder: f.project });
  let calls = 0;
  // Change a file's timestamp every time content is stored, simulating an active writer.
  await assert.rejects(captureFiles(roots, (bytes) => {
    calls++;
    const when = new Date(Date.now() + calls * 1000);
    utimesSync(join(f.project, 'src/Login.jsx'), when, when);
    return String(bytes.length);
  }), /kept changing/);
});

test('captured versions stay immutable when disk files change later', async (t) => {
  const { store, meta, s0, project } = await session(t);
  writeFileSync(join(project, 'src/Login.jsx'), 'CHANGED ON DISK');
  const reader = new VersionReader(store, meta, s0);
  assert.match(reader.read({ fileId: find(s0, 'src/Login.jsx').fileId }), /submitLogin\(values\);/);
  assert.doesNotMatch(await reader.search({ query: 'CHANGED' }), /Login/);
});

test('virtual tools list, search and read the pinned version only', async (t) => {
  const { store, meta, s0 } = await session(t);
  const reader = new VersionReader(store, meta, s0);
  assert.match(reader.list({}), /6 files in Local S0/);
  assert.match(reader.list({ scope: 'interview-app/src' }), /2 files/);
  const login = find(s0, 'src/Login.jsx');
  assert.equal(reader.read({ fileId: login.fileId }), `interview-app/src/Login.jsx (fileId ${login.fileId}, 3 lines, LF)\n1\texport function Login() {\n2\t  submitLogin(values);\n3\t}`);
  assert.match(reader.read({ fileId: find(s0, 'src/api.js').fileId, startLine: 2 }), /CRLF\)\n2\texport const other = 2;$/);
  assert.match(reader.read({ fileId: find(s0, 'README.md').fileId }), /no final newline/);
  assert.match(await reader.search({ query: 'SUBMITLOGIN' }), /Login\.jsx:2\t  submitLogin/);
  assert.match(await reader.search({ query: 'SUBMITLOGIN', caseSensitive: true }), /No matches/);
  assert.throws(() => reader.read({ fileId: 'f_missing' }), /not in this version/);
  assert.throws(() => reader.read({ fileId: login.fileId, startLine: 0 }), /positive/);
  await assert.rejects(reader.search({ query: '' }), /query/);
});

test('an iteration adds, edits and deletes virtually; reads follow the selected version', async (t) => {
  let { store, meta, s0, project } = await session(t);
  const login = find(s0, 'src/Login.jsx'), readme = find(s0, 'README.md');
  const result = validateProposal(store, meta, s0, answer([
    { operation: 'edit', sourceFileId: login.fileId, reason: 'validate', edits: [{ startLine: 2, before: ['  submitLogin(values);'], after: ['  if (!validateLogin(values)) return;', '  submitLogin(values);'] }] },
    { operation: 'create', destinationRootId: 'r1', relativePath: 'src/validateLogin.js', reason: 'helper', content: 'export const validateLogin = () => true;\n' },
    { operation: 'delete', sourceFileId: readme.fileId, reason: 'unused' },
  ]));
  assert.deepEqual(result.changes.map((change) => [change.operation, change.relativePath, change.additions, change.deletions]),
    [['edit', 'src/Login.jsx', 1, 0], ['create', 'src/validateLogin.js', 1, 0], ['delete', 'README.md', 0, 1]]);
  const it1 = newVersion({ kind: 'proposal', label: 'Iteration 1', parentVersionId: s0.id, localSnapshotId: s0.id, roots: s0.roots, files: result.files });
  meta = store.publish(meta, it1);
  const reader = new VersionReader(store, meta, store.version(meta, it1.id));
  assert.match(reader.list({}), /src\/validateLogin\.js/);
  assert.doesNotMatch(reader.list({}), /README\.md/);
  assert.match(await reader.search({ query: 'validateLogin(values)' }), /Login\.jsx:2/);
  assert.match(reader.read({ fileId: find(it1, 'src/validateLogin.js').fileId }), /export const validateLogin/);
  // Iteration 2 builds on Iteration 1's proposed file.
  const helper = find(it1, 'src/validateLogin.js');
  const second = validateProposal(store, meta, it1, answer([{ operation: 'edit', sourceFileId: helper.fileId, reason: 'stricter', edits: [{ startLine: 1, before: ['export const validateLogin = () => true;'], after: ['export const validateLogin = (v) => Boolean(v.email);'] }] }]));
  const it2 = newVersion({ kind: 'proposal', label: 'Iteration 2', parentVersionId: it1.id, localSnapshotId: s0.id, roots: s0.roots, files: second.files });
  meta = store.publish(meta, it2);
  // A branch from Iteration 1 does not inherit Iteration 2.
  const branch = validateProposal(store, meta, it1, answer([{ operation: 'create', destinationRootId: 'r1', relativePath: 'src/other.js', reason: 'alt', content: 'x' }]));
  const it3 = newVersion({ kind: 'proposal', label: 'Iteration 3', parentVersionId: it1.id, localSnapshotId: s0.id, roots: s0.roots, files: branch.files });
  meta = store.publish(meta, it3);
  assert.match(new VersionReader(store, meta, it3).read({ fileId: helper.fileId }), /=> true;/);
  assert.deepEqual(ancestry(meta, it3.id).map((version) => version.label), ['Local S0', 'Iteration 1', 'Iteration 3']);
  assert.deepEqual(changedFiles(it1, it2).map((item) => [item.operation, item.relativePath]), [['edit', 'src/validateLogin.js']]);
  assert.deepEqual(changedFiles(s0, it2).map((item) => item.operation).sort(), ['create', 'delete', 'edit']);
  // Reviews: deleted files stay viewable through the parent; line numbers come from Novi.
  const deletedReview = reviewFile(store, meta, s0, it1, readme.fileId);
  assert.deepEqual([deletedReview.operation, deletedReview.proposedText, deletedReview.lines[0]], ['delete', null, { type: 'remove', oldNumber: 1, newNumber: null, text: '# App' }]);
  const editReview = reviewFile(store, meta, s0, it1, login.fileId);
  assert.deepEqual(editReview.lines.map((line) => [line.type, line.oldNumber, line.newNumber]), [['context', 1, 1], ['add', null, 2], ['context', 2, 3], ['context', 3, 4]]);
  // Unreferenced blobs are cleaned; the project folder never changed.
  store.cleanup(meta);
  assert.equal(readFileSync(join(project, 'README.md'), 'utf8'), '# App');
  const objects = readdirSync(join(store.dir('acct', meta.id), 'objects'));
  assert(objects.every((name) => /^[0-9a-f]{64}$/.test(name)));
});

test('edits preserve CRLF, BOM and missing final newline; edge positions are exact', () => {
  const issues: string[] = [];
  assert.equal(applyEdits('a\r\nb\r\n', [{ startLine: 2, before: ['b'], after: ['B', 'C'] }], 'x', issues), 'a\r\nB\r\nC\r\n');
  assert.equal(applyEdits('a\nb', [{ startLine: 3, before: [], after: ['c'] }], 'x', issues), 'a\nb\nc');
  assert.equal(applyEdits('a\nb\n', [{ startLine: 1, before: [], after: ['top'] }], 'x', issues), 'top\na\nb\n');
  assert.equal(applyEdits('a\nb\n', [{ startLine: 1, before: ['a', 'b'], after: [] }], 'x', issues), '');
  assert.equal(applyEdits('', [{ startLine: 1, before: [], after: ['first'] }], 'x', issues), 'first\n');
  assert.equal(applyEdits('x\nx\nx\n', [{ startLine: 2, before: ['x'], after: ['y'] }], 'x', issues), 'x\ny\nx\n', 'repeated lines are addressed by number');
  assert.equal(applyEdits('héllo ✓\n', [{ startLine: 1, before: ['héllo ✓'], after: ['ünïcode ✓'] }], 'x', issues), 'ünïcode ✓\n');
  // Edits all refer to the original text, applied without shifting each other.
  assert.equal(applyEdits('1\n2\n3\n4\n', [{ startLine: 1, before: ['1'], after: ['one', 'uno'] }, { startLine: 4, before: ['4'], after: ['four'] }], 'x', issues), 'one\nuno\n2\n3\nfour\n');
  assert.deepEqual(issues, []);
  for (const [edits, pattern] of [
    [[{ startLine: 1, before: ['nope'], after: ['x'] }], /not "nope"/],
    [[{ startLine: 9, before: ['a'], after: ['x'] }], /file has 2 lines/],
    [[{ startLine: 1, before: ['a', 'b'], after: ['x'] }, { startLine: 2, before: ['b'], after: ['y'] }], /overlap/],
    [[{ startLine: 2, before: [], after: ['x'] }, { startLine: 2, before: [], after: ['y'] }], /overlap/],
    [[{ startLine: 1, before: ['a'], after: ['x'] }, { startLine: 2, before: [], after: ['y'] }], /overlap/],
    [[{ startLine: 1, before: [], after: [] }], /changes nothing/],
  ] as const) {
    const found: string[] = [];
    assert.equal(applyEdits('a\nb\n', edits as never, 'x', found), null);
    assert.match(found.join('\n'), pattern);
  }
});

test('invalid answers are rejected with precise issues and never stored', async (t) => {
  const { store, meta, s0 } = await session(t);
  const login = find(s0, 'src/Login.jsx');
  assert.throws(() => parseProposal('{"schemaVersion":1,'), /not complete JSON/);
  assert.throws(() => parseProposal('x'.repeat(5 * 1024 * 1024)), /larger than/);
  assert.throws(() => parseProposal({ ...answer([]), extra: 1 }), /unexpected field "extra"/);
  assert.throws(() => parseProposal({ ...answer([]), schemaVersion: 2 }), /schemaVersion must be 1/);
  assert.throws(() => parseProposal(answer([{ operation: 'rename' } as never])), /must be "edit", "create", or "delete"/);
  assert.throws(() => parseProposal(answer([{ operation: 'edit', sourceFileId: 'a', reason: 'r', edits: [{ startLine: 1, before: ['a\nb'], after: [] }] }])), /must not contain line breaks/);
  assert.deepEqual(parseProposal(JSON.stringify(answer([]))).changes, []);
  const before = readdirSync(join(store.dir('acct', meta.id), 'objects')).length;
  const cases: Array<[ProposalResponse['changes'], RegExp]> = [
    [[{ operation: 'edit', sourceFileId: 'f_unknown', reason: 'r', edits: [{ startLine: 1, before: ['a'], after: ['b'] }] }], /is not in Local S0/],
    [[{ operation: 'create', destinationRootId: 'r9', relativePath: 'a.js', reason: 'r', content: 'x' }], /not a source root/],
    [[{ operation: 'create', destinationRootId: 'r1', relativePath: '../escape.js', reason: 'r', content: 'x' }], /"\." or "\.\."/],
    [[{ operation: 'create', destinationRootId: 'r1', relativePath: '/abs.js', reason: 'r', content: 'x' }], /relative/],
    [[{ operation: 'create', destinationRootId: 'r1', relativePath: 'src/LOGIN.jsx', reason: 'r', content: 'x' }], /collides/],
    [[{ operation: 'create', destinationRootId: 'r1', relativePath: 'src', reason: 'r', content: 'x' }], /collides/],
    [[{ operation: 'create', destinationRootId: 'r1', relativePath: 'src/Login.jsx/x.js', reason: 'r', content: 'x' }], /collides/],
    [[{ operation: 'create', destinationRootId: 'r1', relativePath: 'con.txt', reason: 'r', content: 'x' }], /reserved Windows name/],
    [[{ operation: 'create', destinationRootId: 'r1', relativePath: 'a?.js', reason: 'r', content: 'x' }], /not allowed/],
    [[{ operation: 'delete', sourceFileId: login.fileId, reason: 'r' }, { operation: 'edit', sourceFileId: login.fileId, reason: 'r', edits: [{ startLine: 1, before: ['export function Login() {'], after: ['x'] }] }], /same file/],
    [[{ operation: 'edit', sourceFileId: login.fileId, reason: 'r', edits: [{ startLine: 1, before: ['export function Login() {'], after: ['export function Login() {'] }] }], /unchanged/],
  ];
  for (const [changes, pattern] of cases) {
    assert.throws(() => validateProposal(store, meta, s0, answer(changes)), (error: unknown) => error instanceof ProposalInvalid && pattern.test(error.message), String(pattern));
  }
  assert.equal(readdirSync(join(store.dir('acct', meta.id), 'objects')).length, before, 'nothing stored from rejected proposals');
  // Case-only rename by delete + create is allowed.
  const renamed = validateProposal(store, meta, s0, answer([{ operation: 'delete', sourceFileId: login.fileId, reason: 'r' }, { operation: 'create', destinationRootId: 'r1', relativePath: 'src/login.jsx', reason: 'r', content: 'x\n' }]));
  assert(renamed.files.some((entry) => entry.relativePath === 'src/login.jsx'));
  assert.equal(pathProblem('ok/dir/file.ts'), null);
  assert.match(pathProblem('a\\b')!, /"\/"/);
  assert.match(pathProblem('trailing. ')!, /dot or space/);
});

test('three-way refresh: carries proposals, keeps local edits, agrees, and flags conflicts', () => {
  const entry = (path: string, content: string): FileEntry => ({ fileId: `f_${path}`, rootId: 'r1', relativePath: path, contentId: content, bytes: 1, lines: 1, eol: 'lf', finalNewline: true, bom: false });
  const base = [entry('same', 'b'), entry('proposed', 'b'), entry('local', 'b'), entry('agree', 'b'), entry('both', 'b'), entry('editdel', 'b'), entry('deledit', 'b'), entry('localdel', 'b')];
  const local = [entry('same', 'b'), entry('proposed', 'b'), entry('local', 'L'), entry('agree', 'X'), entry('both', 'L'), entry('deledit', 'L'), entry('newlocal', 'n'), entry('createboth', 'L')];
  const proposed = [entry('same', 'b'), entry('proposed', 'P'), entry('local', 'b'), entry('agree', 'X'), entry('both', 'P'), entry('editdel', 'P'), entry('localdel', 'b'), entry('createboth', 'P'), entry('newproposed', 'p')];
  const result = threeWay({ base, local, proposed });
  const files = Object.fromEntries(result.files.map((item) => [item.relativePath, item.contentId]));
  assert.deepEqual(files, { same: 'b', proposed: 'P', local: 'L', agree: 'X', newlocal: 'n', newproposed: 'p' });
  assert.deepEqual(result.conflicts.map((conflict) => conflict.key.split('\0')[1]).sort(), ['both', 'createboth', 'deledit', 'editdel']);
  assert(!('localdel' in files), 'a local deletion of an unproposed file is kept');
});

test('diff helper counts lines and handles creation and deletion', () => {
  assert.deepEqual([diffText(null, 'a\nb\n').additions, diffText('a\n', null).deletions], [2, 1]);
  assert.deepEqual(diffText('a\nb\n', 'a\nc\n').lines.map((line) => line.type), ['context', 'remove', 'add']);
  assert.deepEqual(textMetadata(Buffer.from('﻿x\r\n')), { lines: 1, eol: 'crlf', finalNewline: true, bom: true });
});

test('project files are owner-scoped and ids are validated', async (t) => {
  const { store, meta } = await session(t);
  assert.throws(() => store.load('other', meta.id), /no longer available|another account/);
  assert.throws(() => store.load('acct', '../escape'), /Invalid project/);
  assert.throws(() => store.dir('../x', meta.id), /Invalid account/);
  assert.throws(() => store.version(meta, 'not-a-version'), /not part of the project/);
  assert.throws(() => store.content('acct', meta.id, '../../etc/passwd'), /Invalid content/);
  assert.equal(store.load('acct', meta.id).versions.length, 1);
  assert(statSync(join(store.dir('acct', meta.id), 'project.json')).isFile());
});

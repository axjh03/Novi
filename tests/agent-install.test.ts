import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { c } from 'tar';
import { EngineInstaller, extractRelease, newerVersion, validateRelease } from '../src/main/services/codingAgents/install';
import { CODEX_TRIPLES, engineRuntime } from '../src/main/services/codingAgents/runtime';

test('agent updates compare numeric versions without treating platform suffixes as updates', () => {
  assert.equal(newerVersion('0.163.0', '0.162.1-linux-x64'), true);
  assert.equal(newerVersion('0.162.1', '0.162.1-darwin-arm64'), false);
  assert.equal(newerVersion('1.9.0', '1.10.0'), false);
});

test('agent releases reject external downloads and missing or malformed npm checksums', () => {
  const release = { version: '1.2.3', url: 'https://registry.npmjs.org/@openai/codex/-/codex.tgz', archive: true, integrity: `sha512-${Buffer.alloc(64).toString('base64')}` };
  assert.deepEqual(validateRelease('codex', release), release);
  for (const patch of [{ url: 'https://evil.test/codex.tgz' }, { url: 'http://registry.npmjs.org/@openai/codex/x' }, { integrity: null }, { integrity: 'sha512-bad' }, { version: '../../outside' }]) {
    assert.throws(() => validateRelease('codex', { ...release, ...patch }));
  }
  assert.throws(() => validateRelease('antigravity', { ...release, url: 'https://storage.googleapis.com/another-bucket/agy' }));
});

test('agent archives reject links before extracting files', { skip: process.platform === 'win32' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'novi-archive-'));
  try {
    const source = join(root, 'source'); mkdirSync(source);
    symlinkSync('/etc/passwd', join(source, 'escape'));
    const archive = join(root, 'agent.tgz');
    await c({ gzip: true, cwd: source, file: archive }, ['escape']);
    await assert.rejects(extractRelease(archive, join(root, 'output')), /unsafe path or link/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('install publishes a verified runtime and preserves it when an update download is damaged', { skip: process.platform === 'win32' }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'novi-agent-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vendor = join(root, 'source', 'package', 'vendor', CODEX_TRIPLES[`${process.platform}-${process.arch}`]);
  mkdirSync(join(vendor, 'bin'), { recursive: true });
  mkdirSync(join(vendor, 'codex-path'));
  writeFileSync(join(vendor, 'bin', 'codex'), '#!/bin/sh\necho "codex 1.2.3"\n');
  chmodSync(join(vendor, 'bin', 'codex'), 0o755);
  const archive = join(root, 'agent.tgz');
  await c({ gzip: true, cwd: join(root, 'source'), file: archive }, ['package']);
  const bytes = readFileSync(archive), integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  let corrupt = false;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/latest')) return Response.json({ version: '1.2.3' });
    if (!url.endsWith('.tgz')) return Response.json({ version: `1.2.3-${process.platform}-${process.arch}`, dist: { tarball: 'https://registry.npmjs.org/@openai/codex/-/codex.tgz', integrity } });
    return new Response(corrupt ? Buffer.from('bad archive') : bytes);
  });
  const location = { packaged: true, resourcesPath: join(root, 'no-bundle'), managedPath: join(root, 'managed') };
  const installer = new EngineInstaller(location);
  assert.equal((await installer.check('codex')).updateAvailable, true);
  try { await installer.install('codex'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('This sandbox blocks child-process execution.'); return; }
    throw error;
  }
  const runtime = await engineRuntime('codex', location);
  assert(runtime.executable.startsWith(location.managedPath));
  assert.equal((await installer.check('codex')).updateAvailable, false);
  const pointer = readFileSync(join(location.managedPath, 'codex', 'current.json'), 'utf8');
  corrupt = true;
  await assert.rejects(installer.install('codex'), /checksum failed/);
  assert.equal(readFileSync(join(location.managedPath, 'codex', 'current.json'), 'utf8'), pointer);
  assert.equal((await engineRuntime('codex', location)).executable, runtime.executable);
});

test('uninstall removes managed agent versions, suppresses bundled fallback, and preserves other data', async t => {
  const root = mkdtempSync(join(tmpdir(), 'novi-agent-remove-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const location = { packaged: true, resourcesPath: join(root, 'bundle'), managedPath: join(root, 'managed') };
  const engineDir = join(location.managedPath, 'codex');
  const id = randomUUID(), old = randomUUID();
  for (const directory of [location.resourcesPath, join(engineDir, id), join(engineDir, old)]) {
    mkdirSync(join(directory, 'engines', 'codex'), { recursive: true });
    writeFileSync(join(directory, 'engines', 'codex', 'binary'), 'runtime fixture');
    writeFileSync(join(directory, 'engines', 'manifest.json'), JSON.stringify({ engines: { codex: { version: '1.2.3', executable: 'binary', pathDirs: [], files: {} } } }));
  }
  writeFileSync(join(engineDir, 'current.json'), JSON.stringify({ id }));
  mkdirSync(join(location.managedPath, 'claude'));
  writeFileSync(join(location.managedPath, 'claude', 'keep'), 'other agent');
  writeFileSync(join(root, 'project-history'), 'keep history');
  const installer = new EngineInstaller(location);
  assert((await engineRuntime('codex', location)).executable.startsWith(engineDir));
  await assert.rejects(installer.uninstall('../bundle' as any), /Choose/);
  symlinkSync(location.resourcesPath, join(location.managedPath, 'antigravity'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(installer.uninstall('antigravity'), /directory is a link/);
  assert.equal(existsSync(join(location.resourcesPath, 'current.json')), false);
  installer['installing'].add('codex');
  await assert.rejects(installer.uninstall('codex'), /already being changed/);
  installer['installing'].delete('codex');
  await installer.uninstall('codex');
  assert.equal(existsSync(join(engineDir, id)), false);
  assert.equal(existsSync(join(engineDir, old)), false);
  assert.equal(readFileSync(join(root, 'project-history'), 'utf8'), 'keep history');
  assert.equal(readFileSync(join(location.managedPath, 'claude', 'keep'), 'utf8'), 'other agent');
  assert.equal(existsSync(join(location.resourcesPath, 'engines', 'codex', 'binary')), true);
  await assert.rejects(engineRuntime('codex', location), /uninstalled/);
  await assert.rejects(engineRuntime('codex', { ...location }), /uninstalled/, 'removal survives restart');
  await installer.uninstall('codex');
});

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { t, x } from 'tar';
import type { EngineId, EngineUpdate } from '../../../shared/localCoding';
import { atomicJSON } from '../storage';
import { UserError } from '../validation';
import { CODEX_TRIPLES, engineEnvironment, engineRuntime, isMusl, type Manifest, type RuntimeLocation } from './runtime';

const execute = promisify(execFile);
const target = `${process.platform}-${process.arch}`;
const exe = (name: string) => process.platform === 'win32' ? `${name}.exe` : name;
const REGISTRY = 'https://registry.npmjs.org';
const AGY_UPDATES = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app';

export interface EngineRelease { version: string; url: string; integrity: string | null; archive: boolean }

export function newerVersion(latest: string, current: string) {
  const parse = (value: string) => value.match(/^(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  const a = parse(latest), b = parse(current);
  if (!a || !b) return latest !== current;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function validateRelease(engine: EngineId, value: EngineRelease): EngineRelease {
  const url = new URL(value.url);
  const official = engine === 'antigravity'
    ? url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/antigravity-public/antigravity-cli/')
    : url.hostname === 'registry.npmjs.org' && url.pathname.startsWith(engine === 'codex' ? '/@openai/codex/' : '/@anthropic-ai/claude-agent-sdk-');
  if (!official || url.protocol !== 'https:' || url.username || url.password || url.port || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value.version)) throw new UserError('The agent publisher returned an invalid release.');
  if (value.integrity !== null && !/^(?:sha512-[A-Za-z0-9+/]{86}==|sha256-[A-Za-z0-9+/]{43}=)$/.test(value.integrity)) throw new UserError('The agent release has an invalid checksum.');
  if (engine !== 'antigravity' && !value.integrity) throw new UserError('The agent release is missing its checksum.');
  return value;
}

async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new UserError(`Could not check agent updates (HTTP ${response.status}). Try again.`);
  return response.json();
}

export async function latestRelease(engine: EngineId): Promise<EngineRelease> {
  if (!CODEX_TRIPLES[target]) throw new UserError(`Agent installation is not supported on ${target}.`);
  if (engine === 'antigravity') {
    const os = process.platform === 'win32' ? 'windows' : process.platform;
    const arch = process.arch === 'x64' ? 'amd64' : 'arm64';
    const data = await json(`${AGY_UPDATES}/manifests/${os}_${arch}.json`);
    const version = typeof data.url === 'string' ? data.url.match(/\/antigravity-cli\/(\d+\.\d+\.\d+)-/)?.[1] : null;
    if (!version) throw new UserError('Antigravity returned an unrecognized release. Try again later.');
    if (data.sha256 != null && (typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sha256))) throw new UserError('Antigravity returned an invalid checksum.');
    return validateRelease(engine, { version, url: data.url, archive: process.platform !== 'win32',
      integrity: typeof data.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(data.sha256) ? `sha256-${Buffer.from(data.sha256, 'hex').toString('base64')}` : null });
  }
  let data: any;
  if (engine === 'codex') {
    const latest = await json(`${REGISTRY}/@openai%2Fcodex/latest`);
    if (!/^\d+\.\d+\.\d+$/.test(latest.version)) throw new UserError('Codex returned an invalid version.');
    data = await json(`${REGISTRY}/@openai%2Fcodex/${latest.version}-${target}`);
  } else data = await json(`${REGISTRY}/@anthropic-ai%2Fclaude-agent-sdk-${target}${isMusl() ? '-musl' : ''}/latest`);
  return validateRelease(engine, { version: data.version, url: data.dist?.tarball, integrity: data.dist?.integrity ?? null, archive: true });
}

export async function downloadRelease(release: EngineRelease, file: string) {
  const response = await fetch(release.url, { redirect: 'error', signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok || !response.body) throw new UserError(`Agent download failed (HTTP ${response.status}).`);
  const [algorithm, expected] = (release.integrity || 'sha256-').split('-');
  const hash = createHash(algorithm);
  let bytes = 0;
  await pipeline(Readable.fromWeb(response.body as any), async function* (source) {
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > 600 * 1024 * 1024) throw new UserError('The agent download exceeds the size limit.');
      hash.update(chunk); yield chunk;
    }
  }, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
  if (expected && hash.digest('base64') !== expected) throw new UserError('Agent download checksum failed. The previous installation was preserved.');
}

export async function extractRelease(archive: string, directory: string) {
  let size = 0, files = 0;
  // Inspect before extraction; no archive may create links or escape its staging directory.
  const parser = t({ strict: true, onReadEntry: entry => {
    const path = entry.path.replace(/\\/g, '/');
    if (path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').includes('..') || !['File', 'Directory'].includes(entry.type)) parser.abort(new UserError('The agent archive contains an unsafe path or link.'));
    size += entry.size; files++;
    if (size > 2 * 1024 * 1024 * 1024 || files > 20_000) parser.abort(new UserError('The agent archive exceeds the extraction limit.'));
  } });
  await pipeline(createReadStream(archive), parser);
  await mkdir(directory, { recursive: true });
  await x({ file: archive, cwd: directory, strict: true, noChmod: true });
}

async function hashTree(root: string) {
  const files: Record<string, string> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name), hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    files[relative(root, path).split('\\').join('/')] = hash.digest('hex');
  }
  return files;
}

export class EngineInstaller {
  private installing = new Set<EngineId>();
  constructor(private location: RuntimeLocation) {}

  async check(engine: EngineId): Promise<EngineUpdate> {
    const release = await latestRelease(engine);
    const current = await engineRuntime(engine, this.location).catch(() => null);
    return { latestVersion: release.version, updateAvailable: !current || newerVersion(release.version, current.version) };
  }

  async install(engine: EngineId) {
    if (!this.location.managedPath) throw new UserError('Agent installation is unavailable.');
    if (this.installing.has(engine)) throw new UserError('This agent is already being installed.');
    this.installing.add(engine);
    const id = randomUUID(), root = join(this.location.managedPath, engine, id);
    let published = false;
    try {
      const release = await latestRelease(engine);
      await mkdir(root, { recursive: true, mode: 0o700 });
      const archive = join(root, 'download');
      await downloadRelease(release, archive);
      const extracted = join(root, 'extracted'), destination = join(root, 'engines', engine);
      let executable: string, pathDirs: string[] = [];
      if (release.archive) await extractRelease(archive, extracted);
      if (engine === 'codex') {
        await cp(join(extracted, 'package', 'vendor', CODEX_TRIPLES[target]), destination, { recursive: true });
        executable = `bin/${exe('codex')}`; pathDirs = ['codex-path'];
      } else if (engine === 'claude') {
        await cp(join(extracted, 'package'), destination, { recursive: true });
        executable = exe('claude');
      } else {
        await mkdir(destination, { recursive: true });
        executable = exe('agy');
        await cp(release.archive ? join(extracted, 'antigravity') : archive, join(destination, executable));
      }
      const binary = join(destination, executable);
      if (process.platform !== 'win32') {
        await chmod(binary, 0o755);
        for (const dir of pathDirs) for (const file of await readdir(join(destination, dir))) await chmod(join(destination, dir, file), 0o755);
      }
      const home = join(root, 'check-home');
      await mkdir(join(home, 'tmp'), { recursive: true });
      const { stdout } = await execute(binary, ['--version'], { env: engineEnvironment(home, { DISABLE_AUTOUPDATER: '1', AGY_CLI_DISABLE_AUTO_UPDATE: 'true' }, []), windowsHide: true, timeout: 30_000 });
      if (!/\d+\.\d+\.\d+/.test(stdout)) throw new UserError('The downloaded agent did not report a valid version.');
      const manifest: Manifest = { engines: { [engine]: { version: release.version, executable, pathDirs, files: await hashTree(destination) } } };
      await writeFile(join(root, 'engines', 'manifest.json'), JSON.stringify(manifest));
      await engineRuntime(engine, { packaged: true, resourcesPath: root });
      await Promise.all([rm(archive, { force: true }), rm(extracted, { recursive: true, force: true }), rm(home, { recursive: true, force: true })]);
      atomicJSON(join(this.location.managedPath, engine, 'current.json'), { id });
      published = true;
      // shortcut: retain previous versions so running agents keep their files; prune on startup if disk use becomes significant.
    } finally {
      try { if (!published) await rm(root, { recursive: true, force: true }); }
      finally { this.installing.delete(engine); }
    }
  }
}

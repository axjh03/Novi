import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import type { EngineId } from '../../../shared/localCoding';

// Prefer runtimes installed in Settings, then bundled engines or development dependencies.

const req = typeof require === 'function' ? require : createRequire(import.meta.url);

export const CODEX_TRIPLES: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl',
  'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
};

export interface EngineRuntime { executable: string; pathDirs: string[]; version: string }
export interface RuntimeLocation { packaged: boolean; resourcesPath: string; managedPath?: string }

const exe = (name: string) => process.platform === 'win32' ? `${name}.exe` : name;
const target = `${process.platform}-${process.arch}`;

export function isMusl() {
  if (process.platform !== 'linux') return false;
  try { return !(process.report?.getReport() as { header?: { glibcVersionRuntime?: string } })?.header?.glibcVersionRuntime; }
  catch { return false; }
}

function developmentRuntime(engine: EngineId): EngineRuntime {
  if (engine === 'codex') {
    const triple = CODEX_TRIPLES[target];
    if (!triple) throw new Error(`Codex is not available for ${target}.`);
    const root = join(dirname(req.resolve(`@openai/codex-${target}/package.json`)), 'vendor', triple);
    return { executable: join(root, 'bin', exe('codex')), pathDirs: [join(root, 'codex-path')], version: JSON.parse(readFileSync(join(root, '..', '..', 'package.json'), 'utf8')).version };
  }
  if (engine === 'claude') {
    const name = `@anthropic-ai/claude-agent-sdk-${target}${isMusl() ? '-musl' : ''}`;
    const root = dirname(req.resolve(`${name}/package.json`));
    return { executable: join(root, exe('claude')), pathDirs: [], version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version };
  }
  // antigravity: expect `agy` on PATH or in node_modules/.bin during development.
  // In a packaged build it comes from the engines/ directory via packagedRuntime.
  try {
    const root = dirname(req.resolve('antigravity/package.json'));
    return { executable: join(root, 'bin', exe('agy')), pathDirs: [], version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version };
  } catch {
    // Fall back to resolving `agy` from system PATH in development.
    const executable = (process.env.PATH ?? '').split(delimiter).map(dir => resolve(dir, exe('agy'))).find(path => {
      try { return statSync(path).isFile(); } catch { return false; }
    });
    return { executable: executable ?? exe('agy'), pathDirs: [], version: 'unknown' };
  }
}

export interface Manifest { engines: Record<string, { version: string; executable: string; pathDirs: string[]; files: Record<string, string> }> }

function packagedRuntime(engine: EngineId, resourcesPath: string): EngineRuntime {
  const root = join(resourcesPath, 'engines');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Manifest;
  const item = manifest.engines[engine];
  if (!item) throw new Error('This Novi build does not include that engine.');
  return { executable: join(root, engine, item.executable), pathDirs: item.pathDirs.map((dir) => join(root, engine, dir)), version: item.version };
}

const verified = new Map<string, Promise<void>>();

async function sha256(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Packaged runtimes are checked against the build manifest once per app run; damaged files disable the engine. */
async function verify(engine: EngineId, resourcesPath: string) {
  const root = join(resourcesPath, 'engines');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Manifest;
  for (const [file, expected] of Object.entries(manifest.engines[engine]?.files ?? {})) {
    const path = join(root, engine, file);
    if (!existsSync(path) || await sha256(path) !== expected) throw new Error(`${file} is missing or damaged.`);
  }
}

/** Locates an engine runtime and confirms it is present (and, when packaged, intact). */
export async function engineRuntime(engine: EngineId, location: RuntimeLocation): Promise<EngineRuntime> {
  if (location.managedPath) {
    const pointer = join(location.managedPath, engine, 'current.json');
    if (existsSync(pointer)) {
      const record = JSON.parse(readFileSync(pointer, 'utf8'));
      if (record.disabled === true) throw new Error('This agent was uninstalled. Install it to use Local Coding.');
      const id = record.id;
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('The installed agent record is invalid. Install the agent again.');
      location = { packaged: true, resourcesPath: join(location.managedPath, engine, id) };
    }
  }
  const engineLabel = engine === 'codex' ? 'Codex' : engine === 'claude' ? 'Claude Code' : 'Antigravity (agy)';
  let runtime: EngineRuntime;
  try { runtime = location.packaged ? packagedRuntime(engine, location.resourcesPath) : developmentRuntime(engine); }
  catch { throw new Error(`${engineLabel} is not installed. Install it in Settings › API Management › Local Coding agents.`); }
  if (!existsSync(runtime.executable) || !statSync(runtime.executable).isFile()) throw new Error(`${engineLabel} is missing. Install it in Settings › API Management › Local Coding agents.`);
  if (location.packaged) {
    const key = `${engine}:${location.resourcesPath}`;
    if (!verified.has(key)) verified.set(key, verify(engine, location.resourcesPath).catch((error) => { verified.delete(key); throw error; }));
    try { await verified.get(key); }
    catch (error) { throw new Error(`The ${engineLabel} engine files are damaged (${error instanceof Error ? error.message : 'checksum mismatch'}). Install the agent again in Settings.`); }
  }
  return runtime;
}

/** A small environment for engine processes: no inherited secrets, private home folders, proxy settings kept. */
export function engineEnvironment(home: string, extra: Record<string, string>, pathDirs: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  const keep = process.platform === 'win32'
    ? ['SystemRoot', 'SYSTEMROOT', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']
    : ['LANG', 'LC_ALL', 'LC_CTYPE', 'TZ'];
  for (const name of [...keep, 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS']) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  const system = process.platform === 'win32'
    ? [join(process.env.SystemRoot || 'C:\\Windows', 'System32'), process.env.SystemRoot || 'C:\\Windows']
    : ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  env.PATH = [...pathDirs, ...system].join(process.platform === 'win32' ? ';' : ':');
  env.HOME = home;
  env.TMPDIR = join(home, 'tmp');
  if (process.platform === 'win32') Object.assign(env, { USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'), LOCALAPPDATA: join(home, 'AppData', 'Local'), TEMP: join(home, 'tmp'), TMP: join(home, 'tmp') });
  return { ...env, ...extra };
}

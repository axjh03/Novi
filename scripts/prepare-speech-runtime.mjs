import { createHash } from 'node:crypto';
import { x as extract } from 'tar';
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arch } from 'builder-util';

// npm ci installs host-only optional dependencies; cross-architecture packages need their own addon.
export default async function prepareSpeechRuntime(context) {
  const platform = context.electronPlatformName === 'win32' ? 'win' : context.electronPlatformName;
  const name = `sherpa-onnx-${platform}-${Arch[context.arch]}`;
  const root = context.packager.projectDir;
  const destination = join(root, 'node_modules', name);
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')).packages[`node_modules/${name}`];
  if (!lock?.integrity?.startsWith('sha512-')) throw new Error(`No pinned speech runtime for ${name}`);
  try {
    const installed = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'));
    await access(join(destination, 'sherpa-onnx.node'));
    if (installed.version === lock.version) return;
  } catch { /* Fetch the missing target runtime below. */ }
  const response = await fetch(lock.resolved, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Speech runtime download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== lock.integrity) throw new Error('Speech runtime checksum mismatch. Packaging stopped.');
  const staging = await mkdtemp(join(tmpdir(), 'novi-speech-runtime-'));
  try {
    const archive = join(staging, 'runtime.tgz');
    await writeFile(archive, bytes);
    await extract({ file: archive, cwd: staging, strict: true });
    await access(join(staging, 'package', 'sherpa-onnx.node'));
    await cp(join(staging, 'package'), destination, { recursive: true });
  } finally { await rm(staging, { recursive: true, force: true }); }
}

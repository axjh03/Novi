import { createHash } from 'node:crypto';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Arch } from 'builder-util';

// Bundles the pinned Local Coding engine runtimes for the exact target being packaged.
// Versions and SHA-512 integrity come from package-lock.json; anything missing or altered stops packaging.

const CODEX_TRIPLES = {
  'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl',
  'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
};

async function lockEntry(name) {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const entry = lock.packages[`node_modules/${name}`];
  if (!entry?.resolved || !entry.integrity) throw new Error(`${name} is not pinned in package-lock.json. Packaging stopped.`);
  return entry;
}

/** Downloads a pinned npm tarball and verifies it against the lockfile's SHA-512 integrity. */
async function fetchVerified(entry, staging, label) {
  const response = await fetch(entry.resolved, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok) throw new Error(`${label} download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const [algorithm, expected] = entry.integrity.split('-');
  if (algorithm !== 'sha512' || createHash('sha512').update(bytes).digest('base64') !== expected) throw new Error(`${label} integrity check failed. Packaging stopped.`);
  const archive = join(staging, `${label}.tgz`);
  await writeFile(archive, bytes);
  const out = join(staging, label);
  await mkdir(out, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '-C', out]);
  return join(out, 'package');
}

async function hashTree(root) {
  const files = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath || entry.path, entry.name);
    files[relative(root, path).split('\\').join('/')] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return files;
}

async function makeExecutable(root) {
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath || entry.path, entry.name);
    await chmod(path, entry.isDirectory() ? 0o755 : (await stat(path)).mode & 0o111 ? 0o755 : 0o644);
  }
}

export default async function bundleCodingAgents(context) {
  const platform = context.electronPlatformName, arch = Arch[context.arch];
  const target = `${platform}-${arch}`;
  const triple = CODEX_TRIPLES[target];
  if (!triple) throw new Error(`No Codex runtime for ${target}. Packaging stopped.`);
  const exe = (name) => platform === 'win32' ? `${name}.exe` : name;
  const engines = join(context.packager.getResourcesDir(context.appOutDir), 'engines');
  const staging = await mkdtemp(join(tmpdir(), 'novi-engines-'));
  try {
    await rm(engines, { recursive: true, force: true });
    const manifest = { engines: {} };

    // Codex: the whole platform vendor folder (executable plus its companion tools and resources).
    const codexEntry = await lockEntry(`@openai/codex-${target}`);
    const codexPackage = await fetchVerified(codexEntry, staging, `codex-${target}`);
    const codexDir = join(engines, 'codex');
    await cp(join(codexPackage, 'vendor', triple), codexDir, { recursive: true });
    await copyFile(new URL('../build/licenses/Apache-2.0.txt', import.meta.url), join(codexDir, 'LICENSE.txt'));
    await writeFile(join(codexDir, 'NOTICE.txt'), `OpenAI Codex CLI ${codexEntry.version}\nLicense: Apache-2.0\nSource: https://github.com/openai/codex\n`);
    if (platform !== 'win32') await makeExecutable(codexDir);
    manifest.engines.codex = { version: codexEntry.version, executable: `bin/${exe('codex')}`, pathDirs: ['codex-path'], files: await hashTree(codexDir) };

    // Claude: the Agent SDK's native runtime for this platform (glibc build on Linux, as the SDK selects).
    const claudeEntry = await lockEntry(`@anthropic-ai/claude-agent-sdk-${target}`);
    const claudePackage = await fetchVerified(claudeEntry, staging, `claude-${target}`);
    const claudeDir = join(engines, 'claude');
    await mkdir(claudeDir, { recursive: true });
    await copyFile(join(claudePackage, exe('claude')), join(claudeDir, exe('claude')));
    await copyFile(join(claudePackage, 'LICENSE.md'), join(claudeDir, 'LICENSE.md'));
    await writeFile(join(claudeDir, 'NOTICE.txt'), `Claude Agent SDK runtime ${claudeEntry.version}\nUse is governed by Anthropic's Commercial Terms of Service.\n`);
    if (platform !== 'win32') await chmod(join(claudeDir, exe('claude')), 0o755);
    manifest.engines.claude = { version: claudeEntry.version, executable: exe('claude'), pathDirs: [], files: await hashTree(claudeDir) };

    await writeFile(join(engines, 'manifest.json'), JSON.stringify(manifest, null, 2));
    // Smoke-test the packaged executables whenever the build host can run them.
    if (platform === process.platform && arch === process.arch) {
      execFileSync(join(codexDir, 'bin', exe('codex')), ['--version'], { timeout: 30_000, stdio: 'inherit' });
      execFileSync(join(claudeDir, exe('claude')), ['--version'], { timeout: 30_000, stdio: 'inherit', env: { ...process.env, DISABLE_AUTOUPDATER: '1' } });
    }
  } finally { await rm(staging, { recursive: true, force: true }); }
}

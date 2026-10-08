import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, copyFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Arch } from 'builder-util';

// Publisher SHA-256 checksums: https://github.com/cloudflare/cloudflared/releases/tag/2026.10.0
export const version = '2026.10.0';
export const assets = {
  'darwin-x64': ['cloudflared-darwin-amd64.tgz', '0560c9ab7281ac3f746055323623ed23bc0405b6dab9400474020cba33a978da'],
  'darwin-arm64': ['cloudflared-darwin-arm64.tgz', '72edfd3eea463aef4d5cb89e2e209cecb048cc756c2b01915de2e0ad7cb39830'],
  'win32-x64': ['cloudflared-windows-amd64.exe', '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'],
  'linux-x64': ['cloudflared-linux-amd64', 'd33ff2d14475178d2012c2c56beba87389ac5ded27649519f198a7d3134a99db'],
  'linux-arm64': ['cloudflared-linux-arm64', 'e6422b9d4f72d3194bc5a38676f13667c06666523217b842a877d72a80b5ac08'],
};

export async function downloadVerified(url, checksum) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Cloudflared download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Cloudflared checksum mismatch. Packaging stopped.');
  return bytes;
}

// afterPack runs for every target architecture, before platform signing.
export default async function bundleCloudflared(context) {
  const platform = context.electronPlatformName;
  const arch = Arch[context.arch];
  const asset = assets[`${platform}-${arch}`];
  if (!asset) throw new Error(`No bundled Cloudflared release for ${platform}-${arch}`);
  const directory = join(context.packager.getResourcesDir(context.appOutDir), 'cloudflared');
  const staging = await mkdtemp(join(tmpdir(), 'novi-cloudflared-'));
  try {
    const [name, checksum] = asset;
    const bytes = await downloadVerified(`https://github.com/cloudflare/cloudflared/releases/download/${version}/${name}`, checksum);
    const downloaded = join(staging, name);
    await writeFile(downloaded, bytes);
    if (name.endsWith('.tgz')) execFileSync('tar', ['-xzf', downloaded, '-C', staging, 'cloudflared']);
    const license = await fetch(`https://raw.githubusercontent.com/cloudflare/cloudflared/${version}/LICENSE`, { signal: AbortSignal.timeout(30000) });
    if (!license.ok) throw new Error('Could not include the Cloudflared license. Packaging stopped.');
    await mkdir(directory, { recursive: true });
    const executable = join(directory, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
    await copyFile(name.endsWith('.tgz') ? join(staging, 'cloudflared') : downloaded, executable);
    await chmod(executable, 0o755);
    await writeFile(join(directory, 'LICENSE'), await license.text());
    await writeFile(join(directory, 'VERSION'), `${version}\nSource: https://github.com/cloudflare/cloudflared\n`);
    // Smoke-test the actual packaged executable whenever the build host can run it.
    if (platform === process.platform && arch === process.arch) execFileSync(executable, ['--version'], { timeout: 15000, stdio: 'inherit' });
  } finally { await rm(staging, { recursive: true, force: true }); }
}

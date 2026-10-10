import { mkdtemp, cp, rm, access, copyFile, writeFile, readdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arch } from 'builder-util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ModelManager } from '../src/main/services/localModels.mjs';
import bundleCloudflared from './bundle-cloudflared.mjs';

// Fail packaging if required assets are missing; users should not discover this offline.
export default async function bundleRuntime(context) {
  const resources = context.packager.getResourcesDir(context.appOutDir);
  const platform = context.electronPlatformName === 'win32' ? 'win' : context.electronPlatformName;
  const native = join(resources, 'app.asar.unpacked', 'node_modules', `sherpa-onnx-${platform}-${Arch[context.arch]}`);
  await access(join(native, 'sherpa-onnx.node'));
  const staging = await mkdtemp(join(tmpdir(), 'novi-speech-'));
  const models = new ModelManager(staging);
  try {
    for (const id of ['zipformer-en-small', 'silero-vad']) await models.download(id);
    execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./speech-runtime-smoke.ts', import.meta.url)), staging], { stdio: 'inherit', timeout: 120000 });
    await cp(models.root, join(resources, 'models'), { recursive: true });
    await copyFile(new URL('../build/licenses/Apache-2.0.txt', import.meta.url), join(resources, 'models', 'Apache-2.0.txt'));
    await writeFile(join(resources, 'models', 'NOTICE.txt'), models.registry.filter(m => ['zipformer-en-small', 'silero-vad'].includes(m.id))
      .map(m => `${m.name}\nLicense: ${m.license}\nSource: https://huggingface.co/${m.repository}/tree/${m.version}\n`).join('\n'));
    // Installer resources may be owned by root; every app user must be able to read them.
    const root = join(resources, 'models');
    await chmod(root, 0o755);
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      await chmod(join(entry.parentPath || entry.path, entry.name), entry.isDirectory() ? 0o755 : 0o644);
    }
    await bundleCloudflared(context);
  } finally {
    await models.shutdown();
    await rm(staging, { recursive: true, force: true });
  }
}

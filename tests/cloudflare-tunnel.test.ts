import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CloudflareTunnelService } from '../src/main/services/cloudflareTunnel';

test('Cloudflare prefers the bundled executable and otherwise searches PATH', () => {
  const root = mkdtempSync(join(tmpdir(), 'novi-tunnel-'));
  const originalResources = process.resourcesPath, originalPath = process.env.PATH;
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  try {
    Object.defineProperty(process, 'resourcesPath', { value: root, configurable: true });
    process.env.PATH = root;
    const bundled = join(root, 'cloudflared', name);
    mkdirSync(join(root, 'cloudflared'));
    writeFileSync(bundled, 'test'); chmodSync(bundled, 0o755);
    const service = new CloudflareTunnelService();
    assert.equal(service.findBinary(), bundled);
    assert.equal(service.isAvailable(), true);
    rmSync(join(root, 'cloudflared'), { recursive: true });
    const onPath = join(root, name);
    writeFileSync(onPath, 'test'); chmodSync(onPath, 0o755);
    // A system installation also remains a valid fallback.
    assert.ok([onPath, '/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared'].includes(service.findBinary()!));
  } finally {
    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true });
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

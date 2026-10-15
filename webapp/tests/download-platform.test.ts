import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDesktopPlatform } from '../src/lib/download-platform';

test('detects desktop platforms without guessing for mobile or unknown devices', () => {
  assert.equal(detectDesktopPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows');
  assert.equal(detectDesktopPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'mac');
  assert.equal(detectDesktopPlatform('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
  for (const ua of ['', 'Unknown', 'Mozilla/5.0 (Linux; Android 14)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17 like Mac OS X)', 'Mozilla/5.0 (iPad; CPU OS 17 like Mac OS X)', 'Mozilla/5.0 (X11; CrOS x86_64)']) assert.equal(detectDesktopPlatform(ua), null, ua);
  assert.equal(detectDesktopPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), null);
});

test('favicon embeds RGBA PNG images supported by the production decoder', async () => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(new URL('../src/app/favicon.ico', import.meta.url));
  assert.equal(bytes.readUInt16LE(2), 1, 'ICO image type');
  const count = bytes.readUInt16LE(4);
  assert.ok(count > 0);
  for (let index = 0; index < count; index++) {
    const offset = bytes.readUInt32LE(6 + index * 16 + 12);
    assert.equal(bytes.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes[offset + 25], 6, 'PNG color type must be RGBA');
  }
});

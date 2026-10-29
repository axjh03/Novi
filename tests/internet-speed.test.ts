import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testInternet } from '../src/main/services/internetSpeed';

test('internet check measures a bounded download without credentials', async t => {
  const times = [100, 125, 225];
  t.mock.method(performance, 'now', () => times.shift()!);
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://speed.cloudflare.com/__down?bytes=262144');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return new Response(new Uint8Array(262_144));
  });
  assert.equal(await testInternet(), '25 ms response · 21.0 Mbps sample download');
});

test('internet check handles offline, blocked, incomplete and oversized downloads', async t => {
  let mode = 'offline';
  t.mock.method(globalThis, 'fetch', async () => {
    if (mode === 'offline') throw new Error('Offline');
    if (mode === 'blocked') return new Response('', { status: 403 });
    return new Response(new Uint8Array(mode === 'short' ? 100 : 262_145));
  });
  for (mode of ['offline', 'blocked', 'short', 'oversized']) await assert.rejects(testInternet, /Internet speed test unavailable/);
});

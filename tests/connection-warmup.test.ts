import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import dc from 'node:diagnostics_channel';
import { ConnectionWarmer, warmupUrl } from '../src/main/services/connectionWarmup.ts';
import { newConnection } from '../src/shared/providers.ts';
import type { ProviderConnection, ProviderKind } from '../src/shared/types';

const connection = (provider: ProviderKind, extra: Partial<ProviderConnection> = {}): ProviderConnection =>
  ({ id: 'connection', name: 'Test', ...newConnection(provider).ai, model: 'test-model', ...extra });

async function fixture(delayMs = 0) {
  const requests: Array<{ method?: string; url?: string; headers: IncomingHttpHeaders }> = [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain request bodies */ }
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const body = JSON.stringify({ error: { type: 'authentication_error' } });
    response.writeHead(401, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    requests, base: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

test('warm-up URL targets the model list of the connection that will be used, with the request URL rules', () => {
  assert.equal(warmupUrl(connection('openai', { baseUrl: 'https://ignored.example/v1' })), 'https://api.openai.com/v1/models');
  assert.equal(warmupUrl(connection('anthropic')), 'https://api.anthropic.com/v1/models');
  assert.equal(warmupUrl(connection('gemini')), 'https://generativelanguage.googleapis.com/v1beta/models');
  assert.equal(warmupUrl(connection('compatible', { baseUrl: 'https://api.moonshot.cn/v1' })), 'https://api.moonshot.cn/v1/models');
  assert.equal(warmupUrl(connection('compatible', { baseUrl: 'http://localhost:1234/v1' })), 'http://localhost:1234/v1/models');
  assert.equal(warmupUrl(connection('compatible', { baseUrl: 'http://[::1]:1234/v1' })), 'http://[::1]:1234/v1/models');
  for (const baseUrl of ['http://192.168.1.5:1234/v1', 'ftp://example.com/v1', 'file:///tmp/v1', 'https://user:secret@example.com/v1', 'not a url'])
    assert.equal(warmupUrl(connection('compatible', { baseUrl })), null, baseUrl);
  assert.equal(warmupUrl(connection('openai', { enabled: false })), null);
  assert.equal(warmupUrl(connection('openai', { model: '' })), null);
  assert.equal(warmupUrl(undefined), null);
  assert.equal(warmupUrl(null), null);
});

test('warm-up sends one unauthenticated GET and no content', async t => {
  const server = await fixture();
  t.after(server.close);
  assert.equal(await new ConnectionWarmer().warm(`${server.base}/models`), true);
  assert.equal(server.requests.length, 1);
  const [request] = server.requests;
  assert.equal(request.method, 'GET');
  assert.equal(request.url, '/v1/models');
  for (const header of ['authorization', 'x-api-key', 'x-goog-api-key', 'content-type', 'content-length']) assert.equal(request.headers[header], undefined, header);
  assert.equal(await new ConnectionWarmer().warm(null), false);
  assert.equal(server.requests.length, 1);
});

test('warm-up is throttled per origin and never overlaps itself', async t => {
  const server = await fixture(100);
  t.after(server.close);
  let clock = 1_000_000;
  const warmer = new ConnectionWarmer(undefined, () => clock);
  const url = `${server.base}/models`;
  const first = warmer.warm(url);
  clock += 10_000;
  assert.equal(await warmer.warm(url), false, 'a warm-up already in flight is not repeated');
  assert.equal(await first, true);
  assert.equal(server.requests.length, 1);
  clock = 2_000_000;
  assert.equal(await warmer.warm(url), true);
  clock += 2_999;
  assert.equal(await warmer.warm(url), false, 'a recent warm-up is not repeated');
  clock += 1;
  assert.equal(await warmer.warm(url), true);
  assert.equal(server.requests.length, 3);
});

test('warm-up failures resolve false and do not block later attempts', async t => {
  const closed = await fixture();
  const url = `${closed.base}/models`;
  await closed.close();
  assert.equal(await new ConnectionWarmer().warm(url), false);
  let clock = 0, calls = 0;
  const warmer = new ConnectionWarmer(async () => { if (++calls === 1) throw new TypeError('fetch failed'); return new Response('{}'); }, () => clock);
  assert.equal(await warmer.warm('https://api.example.com/v1/models'), false);
  clock += 3_000;
  assert.equal(await warmer.warm('https://api.example.com/v1/models'), true);
  assert.equal(calls, 2);
  t.diagnostic('no unhandled rejection escaped');
});

test('warm-up reads only a bounded amount of a large response', async () => {
  let pulled = 0, cancelled = false;
  const chunk = new Uint8Array(16 * 1024);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulled += chunk.byteLength; controller.enqueue(chunk); },
    cancel() { cancelled = true; },
  });
  const warmer = new ConnectionWarmer(async () => new Response(body));
  assert.equal(await warmer.warm('https://api.example.com/v1/models'), true);
  assert.equal(cancelled, true);
  assert(pulled <= 128 * 1024, `pulled ${pulled} bytes`);
});

test('the next real request reuses the warmed connection', async t => {
  let connects = 0;
  const onConnect = () => { connects++; };
  dc.subscribe('undici:client:connected', onConnect);
  t.after(() => dc.unsubscribe('undici:client:connected', onConnect));
  const post = async (base: string) => { await (await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).text(); };

  const cold = await fixture();
  t.after(cold.close);
  await post(cold.base);
  assert.equal(connects, 1, 'control: an unwarmed request opens a connection');

  const warm = await fixture();
  t.after(warm.close);
  assert.equal(await new ConnectionWarmer().warm(`${warm.base}/models`), true);
  assert.equal(connects, 2);
  await new Promise(resolve => setTimeout(resolve, 150));
  await post(warm.base);
  assert.equal(connects, 2, 'the POST reused the warmed socket');
  assert.deepEqual(warm.requests.map(request => `${request.method} ${request.url}`), ['GET /v1/models', 'POST /v1/chat/completions']);
});

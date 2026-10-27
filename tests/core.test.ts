import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { baseUrl, connectionInput, conversationTitle, externalUrl, sendInput, settingsInput } from '../src/main/services/validation.ts';
import { LocalAuthService } from '../src/main/services/auth.ts';
import { Storage } from '../src/main/services/storage.ts';
import { AIProviderFactory, providerError, serverEvents } from '../src/main/services/providers.ts';

test('provider boundaries reject unsafe endpoints and malformed inputs', () => {
  assert.equal(baseUrl('http://localhost:1234/v1/'), 'http://localhost:1234/v1');
  assert.equal(baseUrl('https://example.com/v1'), 'https://example.com/v1');
  for (const url of ['http://example.com/v1', 'file:///secrets', 'https://user:pass@example.com', 'https://example.com?key=secret', 'https://example.com/#secret']) assert.throws(() => baseUrl(url));
  const settings = settingsInput({ displayName: ' Ada ', theme: 'system', connection: { name: 'OpenAI', ai: { provider: 'openai', baseUrl: 'https://evil.invalid', model: 'my-model', stream: true } } });
  assert.equal(settings.connection!.ai.baseUrl, 'https://api.openai.com/v1');
  assert.equal(settings.displayName, 'Ada');
  assert.throws(() => connectionInput({ ...settings.connection, ai: { ...settings.connection!.ai, provider: 'other' } }));
  assert.throws(() => sendInput({ conversationId: null, content: '', imageIds: [] }));
  const imageIds = Array.from({ length: 7 }, (_, i) => `image-${i}`);
  assert.deepEqual(sendInput({ conversationId: null, content: '', imageIds }).imageIds, imageIds);
  for (const invalid of [null, 'image-1', [null], ['']]) assert.throws(() => sendInput({ conversationId: null, content: 'hi', imageIds: invalid }));
  assert.equal(conversationTitle('  Explain\n  this React error '), 'Explain this React error');
  assert.equal(conversationTitle(''), 'Image conversation');
});

test('local authentication hashes passwords, isolates accounts, and restores sessions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'novi-auth-test-'));
  try {
    const storage = new Storage(dir), auth = new LocalAuthService(storage);
    const ada = await auth.signUp('Ada', 'ADA@example.com', 'correct horse battery');
    assert.equal(ada.email, 'ada@example.com');
    assert.equal(readFileSync(storage.file, 'utf8').includes('correct horse battery'), false);
    assert.deepEqual(await new LocalAuthService(new Storage(dir)).getCurrentUser(), ada);
    await assert.rejects(() => auth.signUp('Duplicate', 'ada@example.com', 'another password'));
    await auth.signOut();
    assert.equal(await auth.getCurrentUser(), null);
    assert.throws(() => storage.current());
    await assert.rejects(() => auth.signIn('ada@example.com', 'wrong password'));
    assert.deepEqual(await auth.signIn('ada@example.com', 'correct horse battery'), ada);
    storage.current().settings.displayName = 'Ada Lovelace'; storage.save();
    await auth.signOut();
    const grace = await auth.signUp('Grace', 'grace@example.com', 'a secure password');
    assert.notEqual(grace.id, ada.id);
    assert.equal(storage.current().settings.displayName, 'Grace');
    assert.equal(storage.current().conversations.length, 0);
    await auth.signOut(); await auth.signIn('ada@example.com', 'correct horse battery');
    assert.equal(storage.current().settings.displayName, 'Ada Lovelace');
    writeFileSync(storage.file, '{broken');
    assert.throws(() => new Storage(dir), /preserved/);
    assert.equal(readFileSync(storage.file, 'utf8'), '{broken');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('SSE parser handles split UTF-8, CRLF, comments, and final frames', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\n\r\ndata: {"text":"🌱"}\r\n\r\ndata: [DONE]');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const frames: string[] = [];
  for await (const frame of serverEvents(stream)) frames.push(frame);
  assert.deepEqual(frames, ['{"text":"🌱"}', '[DONE]']);
});

test('provider sends multimodal requests, streams, supports JSON, and maps errors', async () => {
  const originalFetch = globalThis.fetch;
  const config = { provider: 'compatible' as const, model: 'vision-model', baseUrl: 'http://localhost:1234/v1', stream: true };
  const messages = [{ id: 'm1', role: 'user' as const, content: 'Describe this', images: [{ id: 'i1', name: 'test.png', mimeType: 'image/png' }], createdAt: 1 }];
  const request = { messages, signal: new AbortController().signal, imageData: () => 'data:image/png;base64,TEST', onDelta: (_text: string) => {} };
  try {
    let sent: Record<string, unknown> = {};
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://localhost:1234/v1/chat/completions');
      assert.equal(options?.redirect, 'error');
      assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer private-key');
      sent = JSON.parse(options!.body as string);
      return new Response('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\ndata: {"choices":[{"delta":{"content":"Ada"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const chunks: string[] = [];
    const result = await AIProviderFactory.create(config, 'private-key').sendMessage({ ...request, onDelta: (text) => chunks.push(text) });
    assert.equal(result.content, 'Hello Ada'); assert.deepEqual(chunks, ['Hello ', 'Ada']);
    assert.equal(sent.model, 'vision-model');
    assert.deepEqual(sent.messages, [{ role: 'user', content: [{ type: 'text', text: 'Describe this' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,TEST' } }] }]);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'Non-streamed' } }] });
    assert.equal((await AIProviderFactory.create({ ...config, stream: false }, '').sendMessage(request)).content, 'Non-streamed');
    globalThis.fetch = async () => Response.json({ error: { code: 'model_not_found' } }, { status: 404 });
    await assert.rejects(() => AIProviderFactory.create(config, '').sendMessage(request), /model could not be found/);
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(() => AIProviderFactory.create(config, '').sendMessage(request), /Unable to connect/);
    globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    await assert.rejects(() => AIProviderFactory.create(config, '').sendMessage(request), /before the response finished/);
    const controller = new AbortController(); controller.abort();
    globalThis.fetch = async (_url, options) => { options!.signal!.throwIfAborted(); return new Response(); };
    await assert.rejects(() => AIProviderFactory.create(config, '').sendMessage({ ...request, signal: controller.signal }), { name: 'AbortError' });
    assert.equal(providerError(401).message, 'Your API key was rejected. Check or replace the saved key in Settings › API Management.');
    // A key from the user's Novi account can only be replaced by their admin in the web portal.
    assert.equal(providerError(401, '', true).message, 'Your API key was rejected by the provider. This key comes from your Novi account, so ask your Novi admin to replace it in the web portal, then press the refresh button in Settings › API Management.');
    assert.match(providerError(500, 'invalid_api_key', true).message, /API key was rejected by the provider/, 'errors inside a stream use the same wording');
    assert.match(providerError(429).message, /rate limit/);
  } finally { globalThis.fetch = originalFetch; }
});

test('the browser only opens Novi\'s own help and key pages', () => {
  for (const url of ['https://platform.openai.com/api-keys', 'https://console.anthropic.com/settings/keys', 'https://aistudio.google.com/app/apikey', 'https://existential.audio/blackhole/']) {
    assert.equal(externalUrl(url), url);
  }
  for (const url of [
    'http://platform.openai.com/api-keys', 'https://platform.openai.com.evil.example/', 'https://evil.example/?platform.openai.com',
    'https://user@platform.openai.com/', 'https://platform.openai.com:8443/', 'javascript:alert(1)', 'file:///etc/passwd',
    'ms-settings:privacy', 'not a url', '', 42, null,
  ]) assert.throws(() => externalUrl(url), /only opens its own help and key pages/, String(url));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIProviderFactory } from '../src/main/services/providers.ts';
import { listModels, testConnection } from '../src/main/services/models.ts';
import { ConnectionService } from '../src/main/services/connections.ts';
import { LocalAuthService } from '../src/main/services/auth.ts';
import { Storage } from '../src/main/services/storage.ts';
import { newConnection, PROVIDERS } from '../src/shared/providers.ts';
import type { ProviderConnection, ProviderKind } from '../src/shared/types';
import { providerFetch } from '../src/main/services/providerTransport.ts';

const messages = [{ id: 'm1', role: 'user' as const, content: 'Describe', createdAt: 1, images: [{ id: 'i1', name: 'image.png', mimeType: 'image/png' }] }, { id: 'm2', role: 'assistant' as const, content: 'Earlier reply', createdAt: 2 }, { id: 'm3', role: 'user' as const, content: 'Continue', createdAt: 3 }];
const request = { messages, signal: new AbortController().signal, imageData: () => 'data:image/png;base64,TEST', onDelta: (_text: string) => {} };
const sse = (...events: unknown[]) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

test('provider errors distinguish invalid keys from permission failures without exposing response secrets', async t => {
  let status = 403, reason = '';
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: {
    code: status, status: 'PERMISSION_DENIED', message: 'private-provider-secret',
    details: [{ '@type': 'unrelated' }, { reason }],
  } }, { status }));
  const config = newConnection('gemini').ai;
  const fetchModels = () => providerFetch(`${config.baseUrl}/models`, config, 'private-key', new AbortController().signal);
  await assert.rejects(fetchModels, error => {
    assert(error instanceof Error);
    assert.match(error.message, /Google \(Gemini\) model list failed \(HTTP 403\)/);
    assert.match(error.message, /denied access/);
    assert.doesNotMatch(error.message, /key was rejected|private-provider-secret|private-key/);
    return true;
  });
  reason = 'API_KEY_HTTP_REFERRER_BLOCKED';
  await assert.rejects(fetchModels, /website restrictions/);
  reason = 'API_KEY_SERVICE_BLOCKED';
  await assert.rejects(fetchModels, /API restrictions/);
  reason = 'SERVICE_DISABLED';
  await assert.rejects(fetchModels, /API is disabled/);
  reason = 'API_KEY_INVALID'; status = 400;
  await assert.rejects(fetchModels, /key was rejected/);
  reason = ''; status = 401;
  await assert.rejects(() => providerFetch(`${config.baseUrl}/models/chat:generateContent`, config, 'private-key', new AbortController().signal, {}), /model request failed \(HTTP 401\).*key was rejected/);
});

test('native providers send correct auth, images and history; streaming and JSON agree', async () => {
  const original = globalThis.fetch;
  const fixtures = {
    openai: { stream: [{ type: 'response.output_text.delta', delta: 'Hello' }, { type: 'response.completed' }], json: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }] }, suffix: '/responses', header: 'Authorization' },
    anthropic: { stream: [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }, { type: 'message_stop' }], json: { content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' }, suffix: '/messages', header: 'x-api-key' },
    gemini: { stream: [{ candidates: [{ content: { parts: [{ text: 'Hidden', thought: true }, { text: 'Hello' }] }, finishReason: 'STOP' }] }], json: { candidates: [{ content: { parts: [{ text: 'Hello' }] }, finishReason: 'STOP' }] }, suffix: ':streamGenerateContent?alt=sse', header: 'x-goog-api-key' },
  };
  try {
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      const fixture = fixtures[provider], config = newConnection(provider).ai;
      let payload: any;
      globalThis.fetch = async (url, options) => {
        assert(String(url).startsWith(PROVIDERS[provider].baseUrl));
        assert(String(url).endsWith(fixture.suffix));
        assert.equal(options!.redirect, 'error');
        const headers = options!.headers as Record<string, string>;
        assert.equal(headers[fixture.header], provider === 'openai' ? 'Bearer private-key' : 'private-key');
        assert(!String(url).includes('private-key'));
        payload = JSON.parse(options!.body as string);
        return sse(...fixture.stream);
      };
      const chunks: string[] = [];
      assert.equal((await AIProviderFactory.create(config, 'private-key').sendMessage({ ...request, onDelta: (text) => chunks.push(text) })).content, 'Hello');
      assert.deepEqual(chunks, ['Hello']);
      if (provider === 'openai') { assert.equal(payload.store, false); assert.equal(payload.input[0].content[1].image_url, 'data:image/png;base64,TEST'); assert.equal(payload.input[1].content[0].type, 'output_text'); }
      if (provider === 'anthropic') { assert.equal(payload.max_tokens, 8192); assert.equal(payload.messages[0].content[0].source.data, 'TEST'); }
      if (provider === 'gemini') { assert.equal(payload.contents[0].parts[1].inlineData.data, 'TEST'); assert.equal(payload.contents[1].role, 'model'); }
      globalThis.fetch = async () => Response.json(fixture.json);
      assert.equal((await AIProviderFactory.create({ ...config, stream: false }, 'private-key').sendMessage(request)).content, 'Hello');
      globalThis.fetch = async () => sse(fixture.stream[0]);
      if (provider !== 'gemini') await assert.rejects(() => AIProviderFactory.create(config, 'private-key').sendMessage(request), /before the response finished/);
    }
    globalThis.fetch = async () => sse({ type: 'response.failed' });
    await assert.rejects(() => AIProviderFactory.create(newConnection().ai, 'key').sendMessage(request), /could not finish/);
    globalThis.fetch = async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } });
    await assert.rejects(() => AIProviderFactory.create(newConnection('gemini').ai, 'key').sendMessage(request), /could not complete/);
  } finally { globalThis.fetch = original; }
});

test('Gemini sends a recorded audio attachment as audio data', async t => {
  let payload: any;
    t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    payload = JSON.parse(String(options?.body));
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Audio received' }] }, finishReason: 'STOP' }] });
  });
  const config = { ...newConnection('gemini').ai, stream: false };
  const audio = { id: 'recording', name: 'recording.webm', mimeType: 'audio/webm' };
  await AIProviderFactory.create(config, 'key').sendMessage({
    messages: [{ id: 'one', role: 'user', content: 'Describe this', createdAt: 0, images: [audio] }],
    imageData: () => 'data:audio/webm;base64,QUJD', signal: new AbortController().signal, onDelta: () => {},
  });
  assert.deepEqual(payload.contents[0].parts[1].inlineData, { mimeType: 'audio/webm', data: 'QUJD' });
});

test('discovery uses native pagination, excludes unsupported modalities, and preserves custom IDs', async () => {
  const original = globalThis.fetch;
  try {
    let count = 0;
    globalThis.fetch = async (url) => {
      count++;
      if (count === 2) assert.equal(new URL(String(url)).searchParams.get('pageToken'), 'next');
      return Response.json(count === 1 ? { models: [{ name: 'models/gemini-chat', displayName: 'Gemini Chat', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'next' } : { models: [{ name: 'models/gemini-other', supportedGenerationMethods: ['generateContent'] }] });
    };
    assert.deepEqual((await listModels(newConnection('gemini').ai, 'key')).map((m) => m.id), ['gemini-chat', 'gemini-other']);
    count = 0;
    globalThis.fetch = async (url) => {
      count++; if (count === 2) assert.equal(new URL(String(url)).searchParams.get('after_id'), 'claude-first');
      return Response.json(count === 1 ? { data: [{ id: 'claude-first', display_name: 'First' }], has_more: true, last_id: 'claude-first' } : { data: [{ id: 'claude-second' }], has_more: false });
    };
    assert.equal((await listModels(newConnection('anthropic').ai, 'key')).length, 2);
    globalThis.fetch = async () => Response.json({ data: ['gpt-chat', 'ft:gpt-chat:custom', 'gpt-image-2', 'text-embedding-3', 'gpt-realtime', 'gpt-audio', 'gpt-chat-instruct', '', 'gpt-bad\n'].map(id => ({ id })) });
    assert.deepEqual((await listModels(newConnection().ai, 'key')).map((m) => m.id), ['ft:gpt-chat:custom', 'gpt-chat']);
    globalThis.fetch = async () => Response.json({ data: [{ id: 'vendor/my-model' }] });
    assert.equal((await listModels(newConnection('compatible').ai, '') )[0].id, 'vendor/my-model');
    globalThis.fetch = async () => Response.json({ error: { code: 'invalid_api_key' } }, { status: 401 });
    await assert.rejects(() => listModels(newConnection().ai, 'bad'), /key was rejected/);
  } finally { globalThis.fetch = original; }
});

test('connection check requires a listed model and a successful reply without sending context', async t => {
  const config = { ...newConnection('gemini').ai, model: 'gemini-chat' };
  let status = 200, listed = true, calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal((options.headers as Record<string, string>)['x-goog-api-key'], 'test-key');
    if (url.includes('/models?')) return Response.json({ models: [{ name: `models/${listed ? config.model : 'other'}`, supportedGenerationMethods: ['generateContent'] }] });
    calls++;
    assert.match(url, /gemini-chat:streamGenerateContent/);
    assert.deepEqual(JSON.parse(String(options.body)), { contents: [{ role: 'user', parts: [{ text: 'Connection check. Reply only OK.' }] }] });
    if (status !== 200) return Response.json({ error: {} }, { status });
    return sse({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] });
  });
  await testConnection(config, 'test-key');
  assert.equal(calls, 1);
  status = 401;
  await assert.rejects(() => testConnection(config, 'test-key'), /key was rejected/);
  status = 429;
  await assert.rejects(() => testConnection(config, 'test-key'), /rate limit/);
  listed = false;
  await assert.rejects(() => testConnection(config, 'test-key'), /no longer available/);
  assert.equal(calls, 3, 'an unlisted model is never called');
  await assert.rejects(() => testConnection({ ...config, model: '' }, 'test-key'), /Choose a model/);
});

test('multiple connections preserve keys, enforce account ownership, and clear keys on endpoint changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-connections-'));
  const keys = new Map<string, string>();
  const slot = (user: string, config: ProviderConnection) => `${user}:${config.id}:${config.provider}:${config.baseUrl}`;
  const vault = { get: (user: string, config: ProviderConnection) => keys.get(slot(user, config)) || '', set: (user: string, config: ProviderConnection, key: string) => { keys.set(slot(user, config), key); } };
  try {
    const storage = new Storage(directory), auth = new LocalAuthService(storage), service = new ConnectionService(storage, vault);
    const user = await auth.signUp('Ada', 'ada@example.com', 'test-password');
    const first = service.save({ ...newConnection(), apiKey: 'openai-secret' });
    const second = service.save({ ...newConnection('anthropic'), apiKey: 'claude-secret' });
    const third = service.save({ ...newConnection(), name: 'Second OpenAI', apiKey: 'other-openai-secret' });
    service.select(second.id);
    assert.equal(storage.current().settings.activeConnectionId, second.id);
    assert.equal(service.resolveKey({ id: first.id, name: first.name, ai: first }), 'openai-secret');
    assert.equal(service.resolveKey({ id: third.id, name: third.name, ai: third }), 'other-openai-secret');
    service.save({ id: second.id, name: 'Claude personal', ai: { ...second, model: 'custom-claude' } });
    assert.equal(vault.get(user.id, second), 'claude-secret');
    assert.equal(service.resolveKey({ id: first.id, name: 'Local', ai: { ...first, provider: 'compatible', baseUrl: 'http://localhost:1234/v1' } }), '');
    assert(!readFileSync(storage.file, 'utf8').includes('secret'));
    assert.equal(new Storage(directory).current().settings.connections.length, 3);
    await auth.signUp('Grace', 'grace@example.com', 'test-password');
    assert.throws(() => service.select(first.id), /saved provider/);
    assert.throws(() => service.resolveKey({ id: first.id, name: first.name, ai: first }), /could not be found/);
    await auth.signIn('ada@example.com', 'test-password');
    service.remove(second.id);
    assert.equal(vault.get(user.id, second), '');
    service.remove(third.id);
    assert.throws(() => service.remove(first.id), /last connection/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('version-one configuration migrates without losing model, endpoint, profile, or history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-migration-'));
  try {
    const storage = new Storage(directory), auth = new LocalAuthService(storage);
    await auth.signUp('Ada', 'ada@example.com', 'test-password');
    const legacy = JSON.parse(readFileSync(storage.file, 'utf8'));
    legacy.version = 1;
    legacy.accounts[0].settings = { displayName: 'Ada', theme: 'dark', onboardingComplete: true, ai: { provider: 'compatible' as ProviderKind, baseUrl: 'http://localhost:9999/v1', model: 'old-custom-model', stream: false } };
    legacy.accounts[0].conversations = [{ id: 'kept', title: 'Keep this', messages: [], createdAt: 1, updatedAt: 1 }];
    writeFileSync(storage.file, JSON.stringify(legacy));
    const migrated = new Storage(directory);
    assert.equal(migrated.current().settings.connections[0].id, 'legacy');
    assert.equal(migrated.current().settings.connections[0].model, 'old-custom-model');
    assert.equal(migrated.current().settings.connections[0].baseUrl, 'http://localhost:9999/v1');
    assert.equal(migrated.current().settings.theme, 'dark');
    assert.equal(migrated.current().conversations[0].id, 'kept');
    assert.equal(migrated.data.version, 2);
    assert.equal(new Storage(directory).current().settings.connections.length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

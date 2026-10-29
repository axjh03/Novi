import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { curlFetch } from '../src/main/services/curlFetch';
import { providerFetch, withCurlFallback } from '../src/main/services/providerTransport';
import { researchProfile } from '../src/main/services/profileResearch';

const require = createRequire(import.meta.url);

test('cURL keeps keys and data off the command line, preserves JSON, and reads interim headers', async t => {
  const childProcess = require('node:child_process');
  let received = '';
  const body = { model: 'chosen-model', prompt: 'Quotes " and newlines\n and \\ paths $(untrusted)', stream: true };
  t.mock.method(childProcess, 'execFile', (file: string, args: string[], options: any, callback: (error: Error | null, value: string) => void) => {
    assert.equal(file, 'curl');
    assert.deepEqual(args, ['--disable', '--config', '-', '--suppress-connect-headers']);
    assert.equal(options.maxBuffer, 2_000_000);
    const stdin = new PassThrough();
    stdin.on('data', value => { received += value; });
    stdin.on('finish', () => callback(null, 'HTTP/1.1 100 Continue\r\n\r\nHTTP/2 200\r\nContent-Type: application/json\r\n\r\n{"ok":true}'));
    return { stdin };
  });
  const response = await curlFetch('https://api.example.com/chat', { Authorization: 'Bearer private-test-key' }, new AbortController().signal, body);
  assert.deepEqual(await response.json(), { ok: true });
  assert.ok(received.includes('Bearer private-test-key'));
  const value = received.split('\n').find(line => line.startsWith('data-binary = '))!.slice('data-binary = '.length);
  assert.deepEqual(JSON.parse(JSON.parse(value)), body);
  assert.doesNotMatch(received, /(?:^|\n)(?:location|insecure)/);
  assert.throws(() => curlFetch('file:///etc/passwd', {}, new AbortController().signal), /HTTP provider URL/);
  assert.throws(() => curlFetch('https://api.example.com', { Authorization: 'key\r\nInjected: yes' }, new AbortController().signal), /invalid header/);
});

test('profile fetch retries a failed connection through cURL using the selected model and reports it', async t => {
  const result = { company: 'Acme', role: 'Engineer', companyUrl: '', domain: 'backend', vocabulary: 'technical', experienceYears: 5, companyValues: 'Not stated.', summary: 'Prepare to discuss backend systems.' };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('fetch failed', { cause: { code: 'ENOTFOUND' } }); });
  t.mock.method(require('node:child_process'), 'execFile', (_file: string, args: string[], _options: unknown, callback: (error: Error | null, value: string) => void) => {
    calls++;
    assert.ok(!args.join(' ').includes('private-key'));
    let config = '';
    const stdin = new PassThrough();
    stdin.on('data', value => { config += value; });
    stdin.on('finish', () => {
      const data = config.split('\n').find(line => line.startsWith('data-binary = '))!.slice('data-binary = '.length);
      const payload = JSON.parse(JSON.parse(data));
      assert.equal(payload.model, 'my-selected-model');
      assert.equal(payload.stream, true);
      const frame = JSON.stringify({ choices: [{ delta: { content: JSON.stringify(result) }, finish_reason: 'stop' }] });
      callback(null, `HTTP/2 200\r\nContent-Type: text/event-stream\r\n\r\ndata: ${frame}\n\ndata: [DONE]\n\n`);
    });
    return { stdin };
  });
  const config = { provider: 'compatible' as const, baseUrl: 'https://api.example.com/v1', model: 'my-selected-model', stream: true };
  const profile = await researchProfile({ folderIds: [], jobDescriptionUrl: '', companyUrl: '', jobDescriptionText: 'Acme needs a backend engineer.' }, [], config, 'private-key');
  assert.equal(profile.company, 'Acme');
  assert.ok(profile.warnings.some(warning => warning.includes('cURL fallback')));
  assert.equal(calls, 1);
  await assert.rejects(() => providerFetch('https://api.example.com/v1/models', config, 'private-key', new AbortController().signal), /Unable to connect.*ENOTFOUND/);
  assert.equal(calls, 1, 'fallback is confined to profile research');
});

test('fallback does not retry rejected keys, and process failures never expose raw diagnostics', async t => {
  const config = { provider: 'openai' as const, baseUrl: 'https://api.openai.com/v1', model: 'chosen', stream: true };
  let fallback = false;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: {} }, { status: 401 }));
  await assert.rejects(() => withCurlFallback(() => providerFetch('https://api.openai.com/v1/responses', config, 'private-key', new AbortController().signal, {}), () => { fallback = true; }), /key was rejected/);
  assert.equal(fallback, false);
  t.mock.method(require('node:child_process'), 'execFile', (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, value: string) => void) => {
    queueMicrotask(() => callback(new Error('PRIVATE_KEY PRIVATE_PROMPT'), 'PRIVATE_RESPONSE'));
    return { stdin: new PassThrough() };
  });
  await assert.rejects(() => curlFetch('https://api.example.com', {}, new AbortController().signal), error => {
    assert.match(String(error), /cURL fallback could not connect/);
    assert.doesNotMatch(String(error), /PRIVATE_/);
    return true;
  });
});

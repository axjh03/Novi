import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { test, type TestContext } from 'node:test';
import { CodexAgent } from '../src/main/services/codingAgents/codex';
import { ClaudeAgent } from '../src/main/services/codingAgents/claude';
import type { AgentTask } from '../src/main/services/codingAgents/types';

function task(signal: AbortSignal): AgentTask {
  return { model: 'test-model', effort: null, instructions: 'Read only.', prompt: 'Explain the project.', images: [],
    schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
    tools: { list: () => '', read: () => '', search: async () => '' }, signal, onProgress() {}, onDenied() {} };
}

function codex(t: TestContext, respond: (request: any) => unknown) {
  const root = mkdtempSync(join(tmpdir(), 'novi-codex-lifecycle-'));
  const work = join(root, 'work');
  mkdirSync(join(root, 'engines', 'codex'), { recursive: true }); mkdirSync(work);
  writeFileSync(join(root, 'engines', 'codex', 'binary'), 'fixture');
  writeFileSync(join(root, 'engines', 'manifest.json'), JSON.stringify({ engines: { codex: {
    version: '0.162.1', executable: 'binary', pathDirs: [], files: {},
  } } }));
  const stdout = new PassThrough(), stderr = new PassThrough();
  const requests: any[] = [];
  const stdin = new Writable({ write(data, _encoding, done) {
    const request = JSON.parse(String(data)); requests.push(request);
    setImmediate(() => {
      const result = respond(request);
      if (result !== undefined) stdout.write(JSON.stringify({ id: request.id, result }) + '\n');
    });
    done();
  } });
  const child = Object.assign(new EventEmitter(), { stdout, stderr, stdin, pid: 123, exitCode: null as number | null, signalCode: null as string | null });
  const close = () => { child.exitCode = 0; stdout.end(); stderr.end(); child.emit('exit', 0); child.emit('close', 0); return true; };
  t.mock.method(childProcess, 'spawn', () => child);
  t.mock.method(process, 'kill', close);
  t.after(() => { close(); rmSync(root, { recursive: true, force: true }); });
  return { agent: new CodexAgent({ packaged: true, resourcesPath: root }, work), work, child, requests };
}

const reply = (request: any) => request.method === 'skills/list' ? { data: [] }
  : request.method === 'thread/start' ? { thread: { id: 'thread' } }
  : request.method === 'turn/start' ? { turn: { id: 'turn' } } : {};

test('Codex cancellation releases stalled startup, model discovery and turn requests', { skip: process.platform === 'win32' }, async t => {
  for (const method of ['initialize', 'account/login/start', 'skills/list', 'model/list', 'thread/start', 'turn/start', 'active-turn']) {
    await t.test(method, async t => {
      const controller = new AbortController();
      const f = codex(t, request => {
        if (request.method === method) { controller.abort(); return undefined; }
        if (method === 'active-turn' && request.method === 'turn/start') setImmediate(() => controller.abort());
        return reply(request);
      });
      const pending = method === 'model/list' ? f.agent.listModels({ apiKey: 'test-key' }, controller.signal)
        : f.agent.run(task(controller.signal), { apiKey: 'test-key' });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          pending.then(() => 'completed', (error: Error) => error.message),
          new Promise<string>(resolve => { timer = setTimeout(() => resolve('still waiting after cancellation'), 1000); }),
        ]);
        assert.equal(outcome, 'Cancelled.');
        assert.deepEqual(readdirSync(f.work), []);
      } finally { clearTimeout(timer); }
    });
  }
});

test('Codex supports older catalogs without inputModalities and preserves explicit text-only models', { skip: process.platform === 'win32' }, async t => {
  const model = { displayName: 'Test', hidden: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] };
  const f = codex(t, request => request.method === 'model/list' ? { data: [
    { ...model, id: 'old' }, { ...model, id: 'text', inputModalities: ['text'] }, { ...model, id: 'hidden', hidden: true },
  ] } : reply(request));
  const models = await f.agent.listModels({ apiKey: 'test-key' }, new AbortController().signal);
  assert.deepEqual(models.map(({ id, images, highestEffort }) => ({ id, images, highestEffort })), [
    { id: 'old', images: true, highestEffort: 'high' }, { id: 'text', images: false, highestEffort: 'high' },
  ]);
  assert.deepEqual(readdirSync(f.work), []);
});

test('Codex handles a closed input pipe without an uncaught error or exposed diagnostics', { skip: process.platform === 'win32' }, async t => {
  let initialized!: () => void;
  const reached = new Promise<void>(resolve => { initialized = resolve; });
  const f = codex(t, () => { initialized(); return undefined; });
  const pending = f.agent.listModels({ apiKey: 'test-key' }, new AbortController().signal);
  const outcome = pending.catch((error: Error) => error);
  await reached;
  assert.doesNotThrow(() => f.child.stdin.emit('error', new Error('EPIPE test-key PRIVATE_SOURCE')));
  const error = await outcome;
  assert(error instanceof Error);
  assert.match(error.message, /Codex.*input/i);
  assert.doesNotMatch(error.message, /test-key|PRIVATE_SOURCE/);
  assert.deepEqual(readdirSync(f.work), []);
});

test('Claude explains provider failures without copying raw provider text', async t => {
  for (const [code, expected] of [
    ['authentication_failed', /API key/], ['billing_error', /billing/], ['rate_limit', /rate limit/],
    ['model_not_found', /selected model/], ['server_error', /unavailable/], ['unknown', /could not finish/],
  ] as const) {
    await t.test(code, async t => {
      const agent = new ClaudeAgent({ packaged: false, resourcesPath: '' }, 'unused');
      let cleaned = false, closed = false;
      const query = Object.assign((async function* () {
        yield { type: 'assistant', error: code, message: { content: [{ type: 'text', text: 'PRIVATE_SOURCE test-key' }] } };
        yield { type: 'result', subtype: 'success', is_error: true, result: 'PRIVATE_SOURCE test-key' };
      })(), { close() { closed = true; } });
      t.mock.method(agent as any, 'prepare', async () => ({
        sdk: { query: () => query, tool() {}, createSdkMcpServer() {} }, options: {}, cleanup: async () => { cleaned = true; },
      }));
      await assert.rejects(agent.run(task(new AbortController().signal), { apiKey: 'test-key' }), (error: Error) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /PRIVATE_SOURCE|test-key/);
        return true;
      });
      assert(cleaned && closed);
    });
  }
});

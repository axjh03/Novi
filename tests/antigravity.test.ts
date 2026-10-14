import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AntigravityAgent } from '../src/main/services/codingAgents/antigravity';
import type { AgentTask } from '../src/main/services/codingAgents/types';

function fixture(t: TestContext, tools: string[], respond: (content: string, emit: (value: unknown) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'novi-agy-test-'));
  const engine = join(root, 'engines', 'antigravity'), work = join(root, 'work');
  mkdirSync(engine, { recursive: true }); mkdirSync(work);
  writeFileSync(join(engine, 'agy'), 'fake engine');
  writeFileSync(join(root, 'engines', 'manifest.json'), JSON.stringify({ engines: { antigravity: {
    version: '1.2.3', executable: 'agy', pathDirs: [], files: { agy: createHash('sha256').update('fake engine').digest('hex') },
  } } }));
  const stdout = new PassThrough(), stderr = new PassThrough();
  const emit = (value: unknown) => stdout.write(JSON.stringify(value) + '\n');
  const stdin = new Writable({ write(data, _encoding, done) {
    try { const event = JSON.parse(String(data)); assert.equal(event.event, 'user'); respond(event.message.content, emit); done(); }
    catch (error) { done(error as Error); }
  } });
  const child = Object.assign(new EventEmitter(), { stdout, stderr, stdin, pid: 123, exitCode: null, signalCode: null as string | null });
  t.mock.method(childProcess, 'spawn', (_command: string, args: string[], options: { env: Record<string, string>; cwd: string }) => {
    assert.equal(options.env.GEMINI_API_KEY, 'test-key');
    assert.equal(args.includes('test-key'), false);
    assert.equal(JSON.parse(readFileSync(join(options.env.HOME, '.gemini/antigravity-cli/settings.json'), 'utf8')).modelProvider, 'gemini');
    assert.match(readFileSync(join(options.cwd, '.agents/agents/novi.md'), 'utf8'), /tools: \[\]/);
    setImmediate(() => emit({ event: 'init', init: { tools } }));
    return child;
  });
  t.mock.method(process, 'kill', (pid: number) => {
    assert.equal(pid, -123);
    child.signalCode = 'SIGKILL'; stdout.end(); stderr.end(); child.emit('close'); return true;
  });
  return { work, agent: new AntigravityAgent({ packaged: true, resourcesPath: root }, work), cleanup() { t.mock.restoreAll(); rmSync(root, { recursive: true, force: true }); } };
}

function task(): AgentTask {
  return { model: 'gemini-test', effort: null, instructions: 'Analyze the captured project.', prompt: 'Read file one.', images: [],
    schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
    signal: AbortSignal.timeout(5000), onProgress() {}, onDenied() {},
    tools: { list: () => '', search: async () => '', read: () => 'captured source' } };
}

test('Antigravity uses saved-key auth, exchanges read results while stdin stays open, and cleans its private home', { skip: process.platform === 'win32' }, async t => {
  let turns = 0, reads = 0;
  const f = fixture(t, [], (content, emit) => {
    if (++turns === 1) {
      assert.equal(content, 'Read file one.');
      emit({ event: 'result', result: { status: 'SUCCESS', structured_output: { tool: 'read_file', arguments: { fileId: 'one' } } } });
    } else {
      assert.deepEqual(JSON.parse(content), { tool: 'read_file', text: 'captured source', ok: true });
      emit({ event: 'result', result: { status: 'SUCCESS', structured_output: { answer: { summary: 'done' } } } });
    }
  });
  try {
    const input = task();
    input.tools.read = args => { assert.equal(args.fileId, 'one'); reads++; return 'captured source'; };
    assert.deepEqual(await f.agent.run(input, { apiKey: 'test-key' }), { summary: 'done' });
    assert.equal(reads, 1); assert.equal(turns, 2);
    assert.deepEqual(readdirSync(f.work), []);
  } finally { f.cleanup(); }
});

test('Antigravity rejects native tools and unknown read requests, and handles cancellation', { skip: process.platform === 'win32' }, async t => {
  for (const scenario of ['native', 'unknown', 'cancel']) {
    let turns = 0, reads = 0;
    const f = fixture(t, scenario === 'native' ? ['run_command'] : [], (_content, emit) => {
      turns++;
      if (scenario === 'unknown') emit({ event: 'result', result: { status: 'SUCCESS', structured_output: { tool: 'write_file', arguments: {} } } });
    });
    try {
      const input = task();
      input.tools.read = () => { reads++; return ''; };
      if (scenario === 'cancel') input.signal = AbortSignal.timeout(100);
      await assert.rejects(f.agent.run(input, { apiKey: 'test-key' }), scenario === 'native' ? /built-in tools/ : scenario === 'unknown' ? /outside the read-only tools/ : /Cancelled|aborted/);
      assert.equal(reads, 0);
      if (scenario === 'native') assert.equal(turns, 0, 'No user prompt is sent when native tools remain enabled');
      assert.deepEqual(readdirSync(f.work), []);
    } finally { f.cleanup(); }
  }
});

test('Antigravity model discovery uses the Gemini API and propagates authentication errors', async t => {
  const agent = new AntigravityAgent({ packaged: false, resourcesPath: '' }, '');
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(new URL(url).origin, 'https://generativelanguage.googleapis.com');
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'test-key');
    return Response.json({ models: [{ name: 'models/gemini-test', supportedGenerationMethods: ['generateContent'] }] });
  });
  assert.deepEqual(await agent.listModels({ apiKey: 'test-key' }, new AbortController().signal), [{ id: 'gemini-test', name: 'gemini-test', efforts: [], highestEffort: null, images: false }]);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'bad key' } }, { status: 401 }));
  await assert.rejects(agent.listModels({ apiKey: 'bad' }, new AbortController().signal));
});

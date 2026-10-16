import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AntigravityAgent } from '../src/main/services/codingAgents/antigravity';
import type { AgentTask } from '../src/main/services/codingAgents/types';

function fixture(t: TestContext, tools: string[], respond: (content: string, emit: (value: unknown) => void) => void,
  startup?: { code: number; stderr: string; output?: unknown }) {
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
  const child = Object.assign(new EventEmitter(), { stdout, stderr, stdin, pid: 123, exitCode: null as number | null, signalCode: null as string | null });
  t.mock.method(childProcess, 'spawn', (_command: string, args: string[], options: { env: Record<string, string>; cwd: string }) => {
    assert.equal(options.env.GEMINI_API_KEY, 'test-key');
    assert.equal(args.includes('test-key'), false);
    assert.equal(JSON.parse(readFileSync(join(options.env.HOME, '.gemini/antigravity-cli/settings.json'), 'utf8')).modelProvider, 'gemini');
    assert.match(readFileSync(join(options.cwd, '.agents/agents/novi.md'), 'utf8'), /tools: \[\]/);
    const schema = JSON.parse(readFileSync(args[args.indexOf('--json-schema') + 1], 'utf8'));
    assert.equal(schema.type, 'object', 'Antigravity 1.2.14+ rejects schemas without an explicit object root before initialization');
    setImmediate(() => {
      if (!startup) { emit({ event: 'init', init: { tools } }); return; }
      stderr.write(startup.stderr);
      if (startup.output !== undefined) emit(startup.output);
      child.exitCode = startup.code;
      stdout.end(); stderr.end(); child.emit('close', startup.code, null);
    });
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

test('Antigravity offers installed CLI model slugs, not Gemini API ids, and propagates authentication errors', async t => {
  const f = fixture(t, [], () => {});
  t.after(() => f.cleanup());
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(new URL(url).origin, 'https://generativelanguage.googleapis.com');
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'test-key');
    return Response.json({ models: [{ name: 'models/antigravity-preview-05-2026', supportedGenerationMethods: ['generateContent'] }] });
  });
  const catalog = t.mock.method(childProcess, 'execFile', (_command: string, args: string[], options: { env: Record<string, string>; cwd: string }, done: Function) => {
    assert.deepEqual(args, ['models']);
    assert.equal(options.env.GEMINI_API_KEY, 'test-key');
    assert.equal(JSON.parse(readFileSync(join(options.env.HOME, '.gemini/antigravity-cli/settings.json'), 'utf8')).modelProvider, 'gemini');
    assert.notEqual(options.cwd, process.cwd());
    done(null, '\u001b[32mgemini-test-high\u001b[0m\tGemini test (High)\r\ngemini-test-medium   Gemini test (Medium)\r\nclaude-test  Claude test\n', '');
  });
  assert.deepEqual(await f.agent.listModels({ apiKey: 'test-key' }, new AbortController().signal), [
    { id: 'gemini-test-high', name: 'Gemini test (High)', efforts: [], highestEffort: null, images: false },
    { id: 'gemini-test-medium', name: 'Gemini test (Medium)', efforts: [], highestEffort: null, images: false },
  ]);
  assert.deepEqual(readdirSync(f.work), [], 'model discovery cleans its private home');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'bad key' } }, { status: 401 }));
  await assert.rejects(f.agent.listModels({ apiKey: 'bad' }, new AbortController().signal));
  assert.equal(catalog.mock.callCount(), 1, 'invalid credentials fail before launching the CLI');
});

test('Antigravity reads snapshot tools and returns explanations from serialized JSON responses', { skip: process.platform === 'win32' }, async t => {
  let turns = 0;
  const f = fixture(t, [], (content, emit) => {
    const result = ++turns === 1 ? { tool: 'read_file', arguments: { fileId: 'one' } } : { answer: { summary: 'This file contains captured source.', changes: [] } };
    if (turns === 2) assert.equal(JSON.parse(content).text, 'captured source');
    emit({ event: 'result', result: { status: 'SUCCESS', response: JSON.stringify(result) } });
  });
  try {
    assert.deepEqual(await f.agent.run(task(), { apiKey: 'test-key' }), { summary: 'This file contains captured source.', changes: [] });
    assert.equal(turns, 2);
    assert.deepEqual(readdirSync(f.work), []);
  } finally { f.cleanup(); }
});

test('Antigravity never falls back to API model ids when the CLI catalog fails', async t => {
  const f = fixture(t, [], () => {});
  t.after(() => f.cleanup());
  t.mock.method(globalThis, 'fetch', async () => Response.json({ models: [{ name: 'models/antigravity-preview-05-2026', supportedGenerationMethods: ['generateContent'] }] }));
  let fail = false;
  t.mock.method(childProcess, 'execFile', (_command: string, _args: string[], _options: unknown, done: Function) => {
    done(fail ? new Error('PRIVATE_DIAGNOSTIC') : null, 'Available models:\nclaude-test  Claude test\n', 'SECRET_SOURCE test-key');
  });
  for (fail of [false, true]) {
    await assert.rejects(f.agent.listModels({ apiKey: 'test-key' }, new AbortController().signal), (error: Error) => {
      assert.match(error.message, /Antigravity could not list its models/);
      assert.doesNotMatch(error.message, /PRIVATE_DIAGNOSTIC|SECRET_SOURCE|test-key/);
      return true;
    });
    assert.deepEqual(readdirSync(f.work), []);
  }
});

test('Antigravity reports early exits and startup error envelopes without exposing diagnostics', { skip: process.platform === 'win32' }, async t => {
  for (const scenario of [
    { stderr: 'error: invalid model selection (--model antigravity-preview-05-2026)', expected: /rejected the selected model/ },
    { stderr: 'authentication required', expected: /could not authenticate/ },
    { stderr: 'unknown flag: --input-format', expected: /Update it in Settings/ },
    { stderr: 'invalid --json-schema: schema root must have type "object"', expected: /response format supplied by Novi/ },
    { stderr: 'unexpected crash', expected: /before initialization \(exit code 1\)/ },
    { stderr: '', output: { status: 'ERROR', error: 'invalid model selection' }, expected: /rejected the selected model/ },
    { stderr: '', output: { status: 'ERROR', error: 'invalid JSON schema: root must be an object' }, expected: /response format supplied by Novi/ },
  ]) {
    let prompts = 0;
    const f = fixture(t, [], () => { prompts++; }, { ...scenario, code: 1, stderr: `${scenario.stderr}\ntest-key /private/project/source SECRET_SOURCE` });
    try {
      await assert.rejects(f.agent.run(task(), { apiKey: 'test-key' }), (error: Error & { diagnostics?: { engineVersion: string; stderr: string; initialized: boolean; exitCode: number; resultError?: string } }) => {
        assert.match(error.message, scenario.expected);
        assert.doesNotMatch(error.message, /test-key|private\/project|SECRET_SOURCE/);
        assert.equal(error.diagnostics?.engineVersion, '1.2.3');
        assert.equal(error.diagnostics?.initialized, false);
        assert.equal(error.diagnostics?.exitCode, 1);
        assert.match(error.diagnostics!.stderr, /SECRET_SOURCE/);
        assert.equal(error.diagnostics?.resultError, scenario.output?.error);
        return true;
      });
      assert.equal(prompts, 0);
      assert.deepEqual(readdirSync(f.work), []);
    } finally { f.cleanup(); }
  }
});

test('Antigravity refuses a successful startup envelope before verifying read-only tools', { skip: process.platform === 'win32' }, async t => {
  let prompts = 0;
  const f = fixture(t, [], () => { prompts++; }, { code: 0, stderr: '', output: { status: 'SUCCESS', structured_output: { answer: { summary: 'unverified' } } } });
  try {
    await assert.rejects(f.agent.run(task(), { apiKey: 'test-key' }), /before confirming its read-only tools/);
    assert.equal(prompts, 0);
    assert.deepEqual(readdirSync(f.work), []);
  } finally { f.cleanup(); }
});

test('Antigravity preserves the original failure when temporary-folder cleanup also fails', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t, [], () => {}, { code: 1, stderr: 'startup crashed' });
  t.mock.method(fsPromises, 'rm', async () => { throw Object.assign(new Error('cleanup denied'), { code: 'EACCES' }); });
  try {
    await assert.rejects(f.agent.run(task(), { apiKey: 'test-key' }), (error: Error & { diagnostics?: { stderr: string } }) => {
      assert.match(error.message, /Antigravity.*clean up/);
      const cause = error.cause as { error: NodeJS.ErrnoException; failure: Error };
      assert.equal(cause.error.code, 'EACCES');
      assert.match(cause.failure.message, /before initialization/);
      assert.equal(error.diagnostics?.stderr, 'startup crashed');
      return true;
    });
  } finally { f.cleanup(); }
});

test('Antigravity rejects empty and malformed results and explains provider errors', { skip: process.platform === 'win32' }, async t => {
  for (const scenario of [
    { result: { status: 'SUCCESS', response: '' }, expected: /no valid structured answer/ },
    { result: { status: 'SUCCESS', response: 'plain text' }, expected: /no valid structured answer/ },
    { result: { status: 'SUCCESS', structured_output: [] }, expected: /no valid structured answer/ },
    { result: { status: 'ERROR', error: 'RESOURCE_EXHAUSTED: quota exceeded; test-key' }, expected: /quota or rate limit/ },
    { result: { status: 'ERROR', error: 'API key not valid: test-key' }, expected: /could not authenticate/ },
  ]) {
    const f = fixture(t, [], (_content, emit) => emit({ event: 'result', result: scenario.result }));
    try {
      await assert.rejects(f.agent.run(task(), { apiKey: 'test-key' }), (error: Error) => {
        assert.match(error.message, scenario.expected);
        assert.doesNotMatch(error.message, /test-key/);
        return true;
      });
      assert.deepEqual(readdirSync(f.work), []);
    } finally { f.cleanup(); }
  }
});

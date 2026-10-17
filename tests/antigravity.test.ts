import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import childProcess, { execFileSync } from 'node:child_process';
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
  startup?: { code: number; stderr: string; output?: unknown }, agent: string | null = 'novi') {
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
    assert.match(readFileSync(join(options.cwd, '.agents/agents/novi.md'), 'utf8'), /tools: \[finish\]/);
    assert.deepEqual(JSON.parse(readFileSync(join(options.cwd, '.agents/hooks.json'), 'utf8')), {
      'novi-read-only': { PreToolUse: [{ matcher: '*', hooks: [{ command: process.platform === 'win32' ? 'novi-tool-gate.cmd' : '"$NOVI_HOOK_NODE" novi-tool-gate.cjs' }] }] },
    });
    assert.equal(options.env.NOVI_HOOK_NODE, process.execPath);
    assert.equal(options.env.ELECTRON_RUN_AS_NODE, '1');
    const schema = JSON.parse(readFileSync(args[args.indexOf('--json-schema') + 1], 'utf8'));
    assert.equal(schema.type, 'object', 'Antigravity 1.2.14+ rejects schemas without an explicit object root before initialization');
    setImmediate(() => {
      if (!startup) { emit({ event: 'init', init: { tools, agent } }); return; }
      stderr.write(startup.stderr);
      if (startup.output !== undefined) emit(startup.output);
      child.exitCode = startup.code;
      stdout.end(); stderr.end(); child.emit('close', startup.code, null);
    });
    return child;
  });
  const killed = () => { child.signalCode = 'SIGKILL'; stdout.end(); stderr.end(); child.emit('close'); };
  t.mock.method(process, 'kill', (pid: number) => { assert.equal(pid, -123); killed(); return true; });
  t.mock.method(childProcess, 'spawnSync', (command: string, args: string[]) => {
    assert.equal(command, 'taskkill.exe');
    assert.deepEqual(args, ['/PID', '123', '/T', '/F']);
    killed(); return { status: 0 };
  });
  return { work, agent: new AntigravityAgent({ packaged: true, resourcesPath: root }, work), cleanup() { t.mock.restoreAll(); rmSync(root, { recursive: true, force: true }); } };
}

function task(): AgentTask {
  return { model: 'gemini-test', effort: null, instructions: 'Analyze the captured project.', prompt: 'Read file one.', images: [],
    schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
    signal: AbortSignal.timeout(5000), onProgress() {}, onDenied() {},
    tools: { list: () => '', search: async () => '', read: () => 'captured source' } };
}

test('Antigravity accepts the CLI catalog, exchanges snapshot reads, and cleans its private home', async t => {
  let turns = 0, reads = 0;
  const f = fixture(t, ['run_command', 'view_file', 'manage_task'], (content, emit) => {
    if (++turns === 1) {
      assert.equal(content, 'Read file one.');
      const gate = join(f.work, readdirSync(f.work)[0], 'workspace', '.agents', 'novi-tool-gate.cjs');
      for (const name of ['finish', 'manage_task', 'run_command', 'view_file', 'future_tool']) {
        const decision = JSON.parse(execFileSync(process.execPath, [gate], { input: JSON.stringify({ toolCall: { name } }), encoding: 'utf8' }));
        assert.equal(decision.decision, name === 'finish' ? 'allow' : 'deny');
      }
      emit({ event: 'step_update', step_update: { step_type: 'finish', state: 'DONE' } });
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

test('Antigravity rejects unconfirmed agents, native tools and unknown reads, and handles cancellation', async t => {
  for (const scenario of ['wrong-agent', 'missing-agent', 'native', 'unknown', 'cancel']) {
    let turns = 0, reads = 0;
    const f = fixture(t, scenario === 'native' ? ['run_command'] : [], (_content, emit) => {
      turns++;
      if (scenario === 'native') emit({ event: 'step_update', step_update: { step_type: 'tool', tool_name: 'run_command' } });
      if (scenario === 'unknown') emit({ event: 'result', result: { status: 'SUCCESS', structured_output: { tool: 'write_file', arguments: {} } } });
    }, undefined, scenario === 'wrong-agent' ? 'default' : scenario === 'missing-agent' ? null : 'novi');
    try {
      const input = task();
      input.tools.read = () => { reads++; return ''; };
      if (scenario === 'cancel') input.signal = AbortSignal.timeout(100);
      await assert.rejects(f.agent.run(input, { apiKey: 'test-key' }), scenario.endsWith('agent') ? /did not select/ : scenario === 'native' || scenario === 'unknown' ? /outside the read-only tools/ : /Cancelled|aborted/);
      assert.equal(reads, 0);
      if (scenario.endsWith('agent')) assert.equal(turns, 0, 'No user prompt is sent without the restricted agent');
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

test('Antigravity reads snapshot tools and returns explanations from serialized JSON responses', async t => {
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

test('Antigravity reports early exits and startup error envelopes without exposing diagnostics', async t => {
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

test('Antigravity refuses a successful startup envelope before verifying read-only tools', async t => {
  let prompts = 0;
  const f = fixture(t, [], () => { prompts++; }, { code: 0, stderr: '', output: { status: 'SUCCESS', structured_output: { answer: { summary: 'unverified' } } } });
  try {
    await assert.rejects(f.agent.run(task(), { apiKey: 'test-key' }), /before confirming its read-only tools/);
    assert.equal(prompts, 0);
    assert.deepEqual(readdirSync(f.work), []);
  } finally { f.cleanup(); }
});

test('Antigravity preserves the original failure when temporary-folder cleanup also fails', async t => {
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

test('Antigravity rejects empty and malformed results and explains provider errors', async t => {
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

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DebugService } from '../src/main/services/debug.ts';
import { SessionTrace } from '../src/main/services/sessionTrace.ts';

test('debug can be enabled during a request, isolates requests and redacts registered secrets', async () => {
  const debug = new DebugService();
  let resume!: () => void;
  const pending = debug.run('send', async () => {
    debug.identify({ conversationId: 'chat-one', model: 'model-one' });
    debug.secret('private/key+value');
    debug.event('Waiting for engine');
    await new Promise<void>(resolve => { resume = resolve; });
    debug.event('Failure', { message: 'private/key+value private%2Fkey%2Bvalue Bearer hidden-token' }, 'error');
  });
  assert.deepEqual(debug.snapshot(), { enabled: false, active: [], events: [] });
  const enabled = debug.setEnabled(true);
  assert.equal(enabled.active[0].stage, 'Waiting for engine');
  assert.equal(enabled.active[0].conversationId, 'chat-one');
  await debug.run('list-models', async () => {
    debug.identify({ connectionId: 'connection-two' });
    debug.event('HTTP response', { status: 200 });
  });
  resume(); await pending;
  const state = debug.snapshot();
  assert.equal(state.active.length, 0);
  const failure = state.events.find(event => event.stage === 'Failure')!;
  assert.equal(failure.conversationId, 'chat-one');
  assert.equal(failure.connectionId, undefined);
  assert.equal(failure.details.message, '[REDACTED] [REDACTED] Bearer [REDACTED]');
  assert(state.events.filter(event => event.operation === 'list-models').every(event => event.conversationId === undefined));
  assert.equal(state.events.at(-1)?.level, 'error');
});

test('debug bounds logs, throttles repeated activity and clears on disable or account change', async () => {
  const debug = new DebugService();
  debug.setEnabled(true);
  await debug.run('send', async () => {
    for (let i = 0; i < 500; i++) debug.event('Step', { index: i });
    assert.equal(debug.snapshot().events.length, 400);
    debug.clear();
    debug.event('Streaming', {}, 'info', 60_000);
    debug.event('Streaming', {}, 'info', 60_000);
    assert.equal(debug.snapshot().events.length, 1);
    debug.setEnabled(false);
    assert.equal(debug.snapshot().events.length, 0);
    debug.setEnabled(true);
    debug.reset();
    debug.event('Late event from old account');
  });
  assert.deepEqual(debug.snapshot(), { enabled: false, active: [], events: [] });
});

test('the session trace keeps engine output out of errors it records', t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-trace-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const trace = new SessionTrace(directory, 'Trace check');
  // Shaped like a real Antigravity failure: execFile puts stderr in its error's message and stack.
  const failed = Object.assign(new Error('Command failed: agy models\nSECRET_SOURCE /private/project'), { code: 'ERR_FAILED', stderr: 'SECRET_SOURCE /private/project' });
  const error = Object.assign(new Error('Antigravity could not list its models.', { cause: { error: failed, engineVersion: '1.2.3', stderr: 'SECRET_SOURCE /private/project' } }), {
    diagnostics: { engineVersion: '1.2.3', exitCode: 1, lastEvent: 'error', stderr: 'SECRET_SOURCE /private/project' },
  });
  trace.error(error);
  const text = readFileSync(trace.file!, 'utf8');
  for (const expected of [/ERROR  Error: Antigravity could not list its models\./, /Command failed: agy models/, /ERR_FAILED/, /"exitCode": 1/, /"engineVersion": "1\.2\.3"/, /\[30 characters not written\]/]) assert.match(text, expected);
  assert.doesNotMatch(text, /SECRET_SOURCE|private\/project/);
});

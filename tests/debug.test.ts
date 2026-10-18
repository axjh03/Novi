import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DebugService } from '../src/main/services/debug.ts';

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

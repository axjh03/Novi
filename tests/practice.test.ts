import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SESSION_MODES } from '../src/shared/sessionModes';
import { PRACTICE_IDLE, PRACTICE_QUESTIONS, practiceReducer, practiceStepNumber, type PracticeEvent, type PracticeState } from '../src/renderer/src/services/practice';
import { READINESS_CHECKS, allReady, continueFromGetReady, getReadyContinued, markReadinessRun, readReadiness, recordReadiness } from '../src/renderer/src/services/readiness';
import { settingsInput } from '../src/main/services/validation';

const run = (events: PracticeEvent[], from: PracticeState = PRACTICE_IDLE) => events.reduce(practiceReducer, from);

test('every mode has a practice question', () => {
  for (const mode of SESSION_MODES) assert(PRACTICE_QUESTIONS[mode.id].trim().endsWith('?') || PRACTICE_QUESTIONS[mode.id].trim().endsWith('.'));
});

test('practice follows listen, hear, stop, send, answer, done', () => {
  let state = run([{ type: 'start', question: 'Q?' }]);
  assert.equal(state.step, 'listen'); assert.equal(practiceStepNumber(state.step), 1);
  state = run([{ type: 'listening', active: false, heard: '' }], state);
  assert.equal(state.step, 'listen', 'the initial not-listening report is ignored');
  state = run([{ type: 'listening', active: true, heard: '' }], state);
  assert.equal(state.step, 'asking'); assert.equal(practiceStepNumber(state.step), 2);
  state = run([{ type: 'spoken' }], state);
  assert.equal(state.step, 'heard');
  state = run([{ type: 'listening', active: false, heard: 'Interviewer: Q?' }], state);
  assert.deepEqual([state.step, state.filled], ['send', false]); assert.equal(practiceStepNumber(state.step), 3);
  state = run([{ type: 'send-started' }], state);
  assert.equal(state.step, 'answer'); assert.equal(practiceStepNumber(state.step), null);
  state = run([{ type: 'send-finished', ok: true, conversationId: 'c1' }], state);
  assert.deepEqual([state.step, state.conversationId], ['done', 'c1']);
  assert.deepEqual(run([{ type: 'cancel' }], state), PRACTICE_IDLE);
});

test('nothing heard fills the question; stopping early also works', () => {
  const early = run([{ type: 'start', question: 'Q?' }, { type: 'listening', active: true, heard: '' }, { type: 'listening', active: false, heard: '  ' }]);
  assert.deepEqual([early.step, early.filled], ['send', true]);
  assert.equal(early.typed, false);
  const typed = run([{ type: 'start', question: 'Q?' }, { type: 'type-instead' }]);
  assert.deepEqual([typed.step, typed.filled, typed.typed], ['send', true, true]);
  assert.equal(run([{ type: 'start', question: 'Q?' }], typed).typed, false, 'a new run resets the choice');
  // Type it instead only applies before listening.
  const listening = run([{ type: 'start', question: 'Q?' }, { type: 'listening', active: true, heard: '' }, { type: 'type-instead' }]);
  assert.equal(listening.step, 'asking');
});

test('a failed send returns to the send step; idle ignores chat activity', () => {
  const failed = run([{ type: 'start', question: 'Q?' }, { type: 'type-instead' }, { type: 'send-started' }, { type: 'send-finished', ok: false, conversationId: null }]);
  assert.deepEqual([failed.step, failed.failed, failed.filled], ['send', true, false]);
  assert.equal(run([{ type: 'send-started' }]).step, 'idle');
  assert.equal(run([{ type: 'send-finished', ok: true, conversationId: 'x' }]).step, 'idle');
  // Typing and sending without listening still completes the run.
  assert.equal(run([{ type: 'start', question: 'Q?' }, { type: 'send-started' }, { type: 'send-finished', ok: true, conversationId: 'c' }]).step, 'done');
});

test('readiness remembers results and a full run', () => {
  assert.equal(allReady(readReadiness()), false);
  for (const { id } of READINESS_CHECKS) recordReadiness(id, { ok: true, detail: 'fine' });
  assert.equal(allReady(readReadiness()), true);
  assert.equal(readReadiness()!.ranAt, undefined);
  assert.equal(typeof markReadinessRun().ranAt, 'number');
  recordReadiness('system', { ok: false, detail: 'No sound' });
  assert.equal(allReady(readReadiness()), false);
  assert.equal(typeof readReadiness()!.ranAt, 'number', 'a later retry keeps the run time');
});

test('settings keep transparentOnStart unless it is sent', () => {
  const base = { displayName: 'Ada', theme: 'system' };
  assert.equal('transparentOnStart' in settingsInput(base), false);
  assert.equal(settingsInput({ ...base, transparentOnStart: true }).transparentOnStart, true);
  assert.equal(settingsInput({ ...base, transparentOnStart: false }).transparentOnStart, false);
  assert.equal('transparentOnStart' in settingsInput({ ...base, transparentOnStart: 'yes' }), false);
});

test('Get ready shows once per app launch, then ending a session returns to session setup', () => {
  assert.equal(getReadyContinued(), false);
  continueFromGetReady();
  assert.equal(getReadyContinued(), true);
});

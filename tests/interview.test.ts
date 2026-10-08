import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InterviewEngine, validateFrame, type ASRStream, type StreamingASR } from '../src/main/services/interviewEngine';
import { InterviewStore } from '../src/main/services/interviewStore';
import { assertRemoteInterviewAccess } from '../src/main/services/interviewPrivacy';
import { speakerResolver } from '../src/main/services/interviewSpeakers';
import { updateTranscript, type InterviewEvent, type InterviewFrame, type TranscriptSegment } from '../src/shared/interview';

class Stream implements ASRStream {
  text = ''; frames = 0;
  acceptWaveform({ samples }: { samples: Float32Array }) { if (samples.some(sample => sample !== 0)) this.text = ['Tell', 'Tell me', 'Tell me about your experience'][Math.min(this.frames++, 2)]; }
  inputFinished() {}
}
const recognizer: StreamingASR = {
  createStream: () => new Stream(), isReady: () => false, decode() {}, isEndpoint: () => false,
  getResult: stream => ({ text: (stream as Stream).text }), reset(stream) { (stream as Stream).text = ''; },
};
const frame = (sessionId: string, sequence: number, source: InterviewFrame['source'] = 'system', loud = true): InterviewFrame => ({ sessionId, sequence, source, startTime: sequence * 100, samples: new Float32Array(1600).fill(loud ? 0.1 : 0) });

test('live partials revise one segment, independent inputs retain roles, stop finalizes once and recovery preserves finals', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-interview-'));
  try {
    const store = new InterviewStore(directory), session = store.create('owner', 'conversation', 'test-model');
    const events: InterviewEvent[] = []; let rendered: TranscriptSegment[] = [];
    const engine = new InterviewEngine(session.id, recognizer, event => {
      events.push(event);
      if (event.type === 'transcript:partial' || event.type === 'transcript:final') rendered = updateTranscript(rendered, event.segment);
      if (event.type === 'transcript:final') store.finalize('owner', event.segment);
    });
    await engine.frame(frame(session.id, 0)); await engine.frame(frame(session.id, 1));
    assert.equal(rendered.length, 1); assert.equal(rendered[0].text, 'Tell me'); assert.equal(rendered[0].isFinal, false);
    await engine.frame(frame(session.id, 0, 'microphone')); await engine.frame(frame(session.id, 2));
    assert.equal(rendered.length, 2); assert.equal(rendered.find(s => s.source === 'microphone')?.role, 'candidate');
    assert.equal(store.read('owner', session.id).segments.length, 0);
    await engine.stop(); await engine.stop();
    assert.equal(events.filter(event => event.type === 'transcript:final').length, 2);
    assert.ok(rendered.every(segment => segment.isFinal));
    const recovered = new InterviewStore(directory).read('owner', session.id);
    assert.equal(recovered.status, 'interrupted'); assert.equal(recovered.segments.length, 2);
    const final = rendered[0];
    assert.equal(updateTranscript(rendered, { ...final, isFinal: false, revision: 100 }), rendered);
    store.finalize('owner', final); assert.equal(store.read('owner', session.id).segments.length, 2);
    assert.throws(() => store.read('other-owner', session.id)); assert.throws(() => store.read('owner', '../outside'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('silence and missing frames bound segments, malformed PCM is rejected', async () => {
  const events: InterviewEvent[] = [], engine = new InterviewEngine('session', recognizer, event => events.push(event));
  await engine.frame(frame('session', 0)); await engine.frame(frame('session', 2));
  for (let index = 3; index < 13; index++) await engine.frame(frame('session', index, 'system', false));
  assert.equal(events.filter(event => event.type === 'transcript:final').length, 2);
  await assert.rejects(engine.frame(frame('session', 12)), /Out-of-order/);
  assert.equal(validateFrame(frame('session', 0)).samples.length, 1600);
  for (const invalid of [null, { ...frame('session', 0), samples: new Float32Array(999999) }, { ...frame('session', 0), samples: new Float32Array(1600).fill(NaN) }, { ...frame('session', 0), source: 'other' }]) assert.throws(() => validateFrame(invalid));
});

test('remote file access cannot expose interview data directly, through symlinks, or ancestor archives', () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-privacy-'));
  try {
    const privateDirectory = join(directory, 'interviews'), publicDirectory = join(directory, 'public');
    mkdirSync(privateDirectory); mkdirSync(publicDirectory);
    assert.throws(() => assertRemoteInterviewAccess(privateDirectory, privateDirectory));
    assert.throws(() => assertRemoteInterviewAccess(directory, privateDirectory, true));
    assert.doesNotThrow(() => assertRemoteInterviewAccess(directory, privateDirectory));
    assert.doesNotThrow(() => assertRemoteInterviewAccess(publicDirectory, privateDirectory, true));
    symlinkSync(privateDirectory, join(publicDirectory, 'alias'), 'junction');
    assert.throws(() => assertRemoteInterviewAccess(join(publicDirectory, 'alias'), privateDirectory));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('optional speaker clustering labels system turns, keeps short turns unknown and fails without losing transcripts', async () => {
  let embedding = new Float32Array([1, 0]), failed = false, throws = false;
  const resolve = speakerResolver({ createStream: () => new Stream(), isReady: () => true, compute: () => { if (throws) throw new Error('inference failure'); return embedding; } }, 0.6, () => { failed = true; });
  const samples = new Float32Array(16000).fill(0.1);
  assert.equal(resolve(new Float32Array(8000)), 'system_1');
  assert.equal(resolve(samples), 'interviewer_1');
  embedding = new Float32Array([0.95, 0.05]); assert.equal(resolve(samples), 'interviewer_1');
  embedding = new Float32Array([0, 1]); assert.equal(resolve(samples), 'interviewer_2');
  throws = true; assert.equal(resolve(samples), 'system_1'); assert.equal(failed, true);
  throws = false; assert.equal(resolve(samples), 'system_1');
  const speakers: string[] = [];
  const engine = new InterviewEngine('session', recognizer, () => {}, 0.006, undefined, () => { speakers.push('system'); return 'interviewer_1'; });
  await engine.frame(frame('session', 0, 'microphone')); await engine.frame(frame('session', 0)); await engine.stop();
  assert.deepEqual(speakers, ['system']);
});

test('audio worklet sends independent 100 ms frames and bounds backlog with credits', () => {
  const sent: Array<{ samples: Float32Array; sequence: number }> = [];
  let Processor: any;
  runInNewContext(readFileSync('src/renderer/public/interview-audio-worklet.js', 'utf8'), {
    Float32Array, Math,
    AudioWorkletProcessor: class { port = { postMessage: (data: { samples: Float32Array; sequence: number }) => sent.push(structuredClone(data)), onmessage: () => {} }; },
    registerProcessor: (_name: string, processor: unknown) => { Processor = processor; },
  });
  const system = new Processor(), mic = new Processor();
  const audio = [[new Float32Array(1600).fill(0.25)]];
  system.process(audio); system.process(audio); system.process(audio);
  assert.equal(sent.length, 2); assert.equal(sent[0].samples.length, 1600);
  assert.equal(sent[0].samples[0], 0.25);
  system.port.onmessage(); system.process(audio);
  assert.equal(sent[2].sequence, 3, 'dropped frames leave a detectable sequence gap');
  mic.process(audio); assert.equal(sent[3].sequence, 0, 'microphone has an independent clock and credit budget');
});

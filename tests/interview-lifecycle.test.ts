import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InterviewService } from '../src/main/services/interviewService';

const options = { mode: 'interviewer', diarization: false, useVad: false, vadThreshold: 0.006 };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'novi-listening-'));
  const settings = { localASRModelId: 'selected' };
  const acquired: string[] = [], launched: string[] = [], released: string[] = [];
  const models = {
    snapshot: async (device: { availableMemory: number }) => {
      device.availableMemory = 8 * 1024 ** 3;
      return { models: ['fallback', 'selected'].map(id => ({ id, name: id, version: '1', type: 'asr', state: 'READY', estimatedRamBytes: 1, recommended: id === 'fallback' })) };
    },
    acquire: async (id: string) => { acquired.push(id); return { files: {}, release: () => released.push(id) }; },
  };
  const service = new InterviewService({ directory, current: () => ({ id: 'owner', settings }) } as any, models as any, '', () => {});
  (service as any).launch = async (session: { modelId: string }) => { launched.push(session.modelId); };
  return { service, models, settings, acquired, launched, released, cleanup: async () => { await service.stop(); rmSync(directory, { recursive: true, force: true }); } };
}

test('local restart waits for cancelled startup and loads the newly selected model', async () => {
  const f = fixture(), entered = deferred(), resume = deferred();
  const snapshot = f.models.snapshot;
  f.models.snapshot = async device => { entered.resolve(); await resume.promise; return snapshot(device); };
  try {
    const first = assert.rejects(f.service.start(options, 1), /cancelled/);
    await entered.promise;
    const stopped = f.service.stop();
    f.settings.localASRModelId = 'fallback';
    const restarted = f.service.start(options, 1);
    assert.deepEqual(f.acquired, []);
    resume.resolve();
    await first; await stopped;
    assert.equal((await restarted).modelId, 'fallback');
    assert.deepEqual(f.launched, ['fallback']);
    await f.service.stop();
    assert.deepEqual(f.released, ['fallback']);
    assert.equal(f.service.active, false);
  } finally { resume.resolve(); await f.cleanup(); }
});

test('explicit speech selection never silently falls back; automatic selection can recover', async () => {
  const f = fixture();
  (f.service as any).launch = async (session: { modelId: string }) => {
    f.launched.push(session.modelId);
    if (session.modelId === 'selected') throw new Error('Model load failed.');
  };
  try {
    await assert.rejects(f.service.start(options, 1), /selected could not start.*Model load failed/);
    assert.deepEqual(f.launched, ['selected']);
    assert.deepEqual(f.released, ['selected']);
    assert.equal(f.service.active, false);
    f.settings.localASRModelId = 'auto';
    const snapshot = f.models.snapshot;
    f.models.snapshot = async device => {
      const setup = await snapshot(device);
      for (const model of setup.models) model.recommended = model.id === 'selected';
      return setup;
    };
    assert.equal((await f.service.start(options, 1)).modelId, 'fallback');
    assert.deepEqual(f.launched, ['selected', 'selected', 'fallback']);
  } finally { await f.cleanup(); }
});

test('leaving Settings during model loading releases the old model before a new recording', async () => {
  const f = fixture(), entered = deferred(), resume = deferred();
  (f.service as any).launch = async (session: { modelId: string }) => {
    f.launched.push(session.modelId);
    entered.resolve(); await resume.promise;
  };
  try {
    const first = assert.rejects(f.service.start(options, 1), /cancelled/);
    await entered.promise;
    const stopped = f.service.stop();
    f.settings.localASRModelId = 'fallback';
    const restarted = f.service.start(options, 1);
    resume.resolve();
    await first; await stopped;
    assert.equal((await restarted).modelId, 'fallback');
    assert.deepEqual(f.released, ['selected']);
    assert.deepEqual(f.launched, ['selected', 'fallback']);
  } finally { resume.resolve(); await f.cleanup(); }
});

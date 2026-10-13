import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import childProcess, { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { mock, test } from 'node:test';
import { spawnEngine } from '../src/main/services/codingAgents/process';
import { fakeOpenAI } from './support/fakeProviders';

test('shutdown waits for pipes to close even after the process exits', async () => {
  const child = Object.assign(new EventEmitter(), { exitCode: 0, signalCode: null });
  const stub = mock.method(childProcess, 'spawn', () => child as ChildProcessWithoutNullStreams);
  syncBuiltinESMExports();
  try {
    const engine = spawnEngine('engine', [], {});
    let stopped = false;
    const stopping = engine.stop().then(() => { stopped = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(stopped, false, 'an exit alone must not release the work folder');
    child.emit('close', 0, null);
    await stopping;
    assert.equal(stopped, true);
    await engine.stop();
  } finally { stub.mock.restore(); syncBuiltinESMExports(); }
});

test('engine shutdown waits for process and pipes before removing its work folder', { timeout: 10_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novi-process-'));
  const engine = spawnEngine(process.execPath, ['-e', `
    require('node:fs').openSync('busy.txt', 'w');
    setInterval(() => {}, 1000);
    process.stdout.write('ready');
  `], { cwd: root });
  t.after(async () => { await engine.stop(); await rm(root, { recursive: true, force: true }); });
  await once(engine.child.stdout, 'data');
  let closed = false;
  engine.child.once('close', () => { closed = true; });
  await engine.stop();
  assert(closed, 'stop must await close, not just send a termination signal');
  assert(engine.child.stdout.destroyed && engine.child.stderr.destroyed);
  await rm(root, { recursive: true });
  await engine.stop();
});

test('engine shutdown handles an already exited process and a failed spawn', { timeout: 10_000 }, async () => {
  const finished = spawnEngine(process.execPath, ['-e', ''], {});
  await once(finished.child, 'close');
  await finished.stop();
  const failed = spawnEngine(join(tmpdir(), 'novi-nonexistent-executable'), [], {});
  const [error] = await once(failed.child, 'error');
  assert.equal(error.code, 'ENOENT');
  await failed.stop();
});

test('fake provider teardown closes a connection with an unfinished request', { timeout: 5000 }, async (t) => {
  const provider = await fakeOpenAI(() => ({ text: 'unused' }));
  t.after(() => provider.close());
  const socket = connect(Number(new URL(provider.url).port), '127.0.0.1');
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  socket.write('POST /v1/responses HTTP/1.1\r\n');
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
  socket.on('error', () => { /* teardown can reset an unfinished connection */ });
  await provider.close();
  await closed;
});

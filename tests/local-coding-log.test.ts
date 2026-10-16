import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeLocalCodingError } from '../src/main/services/localCodingLog';

const context = { taskId: 'request-123', engine: 'antigravity' as const, model: 'gemini-test', state: 'preparing' as const };

test('coding logs preserve error causes and engine diagnostics, redact credentials, and stay private', t => {
  const root = mkdtempSync(join(tmpdir(), 'novi-log-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const key = 'private/key+value';
  const cause = Object.assign(new Error(`failure with ${key}`), { code: 'EPIPE', syscall: 'write' });
  const error = Object.assign(new Error('Antigravity failed.', { cause }), {
    diagnostics: { engineVersion: '1.2.14', exitCode: 1, stderr: `\x1b[31mroot schema rejected\x1b[0m\n${encodeURIComponent(key)}\nBearer another-secret\nsk-${'x'.repeat(30)}\nAIza${'y'.repeat(30)}` },
  });
  const file = writeLocalCodingError(root, context, error, key)!;
  assert.equal(file, join(root, 'logs', 'local-coding.log'));
  const raw = readFileSync(file, 'utf8'), record = JSON.parse(raw);
  assert.equal(record.taskId, context.taskId);
  assert.equal(record.engine, 'antigravity');
  assert.equal(record.error.cause.code, 'EPIPE');
  assert.match(record.error.stack, /Antigravity failed/);
  assert.equal(record.error.diagnostics.engineVersion, '1.2.14');
  assert.match(record.error.diagnostics.stderr, /root schema rejected/);
  for (const secret of [key, encodeURIComponent(key), 'another-secret', 'x'.repeat(30), 'y'.repeat(30), '\x1b']) assert(!raw.includes(secret));
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('coding logs append, rotate at 1 MiB, and bound oversized or circular diagnostics', t => {
  const root = mkdtempSync(join(tmpdir(), 'novi-log-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = writeLocalCodingError(root, context, new Error('first'), '')!;
  writeLocalCodingError(root, context, new Error('second'), '');
  assert.deepEqual(readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line).error.message), ['first', 'second']);
  writeFileSync(file, 'x'.repeat(1024 * 1024));
  const error = Object.assign(new Error('third'), { diagnostics: { stderr: 'large diagnostic '.repeat(100_000) } });
  error.cause = error;
  assert.equal(writeLocalCodingError(root, context, error, ''), file);
  assert.equal(statSync(`${file}.1`).size, 1024 * 1024);
  const record = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(record.error.cause, '[Circular]');
  assert.equal(record.error.diagnostics.stderr.length, 16_384);
  assert(statSync(file).size < 65_536);
});

test('logging reports failure without throwing when its directory is unwritable', t => {
  const root = mkdtempSync(join(tmpdir(), 'novi-log-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'logs'), 'not a directory');
  assert.equal(writeLocalCodingError(root, context, new Error('original failure'), ''), null);
});

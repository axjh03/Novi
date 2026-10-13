import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import http, { IncomingMessage, type ClientRequest } from 'node:http';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { require as tsxRequire } from 'tsx/cjs/api';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UpdateProgress } from '../src/shared/types';
import { SettingsAppUpdater } from '../src/renderer/src/components/SettingsAppUpdater';
import { updaterService } from '../src/renderer/src/services/updaterService';

const { AppUpdater } = tsxRequire('../src/main/services/updater.ts', import.meta.url) as typeof import('../src/main/services/updater');

function fixture(t: TestContext, handler: (path: string, response: IncomingMessage) => void | Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'novi-updater-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // Mock the network boundary; exercise real response streams, disk writes and cleanup.
  t.mock.method(http, 'get', (url: string, callback: (response: IncomingMessage) => void) => {
    const request = new EventEmitter() as ClientRequest;
    request.setTimeout = () => request;
    queueMicrotask(() => {
      const response = new IncomingMessage(new Socket());
      response.statusCode = 200;
      callback(response);
      void handler(new URL(url).pathname, response);
    });
    return request;
  });
  return { directory, url: 'http://update.test' };
}

test('update downloads report real bytes, sampled speed and percent through relative redirects', async t => {
  const body = Buffer.alloc(2000, 'x');
  const server = fixture(t, async (path, response) => {
    if (path === '/redirect') {
      response.statusCode = 302; response.headers.location = '/payload'; response.push(null); return;
    }
    if (path === '/payload') response.headers['content-length'] = String(body.length);
    response.push(body.subarray(0, 1000));
    await delay(1150);
    response.push(body.subarray(1000)); response.push(null);
  });
  const updater = new AppUpdater();
  for (const path of ['/redirect', '/unknown-size']) {
    const events: UpdateProgress[] = [];
    const dest = join(server.directory, 'payload');
    await updater['downloadFile'](server.url + path, dest, progress => events.push(progress));
    assert.deepEqual(readFileSync(dest), body);
    assert.equal(events[0].downloadedBytes, 0);
    const during = events.find(event => event.downloadedBytes === 1000);
    assert(during);
    assert(during.bytesPerSecond! > 0 && Number.isFinite(during.bytesPerSecond));
    assert.equal(during.percent, path === '/redirect' ? 50 : null);
    assert.equal(during.totalBytes, path === '/redirect' ? body.length : undefined);
    assert(events.some(event => event.downloadedBytes === 1000 && event.bytesPerSecond === 0), 'speed drops to zero while the download stalls');
    const final = events.at(-1)!;
    assert.equal(final.percent, 100);
    assert.equal(final.downloadedBytes, body.length);
    assert.equal(final.totalBytes, body.length);
    assert(events.length < 10, 'progress is sampled instead of emitted for every chunk');
  }
});

test('failed, truncated and unwritable downloads reject, remove partial files and allow retry', async t => {
  const server = fixture(t, async (path, response) => {
    if (path === '/loop') {
      response.statusCode = 302; response.headers.location = '/loop'; response.push(null); return;
    }
    if (path === '/error') { response.statusCode = 503; response.push(null); return; }
    if (path === '/truncated') {
      response.headers['content-length'] = '100'; response.push(Buffer.from('partial'));
      await delay(20); response.destroy(new Error('aborted')); return;
    }
    response.push(Buffer.from('complete')); response.push(null);
  });
  const updater = new AppUpdater(), dest = join(server.directory, 'payload');
  for (const [path, error] of [['/error', /503/], ['/loop', /redirects/], ['/truncated', /aborted|premature/i]] as const) {
    const events: UpdateProgress[] = [];
    await assert.rejects(updater['downloadFile'](server.url + path, dest, progress => events.push(progress)), error);
    assert.equal(existsSync(dest), false);
    assert(!events.some(event => event.percent === 100));
    const count = events.length;
    await delay(550);
    assert.equal(events.length, count, 'failed downloads stop reporting progress');
  }
  await assert.rejects(updater['downloadFile'](server.url, join(server.directory, 'missing', 'payload'), () => {}), /ENOENT/);
  await updater['downloadFile'](server.url, dest, () => {});
  assert.equal(readFileSync(dest, 'utf8'), 'complete');
});

test('update page shows size, speed and percent, and stays indeterminate when size is unknown', t => {
  let progress: UpdateProgress = { status: 'Downloading update...', percent: 50, downloadedBytes: 125_000_000, totalBytes: 250_000_000, bytesPerSecond: 2_500_000 };
  t.mock.method(updaterService, 'getState', () => ({
    status: 'downloading', progress, error: null, lastCheckedAt: null,
    result: { hasUpdate: true, currentVersion: '1.0.0', latestVersion: '1.1.0' },
  }));
  const render = () => renderToStaticMarkup(createElement(SettingsAppUpdater, {
    value: { displayName: 'Test', theme: 'system', clickThroughShortcut: 'Alt+C' }, onChange: () => {},
  }));
  const known = render();
  assert.match(known, /125\.0 MB/); assert.match(known, /250\.0 MB/); assert.match(known, /2\.5 MB/);
  assert.match(known, /50%/); assert.match(known, /aria-valuenow="50"/);
  assert.match(known, /Updating to v1\.1\.0/);
  progress = { ...progress, percent: null, totalBytes: undefined, bytesPerSecond: 0 };
  const unknown = render();
  assert.match(unknown, /Size unknown/); assert.match(unknown, /0 B/);
  assert.match(unknown, /indeterminate/); assert.doesNotMatch(unknown, /aria-valuenow|NaN|Infinity/);
  progress = { percent: null, status: 'Installing update...' };
  const installing = render();
  assert.match(installing, /Installing update/); assert.doesNotMatch(installing, /Download speed/);
});

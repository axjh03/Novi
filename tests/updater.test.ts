import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import http, { IncomingMessage, type ClientRequest } from 'node:http';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import childProcess, { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UpdateProgress } from '../src/shared/types';
import { SettingsAppUpdater } from '../src/renderer/src/components/SettingsAppUpdater';
import { updaterService } from '../src/renderer/src/services/updaterService';

// The updater reads electron's app and shell when it runs; install a stand-in before the module loads.
const require = createRequire(import.meta.url);
const electronPath = require.resolve('electron');
require(electronPath);
const electron = {
  temp: tmpdir(), version: '4.0.5', relaunches: [] as unknown[], opened: [] as string[], external: [] as string[],
  dialogs: [] as Array<{ message: string; detail: string; buttons: string[] }>, dialogResponse: 1,
};
require.cache[electronPath]!.exports = {
  app: {
    isPackaged: true, getVersion: () => electron.version, getPath: () => electron.temp,
    relaunch: (options: unknown) => { electron.relaunches.push(options); }, quit: () => {},
  },
  shell: {
    openPath: async (path: string) => { electron.opened.push(path); return ''; },
    openExternal: async (url: string) => { electron.external.push(url); },
  },
  // Records each message box and answers with the button index in electron.dialogResponse.
  dialog: {
    showMessageBox: async (...args: unknown[]) => { electron.dialogs.push(args.at(-1) as typeof electron.dialogs[number]); return { response: electron.dialogResponse }; },
  },
};
const { AppUpdater, releaseFile, manifestEntry, LINUX_ROOT_INSTALL, windowsInstallerArgs, reportUnfinishedUpdate } = require('../src/main/services/updater.ts') as typeof import('../src/main/services/updater');

function fixture(t: TestContext, handler: (path: string, response: IncomingMessage, url: URL) => void | Promise<void>) {
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
      void handler(new URL(url).pathname, response, new URL(url));
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

// The manifests published with v4.0.12, as electron-builder wrote them.
const PUBLISHED: Record<string, string> = {
  'latest-linux.yml': `version: 4.0.12
files:
  - url: novi_4.0.12_x86_64.AppImage
    sha512: nQFhIUSJaWh1aR0k99oJIRVYNc7e8ntddc0sFtzYNrnY21dC9RkxZmSXLBLn0ApQbQdR4SPIzvr7NFGWGaMqZA==
    size: 573820032
    blockMapSize: 597140
  - url: novi_4.0.12_amd64.deb
    sha512: IjgkW9O/aqxGdWz77o3A56gPA6gaWMVfuAdstdCTubFyhiwRhY8Cl1YqQe3WzM/ZcsJFgKmW31gr7BBIS0g6/g==
    size: 451943032
path: novi_4.0.12_x86_64.AppImage
sha512: nQFhIUSJaWh1aR0k99oJIRVYNc7e8ntddc0sFtzYNrnY21dC9RkxZmSXLBLn0ApQbQdR4SPIzvr7NFGWGaMqZA==
releaseDate: '2026-10-14T22:21:42.235Z'
`,
  'latest-linux-arm64.yml': `version: 4.0.12
files:
  - url: novi_4.0.12_arm64.AppImage
    sha512: jJxZux65UgNvmiIFLo9ACwQY96u2BpyHCQXVnde28gXH1VVHoUfn2A9SSX3BxdGcNnf9iCDDCsMH3PmQ8sz+Mw==
    size: 576664407
    blockMapSize: 601763
  - url: novi_4.0.12_arm64.deb
    sha512: 1Uczss1H4CYIz38EW/A89xOgspskE1BysK2TWqt5X3f9Apwp0h3sqz0nw4+cmBaYHIqUuNDDEyfG+JHZ4gIp3A==
    size: 439705132
path: novi_4.0.12_arm64.AppImage
sha512: jJxZux65UgNvmiIFLo9ACwQY96u2BpyHCQXVnde28gXH1VVHoUfn2A9SSX3BxdGcNnf9iCDDCsMH3PmQ8sz+Mw==
releaseDate: '2026-10-14T22:21:42.235Z'
`,
  'latest.yml': `version: 4.0.12
files:
  - url: Novi-Setup-4.0.12.exe
    sha512: ghGXzZL3Vmw+HK42+pED/CZGFK9Nb9ZQ49QSed/TFTxD/FZxmKbIBzz80p+HXWbY6n9ZcLhbpKvO+DVjggJQ7Q==
    size: 416230926
path: Novi-Setup-4.0.12.exe
sha512: ghGXzZL3Vmw+HK42+pED/CZGFK9Nb9ZQ49QSed/TFTxD/FZxmKbIBzz80p+HXWbY6n9ZcLhbpKvO+DVjggJQ7Q==
releaseDate: '2026-10-14T22:11:59.698Z'
`,
  'latest-mac.yml': `version: 4.0.12
files:
  - url: Novi-4.0.12-x64.dmg
    sha512: DltmGqq9Ajg/o8sNAtohi2y2N84Qd+7FLUCWFpaKoo/r9sKTiO+jnTxsW4NxlLnZyevX1huS3Gy/3dFvNB/x2g==
    size: 538717107
  - url: Novi-4.0.12-arm64.dmg
    sha512: op1V0cEu5DyqSA6Wz8QEsxzlYl7R60Vxo7YedoK8l+3iPWyMG/8WF3VmZE2BhXFEOZJ198+7QBqHL3C256lDnQ==
    size: 504046954
path: Novi-4.0.12-x64.dmg
sha512: DltmGqq9Ajg/o8sNAtohi2y2N84Qd+7FLUCWFpaKoo/r9sKTiO+jnTxsW4NxlLnZyevX1huS3Gy/3dFvNB/x2g==
releaseDate: '2026-10-14T22:05:47.163Z'
`,
};

test('each machine asks for its own published installer and finds its checksum', () => {
  const cases = [
    ['darwin', 'arm64', null, 'Novi-4.0.12-arm64.dmg', 504046954],
    ['darwin', 'x64', null, 'Novi-4.0.12-x64.dmg', 538717107],
    ['win32', 'x64', null, 'Novi-Setup-4.0.12.exe', 416230926],
    ['linux', 'x64', { kind: 'deb' }, 'novi_4.0.12_amd64.deb', 451943032],
    ['linux', 'arm64', { kind: 'deb' }, 'novi_4.0.12_arm64.deb', 439705132],
    ['linux', 'x64', { kind: 'appimage', path: '/x' }, 'novi_4.0.12_x86_64.AppImage', 573820032],
    ['linux', 'arm64', { kind: 'appimage', path: '/x' }, 'novi_4.0.12_arm64.AppImage', 576664407],
  ] as const;
  for (const [platform, arch, install, name, size] of cases) {
    const file = releaseFile('4.0.12', platform, arch, install);
    assert.equal(file?.name, name);
    const entry = manifestEntry(PUBLISHED[file!.manifest], file!.name);
    assert.equal(entry?.size, size, name);
    assert.equal(entry?.version, '4.0.12');
    assert.equal(Buffer.from(entry!.sha512, 'base64').length, 64, 'a full SHA-512');
  }
  assert.equal(releaseFile('4.0.12', 'linux', 'x64', null), null, 'an unknown Linux install has no installer');
  assert.equal(releaseFile('4.0.12', 'linux', 'ia32', { kind: 'deb' }), null, 'no 32-bit Linux build exists');
});

test('manifest reading takes only the named file entry and rejects incomplete entries', () => {
  const text = "version: '4.1.0'\r\nfiles:\r\n  - url: \"a.deb\"\r\n    sha512: 'AAAA'\r\n    size: 10\r\n  - url: b.deb\r\n    size: 5\r\npath: a.deb\r\nsha512: ZZZZ\r\nsize: 99\r\n";
  assert.deepEqual(manifestEntry(text, 'a.deb'), { version: '4.1.0', sha512: 'AAAA', size: 10 });
  assert.equal(manifestEntry(text, 'b.deb'), null, 'no checksum');
  assert.equal(manifestEntry(text, 'c.deb'), null, 'not listed');
  assert.equal(manifestEntry('files:\n  - url: a.deb\n    sha512: AAAA\n    size: 10\n', 'a.deb'), null, 'no version');
  assert.equal(manifestEntry('', 'a.deb'), null);
});

const PAYLOAD = Buffer.from('new release payload '.repeat(500));
const sha512 = (data: Buffer) => createHash('sha512').update(data).digest('base64');

function releaseServer(t: TestContext, options: { version?: string; manifest?: (name: string) => string | null; online?: boolean; notice?: string } = {}) {
  const version = options.version ?? '4.1.0';
  const requests: string[] = [];
  process.env.NOVI_PORTAL_URL = 'http://update.test';
  t.after(() => { delete process.env.NOVI_PORTAL_URL; });
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    if (options.online === false) throw new TypeError('fetch failed');
    const url = new URL(input);
    requests.push(url.pathname + url.search);
    if (url.pathname === '/api/releases/latest') return new Response(JSON.stringify({ data: { version, releaseNotes: 'Notes', ...(options.notice ? { notice: options.notice } : {}) } }));
    const file = url.searchParams.get('file') || '';
    const manifest = options.manifest ? options.manifest(file) : `version: ${version}\nfiles:\n  - url: NAME\n    sha512: ${sha512(PAYLOAD)}\n    size: ${PAYLOAD.length}\n`;
    return manifest === null ? new Response('missing', { status: 404 }) : new Response(manifest);
  });
  const downloads: string[] = [];
  const server = fixture(t, async (path, response, url) => {
    downloads.push(url.searchParams.get('file') || path);
    response.headers['content-length'] = String(PAYLOAD.length);
    response.push(PAYLOAD); response.push(null);
  });
  electron.temp = server.directory;
  electron.relaunches = []; electron.opened = []; electron.external = [];
  return { ...server, requests, downloads };
}

function namedManifest(version: string, data = PAYLOAD) {
  return (file: string) => file.endsWith('.yml') ? `version: ${version}\nfiles:\n  - url: novi_${version}_${process.arch === 'arm64' ? 'arm64' : 'x86_64'}.AppImage\n    sha512: ${sha512(data)}\n    size: ${data.length}\n  - url: novi_${version}_${process.arch === 'arm64' ? 'arm64' : 'amd64'}.deb\n    sha512: ${sha512(data)}\n    size: ${data.length}\n` : null;
}

const linuxOnly = { skip: process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch) ? 'Linux x64/arm64 install paths' : false };

test('an AppImage replaces itself with the verified download and relaunches from the same path', linuxOnly, async t => {
  const server = releaseServer(t, { manifest: namedManifest('4.1.0') });
  const folder = join(server.directory, 'Applications'); mkdirSync(folder);
  const appImage = join(folder, 'Novi.AppImage'); writeFileSync(appImage, 'old release', { mode: 0o755 });
  process.env.APPIMAGE = appImage; t.after(() => { delete process.env.APPIMAGE; });
  const events: UpdateProgress[] = [];
  await new AppUpdater().installUpdate(progress => events.push(progress));
  assert.deepEqual(readFileSync(appImage), PAYLOAD);
  assert.equal(statSync(appImage).mode & 0o777, 0o755);
  assert.deepEqual(readdirSync(folder), ['Novi.AppImage'], 'no partial or temporary files remain');
  assert.deepEqual(readdirSync(server.directory).filter(name => name.startsWith('novi-update-')), [], 'the private download folder is removed');
  assert.deepEqual(server.downloads, [`novi_4.1.0_${process.arch === 'arm64' ? 'arm64' : 'x86_64'}.AppImage`]);
  assert(server.requests.includes(`/api/download?file=latest-linux${process.arch === 'arm64' ? '-arm64' : ''}.yml`));
  assert.deepEqual(electron.relaunches, [{ execPath: appImage, args: process.argv.slice(1) }]);
  assert.deepEqual(events.map(event => event.status).filter((status, index, all) => all.indexOf(status) === index),
    ['Checking the latest release...', 'Connecting to download...', 'Downloading update...', 'Verifying download...', 'Installing update...', 'Restarting Novi...']);
});

test('a download that does not match the published checksum is discarded and nothing is replaced', linuxOnly, async t => {
  const server = releaseServer(t, { manifest: namedManifest('4.1.0', Buffer.from('something else')) });
  const appImage = join(server.directory, 'Novi.AppImage'); writeFileSync(appImage, 'old release', { mode: 0o755 });
  process.env.APPIMAGE = appImage; t.after(() => { delete process.env.APPIMAGE; });
  const updater = new AppUpdater();
  await assert.rejects(updater.installUpdate(() => {}), /did not match its published checksum/);
  assert.equal(readFileSync(appImage, 'utf8'), 'old release');
  assert.deepEqual(readdirSync(server.directory).sort(), ['Novi.AppImage']);
  assert.deepEqual(electron.relaunches, []);
  // A missing manifest, or one for another release, stops before anything is downloaded.
  for (const manifest of [() => null, namedManifest('4.0.9')]) {
    const again = releaseServer(t, { manifest });
    process.env.APPIMAGE = appImage;
    await assert.rejects(updater.installUpdate(() => {}), /could not verify this update/, 'the updater can be retried after a failure');
    assert.deepEqual(again.downloads, []);
    assert.equal(readFileSync(appImage, 'utf8'), 'old release');
  }
});

/** A bin folder whose package tools record what they were asked to install. */
function fakeTools(t: TestContext, tools: Record<string, string>) {
  const bin = mkdtempSync(join(tmpdir(), 'novi-updater-bin-'));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  for (const tool of ['mktemp', 'cp', 'mv', 'chmod', 'rm', 'sha512sum', 'install', 'cat', 'ls', 'cut', 'dirname']) symlinkSync(spawnSync('sh', ['-c', `command -v ${tool}`]).stdout.toString().trim(), join(bin, tool));
  for (const [name, body] of Object.entries(tools)) { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); }
  return bin;
}

test('a .deb update installs through the password prompt with the root-checked package, then relaunches', linuxOnly, async t => {
  const server = releaseServer(t, { manifest: namedManifest('4.1.0') });
  const record = join(server.directory, 'record');
  const bin = fakeTools(t, { 'apt-get': `echo "$@" > "${record}.args"; cat "$9" > "${record}.deb"; ls -ld "$(dirname "$9")" | cut -c1-10 > "${record}.mode"` });
  const real = childProcess.spawn;
  const calls: string[][] = [];
  // pkexec runs its program as root; here the same program runs as this user with the fake package tools.
  t.mock.method(childProcess, 'spawn', (command: string, args: string[], options: any) => {
    calls.push([command, ...args]);
    return real(args[0], args.slice(1), { ...options, env: { PATH: bin } });
  });
  const updater = new AppUpdater();
  t.mock.method(updater, 'linuxInstall', async () => ({ kind: 'deb' }));
  let yielded = 0, restored = 0;
  const events: UpdateProgress[] = [];
  await updater.installUpdate(progress => events.push(progress), { yieldWindows: () => { yielded++; return () => { restored++; }; } });
  const debName = `novi_4.1.0_${process.arch === 'arm64' ? 'arm64' : 'amd64'}.deb`;
  assert.deepEqual(server.downloads, [debName]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 3), ['pkexec', '/bin/sh', '-c']);
  assert.equal(calls[0][6], createHash('sha512').update(PAYLOAD).digest('hex'), 'root re-checks the hex SHA-512');
  assert.equal(calls[0][7], 'deb');
  assert.deepEqual(readFileSync(`${record}.deb`), PAYLOAD, 'the package manager received the verified package');
  assert.match(readFileSync(`${record}.args`, 'utf8'), /^install -y -o DPkg::Lock::Timeout=300 .*\/novi\.deb$/m);
  assert.equal(readFileSync(`${record}.mode`, 'utf8').trim(), 'drwxr-xr-x', 'the root copy is readable by apt but not writable by others');
  assert.equal(existsSync(calls[0][5]), false, 'the download is removed after installing');
  assert.deepEqual([yielded, restored], [1, 0]);
  assert(events.some(event => event.status === 'Installing update (enter your password when asked)...'));
  assert.deepEqual(electron.relaunches, [{ execPath: process.execPath, args: process.argv.slice(1) }]);
});

test('a dismissed password prompt cancels cleanly; a desktop without one hands the package to the software installer', linuxOnly, async t => {
  const server = releaseServer(t, { manifest: namedManifest('4.1.0') });
  let exitCode: number | 'missing' = 126;
  t.mock.method(childProcess, 'spawn', () => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
    setImmediate(() => exitCode === 'missing' ? child.emit('error', Object.assign(new Error('spawn pkexec ENOENT'), { code: 'ENOENT' })) : child.emit('close', exitCode));
    return child;
  });
  const updater = new AppUpdater();
  t.mock.method(updater, 'linuxInstall', async () => ({ kind: 'deb' }));
  let restored = 0;
  const options = { yieldWindows: () => () => { restored++; } };
  await assert.rejects(updater.installUpdate(() => {}, options), /Update cancelled/);
  assert.equal(restored, 1, 'windows return to their normal stacking');
  assert.deepEqual(readdirSync(server.directory).filter(name => name.startsWith('novi-update-')), []);
  exitCode = 127;
  await assert.rejects(updater.installUpdate(() => {}, options), /opened the verified update in your software installer/);
  assert.equal(electron.opened.length, 1);
  assert.deepEqual(readFileSync(electron.opened[0]), PAYLOAD, 'the verified package is kept for the installer');
  exitCode = 'missing';
  await assert.rejects(updater.installUpdate(() => {}, options), /software installer/);
  assert.equal(electron.opened.length, 2);
  assert.equal(restored, 3);
  assert.deepEqual(electron.relaunches, []);
  for (const path of electron.opened) rmSync(join(path, '..'), { recursive: true, force: true });
});

test('an install Novi cannot replace opens the download page instead of failing silently', linuxOnly, async t => {
  const server = releaseServer(t);
  const updater = new AppUpdater();
  t.mock.method(updater, 'linuxInstall', async () => null);
  await assert.rejects(updater.installUpdate(() => {}), /cannot replace itself\. The download page has opened/);
  assert.deepEqual(electron.external, ['http://update.test/download']);
  assert.deepEqual(server.downloads, []);
});

test('the root install script checks the copy it installs and reports each failure distinctly', { skip: process.platform !== 'linux' ? 'Linux only' : false }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-root-script-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'download'); writeFileSync(source, PAYLOAD);
  const hex = createHash('sha512').update(PAYLOAD).digest('hex');
  const run = (bin: string, sum: string, target: string) => spawnSync('/bin/sh', ['-c', LINUX_ROOT_INSTALL, 'novi-update', source, sum, target], { env: { PATH: bin }, encoding: 'utf8' });
  const plain = fakeTools(t, {});
  const target = join(directory, 'Novi.AppImage'); writeFileSync(target, 'old');
  assert.equal(run(plain, hex.replace(/^./, hex[0] === '0' ? '1' : '0'), target).status, 3);
  assert.equal(readFileSync(target, 'utf8'), 'old', 'a mismatched copy is never installed');
  assert.equal(run(plain, hex, target).status, 0);
  assert.deepEqual(readFileSync(target), PAYLOAD);
  assert.equal(statSync(target).mode & 0o777, 0o755);
  // Without apt-get the package goes to dpkg; a failing package manager reports its last message.
  const dpkg = fakeTools(t, { dpkg: 'echo "dpkg: dependency problems prevent configuration of novi" >&2; exit 1' });
  const failed = run(dpkg, hex, 'deb');
  assert.equal(failed.status, 4);
  assert.match(failed.stderr, /dependency problems/);
  assert.equal(run(plain, hex, 'deb').status, 4, 'no package manager at all is an install failure');
  assert.equal(spawnSync('/bin/sh', ['-c', LINUX_ROOT_INSTALL, 'novi-update', join(directory, 'nope'), hex, target], { env: { PATH: plain } }).status, 2);
});

test('a manual check with no connection reports the problem instead of claiming Novi is up to date', async t => {
  releaseServer(t, { online: false });
  await assert.rejects(new AppUpdater().checkForUpdates(), /Could not reach the update server/);
});

test('a Mac sends its macOS version, and the portal\'s reason for holding a release back reaches Settings', async t => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  // process.getSystemVersion only exists inside Electron; stand in for a Mac on macOS 12.
  (process as any).getSystemVersion = () => '12.7.6';
  t.after(() => { Object.defineProperty(process, 'platform', original); delete (process as any).getSystemVersion; });
  const server = releaseServer(t, { version: '4.0.25', notice: 'Novi 4.0.26 and later need macOS 13 or later.' });
  const result = await new AppUpdater().checkForUpdates();
  assert(server.requests.some(request => request.startsWith('/api/releases/latest?platform=darwin&arch=') && request.endsWith('&os=12.7.6')), server.requests.join(', '));
  assert.equal(result.notice, 'Novi 4.0.26 and later need macOS 13 or later.');
});

test('Windows update arguments wait for Novi, keep the install type, and never need quoting', () => {
  const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramW6432: 'C:\\Program Files' };
  assert.deepEqual(windowsInstallerArgs(4321, 'C:\\Users\\Jane Doe\\AppData\\Local\\Programs\\Novi\\Novi.exe', env), ['--novi-wait-pid=4321', '--updated', '/S', '--force-run', '/currentuser']);
  assert.equal(windowsInstallerArgs(4321, 'C:\\Program Files\\Novi\\Novi.exe', env).at(-1), '/allusers');
  assert.equal(windowsInstallerArgs(1, 'c:\\program files (x86)\\Novi\\Novi.exe', env).at(-1), '/allusers', 'paths compare without case');
  assert.equal(windowsInstallerArgs(1, 'C:\\Program FilesX\\Novi\\Novi.exe', env).at(-1), '/currentuser', 'a folder that only starts with the same letters is not Program Files');
  assert.equal(windowsInstallerArgs(1, 'C:\\Program Files\\Novi\\Novi.exe', {}).at(-1), '/currentuser', 'unknown Program Files folders mean a per-user install');
  for (const arg of windowsInstallerArgs(1, 'C:\\Program Files\\Novi\\Novi.exe', env)) assert.doesNotMatch(arg, /\s|"/, 'Node quotes arguments with spaces; NSIS options must stay unquoted');
  assert(!windowsInstallerArgs(1, 'C:\\x\\Novi.exe', env).some(arg => /^\/D=/i.test(arg)), 'no /D=: once quoted it would install into a folder name ending in a quote');
});

const windowsManifest = (data = PAYLOAD) => (file: string) => file === 'latest.yml'
  ? "version: 4.1.0\nfiles:\n  - url: Novi-Setup-4.1.0.exe\n    sha512: " + sha512(data) + "\n    size: " + data.length + "\n" : null;

/** Makes the updater take its Windows path on any machine. Only code that never calls Windows itself runs under it. */
function pretendWindows(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  t.after(() => Object.defineProperty(process, 'platform', original));
}

test('Windows starts the verified installer detached with the update arguments, leaves a note, then quits', async t => {
  pretendWindows(t);
  await delay(450); // Let quit timers left by earlier update tests fire before counting quits here.
  const server = releaseServer(t, { manifest: windowsManifest() });
  const quit = t.mock.method(require(electronPath).app, 'quit');
  const child = Object.assign(new EventEmitter(), { unref: t.mock.fn() });
  const launch = t.mock.method(childProcess, 'spawn', () => { setImmediate(() => child.emit('spawn')); return child; });
  const events: UpdateProgress[] = [];
  await new AppUpdater().installUpdate(event => events.push(event));
  const installer = join(server.directory, 'novi-in-app-update', 'setup.exe');
  assert.equal(launch.mock.callCount(), 1);
  const [command, args, options] = launch.mock.calls[0].arguments as unknown as [string, string[], object];
  assert.equal(command, installer, 'the installer itself is started, not PowerShell');
  assert.deepEqual(args, windowsInstallerArgs(process.pid, process.execPath));
  assert.deepEqual(options, { detached: true, stdio: 'ignore' });
  assert.equal(child.unref.mock.callCount(), 1);
  assert.deepEqual(readFileSync(installer), PAYLOAD, 'the verified download is what runs');
  assert.deepEqual(server.downloads, ['Novi-Setup-4.1.0.exe']);
  assert(server.requests.some(request => request.startsWith('/api/releases/latest?platform=win32&arch=')), 'the update check names this system');
  assert(!server.requests.some(request => request.includes('os=')), 'only Macs send their system version');
  const note = JSON.parse(readFileSync(join(server.directory, 'pending-update.json'), 'utf8'));
  assert.equal(note.version, '4.1.0');
  assert.equal(note.installer, installer);
  assert.equal(quit.mock.callCount(), 0, 'Novi quits only after the installer has started');
  assert(events.at(-1)!.status.startsWith('Restarting'));
  await delay(450);
  assert.equal(quit.mock.callCount(), 1);
});

test('Windows keeps Novi open when the installer cannot start, allows retry, and rejects an unverified payload', async t => {
  pretendWindows(t);
  await delay(450); // Let quit timers left by earlier update tests fire before counting quits here.
  const server = releaseServer(t, { manifest: windowsManifest() });
  const quit = t.mock.method(require(electronPath).app, 'quit');
  const launch = t.mock.method(childProcess, 'spawn', () => {
    const child = Object.assign(new EventEmitter(), { unref: () => {} });
    setImmediate(() => child.emit('error', Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN' })));
    return child;
  });
  const updater = new AppUpdater();
  await assert.rejects(updater.installUpdate(() => {}), /Windows could not start the Novi installer \(spawn UNKNOWN\)/);
  assert.equal(existsSync(join(server.directory, 'pending-update.json')), false, 'no note is left when nothing was handed over');
  await assert.rejects(updater.installUpdate(() => {}), /could not start the Novi installer/, 'a retry is allowed');
  assert.equal(launch.mock.callCount(), 2);
  releaseServer(t, { manifest: windowsManifest(Buffer.from('wrong checksum')) });
  await assert.rejects(updater.installUpdate(() => {}), /did not match its published checksum/);
  assert.equal(launch.mock.callCount(), 2, 'an unverified download is never started');
  await delay(450);
  assert.equal(quit.mock.callCount(), 0);
});

test('the next start reports an update that did not install, and cleans up after one that did', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-pending-'));
  t.after(() => { rmSync(directory, { recursive: true, force: true }); electron.version = '4.0.5'; electron.dialogs = []; electron.dialogResponse = 1; });
  electron.temp = directory;
  electron.dialogs = [];
  electron.external = [];
  const note = join(directory, 'pending-update.json'), installer = join(directory, 'setup.exe');
  const leave = (version: string, startedAt: number) => { writeFileSync(installer, 'installer'); writeFileSync(note, JSON.stringify({ version, installer, startedAt })); };
  const now = Date.parse('2026-10-18T12:00:00Z');

  // The update installed: the note and the downloaded installer are removed, nothing is shown.
  electron.version = '4.1.0'; leave('4.1.0', now - 30_000);
  await reportUnfinishedUpdate(undefined, now);
  assert.equal(existsSync(note), false);
  assert.equal(existsSync(installer), false);
  // A newer version (for example installed by hand) also counts as done.
  electron.version = '4.2.0'; leave('4.1.0', now - 3_600_000);
  await reportUnfinishedUpdate(undefined, now);
  assert.equal(existsSync(note), false);

  // Still the old version, but the installer may still be running: decide on a later start.
  electron.version = '4.0.5'; leave('4.1.0', now - 60_000);
  await reportUnfinishedUpdate(undefined, now);
  assert.equal(existsSync(note), true);
  assert.equal(electron.dialogs.length, 0);

  // Still the old version 3 minutes later: tell the user once, offer the download page, keep the installer.
  electron.dialogResponse = 0;
  await reportUnfinishedUpdate(undefined, now + 3 * 60_000);
  assert.equal(electron.dialogs.length, 1);
  assert.equal(electron.dialogs[0].message, 'Novi 4.0.5 is still installed. The update to 4.1.0 did not finish.');
  assert.ok(electron.dialogs[0].detail.includes(installer), 'the message names the downloaded installer');
  assert.deepEqual(electron.dialogs[0].buttons, ['Open download page', 'Close']);
  assert.deepEqual(electron.external, ['https://novi-virid.vercel.app/download']);
  assert.equal(existsSync(note), false, 'the user is told only once');
  assert.equal(existsSync(installer), true, 'the installer is kept so it can be run by hand');

  // No note: nothing happens. A damaged note is removed quietly.
  await reportUnfinishedUpdate(undefined, now);
  writeFileSync(note, 'not json');
  await reportUnfinishedUpdate(undefined, now);
  assert.equal(existsSync(note), false);
  assert.equal(electron.dialogs.length, 1);
});

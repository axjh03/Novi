import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

// Runs the real webapp/public/install.sh from start to finish against a stand-in for the site. Every
// program that could change this machine (sudo, dpkg, apt-get, pgrep, novi) is a stub first on PATH
// that logs its arguments, so the tests never install anything or touch a Novi that is running here.
const INSTALLER = 'webapp/public/install.sh';
const linux = { skip: process.platform !== 'linux' || process.getuid?.() === 0 };
const debian = { skip: linux.skip || !existsSync('/etc/debian_version') };
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

/**
 * The site: the release endpoint (9.9.9) and the download. 'slow' sends 1 KB, pauses 1.2 seconds and
 * sends the rest, so the installer measures a partly written file across a second boundary (where the
 * Linux size check used to crash). 'stall' never finishes; 'cut' drops the connection after 1 KB.
 * `requested` resolves when the download starts, `closed` when its connection closes.
 */
async function site(t: TestContext, payload: Buffer, mode: 'slow' | 'stall' | 'cut' = 'slow') {
  let started!: () => void, ended!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const closed = new Promise<void>(resolve => { ended = resolve; });
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://site').pathname;
    if (path === '/api/releases/latest') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { version: '9.9.9' } }));
    } else if (path !== '/api/download') {
      res.writeHead(404).end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length });
      if (req.method === 'HEAD') { res.end(); return; }
      started();
      res.on('close', ended);
      res.write(payload.subarray(0, 1024));
      if (mode === 'slow') setTimeout(() => res.end(payload.subarray(1024)), 1200);
      if (mode === 'cut') setTimeout(() => res.destroy(), 300);
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requested, closed };
}

/** Writes an executable /bin/sh script. */
function script(file: string, body: string) {
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

/**
 * A temp folder with the stubs in bin/ and the environment to run the installer with. The stubs log
 * to `log`; `running` stands for an open Novi: pgrep finds it until a `stop` command removes it.
 * With `withoutDpkg`, PATH holds only links to the tools the installer needs, so it takes the
 * AppImage path even on Debian.
 */
function fixture(t: TestContext, baseUrl: string, { withoutDpkg = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'novi-unix-installer-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'log');
  writeFileSync(log, '');
  script(join(bin, 'sudo'), 'echo "sudo $*" >> "$NOVI_TEST_LOG"\n[ "$1" = -n ] && shift\n[ "$1" = -v ] && exit 0\nexec "$@"');
  script(join(bin, 'dpkg'), 'echo "dpkg $*" >> "$NOVI_TEST_LOG"\nfor last; do :; done\ncp "$last" "$NOVI_TEST_DIR/installed.deb"');
  script(join(bin, 'dpkg-query'), 'echo 4.0.22');
  script(join(bin, 'apt-get'), 'echo "apt-get $*" >> "$NOVI_TEST_LOG"\nexit 1');
  script(join(bin, 'pgrep'), '[ "$1" = -x ] && [ "$2" = novi ] && [ -e "$NOVI_TEST_DIR/running" ]');
  script(join(bin, 'novi'), 'echo "novi $*" >> "$NOVI_TEST_LOG"\n[ "$1" = stop ] && rm -f "$NOVI_TEST_DIR/running"\nexit 0');
  let path = `${bin}:${process.env.PATH}`;
  if (withoutDpkg) {
    for (const stub of ['sudo', 'dpkg', 'dpkg-query', 'apt-get', 'novi']) rmSync(join(bin, stub));
    for (const tool of ['bash', 'uname', 'mktemp', 'rm', 'mkdir', 'curl', 'tr', 'awk', 'grep', 'head', 'sed', 'date', 'sleep', 'wc', 'mv', 'chmod', 'cat', 'cp', 'sh', 'nohup']) {
      symlinkSync(execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim(), join(bin, tool));
    }
    path = bin;
  }
  const home = join(dir, 'home');
  mkdirSync(home);
  const env = { ...process.env, PATH: path, HOME: home, NOVI_BASE_URL: baseUrl, NOVI_TEST_LOG: log, NOVI_TEST_DIR: dir, NOVI_NO_ANIMATION: '', NOVI_FORCE: '', CI: '' };
  return { dir, home, env, log: () => readFileSync(log, 'utf8'), open: () => writeFileSync(join(dir, 'running'), '') };
}

/**
 * Starts a command and resolves with its exit status and output. Waits for 'exit', not 'close':
 * a process the command leaves behind could hold the output open forever.
 */
function run(command: string, args: string[], env: NodeJS.ProcessEnv, detached = false) {
  const child = spawn(command, args, { env, detached, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
  const done = new Promise<{ status: number | null; stdout: string; stderr: string }>(resolve => child.on('exit', async status => {
    await Promise.race([new Promise(next => child.on('close', next)), sleep(500)]);
    resolve({ status, stdout, stderr });
  }));
  return { child, done };
}

/** Waits until `read()` matches, for steps the installer starts in the background (such as opening Novi). */
async function eventually(read: () => string, pattern: RegExp, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (pattern.test(value)) return value;
    if (Date.now() > end) assert.fail(`${pattern} not seen in:\n${value}`);
    await sleep(50);
  }
}

test('a .deb update downloads, closes the open Novi, installs, and opens the new version', debian, async t => {
  const payload = randomBytes(200_000);
  const server = await site(t, payload);
  const box = fixture(t, server.url);
  box.open();
  const result = await run('bash', [INSTALLER], box.env).done;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Updating Novi 4\.0\.22 to 9\.9\.9/);
  assert.match(result.stdout, /Close the open Novi[\s\S]*Install the package[\s\S]*Novi is updated to 9\.9\.9/);
  assert.deepEqual(readFileSync(join(box.dir, 'installed.deb')), payload, 'dpkg got the whole download');
  const log = await eventually(box.log, /novi start\n$/);
  const work = /-i (\/tmp\/novi-linux\.\w+)\/novi\.deb/.exec(log)?.[1];
  assert.match(log, /^sudo -v\nnovi stop\nsudo -n dpkg --force-confdef --force-confold -i \/tmp\/novi-linux\.\w+\/novi\.deb\ndpkg --force-confdef --force-confold -i \S+\nnovi start\n$/);
  assert.ok(work && !existsSync(work), 'the download folder is removed');
});

test('the same update in a terminal shows the card, then leaves nothing drawing', debian, async t => {
  const server = await site(t, randomBytes(200_000));
  const box = fixture(t, server.url);
  box.open();
  const inner = `stty cols 100 rows 30\nbash ${quote(INSTALLER)}; status=$?\necho "finished $status"\nsleep 0.6\nexit $status`;
  const result = await run('script', ['-q', '-e', '-c', 'bash -c ' + quote(inner), '/dev/null'], { ...box.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8' }).done;
  assert.equal(result.status, 0, result.stdout.slice(-2000));
  assert.match(result.stdout, /A quiet space to think\./, 'the card was drawn');
  const receipt = result.stdout.slice(result.stdout.lastIndexOf('\x1b[?1049l'));
  assert.match(receipt, /✓.*Download Novi 9\.9\.9[\s\S]*✓.*Close the open Novi[\s\S]*✓.*Install the package[\s\S]*✓.*Open Novi/);
  const after = result.stdout.slice(result.stdout.lastIndexOf('finished 0'));
  assert.doesNotMatch(after, /\x1b\[[0-9;]*H|Preparing/, 'nothing is drawn after the installer exits');
});

test('Ctrl+C during the download stops the download too', linux, async t => {
  const server = await site(t, randomBytes(200_000), 'stall');
  const box = fixture(t, server.url);
  const { child, done } = run('bash', [INSTALLER], box.env, true);
  t.after(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already gone */ } });
  await server.requested;
  await sleep(600);
  // A real Ctrl+C reaches every process in the terminal's foreground group; curl, a background job
  // of a script, ignores it, so only the installer's cleanup can stop it.
  process.kill(-child.pid!, 'SIGINT');
  const result = await done;
  assert.equal(result.status, 130, result.stdout + result.stderr);
  const stopped = await Promise.race([server.closed.then(() => true), sleep(2000).then(() => false)]);
  assert.ok(stopped, 'the download connection was closed');
});

test('an AppImage update replaces the old copy only once the download is complete', linux, async t => {
  const payload = Buffer.from('#!/bin/sh\necho "launched $*" >> "$NOVI_TEST_LOG"\n' + '#'.repeat(150_000) + '\n');
  const server = await site(t, payload);
  const box = fixture(t, server.url, { withoutDpkg: true });
  const appimage = join(box.home, '.local', 'bin', 'novi');
  mkdirSync(join(box.home, '.local', 'bin'), { recursive: true });
  script(appimage, 'echo "old $*" >> "$NOVI_TEST_LOG"\n[ "$1" = stop ] && rm -f "$NOVI_TEST_DIR/running"\nexit 0');
  writeFileSync(`${appimage}.version`, '1.0.0\n');
  box.open();
  const result = await run('bash', [INSTALLER], box.env).done;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Updating Novi 1\.0\.0 to 9\.9\.9/);
  assert.deepEqual(readFileSync(appimage), payload);
  assert.ok(statSync(appimage).mode & 0o100, 'the new AppImage is executable');
  assert.equal(readFileSync(`${appimage}.version`, 'utf8'), '9.9.9\n');
  assert.ok(!existsSync(`${appimage}.download`), 'no partial download is left');
  assert.match(await eventually(box.log, /launched \n$/), /^old stop\nlaunched \n$/, 'the old copy was asked to quit, then the new one opened');
});

test('an AppImage download that breaks halfway keeps the copy that works', linux, async t => {
  const server = await site(t, randomBytes(200_000), 'cut');
  const box = fixture(t, server.url, { withoutDpkg: true });
  const appimage = join(box.home, '.local', 'bin', 'novi');
  mkdirSync(join(box.home, '.local', 'bin'), { recursive: true });
  script(appimage, 'echo "old $*" >> "$NOVI_TEST_LOG"');
  writeFileSync(`${appimage}.version`, '1.0.0\n');
  const before = readFileSync(appimage);
  const result = await run('bash', [INSTALLER], box.env).done;
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readFileSync(appimage), before, 'the old AppImage is untouched');
  assert.equal(readFileSync(`${appimage}.version`, 'utf8'), '1.0.0\n');
  assert.ok(!existsSync(`${appimage}.download`), 'no partial download is left');
  assert.equal(box.log(), '', 'nothing was opened or stopped');
});

/**
 * End-to-end test of Novi's Windows in-app update. Runs on the Windows CI runner after packaging.
 *
 * The unit tests fake the installer; this script uses the real thing, so it proves the whole path a
 * user goes through when they press "Update & Restart":
 *   1. Install the previous published Novi release (downloaded from GitHub), as a real user has it.
 *   2. Start that Novi.
 *   3. Hand over to the update helper exactly as AppUpdater.installUpdate does: copy the new installer
 *      to <temp>\novi-in-app-update\setup.exe, start PowerShell with windowsInstallScript() (the same
 *      function the app uses), and wait for it to print "ready".
 *   4. Close Novi the way a user would (a normal close, forced only if it hangs).
 *   5. Wait for the helper and check: it succeeded, Novi.exe now carries the new version, the new Novi
 *      was started from the install folder, the downloaded installer was removed, and the helper's log
 *      says "Installed and relaunched".
 *   6. Clean up (close Novi, uninstall).
 *
 * It runs twice: a per-user install (%LOCALAPPDATA%\Programs\Novi, what the website installer and most
 * people have) and an all-users install (%ProgramFiles%\Novi, which needs administrator rights; the CI
 * runner has them, so no permission prompt appears).
 *
 * Usage (Windows only, from the repo root, after `electron-builder` has written dist/):
 *   node --import tsx scripts/windows-update-e2e.ts
 * GITHUB_TOKEN is optional (it only raises GitHub's rate limit). Exit code 0 on success, 1 on failure.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { releaseFile, windowsInstallScript } from '../src/main/services/updater';

const REPO = 'axjh03/Novi';
const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
const newInstaller = join('dist', releaseFile(version, 'win32', 'x64')!.name);

/** Runs one PowerShell command and returns its trimmed output; throws with PowerShell's error text if it fails. */
function powershell(command: string): string {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`PowerShell failed: ${command}\n${result.stderr}`);
  return result.stdout.trim();
}

/** A path as a single-quoted PowerShell string (quotes doubled), so spaces and symbols are literal. */
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** The leading major.minor.patch of an exe's product version ("4.0.24.512" -> "4.0.24"), read the same way the helper does. */
function installedVersion(exe: string): string {
  return powershell(`if ([string](Get-Item -LiteralPath ${quoted(exe)}).VersionInfo.ProductVersion -match '^(\\d+)\\.(\\d+)\\.(\\d+)') { $Matches[1] + '.' + $Matches[2] + '.' + $Matches[3] }`);
}

/** Process ids of every running process whose executable lives inside `folder`. */
function processesIn(folder: string): number[] {
  const output = powershell(`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith(${quoted(folder + '\\')}, 'CurrentCultureIgnoreCase') } | ForEach-Object { $_.ProcessId }`);
  return output ? output.split(/\s+/).map(Number) : [];
}

/** Compares x.y.z versions; negative when a is older than b. */
function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

/**
 * Finds the newest published release with a Windows installer whose version differs from this build,
 * and downloads that installer into `work`. For a tagged release that is the previous release. For a
 * manual, untagged test build (which keeps package.json's placeholder version) it is the current
 * release, and the "update" installs the test build over it, which exercises exactly the same steps.
 * Returns null when there is none (for example before the very first Windows release).
 */
async function previousRelease(work: string): Promise<{ version: string; installer: string } | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'novi-windows-update-e2e' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers });
  if (!response.ok) throw new Error(`Could not list releases (HTTP ${response.status}).`);
  const releases = await response.json() as Array<{ draft: boolean; prerelease: boolean; assets: Array<{ name: string; browser_download_url: string }> }>;
  const candidates = releases
    .filter(release => !release.draft && !release.prerelease)
    .flatMap(release => release.assets.map(asset => ({ asset, version: /^Novi-Setup-(\d+\.\d+\.\d+)\.exe$/.exec(asset.name)?.[1] })))
    .filter((item): item is { asset: { name: string; browser_download_url: string }; version: string } => Boolean(item.version) && item.version !== version)
    .sort((a, b) => compareVersions(b.version, a.version));
  const newest = candidates[0];
  if (!newest) return null;
  const installer = join(work, newest.asset.name);
  console.log(`Downloading the previous release ${newest.version} (${newest.asset.name})...`);
  const download = await fetch(newest.asset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!download.ok || !download.body) throw new Error(`Could not download ${newest.asset.name} (HTTP ${download.status}).`);
  await pipeline(Readable.fromWeb(download.body as never), createWriteStream(installer));
  return { version: newest.version, installer };
}

/** Polls `check` every second until it returns true; throws with `label` after `timeoutMs`. */
async function waitFor(check: () => boolean, timeoutMs: number, label: string) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (check()) return; await delay(1000); }
  throw new Error(`Timed out after ${timeoutMs / 1000} s waiting for: ${label}`);
}

/** Closes every Novi process in `folder` (forcefully, this is cleanup) and uninstalls the copy installed there. */
function uninstall(folder: string, allUsers: boolean) {
  for (const pid of processesIn(folder)) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  const uninstaller = join(folder, 'Uninstall Novi.exe');
  // _?= makes the NSIS uninstaller run in place and wait, instead of copying itself and returning at once.
  if (existsSync(uninstaller)) spawnSync(uninstaller, ['/S', allUsers ? '/allusers' : '/currentuser', `_?=${folder}`], { stdio: 'inherit', timeout: 300_000 });
  rmSync(folder, { recursive: true, force: true });
}

/** One complete update: install the previous release, run it, update it through the real helper, check everything. */
async function scenario(name: string, allUsers: boolean, previous: { version: string; installer: string }, work: string) {
  console.log(`\n=== ${name}: ${previous.version} -> ${version}`);
  const folder = allUsers ? join(process.env.ProgramFiles!, 'Novi') : join(process.env.LOCALAPPDATA!, 'Programs', 'Novi');
  const exe = join(folder, 'Novi.exe');
  uninstall(folder, allUsers);

  // 1. Install the previous release silently, like the website installer does (it passes only /S).
  const install = spawnSync(previous.installer, ['/S', ...(allUsers ? ['/allusers'] : [])], { stdio: 'inherit', timeout: 600_000 });
  assert.equal(install.status, 0, `the ${previous.version} installer failed (exit ${install.status})`);
  assert.ok(existsSync(exe), `${previous.version} was not installed at ${exe}`);
  assert.equal(installedVersion(exe), previous.version);

  // 2. Start the installed Novi with its own data folder, so the runner's profile stays untouched.
  const data = mkdtempSync(join(work, `data-${name}-`));
  const env: NodeJS.ProcessEnv = { ...process.env, NOVI_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  let novi: ChildProcess = spawn(exe, [], { env, stdio: 'ignore' });
  await delay(8000);
  // If the runner can't keep a desktop app open, still test the installer and helper with a stand-in
  // process for Novi, and say clearly that the relaunch could not be checked.
  const appRuns = novi.exitCode === null && novi.signalCode === null;
  if (!appRuns) {
    console.log(`::warning::Novi ${previous.version} did not stay open on this runner (exit ${novi.exitCode}); using a stand-in process, so the relaunch is checked only through the helper's log.`);
    novi = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  }

  // 3. Hand over to the helper exactly like AppUpdater.installUpdate.
  const updateDir = join(work, `novi-in-app-update-${name}`);
  mkdirSync(updateDir, { recursive: true });
  const payload = join(updateDir, 'setup.exe');
  copyFileSync(newInstaller, payload);
  const script = Buffer.from(windowsInstallScript(payload, novi.pid!, exe, version), 'utf16le').toString('base64');
  const helper: ChildProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', script], {
    cwd: updateDir, env, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const finished = new Promise<number | null>((resolve, reject) => { helper.once('exit', resolve); helper.once('error', reject); });
  await new Promise<void>((resolve, reject) => {
    let output = '';
    helper.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString(); if (output.includes('ready\n')) resolve(); });
    helper.once('exit', code => reject(new Error(`The helper exited before it was ready (${code}).`)));
  });
  console.log('Helper is ready; closing Novi the normal way.');

  // 4. A normal close (WM_CLOSE). Forced only if Novi is still running after 30 s.
  spawnSync('taskkill', ['/PID', String(novi.pid)]);
  await waitFor(() => novi.exitCode !== null || novi.signalCode !== null, 30_000, 'Novi to close').catch(() => {
    console.log('Novi did not close within 30 s; forcing it closed.');
    spawnSync('taskkill', ['/PID', String(novi.pid), '/T', '/F']);
  });

  // 5. The helper waits for the installer; give it 10 minutes.
  const code = await Promise.race([finished, delay(600_000).then(() => 'timeout' as const)]);
  const logFile = payload + '.log';
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf16le').replace(/^﻿/, '') : '(no log written)';
  console.log(`Helper log:\n${log}`);
  if (code === 'timeout') { helper.kill(); throw new Error('The update helper did not finish within 10 minutes (a failure message box may be waiting).'); }
  assert.equal(code, 0, 'the update helper reported a failure');
  assert.equal(installedVersion(exe), version, 'Novi.exe does not carry the new version');
  assert.match(log, /Installed and relaunched/);
  assert.equal(existsSync(payload), false, 'the downloaded installer should be removed after a successful update');
  if (appRuns) await waitFor(() => processesIn(folder).length > 0, 60_000, 'the updated Novi to start');
  console.log(`${name}: updated to ${version} and ${appRuns ? 'relaunched' : 'the helper started it (not observable on this runner)'}.`);

  // 6. Clean up for the next scenario.
  uninstall(folder, allUsers);
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This test only runs on Windows.');
  assert.ok(existsSync(newInstaller), `${newInstaller} is missing; run electron-builder first.`);
  const work = mkdtempSync(join(tmpdir(), 'novi-update-e2e-'));
  try {
    const previous = await previousRelease(work);
    if (!previous) { console.log(`No published Windows release other than ${version}; nothing to update from.`); return; }
    await scenario('per-user', false, previous, work);
    await scenario('all-users', true, previous, work);
    console.log(`\nWindows in-app update works: ${previous.version} -> ${version}, per-user and all-users.`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

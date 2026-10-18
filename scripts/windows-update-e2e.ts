/**
 * End-to-end test of Novi's Windows in-app update. Runs on the Windows CI runner after packaging.
 *
 * The unit tests fake the installer; this script uses the real one, so it proves the path a user goes
 * through when they press "Update & Restart":
 *   1. Install the previous published Novi release (downloaded from GitHub), as a real user has it.
 *   2. Start that Novi.
 *   3. Start the new installer exactly as AppUpdater.installUpdate does: copied to
 *      <temp>\novi-in-app-update\setup.exe, started detached with windowsInstallerArgs() (the same
 *      function the app uses), so it is told to wait for Novi's process.
 *   4. Check that the installer is really waiting: it is still running and the old version is still
 *      installed while Novi is open (build/installer.nsh).
 *   5. Close Novi the way a user would (a normal close, forced only if it hangs).
 *   6. Wait for the installer and check that Novi.exe now carries the new version and that the new
 *      Novi was started from the install folder.
 *   7. Clean up (close Novi, uninstall).
 *
 * It runs twice: a per-user install (%LOCALAPPDATA%\Programs\Novi, what the website installer and most
 * people have) and an all-users install (%ProgramFiles%\Novi, which needs administrator rights; the CI
 * runner has them, so no permission prompt appears). Both scenarios always run and are reported; a
 * cleanup problem is printed as a warning and never hides the real result.
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
import { releaseFile, windowsInstallerArgs } from '../src/main/services/updater';

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

/** The leading major.minor.patch of an exe's product version ("4.0.24.512" -> "4.0.24"), or '' if it is missing. */
function installedVersion(exe: string): string {
  if (!existsSync(exe)) return '';
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

/** True once a started child process has ended. */
const ended = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null;

/** Runs a cleanup step; a failure there is printed as a warning and never replaces the test's own result. */
function tidy(label: string, step: () => void) {
  try { step(); } catch (error) { console.log(`::warning::Cleanup (${label}) failed: ${error instanceof Error ? error.message : String(error)}`); }
}

/** Closes every Novi process in `folder` (forcefully: this is cleanup) and uninstalls the copy installed there. */
function uninstall(folder: string, allUsers: boolean) {
  for (const pid of processesIn(folder)) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  const uninstaller = join(folder, 'Uninstall Novi.exe');
  // _?= makes the NSIS uninstaller run in place and wait, instead of copying itself and returning at once.
  if (existsSync(uninstaller)) spawnSync(uninstaller, ['/S', allUsers ? '/allusers' : '/currentuser', `_?=${folder}`], { stdio: 'inherit', timeout: 300_000 });
  rmSync(folder, { recursive: true, force: true });
}

/** One complete update: install the previous release, run it, update it with the real installer, check everything. */
async function scenario(name: string, allUsers: boolean, previous: { version: string; installer: string }, work: string) {
  console.log(`\n=== ${name}: ${previous.version} -> ${version}`);
  const folder = allUsers ? join(process.env.ProgramFiles!, 'Novi') : join(process.env.LOCALAPPDATA!, 'Programs', 'Novi');
  const exe = join(folder, 'Novi.exe');
  let novi: ChildProcess | null = null, installer: ChildProcess | null = null;
  tidy('remove an earlier copy', () => uninstall(folder, allUsers));
  try {
    // 1. Install the previous release silently, like the website installer does (it passes only /S).
    const install = spawnSync(previous.installer, ['/S', ...(allUsers ? ['/allusers'] : [])], { stdio: 'inherit', timeout: 600_000 });
    assert.equal(install.status, 0, `the ${previous.version} installer failed (exit ${install.status})`);
    assert.equal(installedVersion(exe), previous.version, `${previous.version} was not installed at ${exe}`);

    // 2. Start the installed Novi with its own data folder, so the runner's profile stays untouched.
    const env: NodeJS.ProcessEnv = { ...process.env, NOVI_DATA_DIR: mkdtempSync(join(work, `data-${name}-`)) };
    delete env.ELECTRON_RUN_AS_NODE;
    novi = spawn(exe, [], { env, stdio: 'ignore' });
    await delay(8000);
    // If the runner can't keep a desktop app open, still test the installer with a stand-in process for
    // Novi, and say clearly that the relaunch could not be checked.
    const appRuns = !ended(novi);
    if (!appRuns) {
      console.log(`::warning::Novi ${previous.version} did not stay open on this runner (exit ${novi.exitCode}); using a stand-in process, so the relaunch is not checked.`);
      novi = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    }

    // 3. Start the new installer exactly like AppUpdater.installUpdate.
    const updateDir = join(work, `novi-in-app-update-${name}`);
    mkdirSync(updateDir, { recursive: true });
    const payload = join(updateDir, 'setup.exe');
    copyFileSync(newInstaller, payload);
    const args = windowsInstallerArgs(novi.pid!, exe);
    console.log(`Starting the installer: setup.exe ${args.join(' ')}`);
    installer = spawn(payload, args, { detached: true, stdio: 'ignore' });
    const started = installer;
    const finished = new Promise<number | null>((resolve, reject) => { started.once('exit', resolve); started.once('error', reject); });

    // 4. The installer must wait while Novi is open: still running, nothing replaced yet.
    await delay(10_000);
    assert.equal(ended(installer), false, `the installer did not wait for Novi (it exited with ${installer.exitCode})`);
    assert.equal(installedVersion(exe), previous.version, 'the installer replaced Novi while it was still open');
    console.log('The installer is waiting for Novi to close, as intended.');

    // 5. Close Novi normally (WM_CLOSE, like clicking the window's X). Forced only if it is still open after 30 s.
    const running = novi;
    spawnSync('taskkill', ['/PID', String(running.pid)]);
    await waitFor(() => ended(running), 30_000, 'Novi to close').catch(() => {
      console.log('Novi did not close within 30 s; forcing it closed.');
      spawnSync('taskkill', ['/PID', String(running.pid), '/T', '/F']);
    });

    // 6. The installer now installs and relaunches Novi. Give it 10 minutes.
    const code = await Promise.race([finished, delay(600_000).then(() => 'timeout' as const)]);
    console.log(`Installer finished: ${code === 'timeout' ? 'still running after 10 minutes' : `exit code ${code}`}`);
    assert.notEqual(code, 'timeout', 'the installer did not finish within 10 minutes');
    assert.equal(installedVersion(exe), version, 'Novi.exe does not carry the new version');
    if (appRuns) await waitFor(() => processesIn(folder).length > 0, 60_000, 'the updated Novi to start');
    console.log(`${name}: updated to ${version}${appRuns ? ' and relaunched' : ''}.`);
  } finally {
    // 7. Clean up for the next scenario, whatever happened above.
    const leftInstaller = installer, leftNovi = novi;
    if (leftInstaller && !ended(leftInstaller)) tidy('stop the installer', () => { spawnSync('taskkill', ['/PID', String(leftInstaller.pid), '/T', '/F']); });
    if (leftNovi && !ended(leftNovi)) tidy('stop Novi', () => { spawnSync('taskkill', ['/PID', String(leftNovi.pid), '/T', '/F']); });
    tidy('uninstall', () => uninstall(folder, allUsers));
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This test only runs on Windows.');
  assert.ok(existsSync(newInstaller), `${newInstaller} is missing; run electron-builder first.`);
  const work = mkdtempSync(join(tmpdir(), 'novi-update-e2e-'));
  const failures: string[] = [];
  try {
    const previous = await previousRelease(work);
    if (!previous) { console.log(`No published Windows release other than ${version}; nothing to update from.`); return; }
    for (const [name, allUsers] of [['per-user', false], ['all-users', true]] as const) {
      try { await scenario(name, allUsers, previous, work); }
      catch (error) {
        console.error(`::error::${name} update failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
        failures.push(name);
      }
    }
  } finally {
    // Novi's data folders can stay locked for a moment after it closes; never let that hide the result.
    tidy('remove the work folder', () => rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }));
  }
  if (failures.length) { console.error(`\nWindows in-app update FAILED: ${failures.join(', ')}.`); process.exit(1); }
  console.log(`\nWindows in-app update works: per-user and all-users updated to ${version}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });

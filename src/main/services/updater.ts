import { app, dialog, shell, type BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { createWriteStream, rmSync, mkdirSync, mkdtempSync, existsSync, realpathSync, accessSync, chmodSync, renameSync, readFileSync, writeFileSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { exec, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import https from 'node:https';
import http, { type IncomingMessage } from 'node:http';
import type { UpdateCheckResult, UpdateProgress } from '../../shared/types';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export function getEffectivePortalUrl(): string {
  if (process.env.NOVI_PORTAL_URL) {
    return process.env.NOVI_PORTAL_URL;
  }
  // Packaged desktop application for end users uses the hosted production URL
  if (typeof app !== 'undefined' && app?.isPackaged) {
    return 'https://novi-virid.vercel.app';
  }
  // In development (e.g. npm run dev), default to local dev server
  return 'http://localhost:3000';
}

export type LinuxInstall = { kind: 'deb' } | { kind: 'appimage'; path: string };
/** A release file and the electron-builder manifest (latest*.yml) that records its size and SHA-512. */
export interface ReleaseFile { name: string; manifest: string }

/** The installer for this machine. Names follow artifactName in electron-builder.yml. */
export function releaseFile(version: string, platform: NodeJS.Platform, arch: string, linux: LinuxInstall | null = null): ReleaseFile | null {
  const arm = arch === 'arm64';
  if (platform === 'darwin') return { name: `Novi-${version}-${arm ? 'arm64' : 'x64'}.dmg`, manifest: 'latest-mac.yml' };
  if (platform === 'win32') return { name: `Novi-Setup-${version}.exe`, manifest: 'latest.yml' };
  // Linux builds exist for x64 and arm64 only.
  if (platform !== 'linux' || !linux || (arch !== 'x64' && !arm)) return null;
  const manifest = arm ? 'latest-linux-arm64.yml' : 'latest-linux.yml';
  return linux.kind === 'deb'
    ? { name: `novi_${version}_${arm ? 'arm64' : 'amd64'}.deb`, manifest }
    : { name: `novi_${version}_${arm ? 'arm64' : 'x86_64'}.AppImage`, manifest };
}

/** Reads the release version and one file's size and SHA-512 (base64) from a latest*.yml manifest. */
export function manifestEntry(text: string, name: string): { version: string; sha512: string; size: number } | null {
  const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, '$2');
  let version = '', current: Record<string, string> | null = null;
  const files: Array<Record<string, string>> = [];
  for (const line of text.split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+url:\s*(.+)$/);
    if (item) { current = { url: unquote(item[1]) }; files.push(current); continue; }
    const field = line.match(/^\s+(sha512|size):\s*(.+)$/);
    if (field && current) { current[field[1]] = unquote(field[2]); continue; }
    if (/^\S/.test(line)) {
      current = null;
      const top = line.match(/^version:\s*(.+)$/);
      if (top) version = unquote(top[1]);
    }
  }
  const entry = files.find((file) => file.url === name);
  const size = Number(entry?.size);
  if (!entry?.sha512 || !Number.isSafeInteger(size) || size <= 0 || !version) return null;
  return { version, sha512: entry.sha512, size };
}

// Runs as root through pkexec, so it trusts nothing the unprivileged app could still change:
// it copies the download into a root-owned folder and checks the SHA-512 again before installing.
// Exit codes: 2 = could not copy, 3 = checksum mismatch, 4 = install failed. pkexec itself uses 126 and 127.
export const LINUX_ROOT_INSTALL = `
src=$1 sum=$2 target=$3
work=$(mktemp -d) || exit 2
trap 'rm -rf "$work"' EXIT
cp -- "$src" "$work/payload" || exit 2
printf '%s  %s\\n' "$sum" "$work/payload" | sha512sum -c --status - || exit 3
if [ "$target" = deb ]; then
  mv -- "$work/payload" "$work/novi.deb" || exit 2
  chmod 755 "$work" && chmod 644 "$work/novi.deb" || exit 2
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 apt-get install -y -o DPkg::Lock::Timeout=300 \\
      -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$work/novi.deb" || exit 4
  else
    dpkg -i --force-confdef --force-confold "$work/novi.deb" || exit 4
  fi
else
  install -m 0755 -- "$work/payload" "$target" || exit 4
fi
`;

/**
 * Command-line arguments for running a downloaded Windows installer as an in-app update.
 *
 * Novi starts the NSIS installer itself (detached) and then quits normally. The installer does the rest:
 * - `--novi-wait-pid=<pid>`: Novi's own process id. build/installer.nsh makes the installer wait (up to
 *   2 minutes) until that process has ended, so Novi's shutdown (recordings, engines, sign-out) is never
 *   cut short and no files are locked when the old version is removed.
 * - `--updated`: tells electron-builder's installer this is an update: keep user data and shortcuts,
 *   close any leftover Novi process, and pass `--updated` to the relaunched app.
 * - `/S`: silent, no installer windows (an all-users install still shows Windows' permission prompt).
 * - `--force-run`: start the new Novi when installation finishes, as the signed-in user.
 * - `/allusers` or `/currentuser`: keep the install type of the copy that is running now. Novi in
 *   Program Files was installed for all users; anywhere else it was installed for this user only.
 *
 * There is deliberately no `/D=<folder>`. NSIS needs that argument unquoted, but Node quotes any argument
 * that contains a space ("C:\Program Files", "C:\Users\Jane Doe"), and electron-builder would then install
 * into a folder name ending in a quote. Without it, the installer reuses the folder recorded when Novi
 * was installed, which is the folder it runs from.
 *
 * No PowerShell is involved: PowerShell started detached gets no console and exits before doing anything
 * (that broke every Windows update until v4.0.24), and a hidden PowerShell launched by an app is what
 * security software blocks as malware.
 *
 * @param parentPid  Novi's main process id (process.pid).
 * @param executable the running Novi.exe (process.execPath), used to tell an all-users install apart.
 * @param env        environment to read the Program Files folders from (tests pass their own).
 * @returns the arguments, none of which contain spaces.
 */
export function windowsInstallerArgs(parentPid: number, executable: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const exe = executable.toLowerCase();
  const allUsers = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432]
    .filter((root): root is string => Boolean(root))
    .some(root => exe.startsWith(root.toLowerCase().replace(/[\\/]+$/, '') + '\\'));
  return [`--novi-wait-pid=${parentPid}`, '--updated', '/S', '--force-run', allUsers ? '/allusers' : '/currentuser'];
}

/** Compares x.y.z versions: positive when a is newer, negative when older, 0 when equal. */
function compareVersions(a: string, b: string): number {
  const p1 = (a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = (b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const difference = (p1[i] || 0) - (p2[i] || 0);
    if (difference) return difference;
  }
  return 0;
}

/** The note Novi leaves before handing a Windows update to the installer. */
interface PendingUpdate { version: string; installer: string; startedAt: number }
/** Where that note is kept: Novi's own data folder, so it survives the update. */
const pendingUpdateFile = () => join(app.getPath('userData'), 'pending-update.json');

/**
 * Checks, when Novi starts, whether a Windows update handed to the installer actually finished.
 *
 * Once Novi has quit for an update, it can't report anything, so it leaves a note first (see
 * installUpdate). On the next start:
 * - this version is the target or newer: the update worked; the note and the downloaded installer
 *   are deleted;
 * - the note is less than 3 minutes old: the installer may still be running, so nothing is decided yet;
 * - otherwise the update did not install (for example the Windows permission prompt was declined, or
 *   the installer failed): the note is deleted and the user is told, with a button for the download page.
 *   The downloaded installer is kept so it can be run by hand.
 *
 * @param parent the main window, so the message appears on top of Novi (its window stays above others).
 * @param now    the current time (tests pass a fixed time).
 */
export async function reportUnfinishedUpdate(parent?: BrowserWindow, now = Date.now()): Promise<void> {
  if (!existsSync(pendingUpdateFile())) return;
  let pending: PendingUpdate | null = null;
  try { pending = JSON.parse(readFileSync(pendingUpdateFile(), 'utf8')); } catch { /* A damaged note is removed below. */ }
  if (!pending || typeof pending.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pending.version)) { rmSync(pendingUpdateFile(), { force: true }); return; }
  const current = app.getVersion();
  if (compareVersions(current, pending.version) >= 0) {
    rmSync(pendingUpdateFile(), { force: true });
    if (typeof pending.installer === 'string') rmSync(pending.installer, { force: true });
    return;
  }
  if (now - Number(pending.startedAt) < 3 * 60_000) return;
  rmSync(pendingUpdateFile(), { force: true });
  const options = {
    type: 'warning' as const,
    title: 'Novi update did not finish',
    message: `Novi ${current} is still installed. The update to ${pending.version} did not finish.`,
    detail: `If Windows asked for permission, the update needs it. You can try again from Settings › Updates, download Novi from the website, or run the downloaded installer:\n${pending.installer}`,
    buttons: ['Open download page', 'Close'],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  if (response === 0) void shell.openExternal(`${getEffectivePortalUrl()}/download`);
}

interface LatestRelease { version: string; base: string }
interface InstallOptions {
  /** Lets the system password window appear above Novi's windows; returns a function that restores them. */
  yieldWindows?: () => () => void;
}

export class AppUpdater {
  private latest: LatestRelease | null = null;
  private isUpdating = false;

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();
    const primaryUrl = getEffectivePortalUrl();
    // Ask for the newest release that has an installer for THIS system and chip, so a release whose
    // Windows (or Mac, or Linux) build is missing is never offered to the machines that can't install it.
    let latestPath = `/api/releases/latest?platform=${encodeURIComponent(process.platform)}&arch=${encodeURIComponent(process.arch)}`;
    // Macs also send their macOS version, because Novi 4.0.26 and later need macOS 13 or later.
    // The portal then never offers this Mac a release it can't open, and says why (data.notice).
    // Novi 4.0.24 and older don't send it, so the portal gives them 4.0.25 first.
    if (process.platform === 'darwin' && typeof process.getSystemVersion === 'function') latestPath += `&os=${encodeURIComponent(process.getSystemVersion())}`;
    let res: Response;
    let effectiveBase = primaryUrl;
    try {
      res = await fetch(`${primaryUrl}${latestPath}`, {
        headers: { 'User-Agent': `Novi-Desktop/${currentVersion}` },
        signal: AbortSignal.timeout(4000),
      });
    } catch (networkErr: any) {
      // If in local dev and localhost:3000 is unreachable, fall back to production portal
      if (!app?.isPackaged && primaryUrl.includes('localhost')) {
        effectiveBase = 'https://novi-virid.vercel.app';
        res = await fetch(`${effectiveBase}${latestPath}`, {
          headers: { 'User-Agent': `Novi-Desktop/${currentVersion}` },
          signal: AbortSignal.timeout(6000),
        });
      } else {
        console.warn('[Updater] Check failed:', networkErr?.message || networkErr);
        throw new Error('Could not reach the update server. Check your internet connection and try again.');
      }
    }

    if (!res.ok) {
      throw new Error(`The update server returned an error (status ${res.status}). Please try again later.`);
    }

    const json = await res.json();
    const data = json.data || json;
    const latestVersion = String(data.version || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) throw new Error('The update server returned an unreadable version.');
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    this.latest = hasUpdate ? { version: latestVersion, base: effectiveBase } : null;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseNotes: data.releaseNotes,
      releaseDate: data.releaseDate,
      // Set by the portal when a newer release exists that this computer can't run (an older macOS).
      ...(typeof data.notice === 'string' && data.notice ? { notice: data.notice.slice(0, 500) } : {}),
    };
  }

  async installUpdate(onProgress: (progress: UpdateProgress) => void, options: InstallOptions = {}): Promise<void> {
    if (this.isUpdating) throw new Error('Update already in progress.');
    if (!app.isPackaged) throw new Error('Updates install only in the packaged Novi app.');
    this.isUpdating = true;

    try {
      onProgress({ percent: null, status: 'Checking the latest release...' });
      // Check again so the files requested below belong to the release that is live right now.
      const check = await this.checkForUpdates();
      if (!check.hasUpdate || !this.latest) throw new Error('No update payload available.');
      const latest = this.latest;

      if (process.platform === 'darwin') {
        const tempDir = join(app.getPath('temp'), 'novi-in-app-update');
        mkdirSync(tempDir, { recursive: true });
        const dmgPath = join(tempDir, 'payload.dmg');
        await this.downloadVerified(latest, releaseFile(latest.version, 'darwin', process.arch)!, dmgPath, onProgress);

        onProgress({ percent: null, status: 'Mounting disk container...' });
        const mountDir = join(tempDir, 'mount');
        mkdirSync(mountDir, { recursive: true });
        await execAsync(`hdiutil attach "${dmgPath}" -nobrowse -readonly -mountpoint "${mountDir}" -quiet`);

        onProgress({ percent: null, status: 'Installing and clearing security quarantine...' });
        const appPath = '/Applications/Novi.app';
        const updateScript = `
          sleep 1
          if [ -d "${mountDir}/Novi.app" ]; then
            ditto "${mountDir}/Novi.app" "${appPath}"
          fi
          hdiutil detach "${mountDir}" -quiet 2>/dev/null || true
          xattr -cr "${appPath}" 2>/dev/null || true
          rm -rf "${tempDir}"
          open "${appPath}"
        `;

        onProgress({ percent: 100, status: 'Restarting Novi...' });
        spawn('bash', ['-c', updateScript], { detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => app.quit(), 400);

      } else if (process.platform === 'win32') {
        const tempDir = join(app.getPath('temp'), 'novi-in-app-update');
        mkdirSync(tempDir, { recursive: true });
        const exePath = join(tempDir, 'setup.exe');
        await this.downloadVerified(latest, releaseFile(latest.version, 'win32', process.arch)!, exePath, onProgress);

        // Leave a note first: after Novi quits it can't report a failed install, so the next start checks it.
        const pending: PendingUpdate = { version: latest.version, installer: exePath, startedAt: Date.now() };
        writeFileSync(pendingUpdateFile(), JSON.stringify(pending));
        try {
          // The installer is a normal windowed program, so it runs detached and outlives Novi.
          // It waits for this process to end before installing (see windowsInstallerArgs).
          await new Promise<void>((resolve, reject) => {
            const installer = spawn(exePath, windowsInstallerArgs(process.pid, process.execPath), { detached: true, stdio: 'ignore' });
            installer.once('error', reject);
            installer.once('spawn', () => { installer.unref(); resolve(); });
          });
        } catch (error) {
          rmSync(pendingUpdateFile(), { force: true });
          throw new Error(`Windows could not start the Novi installer (${error instanceof Error ? error.message : String(error)}). Please try again.`);
        }
        onProgress({ percent: 100, status: 'Restarting to finish update...' });
        setTimeout(() => app.quit(), 400);

      } else if (process.platform === 'linux') {
        await this.installLinux(latest, onProgress, options);

      } else {
        throw new Error('Automatic updates are not available on this system. Download the latest version from the Novi website.');
      }
    } catch (err) {
      this.isUpdating = false;
      throw err;
    }
  }

  /** How this copy was installed: the AppImage runtime sets APPIMAGE; a .deb install is owned by the "novi" package. */
  async linuxInstall(): Promise<LinuxInstall | null> {
    const appImage = process.env.APPIMAGE;
    if (appImage && existsSync(appImage)) return { kind: 'appimage', path: realpathSync(appImage) };
    try {
      const { stdout } = await execFileAsync('dpkg-query', ['-S', realpathSync(process.execPath)], { timeout: 10_000 });
      if (stdout.split('\n').some((line) => line.startsWith('novi: '))) return { kind: 'deb' };
    } catch { /* Not installed by dpkg. */ }
    return null;
  }

  private async installLinux(latest: LatestRelease, onProgress: (progress: UpdateProgress) => void, options: InstallOptions) {
    const install = await this.linuxInstall();
    const target = releaseFile(latest.version, 'linux', process.arch, install);
    if (!install || !target) {
      void shell.openExternal(`${latest.base}/download`);
      throw new Error('This copy of Novi was not installed from the .deb package or an AppImage, so it cannot replace itself. The download page has opened in your browser.');
    }
    // A private folder: another account on this computer must not be able to swap the file before it is installed.
    const privateDir = mkdtempSync(join(app.getPath('temp'), 'novi-update-'));
    let keepPrivateDir = false;
    try {
      if (install.kind === 'appimage') {
        const folder = dirname(install.path);
        const writable = (() => { try { accessSync(folder, constants.W_OK); return true; } catch { return false; } })();
        // Downloading next to the AppImage lets the swap be a single atomic rename.
        const payload = writable ? join(folder, `.novi-update-${process.pid}.AppImage`) : join(privateDir, target.name);
        try {
          const expected = await this.downloadVerified(latest, target, payload, onProgress);
          if (writable) {
            onProgress({ percent: 100, status: 'Installing update...' });
            chmodSync(payload, 0o755);
            renameSync(payload, install.path);
          } else {
            await this.installAsAdmin(payload, expected.sha512, install.path, onProgress, options).catch((error) => {
              if (!(error instanceof PasswordPromptUnavailable)) throw error;
              throw new Error(`Novi could not get permission to replace ${install.path}. Move the Novi AppImage into a folder you own, such as your home folder, then try again.`);
            });
          }
        } finally {
          rmSync(payload, { force: true });
        }
      } else {
        const payload = join(privateDir, target.name);
        const expected = await this.downloadVerified(latest, target, payload, onProgress);
        try {
          await this.installAsAdmin(payload, expected.sha512, 'deb', onProgress, options);
        } catch (error) {
          if (!(error instanceof PasswordPromptUnavailable)) throw error;
          // No password prompt on this desktop: hand the verified package to the system's software installer.
          keepPrivateDir = true;
          const failure = await shell.openPath(payload);
          throw new Error(failure
            ? `Novi could not get permission to install the update. The verified update was downloaded to ${payload}; open it to install.`
            : 'Novi could not get permission to install the update, so it opened the verified update in your software installer. Install it there, then reopen Novi.');
        }
      }
    } finally {
      if (!keepPrivateDir) rmSync(privateDir, { recursive: true, force: true });
    }

    onProgress({ percent: 100, status: 'Restarting Novi...' });
    // execPath was recorded at startup, so it still names the installed file after the swap.
    const execPath = install.kind === 'appimage' ? install.path : process.execPath;
    app.relaunch({ execPath, args: process.argv.slice(1) });
    setTimeout(() => app.quit(), 400);
  }

  private async installAsAdmin(payload: string, sha512: string, target: string, onProgress: (progress: UpdateProgress) => void, options: InstallOptions) {
    const hex = Buffer.from(sha512, 'base64').toString('hex');
    onProgress({ percent: null, status: 'Installing update (enter your password when asked)...' });
    const restoreWindows = options.yieldWindows?.();
    let result: { code: number | null; output: string };
    try {
      result = await new Promise((resolve, reject) => {
        const child = spawn('pkexec', ['/bin/sh', '-c', LINUX_ROOT_INSTALL, 'novi-update', payload, hex, target], { stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-4000); };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT' ? new PasswordPromptUnavailable() : error));
        child.once('close', (code) => resolve({ code, output }));
      });
    } catch (error) {
      restoreWindows?.();
      throw error;
    }
    if (result.code === 0) return;
    restoreWindows?.();
    if (result.code === 126) throw new Error('Update cancelled. Novi needs your computer password to install updates. Click Retry, then Update & Restart to try again.');
    if (result.code === 127) throw new PasswordPromptUnavailable();
    if (result.code === 3) throw new Error('The downloaded update did not match its published checksum, so it was not installed. Please try again.');
    const detail = result.output.trim().split('\n').filter(Boolean).at(-1);
    throw new Error(`The update could not be installed${detail ? ` (${detail})` : ''}. Please try again.`);
  }

  /** Downloads one release file and rejects it unless its size and SHA-512 match the release manifest. */
  private async downloadVerified(latest: LatestRelease, file: ReleaseFile, dest: string, onProgress: (progress: UpdateProgress) => void) {
    onProgress({ percent: null, status: 'Connecting to download...' });
    const expected = await this.expectedChecksum(latest, file);
    const actual = await this.downloadFile(this.assetUrl(latest, file.name), dest, onProgress);
    onProgress({ percent: 100, status: 'Verifying download...' });
    if (actual.bytes !== expected.size || actual.sha512 !== expected.sha512) {
      rmSync(dest, { force: true });
      throw new Error('The downloaded update did not match its published checksum, so it was not installed. Please try again.');
    }
    return expected;
  }

  private async expectedChecksum(latest: LatestRelease, file: ReleaseFile) {
    let text = '';
    try {
      const res = await fetch(this.assetUrl(latest, file.manifest), { signal: AbortSignal.timeout(20_000) });
      if (res.ok) text = (await res.text()).slice(0, 256 * 1024);
    } catch { /* Reported below. */ }
    const entry = manifestEntry(text, file.name);
    if (!entry || entry.version !== latest.version) {
      throw new Error('Novi could not verify this update, so it was not installed. Please try again in a few minutes.');
    }
    return entry;
  }

  private assetUrl(latest: LatestRelease, name: string) {
    return `${latest.base}/api/download?file=${encodeURIComponent(name)}`;
  }

  private async downloadFile(url: string, dest: string, onProgress: (progress: UpdateProgress) => void, redirects = 0): Promise<{ bytes: number; sha512: string }> {
    if (redirects > 10) throw new Error('Too many download redirects.');
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, resolve);
      req.setTimeout(30_000, () => req.destroy(new Error('Update download timed out. Please try again.')));
      req.on('error', reject);
    });

    if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
      response.destroy();
      return this.downloadFile(new URL(response.headers.location, url).href, dest, onProgress, redirects + 1);
    }
    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error(`Download failed with status ${response.statusCode}`);
    }

    const length = Number(response.headers['content-length']);
    const totalBytes = Number.isSafeInteger(length) && length > 0 ? length : undefined;
    const hash = createHash('sha512');
    let downloadedBytes = 0, previousBytes = 0, previousTime = performance.now();
    const report = (complete = false) => {
      const now = performance.now();
      onProgress({
        status: 'Downloading update...',
        percent: complete ? 100 : totalBytes ? Math.min(99, Math.floor(downloadedBytes / totalBytes * 100)) : null,
        downloadedBytes,
        totalBytes: complete ? downloadedBytes : totalBytes,
        bytesPerSecond: (downloadedBytes - previousBytes) * 1000 / Math.max(1, now - previousTime),
      });
      previousBytes = downloadedBytes;
      previousTime = now;
    };
    const timer = setInterval(report, 500);
    try {
      report();
      await pipeline(response, async function* (source) {
        for await (const chunk of source) {
          downloadedBytes += chunk.length;
          hash.update(chunk);
          yield chunk;
        }
      }, createWriteStream(dest, { mode: 0o600 }));
      report(true);
      return { bytes: downloadedBytes, sha512: hash.digest('base64') };
    } catch (err) {
      rmSync(dest, { force: true });
      throw err;
    } finally {
      clearInterval(timer);
    }
  }
}

class PasswordPromptUnavailable extends Error {
  constructor() { super('Permission to install the update was not granted.'); }
}

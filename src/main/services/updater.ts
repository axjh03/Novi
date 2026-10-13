import { app } from 'electron';
import { join } from 'node:path';
import { createWriteStream, rmSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import https from 'node:https';
import http, { type IncomingMessage } from 'node:http';
import type { UpdateCheckResult, UpdateProgress } from '../../shared/types';

const execAsync = promisify(exec);

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

export class AppUpdater {
  private cachedDownloadUrl: string | null = null;
  private isUpdating = false;

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();
    const primaryUrl = getEffectivePortalUrl();
    try {
      let res: Response | null = null;
      let effectiveBase = primaryUrl;

      try {
        res = await fetch(`${primaryUrl}/api/releases/latest`, {
          headers: { 'User-Agent': `Novi-Desktop/${currentVersion}` },
          signal: AbortSignal.timeout(4000),
        });
      } catch (networkErr: any) {
        // If in local dev and localhost:3000 is unreachable, fall back to production portal
        if (!app?.isPackaged && primaryUrl.includes('localhost')) {
          effectiveBase = 'https://novi-virid.vercel.app';
          res = await fetch(`${effectiveBase}/api/releases/latest`, {
            headers: { 'User-Agent': `Novi-Desktop/${currentVersion}` },
            signal: AbortSignal.timeout(6000),
          });
        } else {
          throw networkErr;
        }
      }

      if (!res.ok) {
        throw new Error(`Endpoint returned status ${res.status}`);
      }

      const json = await res.json();
      const data = json.data || json;
      const latestVersion = String(data.version || '').replace(/^v/, '');
      const hasUpdate = this.compareSemver(latestVersion, currentVersion) > 0;

      if (hasUpdate && data.downloads) {
        const isArm = process.arch === 'arm64';
        let relUrl = '';
        if (process.platform === 'darwin') {
          relUrl = isArm ? data.downloads.macArm64 : data.downloads.macX64;
        } else if (process.platform === 'win32') {
          relUrl = data.downloads.windows;
        } else {
          relUrl = data.downloads.linuxAppImage || data.downloads.linuxDeb;
        }

        if (relUrl.startsWith('http')) {
          this.cachedDownloadUrl = relUrl;
        } else {
          this.cachedDownloadUrl = `${effectiveBase}${relUrl}`;
        }
      }

      return {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseNotes: data.releaseNotes,
        releaseDate: data.releaseDate,
      };
    } catch (err: any) {
      console.warn('[Updater] Check failed:', err?.message || err);
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
      };
    }
  }

  async installUpdate(onProgress: (progress: UpdateProgress) => void): Promise<void> {
    if (this.isUpdating) throw new Error('Update already in progress.');
    if (!this.cachedDownloadUrl) {
      const check = await this.checkForUpdates();
      if (!check.hasUpdate || !this.cachedDownloadUrl) {
        throw new Error('No update payload available.');
      }
    }

    this.isUpdating = true;
    const downloadUrl = this.cachedDownloadUrl;
    const tempDir = join(app.getPath('temp'), 'novi-in-app-update');

    try {
      mkdirSync(tempDir, { recursive: true });
      if (process.platform === 'darwin') {
        const dmgPath = join(tempDir, 'payload.dmg');
        onProgress({ percent: null, status: 'Connecting to download...' });
        await this.downloadFile(downloadUrl, dmgPath, onProgress);

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
        const exePath = join(tempDir, 'setup.exe');
        onProgress({ percent: null, status: 'Connecting to download...' });
        await this.downloadFile(downloadUrl, exePath, onProgress);

        onProgress({ percent: 100, status: 'Restarting to finish update...' });
        // Run NSIS silent updater and clean up temporary download payload afterwards
        const winScript = `start /b cmd /c "timeout /t 2 /nobreak >nul && "${exePath}" /S && timeout /t 4 /nobreak >nul && rmdir /s /q "${tempDir}""`;
        spawn('cmd.exe', ['/c', winScript], { detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => app.quit(), 400);

      } else {
        throw new Error('Automatic in-place update currently supported on macOS and Windows.');
      }
    } catch (err) {
      this.isUpdating = false;
      throw err;
    }
  }

  private compareSemver(v1: string, v2: string): number {
    const p1 = (v1 || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const p2 = (v2 || '0').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  private async downloadFile(url: string, dest: string, onProgress: (progress: UpdateProgress) => void, redirects = 0): Promise<void> {
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
          yield chunk;
        }
      }, createWriteStream(dest));
      report(true);
    } catch (err) {
      rmSync(dest, { force: true });
      throw err;
    } finally {
      clearInterval(timer);
    }
  }
}

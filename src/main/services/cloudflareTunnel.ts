import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

export class CloudflareTunnelService {
  private process: ChildProcess | null = null;
  private url: string | null = null;
  private startingPromise: Promise<string> | null = null;

  findBinary(): string | null {
    const candidates = [
      '/opt/homebrew/bin/cloudflared',
      '/usr/local/bin/cloudflared',
      'cloudflared',
    ];
    for (const c of candidates) {
      if (c.startsWith('/') && existsSync(c)) return c;
    }
    return 'cloudflared';
  }

  isAvailable(): boolean {
    return Boolean(this.findBinary());
  }

  getUrl(): string | null {
    return this.url;
  }

  isActive(): boolean {
    return Boolean(this.url && this.process && !this.process.killed);
  }

  async start(port: number): Promise<string> {
    if (this.isActive() && this.url) return this.url;
    if (this.startingPromise) return this.startingPromise;

    const bin = this.findBinary() || 'cloudflared';

    this.startingPromise = new Promise((resolve, reject) => {
      let resolved = false;
      const child = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.process = child;

      const handleOutput = (chunk: Buffer) => {
        const text = chunk.toString();
        // Look for trycloudflare.com URL pattern
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          this.url = match[0];
          this.startingPromise = null;
          resolve(match[0]);
        }
      };

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', handleOutput);

      child.on('error', (err) => {
        this.process = null;
        this.url = null;
        this.startingPromise = null;
        if (!resolved) reject(err);
      });

      child.on('exit', (code) => {
        this.process = null;
        this.url = null;
        this.startingPromise = null;
        if (!resolved) reject(new Error(`cloudflared exited with code ${code}`));
      });

      // Timeout after 25 seconds if no URL was emitted
      setTimeout(() => {
        if (!resolved) {
          this.stop();
          this.startingPromise = null;
          reject(new Error('Cloudflare Quick Tunnel timed out.'));
        }
      }, 25000);
    });

    return this.startingPromise;
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      this.process = null;
    }
    this.url = null;
    this.startingPromise = null;
  }
}

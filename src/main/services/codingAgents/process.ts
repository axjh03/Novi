import { spawn, spawnSync, type SpawnOptionsWithoutStdio } from 'node:child_process';

/** Own the engine until its process and pipes have closed, before removing its private home. */
export function spawnEngine(command: string, args: string[], options: SpawnOptionsWithoutStdio) {
  const child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  return {
    child,
    async stop() {
      if (child.exitCode === null && child.signalCode === null && child.pid) {
        if (process.platform === 'win32') {
          const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
          if (result.error || result.status !== 0) child.kill('SIGKILL');
        } else {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([closed, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('The coding engine did not close within 5 seconds.')), 5000);
        })]);
      } finally { clearTimeout(timer); }
    },
  };
}

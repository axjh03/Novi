import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { UserError } from './validation';

export function appCommand(argv: string[], packaged: boolean): 'start' | 'stop' {
  // Electron development adds the app entrypoint before user arguments.
  return argv.slice(packaged ? 1 : 2).includes('stop') ? 'stop' : 'start';
}

export function commandLauncher(executable: string, windows: boolean): string {
  if (/[\r\n\x00]/.test(executable)) throw new UserError('The application path contains unsupported characters.');
  if (windows) {
    if (/["%]/.test(executable)) throw new UserError('Move Novi to a path without quotes or percent signs before installing its command.');
    return `@echo off\r\nrem Novi command launcher\r\nsetlocal DisableDelayedExpansion\r\nif "%~1"=="start" goto start\r\nif "%~1"=="stop" goto stop\r\necho Usage: novi start ^| stop\r\nexit /b 1\r\n:start\r\nstart "" "${executable}" start\r\nexit /b\r\n:stop\r\nstart "" /wait "${executable}" stop\r\n`;
  }
  const quoted = "'" + executable.replace(/'/g, "'\\''") + "'";
  return `#!/bin/sh\n# Novi command launcher\ncase "$1" in\n  start) nohup ${quoted} start >/dev/null 2>&1 & ;;\n  stop) exec ${quoted} stop ;;\n  *) echo 'Usage: novi start | stop' >&2; exit 1 ;;\nesac\n`;
}

export function installCommand(directory: string, executable: string, windows: boolean) {
  const file = join(directory, windows ? 'novi.cmd' : 'novi');
  const source = commandLauncher(executable, windows);
  mkdirSync(directory, { recursive: true });
  if (existsSync(file) && !readFileSync(file, 'utf8').includes('Novi command launcher')) throw new UserError(`A different command already exists at ${file}. It has been preserved.`);
  writeFileSync(file, source, { mode: 0o755 });
  return { directory, file };
}

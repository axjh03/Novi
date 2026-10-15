import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, chmodSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppCommandStatus } from '../../shared/types';
import { UserError } from './validation';

export function appCommand(argv: string[], packaged: boolean): 'start' | 'stop' {
  // Electron development adds the app entrypoint before user arguments.
  return argv.slice(packaged ? 1 : 2).includes('stop') ? 'stop' : 'start';
}

export function commandLauncher(executable: string, windows: boolean): string {
  if (/[\r\n\x00]/.test(executable)) throw new UserError('The application path contains unsupported characters.');
  if (windows) {
    if (/["%]/.test(executable)) throw new UserError('Move Novi to a path without quotes or percent signs before installing its command.');
    return `@echo off\r\nrem Novi command launcher\r\nsetlocal DisableDelayedExpansion\r\nif "%~1"=="start" goto start\r\nif "%~1"=="show" goto start\r\nif "%~1"=="stop" goto stop\r\necho Usage: novi start ^| show ^| stop\r\nexit /b 1\r\n:start\r\nstart "" "${executable}" start\r\nexit /b\r\n:stop\r\nstart "" /wait "${executable}" stop\r\n`;
  }
  const quoted = "'" + executable.replace(/'/g, "'\\''") + "'";
  return `#!/bin/sh\n# Novi command launcher\ncase "$1" in\n  start|show) nohup ${quoted} start >/dev/null 2>&1 & ;;\n  stop) exec ${quoted} stop ;;\n  *) echo 'Usage: novi start | show | stop' >&2; exit 1 ;;\nesac\n`;
}

export function installCommand(directory: string, executable: string, windows: boolean) {
  const file = join(directory, windows ? 'novi.cmd' : 'novi');
  const source = commandLauncher(executable, windows);
  mkdirSync(directory, { recursive: true });
  if (existsSync(file) && !readFileSync(file, 'utf8').includes('Novi command launcher')) throw new UserError(`A different command already exists at ${file}. It has been preserved.`);
  writeFileSync(file, source, { mode: 0o755 });
  if (!windows) chmodSync(file, 0o755);
  return { directory, file };
}

const execute = promisify(execFile);
const quoteShell = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export class AppCommandService {
  constructor(private options: { directory: string; executable: string; home: string; windows: boolean; packaged: boolean },
    private env: NodeJS.ProcessEnv = process.env) {}

  private profiles() {
    const { home, directory } = this.options;
    if (/[\r\n\x00:]/.test(directory)) throw new UserError('The command directory contains unsupported PATH characters.');
    const shell = basename(this.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'));
    const quoted = quoteShell(directory);
    const line = `\n# Novi terminal command PATH\ncase ":$PATH:" in *:${quoted}:*) ;; *) export PATH=${quoted}:"$PATH" ;; esac\n`;
    if (shell === 'zsh') return { files: ['.zprofile', '.zshrc'].map(file => join(this.env.ZDOTDIR || home, file)), line };
    if (shell === 'bash') {
      const login = ['.bash_profile', '.bash_login', '.profile'].map(file => join(home, file)).find(existsSync) || join(home, '.profile');
      return { files: [login, join(home, '.bashrc')], line };
    }
    if (['sh', 'dash', 'ksh'].includes(shell)) return { files: [join(home, '.profile')], line };
    if (shell === 'fish') {
      const fishQuoted = "'" + directory.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      return { files: [join(this.env.XDG_CONFIG_HOME || join(home, '.config'), 'fish', 'conf.d', 'novi-path.fish')],
        line: `\n# Novi terminal command PATH\nif not contains -- ${fishQuoted} $PATH\n  set -gx PATH ${fishQuoted} $PATH\nend\n` };
    }
    throw new UserError(`Automatic PATH setup is not supported for ${shell}. Add ${directory} to your shell's PATH.`);
  }

  private async windowsPath(install: boolean) {
    // .NET persists the user PATH and broadcasts WM_SETTINGCHANGE; no setx truncation or shell interpolation.
    const script = `$ErrorActionPreference = 'Stop'
$directory = $env:NOVI_COMMAND_DIRECTORY
$user = [string][Environment]::GetEnvironmentVariable('Path', 'User')
$machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$found = @((($user + ';' + $machine) -split ';') | Where-Object { [Environment]::ExpandEnvironmentVariables($_).Trim('"').TrimEnd('\\') -ieq $directory.TrimEnd('\\') }).Count -gt 0
if ($env:NOVI_COMMAND_INSTALL -eq '1' -and -not $found) {
  [Environment]::SetEnvironmentVariable('Path', ($user.TrimEnd(';') + ';' + $directory).TrimStart(';'), 'User')
  $found = $true
}
if ($found) { 'true' } else { 'false' }`;
    const { stdout } = await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...this.env, NOVI_COMMAND_DIRECTORY: this.options.directory, NOVI_COMMAND_INSTALL: install ? '1' : '0' },
      windowsHide: true, timeout: 30_000,
    });
    return stdout.trim() === 'true';
  }

  async status(): Promise<AppCommandStatus> {
    const { directory, executable, windows, packaged } = this.options;
    const file = join(directory, windows ? 'novi.cmd' : 'novi');
    let state: AppCommandStatus['state'] = 'missing';
    if (existsSync(file)) {
      if (!statSync(file).isFile()) state = 'conflict';
      else {
        const source = readFileSync(file, 'utf8');
        state = !source.includes('Novi command launcher') ? 'conflict'
          : source === commandLauncher(executable, windows) && (windows || (statSync(file).mode & 0o111) !== 0) ? 'installed' : 'outdated';
      }
    }
    let pathConfigured: boolean;
    if (windows) pathConfigured = await this.windowsPath(false);
    else {
      pathConfigured = (this.env.PATH || '').split(':').includes(directory);
      if (!pathConfigured) {
        const { files, line } = this.profiles();
        pathConfigured = files.every(file => existsSync(file) && readFileSync(file, 'utf8').includes(line));
      }
    }
    return { directory, file, state, pathConfigured, canInstall: packaged && state !== 'conflict' };
  }

  async install(): Promise<AppCommandStatus> {
    if (!this.options.packaged) throw new UserError('Install the command from an installed Novi build. In development, use electron . start or electron . stop.');
    const { directory, executable, windows } = this.options;
    // Resolve shell support before writing a launcher.
    const profiles = windows ? null : this.profiles();
    installCommand(directory, executable, windows);
    if (windows) await this.windowsPath(true);
    else if (!(this.env.PATH || '').split(':').includes(directory)) {
      for (const file of profiles!.files) {
        if (existsSync(file) && readFileSync(file, 'utf8').includes(profiles!.line)) continue;
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, profiles!.line, { mode: 0o644 });
      }
    }
    return this.status();
  }
}

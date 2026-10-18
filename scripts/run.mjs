import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
const separateTerminals = process.argv.includes('--terminals');
const appIndex = process.argv.indexOf('--app');
const target = appIndex === -1 ? null : process.argv[appIndex + 1];
const windows = process.platform === 'win32';
const port = Number(process.env.NOVI_PORT || process.env.ASTRA_PORT || 3000);
const children = new Set();
let stopping = false;
const env = { ...process.env, PORTAL_ORIGIN: `http://localhost:${port}`, NOVI_ACCESS_URL: `http://localhost:${port}` };
delete env.ELECTRON_RUN_AS_NODE;

function launch(label, entry, args = [], cwd = root) {
  console.log(`\n[novi] ${label}`);
  const child = spawn(process.execPath, [resolve(root, entry), ...args], { cwd, env, stdio: 'inherit', windowsHide: true, detached: !windows });
  children.add(child);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      children.delete(child);
      if (code === 0 || stopping) resolve();
      else reject(new Error(`${label} exited (${signal || code}).`));
    });
  });
  // The caller may still be waiting for the other component to start.
  void done.catch(() => {});
  return { child, done };
}
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.all([...children].map(child => new Promise(resolve => {
    if (!child.pid) return resolve();
    if (windows) {
      // Only terminate the process trees started by this launcher.
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.once('error', resolve); killer.once('close', resolve);
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
      resolve();
    }
  })));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void stop().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143)); });

async function ready() {
  const seconds = mode === 'build-and-run' ? 300 : 90;
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline && !stopping) {
    try { const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch { /* Server is still starting. */ }
    await delay(500);
  }
  throw new Error(`The web frontend/backend did not become ready within ${seconds} seconds. Check its terminal.`);
}
async function checkPort() {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} is busy. Stop that server or set NOVI_PORT to a free port.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const psQuote = value => `'${value.replaceAll("'", "''")}'`;
const encoded = script => Buffer.from(script, 'utf16le').toString('base64');
async function openTerminal(app) {
  const title = `Novi - ${app === 'web' ? 'Web frontend + backend' : 'Electron'} - ${mode}`;
  const args = [resolve(root, 'scripts/run.mjs'), mode, '--app', app];
  let command, terminalArgs;
  if (windows) {
    // Start-Process explicitly creates a visible, independent console window.
    const script = `$Host.UI.RawUI.WindowTitle = ${psQuote(title)}; $env:NOVI_PORT = '${port}'; $env:ASTRA_PORT = '${port}'; & ${[process.execPath, ...args].map(psQuote).join(' ')}; Write-Host ('Finished with exit code ' + $LASTEXITCODE)`;
    command = 'powershell.exe';
    terminalArgs = ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded(`$ErrorActionPreference = 'Stop'; Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-NoExit', '-EncodedCommand', '${encoded(script)}') -WorkingDirectory ${psQuote(root)} -WindowStyle Normal`)];
  } else {
    // Explicit port propagation also works with already-running terminal daemons.
    const script = `cd ${shellQuote(root)} && env NOVI_PORT=${port} ASTRA_PORT=${port} ${[process.execPath, ...args].map(shellQuote).join(' ')}; result=$?; printf '\\nFinished (exit %s). Press Enter to close.\\n' "$result"; read -r answer`;
    if (process.platform === 'darwin') {
      command = '/usr/bin/osascript';
      terminalArgs = ['-e', `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(script)}\nend tell`];
    } else {
      const terminal = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'].find(name => (process.env.PATH || '').split(delimiter).some(dir => existsSync(join(dir, name))));
      if (!terminal) throw new Error('No supported terminal found. Install xterm, or run two terminals manually with --app web and --app electron.');
      command = terminal;
      terminalArgs = terminal === 'gnome-terminal' ? ['--title', title, '--', 'sh', '-c', script] : terminal === 'xfce4-terminal' ? ['--disable-server', '--title', title, '-x', 'sh', '-c', script] : ['-e', 'sh', '-c', script];
    }
  }
  const terminal = spawn(command, terminalArgs, { cwd: root, env, stdio: 'ignore', detached: !windows, windowsHide: true });
  await new Promise((resolve, reject) => {
    terminal.once('error', reject);
    if (windows || process.platform === 'darwin') terminal.once('exit', code => code === 0 ? resolve() : reject(new Error(`Could not open ${title} (exit ${code}).`)));
    else terminal.once('spawn', resolve);
  });
  terminal.unref();
  console.log(`[novi] Opened ${title}`);
}
async function main() {
  if (!['dev', 'build', 'build-and-run'].includes(mode)) throw new Error('Usage: node scripts/run.mjs dev|build|build-and-run');
  if (appIndex !== -1 && !['web', 'electron'].includes(target)) throw new Error('--app must be web or electron.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('NOVI_PORT must be a port between 1024 and 65535.');
  for (const folder of ['node_modules/electron-vite', 'webapp/node_modules/next']) if (!existsSync(resolve(root, folder))) throw new Error('Install dependencies first: npm install && npm --prefix webapp install');
  if (separateTerminals) {
    if (target) throw new Error('Use either --terminals or --app.');
    if (mode !== 'build') await checkPort();
    await openTerminal('web');
    await openTerminal('electron');
    console.log('[novi] Each app has its own terminal. Stop each app with Ctrl+C in its terminal.');
    return;
  }
  const web = (action) => launch(`Web frontend + backend: ${action}`, 'webapp/scripts/run-access.mjs', ['next', action, ...(action === 'build' ? [] : ['--port', String(port), '--hostname', '127.0.0.1'])], resolve(root, 'webapp'));
  if (mode !== 'dev') {
    if (target !== 'web') {
      await launch('Type-check Electron', 'node_modules/typescript/bin/tsc', ['--noEmit']).done;
      await launch('Build Electron', 'node_modules/electron-vite/bin/electron-vite.js', ['build']).done;
    }
    if (target !== 'electron') await web('build').done;
    if (mode === 'build') { console.log(`\n[novi] ${target || 'Both apps'} built successfully.`); return; }
  }
  const startDesktop = () => launch(mode === 'dev' ? 'Start Electron development' : 'Run Electron production build', 'node_modules/electron-vite/bin/electron-vite.js', [mode === 'dev' ? 'dev' : 'preview']);
  if (target === 'electron') {
    console.log(`[novi] Waiting for the web app at http://localhost:${port} ...`);
    await ready();
    await startDesktop().done;
    return;
  }
  // Do not attach Electron to, or terminate, an unrelated server on this port.
  await checkPort();
  const server = web(mode === 'dev' ? 'dev' : 'start');
  if (target === 'web') { console.log(`[novi] Portal: http://localhost:${port}`); await server.done; return; }
  await Promise.race([ready(), server.done.then(() => { throw new Error('The web server exited before becoming ready.'); })]);
  console.log(`\n[novi] Portal: http://localhost:${port}. Press Ctrl+C to stop both applications.`);
  const desktop = startDesktop();
  await Promise.race([server.done, desktop.done]);
}
try { await main(); } catch (error) { console.error(`\n[novi] ${error.message}`); process.exitCode = 1; } finally { await stop(); }

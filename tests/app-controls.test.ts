import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AppMask, appMaskInput, DEFAULT_APP_MASK } from '../src/main/services/appMask';
import { AppCommandService, appCommand, commandLauncher, installCommand } from '../src/main/services/appCommand';

test('mask validates names and bounded PNG data without accepting filesystem paths', () => {
  assert.deepEqual(appMaskInput(DEFAULT_APP_MASK), DEFAULT_APP_MASK);
  for (const patch of [{ enabled: 'true' }, { name: '' }, { name: 'a\nb' }, { name: 'x'.repeat(61) }, { icon: '/etc/passwd' }, { icon: 'x'.repeat(200_001) }]) {
    assert.throws(() => appMaskInput({ ...DEFAULT_APP_MASK, ...patch }));
  }
});

test('mask persists across launch, covers new windows and title updates, and restores all windows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-mask-'));
  const windows: any[] = [];
  function window(title: string, url = '') {
    const win = Object.assign(new EventEmitter(), {
      title, skipped: false, icon: '', getTitle() { return this.title; },
      setTitle(value: string) { this.title = value; }, setSkipTaskbar(value: boolean) { this.skipped = value; },
      setIcon(value: any) { this.icon = value.path; }, webContents: { getURL: () => url },
      minimizable: !url.endsWith('#/overlay'), minimized: false,
      isMinimizable() { return this.minimizable; }, setMinimizable(value: boolean) { this.minimizable = value; },
      isMinimized() { return this.minimized; }, restore() { this.minimized = false; },
    });
    windows.push(win); return win;
  }
  const main = window('Novi');
  const viewer = window('Code', 'file:///index.html#/code-viewer');
  let dockHidden = false;
  const electron: any = {
    BrowserWindow: { getAllWindows: () => windows },
    app: { dock: { hide: () => { dockHidden = true; }, show: async () => { dockHidden = false; } } },
    nativeImage: {
      createFromPath: (path: string) => ({ path, isEmpty: () => false }),
      createFromDataURL: (path: string) => ({ path, isEmpty: () => path.endsWith('bad') }),
    },
  };
  try {
    const mask = new AppMask(directory, 'default.png', () => main as any, electron);
    mask.attach(main as any); mask.attach(viewer as any);
    assert.equal(main.skipped, false);
    const settings = { enabled: true, name: 'Notes', icon: 'data:image/png;base64,aGVsbG8=' };
    mask.save(settings);
    assert.equal(dockHidden, true);
    assert.equal(main.minimizable, true, 'masked windows can still be minimized');
    main.minimized = true; main.emit('minimize');
    assert.equal(main.minimized, true);
    main.minimized = false;
    for (const win of windows) assert.deepEqual([win.title, win.skipped], ['Notes', true]);
    let prevented = false;
    viewer.emit('page-title-updated', { preventDefault: () => { prevented = true; } }, 'Updated code');
    assert.equal(prevented, true);
    assert.equal(viewer.title, 'Notes');
    const overlay = window('Overlay', 'file:///index.html#/overlay');
    mask.attach(overlay as any);
    assert.deepEqual([overlay.title, overlay.skipped], ['Notes', true]);
    dockHidden = false;
    overlay.emit('show');
    assert.equal(dockHidden, true, 'showing an auxiliary window keeps the Dock hidden');
    assert.deepEqual(new AppMask(directory, 'default.png', () => main as any, electron).settings, settings);
    assert.throws(() => mask.save({ ...settings, icon: 'data:image/png;base64,bad' }));
    assert.deepEqual(mask.settings, settings, 'invalid icons do not change saved state');
    mask.save({ ...settings, enabled: false });
    assert.equal(dockHidden, false);
    assert.deepEqual([main.title, main.skipped], ['Novi', false]);
    assert.deepEqual([viewer.title, viewer.skipped], ['Updated code', false]);
    assert.deepEqual([overlay.title, overlay.skipped], ['Overlay', true]);
    if (process.platform !== 'darwin') for (const win of windows) assert.equal(win.icon, 'default.png');
    assert.equal(JSON.parse(readFileSync(join(directory, 'app-mask.json'), 'utf8')).enabled, false);
    assert.equal(main.minimizable, true);
    assert.equal(overlay.minimizable, false, 'auxiliary windows retain their original minimize policy');
    main.minimized = true;
    mask.setTransparent(true);
    assert.deepEqual([main.minimizable, main.minimized], [false, false]);
    mask.save(settings);
    mask.setTransparent(false);
    assert.equal(main.minimizable, true, 'leaving transparent mode allows minimizing again while masked');
    mask.save({ ...settings, enabled: false });
    assert.equal(main.minimizable, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('commands recognize packaged and development arguments without interpreting an entrypoint as a command', () => {
  assert.equal(appCommand(['/app/novi', 'stop'], true), 'stop');
  assert.equal(appCommand(['/electron', '/app', 'stop'], false), 'stop');
  assert.equal(appCommand(['/electron', 'stop'], false), 'start');
  assert.equal(appCommand(['/app/novi', 'start'], true), 'start');
  assert.equal(appCommand(['/app/novi'], true), 'start');
});

test('command installation preserves unrelated files and refreshes its own launcher', () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-command-'));
  try {
    const file = join(directory, 'novi');
    writeFileSync(file, 'existing command');
    assert.throws(() => installCommand(directory, '/app/Novi', false), /preserved/);
    assert.equal(readFileSync(file, 'utf8'), 'existing command');
    rmSync(file);
    installCommand(directory, '/app/Novi', false);
    installCommand(directory, '/new/Novi', false);
    assert.match(readFileSync(file, 'utf8'), /\/new\/Novi/);
    assert.throws(() => commandLauncher('/bad\npath', false));
    assert.throws(() => commandLauncher('C:\\bad%PATH%\\Novi.exe', true));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('POSIX launcher safely runs a path containing shell metacharacters and rejects unknown commands', { skip: process.platform === 'win32' }, (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-command-shell-'));
  try {
    const executable = join(directory, "Novi's $(false) `false` app");
    writeFileSync(executable, '#!/bin/sh\nprintf "%s" "$1"\n', { mode: 0o755 });
    const { file } = installCommand(directory, executable, false);
    let output: string;
    try { output = execFileSync(file, ['stop'], { encoding: 'utf8' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('This sandbox blocks child-process execution.'); return; }
      throw error;
    }
    assert.equal(output, 'stop');
    assert.throws(() => execFileSync(file, ['invalid'], { stdio: 'pipe' }), /Command failed/);
    execFileSync('sh', ['-n', file]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('terminal setup detects installation, repairs moved launchers, and adds PATH once without replacing profiles', async () => {
  const home = mkdtempSync(join(tmpdir(), "novi-shell-'$`-"));
  const directory = join(home, '.local', 'bin');
  const options = { directory, executable: '/app/Novi', home, windows: false, packaged: true };
  const service = new AppCommandService(options, { SHELL: '/bin/bash', PATH: '/usr/bin:/bin' });
  try {
    writeFileSync(join(home, '.bash_profile'), '# Keep my login configuration\n');
    assert.equal((await service.status()).state, 'missing');
    const installed = await service.install();
    assert.deepEqual([installed.state, installed.pathConfigured], ['installed', true]);
    const profile = readFileSync(join(home, '.bash_profile'), 'utf8');
    const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');
    assert(profile.startsWith('# Keep my login configuration\n'));
    await service.install();
    assert.equal(readFileSync(join(home, '.bash_profile'), 'utf8'), profile);
    assert.equal(readFileSync(join(home, '.bashrc'), 'utf8'), bashrc);
    const moved = new AppCommandService({ ...options, executable: '/new/Novi' }, { SHELL: '/bin/bash', PATH: '' });
    assert.equal((await moved.status()).state, 'outdated');
    assert.equal((await moved.install()).state, 'installed');
    chmodSync(installed.file, 0o644);
    if (process.platform !== 'win32') assert.equal((await moved.status()).state, 'outdated');
    assert.equal((await moved.install()).state, 'installed');
    writeFileSync(installed.file, '# Another application');
    assert.equal((await moved.status()).state, 'conflict');
    await assert.rejects(moved.install(), /preserved/);
    assert.equal(readFileSync(installed.file, 'utf8'), '# Another application');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('PATH setup honors zsh config directories and does not install from development', async () => {
  const home = mkdtempSync(join(tmpdir(), 'novi-zsh-'));
  const options = { directory: join(home, 'bin'), executable: '/app/Novi', home, windows: false, packaged: true };
  try {
    const env = { SHELL: '/bin/zsh', ZDOTDIR: join(home, 'zsh'), PATH: '' };
    const service = new AppCommandService(options, env);
    await service.install();
    for (const file of ['.zprofile', '.zshrc']) assert.match(readFileSync(join(env.ZDOTDIR, file), 'utf8'), /Novi terminal command PATH/);
    await assert.rejects(new AppCommandService({ ...options, packaged: false }, env).install(), /installed Novi build/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('generated PATH setup is safe for shell metacharacters and takes effect in a fresh shell', { skip: process.platform === 'win32' }, async (t) => {
  const home = mkdtempSync(join(tmpdir(), "novi-path-'$`-"));
  const directory = join(home, '.local', 'bin');
  try {
    await new AppCommandService({ directory, executable: '/app/Novi', home, windows: false, packaged: true }, { SHELL: '/bin/bash', PATH: '/usr/bin:/bin' }).install();
    try {
      const output = execFileSync('/bin/sh', ['-c', '. "$1"; . "$1"; printf "%s" "$PATH"', 'check', join(home, '.profile')], { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
      assert.equal(output, `${directory}:/usr/bin:/bin`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('This sandbox blocks child-process execution.'); return; }
      throw error;
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

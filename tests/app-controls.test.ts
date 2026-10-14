import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AppMask, appMaskInput, DEFAULT_APP_MASK } from '../src/main/services/appMask';
import { appCommand, commandLauncher, installCommand } from '../src/main/services/appCommand';

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

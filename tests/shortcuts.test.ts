import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isShortcut, recordShortcut, sameShortcut, type KeyPress } from '../src/shared/shortcuts.ts';
import { DEFAULT_TRANSPARENT_SHORTCUT, LEGACY_TRANSPARENT_SHORTCUT } from '../src/shared/types.ts';
import { settingsInput } from '../src/main/services/validation.ts';
import { Storage } from '../src/main/services/storage.ts';
import { StealthService } from '../src/main/services/stealth.ts';

const press = (code: string, key: string, held: Partial<KeyPress> = {}): KeyPress => ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...held });

test('the recorder turns the keys pressed into a shortcut, using physical keys', () => {
  assert.deepEqual(recordShortcut(press('KeyT', 'T', { ctrlKey: true, shiftKey: true }), false), { shortcut: 'Control+Shift+T' });
  assert.deepEqual(recordShortcut(press('Digit3', '#', { shiftKey: true, altKey: true }), false), { shortcut: 'Alt+Shift+3' }, 'Shift+3 is 3, not #');
  assert.deepEqual(recordShortcut(press('KeyT', '†', { altKey: true, ctrlKey: true }), true), { shortcut: 'Control+Option+T' }, 'Option+T on a Mac is T');
  assert.deepEqual(recordShortcut(press('KeyK', 'k', { metaKey: true }), true), { shortcut: 'Command+K' });
  assert.deepEqual(recordShortcut(press('KeyK', 'k', { metaKey: true }), false), { shortcut: 'Super+K' });
  assert.deepEqual(recordShortcut(press('F9', 'F9', { altKey: true }), false), { shortcut: 'Alt+F9' });
  assert.deepEqual(recordShortcut(press('PageUp', 'PageUp', { ctrlKey: true }), false), { shortcut: 'Control+PageUp' });
  assert.deepEqual(recordShortcut(press('Numpad7', '7', { ctrlKey: true }), false), { shortcut: 'Control+7' });
  assert.deepEqual(recordShortcut(press('ArrowLeft', 'ArrowLeft', { ctrlKey: true, altKey: true }), false), { shortcut: 'Control+Alt+Left' });
  assert.deepEqual(recordShortcut(press('', 'q', { ctrlKey: true }), false), { shortcut: 'Control+Q' }, 'keyboards without key codes still record');
  // While only modifiers are held, the field shows them.
  assert.deepEqual(recordShortcut(press('ControlLeft', 'Control', { ctrlKey: true }), false), { partial: 'Control' });
  assert.deepEqual(recordShortcut(press('ShiftLeft', 'Shift', { ctrlKey: true, shiftKey: true }), false), { partial: 'Control+Shift' });
  assert.deepEqual(recordShortcut(press('ShiftLeft', 'Shift'), false), { partial: '' }, 'releasing the last modifier clears the preview');
  assert.match((recordShortcut(press('KeyT', 't'), false) as { error: string }).error, /Hold Ctrl, Alt, or Shift together with T/);
  assert.match((recordShortcut(press('Minus', '-', { ctrlKey: true }), false) as { error: string }).error, /not supported/);
  for (const shortcut of ['Control+Shift+T', 'Alt+Shift+3', 'Control+Option+T', 'Command+K', 'Super+K', 'Alt+F9', 'Control+Alt+Left', DEFAULT_TRANSPARENT_SHORTCUT]) assert(isShortcut(shortcut), shortcut);
  for (const shortcut of ['T', 'Control+', 'Control+Control+T', 'Hyper+T', 'Control+Shift+t', 'Control+-']) assert(!isShortcut(shortcut), shortcut);
});

test('shortcuts compare equal regardless of modifier order or Electron aliases', () => {
  assert(sameShortcut('Control+Shift+T', 'Shift+Control+T'));
  assert(sameShortcut('CommandOrControl+Shift+T', 'Control+Shift+t'));
  assert(sameShortcut('Option+Control+T', 'Control+Alt+T'));
  assert(!sameShortcut('Control+Shift+T', 'Control+T'));
  assert(!sameShortcut('Alt+3', 'Alt+4'));
});

test('the interaction shortcut must differ from the transparency shortcut', () => {
  const base = { displayName: 'Ada', theme: 'system' };
  assert.throws(() => settingsInput({ ...base, clickThroughShortcut: 'Shift+Control+T', transparentShortcut: 'Control+Shift+T' }), /must be different/);
  assert.throws(() => settingsInput({ ...base, clickThroughShortcut: DEFAULT_TRANSPARENT_SHORTCUT }), /must be different/, 'compared with the default when none is sent');
  assert.equal(settingsInput({ ...base, clickThroughShortcut: 'Control+Shift+T', transparentShortcut: 'Alt+F9' }).clickThroughShortcut, 'Control+Shift+T',
    'a combination is only reserved while transparency uses it');
  assert.throws(() => settingsInput({ ...base, clickThroughShortcut: 'Control+Shift+t' }), /supported key combination/);
});

test('a saved copy of the old Home+PageUp default moves to the current default; chosen shortcuts stay', { skip: process.platform === 'darwin' ? 'Mac never used Home+PageUp' : false }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'novi-shortcuts-'));
  try {
    const { LocalAuthService } = await import('../src/main/services/auth.ts');
    const storage = new Storage(dir);
    await new LocalAuthService(storage).signUp('Ada', 'ada@example.com', 'password123');
    storage.current().settings.transparentShortcut = LEGACY_TRANSPARENT_SHORTCUT;
    storage.save();
    assert.equal(new Storage(dir).current().settings.transparentShortcut, 'Control+Shift+T');
    storage.current().settings.transparentShortcut = 'Alt+F9';
    storage.save();
    assert.equal(new Storage(dir).current().settings.transparentShortcut, 'Alt+F9');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('only the shortcuts shown in Settings are registered, and recording pauses them all', () => {
  const require = createRequire(import.meta.url);
  const electronPath = require.resolve('electron'); require(electronPath);
  const original = require.cache[electronPath]!.exports;
  const registered = new Map<string, () => void>();
  require.cache[electronPath]!.exports = {
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: {
      register(key: string, callback: () => void) { if (registered.has(key)) return false; registered.set(key, callback); return true; },
      unregister(key: string) { registered.delete(key); },
      isRegistered: (key: string) => registered.has(key),
    },
  };
  const win: any = { isDestroyed: () => false, setContentProtection() {}, setAlwaysOnTop() {}, setIgnoreMouseEvents() {}, webContents: { send() {}, getURL: () => '' } };
  const stealth = new StealthService(() => win);
  try {
    const shown = [DEFAULT_TRANSPARENT_SHORTCUT, 'Alt+C', 'Alt+B', 'Alt+3', 'Alt+A'];
    assert.deepEqual([...registered.keys()].sort(), [...shown].sort(), 'no hidden transparency hotkeys');
    registered.get(DEFAULT_TRANSPARENT_SHORTCUT)!();
    assert.equal(stealth.getState().transparent, true);
    assert(registered.has('numlock') && registered.has(stealth.getState().clickThroughShortcut));
    assert(!registered.has('CommandOrControl+Shift+T') && !registered.has('Shift+PageDown') && !registered.has('Home+PageUp'));

    stealth.suspendShortcuts(true);
    for (const key of [...shown, stealth.getState().clickThroughShortcut]) assert(!registered.has(key), `${key} is paused while recording`);
    stealth.suspendShortcuts(true);
    stealth.suspendShortcuts(false);
    for (const key of [...shown, stealth.getState().clickThroughShortcut]) assert(registered.has(key), `${key} works again after recording`);
    registered.get(DEFAULT_TRANSPARENT_SHORTCUT)!();
    assert.equal(stealth.getState().transparent, false);
    assert(!registered.has(stealth.getState().clickThroughShortcut), 'the interaction shortcut is only active while transparent');
  } finally {
    stealth.cleanup();
    require.cache[electronPath]!.exports = original;
  }
});

test('paused shortcuts come back on their own if recording is never finished', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const require = createRequire(import.meta.url);
  const electronPath = require.resolve('electron'); require(electronPath);
  const original = require.cache[electronPath]!.exports;
  const registered = new Set<string>();
  require.cache[electronPath]!.exports = {
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: { register: (key: string) => { registered.add(key); return true; }, unregister: (key: string) => { registered.delete(key); }, isRegistered: (key: string) => registered.has(key) },
  };
  const stealth = new StealthService(() => null);
  try {
    stealth.suspendShortcuts(true);
    assert(!registered.has(DEFAULT_TRANSPARENT_SHORTCUT));
    t.mock.timers.tick(59_000);
    assert(!registered.has(DEFAULT_TRANSPARENT_SHORTCUT));
    t.mock.timers.tick(1_000);
    assert(registered.has(DEFAULT_TRANSPARENT_SHORTCUT));
  } finally {
    stealth.cleanup();
    require.cache[electronPath]!.exports = original;
  }
});

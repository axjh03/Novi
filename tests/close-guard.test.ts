import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { CloseGuard, type CloseState } from '../src/main/services/closeGuard.ts';

/**
 * A stand-in for the main BrowserWindow: records what the guard does to it, and turns `close()`
 * into a 'close' event that a test can cancel, like Electron does.
 */
class FakeWindow extends EventEmitter {
  minimized = false; shown = 0; focused = 0; closes = 0;
  crashed = false; loading = false;
  sent: Array<{ channel: string; value: unknown }> = [];
  webContents = {
    isCrashed: () => this.crashed,
    isLoading: () => this.loading,
    send: (channel: string, value: unknown) => { this.sent.push({ channel, value }); },
  };
  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; }
  show() { this.shown++; }
  focus() { this.focused++; }
  close() { this.closes++; }
}

/** A guard over one fake window, with a state the test can change between close requests. */
function setup(initial: Partial<CloseState> = {}) {
  const state: CloseState = { signedIn: true, quitting: false, session: false, ...initial };
  const guard = new CloseGuard(() => state);
  const window = new FakeWindow();
  guard.watch(window as any);
  return { state, guard, window, allow: () => guard.allow(window as any) };
}

test('signed in: closing asks the page first and brings a minimized window forward', () => {
  const { window, allow } = setup({ session: true });
  window.minimized = true;
  assert.equal(allow(), false, 'the close must be cancelled until the user confirms');
  assert.deepEqual(window.sent, [{ channel: 'close-requested', value: { session: true } }]);
  assert.equal(window.minimized, false, 'a minimized window would hide the question');
  assert.equal(window.shown, 1);
  assert.equal(window.focused, 1);
});

test('the page learns whether a session is running', () => {
  const { window, allow } = setup({ session: false });
  allow();
  assert.deepEqual(window.sent, [{ channel: 'close-requested', value: { session: false } }]);
});

test('after the user confirms, the window closes and asks no more', () => {
  const { guard, window, allow } = setup();
  assert.equal(allow(), false);
  guard.confirm(window as any);
  assert.equal(window.closes, 1, 'confirm closes the window');
  assert.equal(allow(), true, 'the repeated close event goes through');
  assert.equal(window.sent.length, 1, 'and is not asked about again');
});

test('a new main window asks again (macOS keeps Novi running after its window closes)', () => {
  const { guard, window } = setup();
  guard.confirm(window as any);
  const next = new FakeWindow();
  guard.watch(next as any);
  assert.equal(guard.allow(next as any), false, 'confirming one window does not confirm the next');
});

test('nothing to lose or already leaving: closes without asking', () => {
  for (const [label, change] of [['signed out', { signedIn: false }], ['quitting', { quitting: true }]] as const) {
    const { window, allow } = setup(change);
    assert.equal(allow(), true, label);
    assert.deepEqual(window.sent, [], `${label}: no question`);
    assert.equal(window.shown + window.focused, 0, `${label}: the window is left alone`);
  }
});

test('the state is read at each close, so quitting after a cancelled close is not blocked', () => {
  const { state, allow } = setup();
  assert.equal(allow(), false);
  state.quitting = true;
  assert.equal(allow(), true);
});

test('a page that can never answer does not keep Novi open', () => {
  const crashed = setup();
  crashed.window.crashed = true;
  assert.equal(crashed.allow(), true, 'crashed page');

  const loading = setup();
  loading.window.loading = true;
  assert.equal(loading.allow(), true, 'page still loading');

  const frozen = setup();
  frozen.window.emit('unresponsive');
  assert.equal(frozen.allow(), true, 'frozen page');
  frozen.window.emit('responsive');
  assert.equal(frozen.allow(), false, 'asks again once the page responds');
});

test('a Windows shutdown, restart or log-off closes without asking', () => {
  const { window, allow } = setup();
  window.emit('session-end');
  assert.equal(allow(), true);
  assert.deepEqual(window.sent, []);
});

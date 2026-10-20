import type { BrowserWindow } from 'electron';
import type { CloseRequest } from '../../shared/types';

/** What the main process knows at the moment the main window is asked to close. */
export interface CloseState {
  /** An account is signed in, so closing ends its work. Nothing is lost on the sign-in screen. */
  signedIn: boolean;
  /**
   * Novi has already started quitting: Quit Novi in Settings (confirmed there), the Quit shortcut
   * (Cmd+Q on macOS, Ctrl+Q on Linux), `novi stop`, an update restart, or a macOS/Linux shutdown.
   * Those close every window without asking.
   */
  quitting: boolean;
  /** A session is running, so the confirmation can say that closing ends it. */
  session: boolean;
}

/**
 * Asks before the main window closes while an account is signed in.
 *
 * Every way of closing the main window arrives as its 'close' event: the title bar's X button,
 * Alt+F4, Ctrl+W or Cmd+W (Electron's default menu), and closing it from the taskbar or Dock.
 * The caller passes each one to `allow()`. When the user must confirm, `allow()` cancels nothing
 * itself: it asks the page to show Novi's own confirmation and returns false, so the caller
 * prevents that close. If the user then chooses Close, the page calls `confirm()`, which closes
 * the window for real.
 *
 * The window always closes without asking when the page could never show the confirmation
 * (crashed, frozen or still loading), so Novi can't get stuck open. The preload script covers
 * the remaining case, a page that is running but shows no confirmation (see `onCloseRequested`).
 */
export class CloseGuard {
  /** Windows whose close the user already confirmed; their next close goes ahead. */
  private readonly confirmed = new WeakSet<BrowserWindow>();
  /** Windows whose page stopped responding (Electron's 'unresponsive' event). */
  private readonly frozen = new WeakSet<BrowserWindow>();
  /** Windows is shutting down, restarting or signing the user out; it must never be held up. */
  private systemEnding = false;

  /** @param state read fresh on every close request, so it reflects sign-in and quitting at that moment. */
  constructor(private readonly state: () => CloseState) {}

  /**
   * Tracks the window events that decide whether asking is still possible. Call once per window,
   * when it is created. Watching windows that never become the main window is harmless.
   */
  watch(window: BrowserWindow) {
    window.on('unresponsive', () => this.frozen.add(window));
    window.on('responsive', () => this.frozen.delete(window));
    // Windows only, and only when the system is shutting down, restarting or logging off. Electron
    // skips 'before-quit' then, so this is the one signal that closing must not wait for an answer.
    window.on('session-end', () => { this.systemEnding = true; });
  }

  /**
   * Decides whether the main window may close now.
   *
   * @param window the main window, from its 'close' event.
   * @returns true to let the window close. false when the user must confirm first: the window is
   *   brought forward (a minimized window would hide the question) and its page receives
   *   'close-requested'. The caller must then call `event.preventDefault()`.
   */
  allow(window: BrowserWindow): boolean {
    const { signedIn, quitting, session } = this.state();
    const page = window.webContents;
    if (!signedIn || quitting || this.systemEnding || this.confirmed.has(window)) return true;
    if (this.frozen.has(window) || page.isCrashed() || page.isLoading()) return true;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    const request: CloseRequest = { session };
    page.send('close-requested', request);
    return false;
  }

  /**
   * Closes the window after the user chose Close in the confirmation. Its 'close' event runs
   * again and `allow()` now lets it through.
   */
  confirm(window: BrowserWindow) {
    this.confirmed.add(window);
    window.close();
  }
}

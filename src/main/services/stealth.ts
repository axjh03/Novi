import type { BrowserWindow } from 'electron';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, DEFAULT_TRANSPARENT_SHORTCUT } from '../../shared/types';
import type { OverlayService } from './overlay';
import { UserError } from './validation';
import { createRequire } from 'node:module';

const req = typeof require === 'function' ? require : createRequire(import.meta.url);

function getGlobalShortcut(): { register: (key: string, cb: () => void) => boolean; unregister: (key: string) => void } | null {
  try {
    return req('electron').globalShortcut;
  } catch {
    return null;
  }
}

export interface StealthState {
  transparent: boolean;
  numLock: boolean;
  clickThrough: boolean;
  clickThroughShortcut: string;
}

export class StealthService {
  private transparent = false;
  private numLock = false;
  private clickThrough = false;
  private clickThroughShortcut = DEFAULT_CLICK_THROUGH_SHORTCUT;
  private registeredClickThroughShortcut: string | null = null;
  private transparentShortcut = DEFAULT_TRANSPARENT_SHORTCUT;
  private codingModeShortcut = 'Alt+C';
  private behavioralModeShortcut = 'Alt+B';
  private screenshotShortcut = 'Alt+3';
  private audioRecordShortcut = 'Alt+A';
  private pollInterval: NodeJS.Timeout | null = null;
  private getKeyStateFn: ((vk: number) => number) | null = null;
  private overlayService: OverlayService | null = null;
  private getWindow: () => BrowserWindow | null;

  constructor(getWindow: () => BrowserWindow | null, overlayService?: OverlayService) {
    this.getWindow = getWindow;
    this.overlayService = overlayService || null;
    this.initNativeKeyReader();
    // Initial check of NumLock state
    this.numLock = this.readNumLock();
    this.registerGlobalHotkeys();
  }

  getOverlayService(): OverlayService | null {
    return this.overlayService;
  }

  private sendAction(type: string, payload?: any) {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('global-action', { type, payload });
    }
  }

  private registerGlobalHotkeys() {
    const shortcut = getGlobalShortcut();
    if (!shortcut) return;

    try {
      shortcut.register(this.transparentShortcut, () => {
        this.toggleTransparent();
      });
    } catch { /* ignore */ }

    if (process.platform === 'darwin') {
      try {
        shortcut.register('Option+Control+T', () => {
          this.toggleTransparent();
        });
      } catch { /* ignore */ }
    } else {
      // Windows & Linux
      try {
        shortcut.register('Home+PageUp', () => {
          this.setTransparent(true);
        });
      } catch { /* ignore */ }
      try {
        shortcut.register('Shift+PageDown', () => {
          this.setTransparent(false);
        });
      } catch { /* ignore */ }
    }

    try {
      shortcut.register(this.codingModeShortcut, () => {
        this.sendAction('toggle-coding-mode');
      });
    } catch { /* ignore */ }

    try {
      shortcut.register(this.behavioralModeShortcut, () => {
        this.sendAction('toggle-behavioral-mode');
      });
    } catch { /* ignore */ }

    try {
      shortcut.register(this.screenshotShortcut, () => {
        this.sendAction('capture-screen');
      });
    } catch { /* ignore */ }

    try {
      shortcut.register(this.audioRecordShortcut, () => {
        this.sendAction('toggle-audio-record');
      });
    } catch { /* ignore */ }
  }

  setOverlayService(overlay: OverlayService) {
    this.overlayService = overlay;
  }

  private initNativeKeyReader() {
    if (process.platform === 'win32') {
      try {
        const koffi = req('koffi');
        const user32 = koffi.load('user32.dll');
        const GetKeyState = user32.func('short __stdcall GetKeyState(int nVirtKey)');
        this.getKeyStateFn = (vk: number) => GetKeyState(vk);
      } catch (err) {
        console.warn('[StealthService] Could not initialize koffi for user32 GetKeyState:', err);
      }
    }
  }

  private readNumLock(): boolean {
    if (this.getKeyStateFn) {
      try {
        // VK_NUMLOCK is 0x90. Bit 0 indicates toggle state (1 = ON, 0 = OFF).
        return (this.getKeyStateFn(0x90) & 1) !== 0;
      } catch {
        return false;
      }
    }
    return false;
  }

  getState(): StealthState {
    this.numLock = this.readNumLock();
    return {
      transparent: this.transparent,
      numLock: this.numLock,
      clickThrough: this.clickThrough,
      clickThroughShortcut: this.clickThroughShortcut,
    };
  }

  setClickThroughShortcut(key: string) {
    if (key === this.clickThroughShortcut) return;
    const wasTransparent = this.transparent;
    const shortcuts = getGlobalShortcut();
    if (shortcuts) {
      let registered = false;
      try { registered = shortcuts.register(key, () => this.toggleClickThrough()); } catch { /* report the unsupported or unavailable accelerator below */ }
      if (!registered) throw new UserError('That shortcut is already in use by another app. Choose a different one.');
      if (this.registeredClickThroughShortcut) shortcuts.unregister(this.registeredClickThroughShortcut);
      if (!wasTransparent) shortcuts.unregister(key);
      this.registeredClickThroughShortcut = wasTransparent ? key : null;
    }
    this.clickThroughShortcut = key;
    this.broadcastState();
  }

  setTransparent(enabled: boolean): StealthState {
    const win = this.getWindow();
    this.transparent = enabled;
    this.numLock = this.readNumLock();
    this.clickThrough = enabled && !this.numLock;

    for (const window of this.getWindows()) {
      window.setContentProtection(enabled);
      if (enabled) {
        window.setAlwaysOnTop(true, 'screen-saver');
        this.applyMouseMode(window, !this.clickThrough);
      } else {
        window.setAlwaysOnTop(false);
        window.setIgnoreMouseEvents(false);
      }
    }

    if (enabled) {
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }

    // Also protect the eye-tracking overlay window if present
    if (this.overlayService) {
      this.overlayService.setContentProtection(enabled);
    }

    this.broadcastState();
    return this.getState();
  }

  toggleTransparent(): StealthState {
    return this.setTransparent(!this.transparent);
  }

  private applyMouseMode(win: BrowserWindow, isNumLockOn: boolean) {
    // Detached code/diagram viewers remain scrollable while the main HUD passes clicks through.
    if (!this.transparent || win.webContents.getURL?.().endsWith('#/code-viewer')) {
      win.setIgnoreMouseEvents(false);
      return;
    }

    if (isNumLockOn) {
      // Interactive mode: clicks and typing are accepted
      win.setIgnoreMouseEvents(false);
    } else {
      // Click-through mode: clicks pass right through to windows underneath
      win.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  private startMonitoring() {
    this.stopMonitoring();

    // Check periodically for NumLock changes (75ms gives snappy, unnoticeable latency)
    this.pollInterval = setInterval(() => {
      this.checkNumLockChange();
    }, 75);

    const shortcut = getGlobalShortcut();
    if (shortcut) {
      try {
        shortcut.register('numlock', () => {
          setTimeout(() => this.checkNumLockChange(), 10);
        });
      } catch {
        // Ignore
      }

      try {
        shortcut.register('CommandOrControl+Shift+T', () => {
          this.toggleTransparent();
        });
      } catch {
        // Ignore
      }
    }
    this.registerClickThroughShortcut();
  }

  private registerClickThroughShortcut() {
    const shortcut = getGlobalShortcut();
    if (!shortcut || !this.transparent) return;
    if (shortcut.register(this.clickThroughShortcut, () => this.toggleClickThrough())) {
      this.registeredClickThroughShortcut = this.clickThroughShortcut;
    }
  }

  public toggleClickThrough(): StealthState {
    if (!this.transparent) return this.getState();
    this.clickThrough = !this.clickThrough;
    const win = this.getWindow();
    if (win && !win.isDestroyed()) this.applyMouseMode(win, !this.clickThrough);
    this.broadcastState();
    return this.getState();
  }

  private stopMonitoring() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    const shortcut = getGlobalShortcut();
    if (shortcut) {
      try {
        shortcut.unregister('numlock');
      } catch {
        // Ignore
      }
      if (this.registeredClickThroughShortcut) {
        shortcut.unregister(this.registeredClickThroughShortcut);
        this.registeredClickThroughShortcut = null;
      }
    }
  }

  private checkNumLockChange() {
    const current = this.readNumLock();
    if (current !== this.numLock) {
      this.numLock = current;
      this.clickThrough = !this.numLock;
      for (const window of this.getWindows()) {
        if (window && !window.isDestroyed() && this.transparent) {
          this.applyMouseMode(window, !this.clickThrough);
        }
      }
      this.broadcastState();
    }
  }

  private broadcastState() {
    for (const window of this.getWindows()) window.webContents.send('stealth-state-changed', this.getState());
  }

  private getWindows(): BrowserWindow[] {
    const win = this.getWindow();
    const windows = new Set<BrowserWindow>(win && !win.isDestroyed() ? [win] : []);
    try { for (const window of req('electron').BrowserWindow.getAllWindows()) if (!window.isDestroyed()) windows.add(window); } catch { /* tests and shutdown */ }
    return [...windows];
  }

  setShortcuts(shortcuts: { coding?: string; behavioral?: string; screenshot?: string; audio?: string; transparent?: string }) {
    const globalShortcuts = getGlobalShortcut();
    if (!globalShortcuts) return;

    if (shortcuts.transparent && shortcuts.transparent !== this.transparentShortcut) {
      try { globalShortcuts.unregister(this.transparentShortcut); } catch {}
      try {
        if (globalShortcuts.register(shortcuts.transparent, () => this.toggleTransparent())) {
          this.transparentShortcut = shortcuts.transparent;
        }
      } catch {}
    }
    if (shortcuts.coding && shortcuts.coding !== this.codingModeShortcut) {
      try { globalShortcuts.unregister(this.codingModeShortcut); } catch {}
      try {
        if (globalShortcuts.register(shortcuts.coding, () => this.sendAction('toggle-coding-mode'))) {
          this.codingModeShortcut = shortcuts.coding;
        }
      } catch {}
    }
    if (shortcuts.behavioral && shortcuts.behavioral !== this.behavioralModeShortcut) {
      try { globalShortcuts.unregister(this.behavioralModeShortcut); } catch {}
      try {
        if (globalShortcuts.register(shortcuts.behavioral, () => this.sendAction('toggle-behavioral-mode'))) {
          this.behavioralModeShortcut = shortcuts.behavioral;
        }
      } catch {}
    }
    if (shortcuts.screenshot && shortcuts.screenshot !== this.screenshotShortcut) {
      try { globalShortcuts.unregister(this.screenshotShortcut); } catch {}
      try {
        if (globalShortcuts.register(shortcuts.screenshot, () => this.sendAction('capture-screen'))) {
          this.screenshotShortcut = shortcuts.screenshot;
        }
      } catch {}
    }
    if (shortcuts.audio && shortcuts.audio !== this.audioRecordShortcut) {
      try { globalShortcuts.unregister(this.audioRecordShortcut); } catch {}
      try {
        if (globalShortcuts.register(shortcuts.audio, () => this.sendAction('toggle-audio-record'))) {
          this.audioRecordShortcut = shortcuts.audio;
        }
      } catch {}
    }
  }

  cleanup() {
    this.stopMonitoring();
    const shortcut = getGlobalShortcut();
    if (shortcut) {
      try { shortcut.unregister(this.transparentShortcut); } catch { /* ignore */ }
      try { shortcut.unregister('Option+Control+T'); } catch { /* ignore */ }
      try { shortcut.unregister('Home+PageUp'); } catch { /* ignore */ }
      try { shortcut.unregister('Shift+PageDown'); } catch { /* ignore */ }
      try { shortcut.unregister(this.codingModeShortcut); } catch { /* ignore */ }
      try { shortcut.unregister(this.behavioralModeShortcut); } catch { /* ignore */ }
      try { shortcut.unregister(this.screenshotShortcut); } catch { /* ignore */ }
      try { shortcut.unregister(this.audioRecordShortcut); } catch { /* ignore */ }
    }
  }
}

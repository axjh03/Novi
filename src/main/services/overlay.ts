import { BrowserWindow, screen } from 'electron';
import type { MonitorDisplay, OverlayEvent } from '../../shared/types';

export class OverlayService {
  private overlayWindow: BrowserWindow | null = null;
  private currentDisplayId: number | null = null;
  private contentProtectionEnabled = false;
  private lastContent: OverlayEvent | null = null;

  setContentProtection(enable: boolean): void {
    this.contentProtectionEnabled = enable;
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.setContentProtection(enable);
    }
  }

  getDisplays(): MonitorDisplay[] {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d, index) => ({
      id: d.id,
      label: d.label || `Monitor ${index + 1} (${d.bounds.width}×${d.bounds.height})`,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === primary.id,
    }));
  }

  owns(window: BrowserWindow): boolean {
    return this.overlayWindow !== null && this.overlayWindow === window;
  }

  get activeDisplayId(): number | null {
    return this.overlayWindow && !this.overlayWindow.isDestroyed() ? this.currentDisplayId : null;
  }

  openOverlay(displayId: number, rendererUrl: string, preloadPath: string): void {
    const displays = screen.getAllDisplays();
    const targetDisplay = displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay();
    this.currentDisplayId = targetDisplay.id;

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.setBounds(targetDisplay.bounds);
      this.overlayWindow.showInactive();
      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      return;
    }

    this.overlayWindow = new BrowserWindow({
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.bounds.width,
      height: targetDisplay.bounds.height,
      frame: false,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (this.contentProtectionEnabled) {
      this.overlayWindow.setContentProtection(true);
    }
    // Default to click-through so user can click other apps beneath the overlay
    this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    this.overlayWindow.showInactive();
    // A crashed/reloading renderer must never leave an invisible input blocker.
    this.overlayWindow.webContents.on('render-process-gone', () => this.setIgnoreMouse(true));
    this.overlayWindow.webContents.on('did-start-loading', () => this.setIgnoreMouse(true));

    const targetUrl = rendererUrl.includes('#') ? rendererUrl : `${rendererUrl}#/overlay`;
    void this.overlayWindow.loadURL(targetUrl);

    const win = this.overlayWindow;
    // A late event from a replaced window must not orphan the current overlay.
    win.on('closed', () => {
      if (this.overlayWindow !== win) return;
      this.overlayWindow = null;
      this.currentDisplayId = null;
      this.lastContent = null;
    });
  }

  closeOverlay(): void {
    this.lastContent = null;
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.close();
      this.overlayWindow = null;
      this.currentDisplayId = null;
    }
  }

  setIgnoreMouse(ignore: boolean): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }

  sendToOverlay(event: OverlayEvent): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('overlay-event', event);
    }
  }

  forwardToAllWindows(event: OverlayEvent): void {
    // The overlay page loads after openOverlay resolves, so content sent on open can arrive before it listens.
    if (event.type === 'request-content') {
      if (this.lastContent) this.sendToOverlay(this.lastContent);
      return;
    }
    if (event.type === 'set-content') this.lastContent = event;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('overlay-event', event);
      }
    }
  }
}

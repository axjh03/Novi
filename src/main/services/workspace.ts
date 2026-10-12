import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron';
import { createRequire } from 'node:module';

const req = typeof require === 'function' ? require : createRequire(import.meta.url);
const electron = () => req('electron') as typeof import('electron');

export const TRAY_NAME = /^novi-tray-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRAY_WIDTH = 860;
const TRAY_GAP = 12;
const TRAY_MIN_HEIGHT = 48;
const TRAY_INITIAL_HEIGHT = 190;
// Below this much free space beside the panel, the tray centers on the screen and may overlap it.
const TRAY_MIN_SPACE = 424;
const NORMAL_SIZE = { width: 1200, height: 800 };
/** The main window's minimum size, docked or not, so code and text stay readable. */
export const MAIN_WINDOW_MIN = { width: 850, height: 600 };

/** The output panel: full height on the right edge, 35% of the screen, at least 850 and at most 1000 px wide. */
export function dockedBounds(area: Rectangle): Rectangle {
  const width = Math.min(area.width, Math.max(MAIN_WINDOW_MIN.width, Math.min(1000, Math.round(area.width * 0.35))));
  return { x: area.x + area.width - width, y: area.y, width, height: area.height };
}

/** The tray: top-center of the screen, shifted left only as far as needed to clear the docked panel. */
export function trayBounds(area: Rectangle, dockLeft: number | null, height: number): Rectangle {
  const usePanel = dockLeft !== null && dockLeft > area.x && dockLeft < area.x + area.width && dockLeft - area.x >= TRAY_MIN_SPACE;
  const right = usePanel ? dockLeft! : area.x + area.width;
  const width = Math.max(0, Math.min(TRAY_WIDTH, right - area.x - 2 * TRAY_GAP));
  const centered = Math.round(area.x + (area.width - width) / 2);
  const x = Math.max(area.x + TRAY_GAP, Math.min(centered, right - TRAY_GAP - width));
  return { x, y: area.y + TRAY_GAP, width, height: clampTrayHeight(area, height) };
}

export function clampTrayHeight(area: Rectangle, height: number): number {
  return Math.round(Math.max(TRAY_MIN_HEIGHT, Math.min(height, area.height - 2 * TRAY_GAP)));
}

function intersects(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Docks the main window as the output panel and owns the floating input tray during a session. */
export class WorkspaceService {
  private tray: BrowserWindow | null = null;
  private trayShown = false;
  private pendingHeight: number | null = null;
  private saved: { bounds: Rectangle; maximized: boolean; minimum: [number, number] } | null = null;
  private dockedState = false;

  constructor(
    private getMainWindow: () => BrowserWindow | null,
    private onTrayCreated: (tray: BrowserWindow) => void = () => {},
  ) {}

  get docked() { return this.dockedState; }

  attachMain(window: BrowserWindow) {
    window.webContents.setWindowOpenHandler(({ url, frameName }) => url === 'about:blank' && TRAY_NAME.test(frameName)
      ? { action: 'allow', overrideBrowserWindowOptions: this.trayOptions() }
      : { action: 'deny' });
    window.webContents.on('did-create-window', (child, { frameName }) => {
      if (TRAY_NAME.test(frameName)) this.adoptTray(child);
      else child.close();
    });
    // A reload or crash ends the page that renders the tray; never leave an empty tray behind.
    window.webContents.on('did-start-navigation', (details) => { if (details.isMainFrame && !details.isSameDocument) this.closeTray(); });
    window.webContents.on('render-process-gone', () => this.closeTray());
    window.on('closed', () => this.closeTray());
    // The panel and the tray come forward together. moveTop never takes focus.
    window.on('focus', () => this.bringForward(this.tray));
  }

  private bringForward(window: BrowserWindow | null) {
    if (!window || window.isDestroyed() || !window.isVisible() || window.isMinimized()) return;
    try { window.moveTop(); } catch { /* Not supported on Wayland. */ }
  }

  private trayOptions(): BrowserWindowConstructorOptions {
    const bounds = this.trayPlacement(TRAY_INITIAL_HEIGHT);
    return {
      ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
      // Stays above other apps only in transparent mode (see StealthService).
      title: 'Novi', autoHideMenuBar: true,
    };
  }

  /** Top-center of the screen the output panel is on, clear of the panel while docked. */
  private trayPlacement(height: number): Rectangle {
    const { screen } = electron();
    const main = this.getMainWindow();
    const mainBounds = main && !main.isDestroyed() ? main.getBounds() : null;
    const area = (mainBounds ? screen.getDisplayMatching(mainBounds) : screen.getPrimaryDisplay()).workArea;
    const dockLeft = this.dockedState && mainBounds && intersects(mainBounds, area) ? mainBounds.x : null;
    return trayBounds(area, dockLeft, height);
  }

  private adoptTray(child: BrowserWindow) {
    // React development mode opens and closes a tray once before the real one.
    if (child.isDestroyed()) return;
    if (this.tray && !this.tray.isDestroyed() && this.tray !== child) this.tray.close();
    this.tray = child;
    this.trayShown = false;
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-navigate', (event) => event.preventDefault());
    child.webContents.on('will-attach-webview', (event) => event.preventDefault());
    child.on('closed', () => { if (this.tray === child) { this.tray = null; this.trayShown = false; } });
    child.on('focus', () => this.bringForward(this.getMainWindow()));
    this.onTrayCreated(child);
    // The window may be adopted after the panel docked; place it against the current layout.
    this.placeTray();
    if (this.pendingHeight !== null) { const height = this.pendingHeight; this.pendingHeight = null; this.resizeTray(height); }
    // Normally shown on the first size report; this covers a renderer that never reports.
    setTimeout(() => { if (this.tray === child) this.showTray(); }, 1000);
  }

  private showTray() {
    const tray = this.tray;
    if (!tray || tray.isDestroyed() || this.trayShown) return;
    this.trayShown = true;
    tray.show();
  }

  resizeTray(height: number) {
    const tray = this.tray;
    if (!tray || tray.isDestroyed()) { this.pendingHeight = height; return; }
    const { screen } = electron();
    const bounds = tray.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const nextHeight = clampTrayHeight(area, height);
    const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - nextHeight));
    if (nextHeight !== bounds.height || y !== bounds.y) tray.setBounds({ x: bounds.x, y, width: bounds.width, height: nextHeight });
    this.showTray();
  }

  private placeTray() {
    const tray = this.tray;
    if (!tray || tray.isDestroyed()) return;
    tray.setBounds(this.trayPlacement(tray.getBounds().height));
  }

  closeTray() {
    const tray = this.tray;
    this.tray = null;
    this.trayShown = false;
    this.pendingHeight = null;
    if (tray && !tray.isDestroyed()) tray.close();
  }

  dock(area: Rectangle) {
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) return;
    if (!this.dockedState) {
      const minimum = window.getMinimumSize();
      this.saved = {
        bounds: window.isMaximized() ? window.getNormalBounds() : window.getBounds(),
        maximized: window.isMaximized(),
        minimum: [minimum[0] ?? 0, minimum[1] ?? 0],
      };
    }
    this.dockedState = true;
    if (window.isMinimized()) window.restore();
    if (window.isMaximized()) window.unmaximize();
    window.setMinimumSize(Math.min(MAIN_WINDOW_MIN.width, area.width), Math.min(MAIN_WINDOW_MIN.height, area.height));
    window.setBounds(dockedBounds(area));
    this.placeTray();
  }

  // The page closes its own tray; closing it here could race a tray it has just reopened.
  undock() {
    if (!this.dockedState) return;
    this.dockedState = false;
    const saved = this.saved;
    this.saved = null;
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) return;
    const { screen } = electron();
    if (window.isMaximized()) window.unmaximize();
    let bounds = saved?.bounds;
    if (!bounds || !screen.getAllDisplays().some((display) => intersects(display.workArea, bounds!))) {
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      const width = Math.min(NORMAL_SIZE.width, area.width), height = Math.min(NORMAL_SIZE.height, area.height);
      bounds = { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
    }
    window.setBounds(bounds);
    if (saved) window.setMinimumSize(saved.minimum[0], saved.minimum[1]);
    if (saved?.maximized) window.maximize();
  }
}

import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron';
import { createRequire } from 'node:module';
import type { InterfaceStyle, TrayRole } from '../../shared/appearance';

const req = typeof require === 'function' ? require : createRequire(import.meta.url);
const electron = () => req('electron') as typeof import('electron');

/** `novi-tray-<role>-<uuid>`; the legacy `novi-tray-<uuid>` is the center tray. */
export const TRAY_NAME = /^novi-tray-(?:(left|center|right)-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function trayRole(frameName: string): TrayRole | null {
  const match = TRAY_NAME.exec(frameName);
  return match ? (match[1] as TrayRole | undefined) ?? 'center' : null;
}
const TRAY_WIDTH = 600;
const MODERN_TRAY_WIDTH = 490;
export const SIDE_TRAY_WIDTH = 360;
export const LEFT_TRAY_WIDTH = 470;
const TRAY_MIN_WIDTH = 320;
const TRAY_GAP = 12;
const TRAY_MIN_HEIGHT = 48;
const TRAY_INITIAL_HEIGHT = 190;
// Below this much free space beside the panel, the tray centers on the screen and may overlap it.
const TRAY_MIN_SPACE = TRAY_MIN_WIDTH + 2 * TRAY_GAP;
const NORMAL_SIZE = { width: 1200, height: 800 };
/** The main window can shrink to 25% of its original minimum size. */
export const MAIN_WINDOW_MIN = { width: 213, height: 150 };

/** Leave a little desktop visible at startup, including on scaled laptop displays. */
export function normalBounds(area: Rectangle): Rectangle {
  const width = Math.min(NORMAL_SIZE.width, Math.round(area.width * 0.9));
  const height = Math.min(NORMAL_SIZE.height, Math.round(area.height * 0.9));
  return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
}

/** A readable output column, aligned to the right of the working display. */
export function dockedBounds(area: Rectangle): Rectangle {
  const width = Math.min(area.width, Math.max(420, Math.min(1000, Math.round(area.width * 0.35))));
  return { x: area.x + area.width - width, y: area.y, width, height: area.height };
}

/** A plain reading window below the floating controls, including on small or offset displays. */
export function modernBounds(area: Rectangle, controlsHeight = 0): Rectangle {
  const gap = Math.min(12, Math.floor(Math.min(area.width, area.height) / 10));
  const width = Math.min(area.width, Math.max(Math.min(MAIN_WINDOW_MIN.width, area.width), Math.min(820, area.width - gap * 2)));
  const minimumHeight = Math.min(MAIN_WINDOW_MIN.height, area.height);
  const bottomGap = Math.min(gap, area.height - minimumHeight);
  const top = Math.max(0, Math.min(Math.max(Math.min(96, Math.round(area.height * 0.18)), controlsHeight + TRAY_GAP * 2), area.height - minimumHeight - bottomGap));
  const height = Math.min(720, area.height - top - bottomGap);
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + top, width, height };
}

export function viewerBounds(area: Rectangle, panel: Rectangle): Rectangle {
  const gap = Math.min(16, Math.round(area.width * 0.02));
  const available = panel.x - area.x - gap * 2;
  const width = Math.min(Math.max(360, Math.round(area.width * 0.46)), 800, available >= 300 ? available : area.width - gap * 2);
  const height = Math.min(900, Math.round(area.height * 0.78));
  return { x: area.x + gap, y: area.y + Math.round((area.height - height) / 2), width, height };
}

/** The tray: top-center of the screen, shifted left only as far as needed to clear the docked panel. */
export function trayBounds(area: Rectangle, dockLeft: number | null, height: number, preferredWidth = TRAY_WIDTH): Rectangle {
  const usePanel = dockLeft !== null && dockLeft > area.x && dockLeft < area.x + area.width && dockLeft - area.x >= TRAY_MIN_SPACE;
  const right = usePanel ? dockLeft! : area.x + area.width;
  const width = Math.max(0, Math.min(preferredWidth, right - area.x - 2 * TRAY_GAP));
  const centered = Math.round(area.x + (area.width - width) / 2);
  const x = Math.max(area.x + TRAY_GAP, Math.min(centered, right - TRAY_GAP - width));
  return { x, y: area.y + TRAY_GAP, width, height: clampTrayHeight(area, height) };
}

/** The Modern side trays: top-left and top-right corners of the screen, never shifted for a docked panel. */
export function sideTrayBounds(area: Rectangle, side: 'left' | 'right', height: number, preferredWidth = SIDE_TRAY_WIDTH): Rectangle {
  const width = Math.max(0, Math.min(preferredWidth, area.width - 2 * TRAY_GAP));
  const x = side === 'left' ? area.x + TRAY_GAP : area.x + area.width - TRAY_GAP - width;
  return { x, y: area.y + TRAY_GAP, width, height: clampTrayHeight(area, height) };
}

export function clampTrayHeight(area: Rectangle, height: number): number {
  return Math.round(Math.max(TRAY_MIN_HEIGHT, Math.min(height, area.height - 2 * TRAY_GAP)));
}

/** Keep the opposite edge anchored and prevent a resize from pushing the tray off its monitor. */
export function resizedTrayBounds(area: Rectangle, bounds: Rectangle, requestedWidth: number, edge: 'left' | 'right'): Rectangle {
  const minimum = Math.min(TRAY_MIN_WIDTH, area.width);
  const anchor = edge === 'left'
    ? Math.max(area.x + minimum, Math.min(bounds.x + bounds.width, area.x + area.width))
    : Math.max(area.x, Math.min(bounds.x, area.x + area.width - minimum));
  const available = edge === 'left' ? anchor - area.x : area.x + area.width - anchor;
  const width = Math.round(Math.max(minimum, Math.min(requestedWidth, available)));
  return { ...bounds, x: edge === 'left' ? anchor - width : anchor, width };
}

function intersects(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Keep enlarged controls clear of the reader while leaving manually separated windows alone. */
export function readingBoundsBelowControls(area: Rectangle, reader: Rectangle, controls: Rectangle): Rectangle {
  if (!intersects(reader, controls)) return reader;
  const minimumHeight = Math.min(MAIN_WINDOW_MIN.height, area.height);
  const y = Math.max(area.y, Math.min(controls.y + controls.height + TRAY_GAP, area.y + area.height - minimumHeight));
  const height = Math.max(minimumHeight, Math.min(reader.height, area.y + area.height - y - TRAY_GAP));
  return { ...reader, y, height };
}

/**
 * Docks the main window as the output panel and owns the floating trays during a session.
 * Up to three trays, keyed by role: Modern floats a session bar (`left`), the answer bar and panel
 * (`center`) and an appearance bar (`right`); Classic opens only the center one. Hide/show, focus
 * and placement treat them as a group; sizes are per tray, and only the center tray's controls
 * height positions the Modern reading window.
 */
export class WorkspaceService {
  private trays = new Map<TrayRole, BrowserWindow>();
  private shown = new Set<TrayRole>();
  private hidden = false;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private shortcutRegistered = false;
  private pendingHeights = new Map<TrayRole, { height: number; controlsHeight?: number }>();
  private saved: { bounds: Rectangle; maximized: boolean; minimum: [number, number] } | null = null;
  private dockedState = false;
  private interfaceStyle: InterfaceStyle = 'classic';
  private controlsHeight = 0;

  constructor(
    private getMainWindow: () => BrowserWindow | null,
    private onTrayCreated: (tray: BrowserWindow) => void = () => {},
  ) {}

  get docked() { return this.dockedState; }

  private tray(role: TrayRole): BrowserWindow | null {
    const tray = this.trays.get(role);
    return tray && !tray.isDestroyed() ? tray : null;
  }

  private *openTrays(): Generator<[TrayRole, BrowserWindow]> {
    for (const [role, tray] of this.trays) if (!tray.isDestroyed()) yield [role, tray];
  }

  action(action: 'dashboard' | 'hide' | 'show') {
    const main = this.getMainWindow();
    if (action === 'dashboard') {
      if (main?.isVisible()) main.hide(); else main?.show();
      return;
    }
    clearTimeout(this.hideTimer);
    this.hidden = action === 'hide';
    main?.webContents.send('global-action', { type: 'workspace-visibility', payload: !this.hidden });
    if (this.hidden) {
      const trays = [...this.trays.values()];
      this.hideTimer = setTimeout(() => { if (this.hidden) for (const tray of trays) if (!tray.isDestroyed()) tray.hide(); }, 170);
      if (!this.shortcutRegistered) main?.show();
    } else for (const [, tray] of this.openTrays()) tray.show();
  }

  attachMain(window: BrowserWindow) {
    const shortcut = 'CommandOrControl+\\';
    const registered = electron().globalShortcut.register(shortcut, () => { if (this.interfaceStyle === 'modern') this.action(this.hidden ? 'show' : 'hide'); });
    this.shortcutRegistered = registered;
    window.on('closed', () => { if (registered) electron().globalShortcut.unregister(shortcut); });
    window.webContents.setWindowOpenHandler(({ url, frameName }) => {
      const role = url === 'about:blank' ? trayRole(frameName) : null;
      return role ? { action: 'allow', overrideBrowserWindowOptions: this.trayOptions(role) } : { action: 'deny' };
    });
    window.webContents.on('did-create-window', (child, { frameName }) => {
      const role = trayRole(frameName);
      if (role) this.adoptTray(child, role);
      else child.close();
    });
    // A reload or crash ends the page that renders the trays; never leave an empty tray behind.
    window.webContents.on('did-start-navigation', (details) => { if (details.isMainFrame && !details.isSameDocument) this.closeTray(); });
    window.webContents.on('render-process-gone', () => this.closeTray());
    window.on('closed', () => this.closeTray());
    // The panel and the trays come forward together. moveTop never takes focus.
    window.on('focus', () => { for (const [, tray] of this.openTrays()) this.bringForward(tray); });
  }

  private bringForward(window: BrowserWindow | null) {
    if (!window || window.isDestroyed() || !window.isVisible() || window.isMinimized()) return;
    try { window.moveTop(); } catch { /* Not supported on Wayland. */ }
  }

  private trayOptions(role: TrayRole): BrowserWindowConstructorOptions {
    const bounds = this.trayPlacement(role, TRAY_INITIAL_HEIGHT);
    return {
      ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      alwaysOnTop: true,
      resizable: true, minWidth: Math.min(TRAY_MIN_WIDTH, bounds.width), minHeight: TRAY_MIN_HEIGHT, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
      // Stays above other apps in both normal and transparent modes.
      title: 'Novi', autoHideMenuBar: true,
    };
  }

  // The session bar on the left carries labelled controls, so it starts wider than the appearance bar.
  private defaultTrayWidth(role: TrayRole) {
    if (role === 'center') return this.interfaceStyle === 'modern' ? MODERN_TRAY_WIDTH : TRAY_WIDTH;
    return role === 'left' ? LEFT_TRAY_WIDTH : SIDE_TRAY_WIDTH;
  }

  /** On the screen the output panel is on: the center tray clear of the panel while docked, the side trays in the corners. */
  private trayPlacement(role: TrayRole, height: number, width?: number): Rectangle {
    const { screen } = electron();
    const main = this.getMainWindow();
    const mainBounds = main && !main.isDestroyed() ? main.getBounds() : null;
    const area = (mainBounds ? screen.getDisplayMatching(mainBounds) : screen.getPrimaryDisplay()).workArea;
    const current = this.tray(role);
    const trayWidth = width ?? (current ? current.getBounds().width : this.defaultTrayWidth(role));
    if (role !== 'center') return sideTrayBounds(area, role, height, trayWidth);
    const dockLeft = this.dockedState && this.interfaceStyle === 'classic' && mainBounds && intersects(mainBounds, area) ? mainBounds.x : null;
    return trayBounds(area, dockLeft, height, trayWidth);
  }

  private adoptTray(child: BrowserWindow, role: TrayRole) {
    // React development mode opens and closes a tray once before the real one.
    if (child.isDestroyed()) return;
    const previous = this.tray(role);
    if (previous && previous !== child) previous.close();
    this.trays.set(role, child);
    this.shown.delete(role);
    if (this.hidden) {
      // A tray reopened while hidden brings the whole group back, so no tray is left behind.
      this.hidden = false;
      for (const [other, tray] of this.openTrays()) if (other !== role && this.shown.has(other)) tray.show();
    }
    child.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-navigate', (event) => event.preventDefault());
    child.webContents.on('will-attach-webview', (event) => event.preventDefault());
    child.on('closed', () => {
      if (this.trays.get(role) !== child) return;
      this.trays.delete(role);
      this.shown.delete(role);
      if (role === 'center') this.controlsHeight = 0;
    });
    child.on('focus', () => this.bringForward(this.getMainWindow()));
    this.onTrayCreated(child);
    // The window may be adopted after the panel docked; place it against the current layout.
    this.placeOne(role, child);
    const pending = this.pendingHeights.get(role);
    if (pending) { this.pendingHeights.delete(role); this.resizeTray(pending.height, pending.controlsHeight, role); }
    // Normally shown on the first size report; this covers a renderer that never reports.
    setTimeout(() => { if (this.trays.get(role) === child) this.showTray(role); }, 1000);
  }

  private showTray(role: TrayRole) {
    const tray = this.tray(role);
    if (!tray || this.shown.has(role) || this.hidden) return;
    this.shown.add(role);
    tray.show();
  }

  resizeTray(height: number, controlsHeight?: number, role: TrayRole = 'center') {
    // Only the center tray's controls sit above the Modern reader.
    if (role === 'center' && controlsHeight !== undefined) this.controlsHeight = controlsHeight;
    const tray = this.tray(role);
    if (!tray) { this.pendingHeights.set(role, { height, controlsHeight }); return; }
    const { screen } = electron();
    const bounds = tray.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const nextHeight = clampTrayHeight(area, height);
    const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - nextHeight));
    if (nextHeight !== bounds.height || y !== bounds.y) tray.setBounds({ x: bounds.x, y, width: bounds.width, height: nextHeight });
    const main = this.getMainWindow();
    if (role === 'center' && this.dockedState && this.interfaceStyle === 'modern' && controlsHeight && main && !main.isDestroyed()) {
      const reader = main.getBounds();
      if (intersects(reader, area)) {
        const next = readingBoundsBelowControls(area, reader, { ...bounds, y, height: controlsHeight });
        if (next.y !== reader.y || next.height !== reader.height) main.setBounds(next);
      }
    }
    this.showTray(role);
  }

  resizeTrayWidth(width: number, edge: 'left' | 'right', role: TrayRole = 'center') {
    const tray = this.tray(role);
    if (!tray) return;
    const bounds = tray.getBounds();
    const area = electron().screen.getDisplayMatching(bounds).workArea;
    tray.setBounds(resizedTrayBounds(area, bounds, width, edge));
  }

  resetSizes() {
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) return;
    const { screen } = electron();
    if (window.isMaximized()) window.unmaximize();
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    window.setMinimumSize(Math.min(MAIN_WINDOW_MIN.width, area.width), Math.min(MAIN_WINDOW_MIN.height, area.height));
    if (this.dockedState) window.setBounds(this.interfaceStyle === 'modern' ? modernBounds(area, this.controlsHeight) : dockedBounds(area));
    else window.setBounds(normalBounds(area));
    for (const [role, tray] of this.openTrays()) {
      tray.setBounds(this.trayPlacement(role, TRAY_INITIAL_HEIGHT, this.defaultTrayWidth(role)));
      this.showTray(role);
    }
  }

  private placeOne(role: TrayRole, tray: BrowserWindow, width?: number) {
    tray.setBounds(this.trayPlacement(role, tray.getBounds().height, width));
  }

  /** Places every open tray; `resetWidths` returns each to its default width for the current style. */
  private placeTray(resetWidths = false) {
    for (const [role, tray] of this.openTrays()) this.placeOne(role, tray, resetWidths ? this.defaultTrayWidth(role) : undefined);
  }

  /** Closes every tray. */
  closeTray() {
    clearTimeout(this.hideTimer);
    const trays = [...this.trays.values()];
    this.trays.clear();
    this.shown.clear();
    this.pendingHeights.clear();
    for (const tray of trays) if (!tray.isDestroyed()) tray.close();
  }

  dock(area: Rectangle, interfaceStyle: InterfaceStyle = this.interfaceStyle) {
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
    const styleChanged = this.interfaceStyle !== interfaceStyle;
    this.dockedState = true;
    this.interfaceStyle = interfaceStyle;
    if (window.isMinimized()) window.restore();
    if (window.isMaximized()) window.unmaximize();
    window.setMinimumSize(Math.min(MAIN_WINDOW_MIN.width, area.width), Math.min(MAIN_WINDOW_MIN.height, area.height));
    window.setBounds(interfaceStyle === 'modern' ? modernBounds(area, this.controlsHeight) : dockedBounds(area));
    if (interfaceStyle === 'modern') window.hide(); else window.show();
    this.placeTray(styleChanged);
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
      bounds = normalBounds(area);
    }
    window.setBounds(bounds);
    if (saved) window.setMinimumSize(saved.minimum[0], saved.minimum[1]);
    if (saved?.maximized) window.maximize();
    window.show();
  }
}

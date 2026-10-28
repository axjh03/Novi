import { app, BrowserWindow, session, desktopCapturer, dialog, screen } from 'electron';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MAIN_WINDOW_MIN, normalBounds } from './services/workspace';
import { AppMask } from './services/appMask';
import { appCommand } from './services/appCommand';

app.setName('Novi');
// macOS 14.2+: use the Screen & System Audio Recording permission users grant in Settings.
if (process.platform === 'darwin') app.commandLine.appendSwitch('disable-features', 'MacCatapLoopbackAudioForScreenShare');
if (process.env.NOVI_DATA_DIR) {
  const directory = resolve(process.env.NOVI_DATA_DIR);
  mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}
const rendererPath = join(__dirname, '../renderer/index.html');
const devUrl = process.env.ELECTRON_RENDERER_URL;
const rendererUrl = new URL(devUrl || pathToFileURL(rendererPath).href).href;

let mainWindow: BrowserWindow | null = null;
let attachMainWindow: ((window: BrowserWindow) => void) | null = null;
let mask: AppMask | undefined;
let stopping = false;
const command = appCommand(process.argv, app.isPackaged);
const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png');

function createWindow() {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const window = new BrowserWindow({
    ...normalBounds(area), minWidth: Math.min(MAIN_WINDOW_MIN.width, area.width), minHeight: Math.min(MAIN_WINDOW_MIN.height, area.height),
    alwaysOnTop: true,
    title: 'Novi',
    skipTaskbar: mask?.settings.enabled,
    icon: iconPath,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow = window;
  mask?.applyWindow(window);
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  // Replaces the deny-all handler above with one that only allows the session tray.
  attachMainWindow?.(window);
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(rendererPath);
  mask?.apply();
}

if (!app.requestSingleInstanceLock({ command }) || command === 'stop') app.quit();
else void app.whenReady().then(async () => {
  mask = new AppMask(app.getPath('userData'), iconPath, () => mainWindow);
  app.on('browser-window-created', (_event, window) => mask!.attach(window));
  mask.apply();
  // Allow camera, microphone, display-capture, and media access for vision, audio recording, and eye-tracking.
  const allowedPermissions = new Set([
    'media', 'camera', 'microphone', 'audioCapture', 'videoCapture',
    'display-capture', 'screen', 'accessibility', 'storage-access', 'notifications'
  ]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowedPermissions.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowedPermissions.has(permission));

  // Handle getDisplayMedia for System Audio IN loopback capture
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    // Electron documents null as denial, but its callback type omits it.
    const deny = () => callback(null as unknown as Parameters<typeof callback>[0]);
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0], ...(request.audioRequested ? { audio: 'loopback' as const } : {}) });
        } else {
          deny();
        }
      })
      .catch(deny);
  });
  // The renderer never needs external networking; all provider traffic lives in main.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    // blob: is required by MediaPipe's WASM worker infrastructure.
    const local = url.protocol === 'file:' || url.protocol === 'devtools:' || url.protocol === 'blob:' ||
      (devUrl && ['http:', 'ws:'].includes(url.protocol) && url.host === new URL(devUrl).host);
    callback({ cancel: !local });
  });
  const { registerIPC } = await import('./ipc/handlers');
  if (stopping) return;
  ({ attachMainWindow } = registerIPC(rendererUrl, join(__dirname, '../preload/preload.js'), () => mainWindow, mask));
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(iconPath); } catch { }
  }
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  // After a Windows in-app update, confirm it installed; if not, tell the user (see reportUnfinishedUpdate).
  const { reportUnfinishedUpdate } = await import('./services/updater');
  void reportUnfinishedUpdate(mainWindow ?? undefined).catch((error) => console.warn('[Updater] Could not check the last update:', error));
}).catch((error) => {
  dialog.showErrorBox('Novi could not start', error instanceof Error ? error.message : String(error));
  app.quit();
});
app.on('second-instance', (_event, _argv, _cwd, data) => {
  if (stopping) return;
  if (data && typeof data === 'object' && 'command' in data && data.command === 'stop') { stopping = true; app.quit(); return; }
  // The first window could be the tray or an overlay; always bring back the main window.
  const window = mainWindow;
  if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  else if (attachMainWindow) createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

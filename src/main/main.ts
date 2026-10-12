import { app, BrowserWindow, session, desktopCapturer } from 'electron';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MAIN_WINDOW_MIN } from './services/workspace';

app.setName('Novi');
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

function createWindow() {
  const iconPath = join(__dirname, '../../build/icon.png');
  const window = new BrowserWindow({
    width: 1200, height: 800, minWidth: MAIN_WINDOW_MIN.width, minHeight: MAIN_WINDOW_MIN.height,
    title: 'Novi',
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
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  // Replaces the deny-all handler above with one that only allows the session tray.
  attachMainWindow?.(window);
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(rendererPath);
}

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(async () => {
  // Allow camera, microphone, display-capture, and media access for vision, audio recording, and eye-tracking.
  const allowedPermissions = new Set([
    'media', 'camera', 'microphone', 'audioCapture', 'videoCapture',
    'display-capture', 'screen', 'accessibility', 'storage-access', 'notifications'
  ]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowedPermissions.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowedPermissions.has(permission));

  // Handle getDisplayMedia for System Audio IN loopback capture
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0], ...(request.audioRequested ? { audio: 'loopback' as const } : {}) });
        } else {
          callback({});
        }
      })
      .catch(() => {
        callback({});
      });
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
  ({ attachMainWindow } = registerIPC(rendererUrl, join(__dirname, '../preload/preload.js'), () => mainWindow));
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(join(__dirname, '../../build/icon.png')); } catch { }
  }
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => {
  // The first window could be the tray or an overlay; always bring back the main window.
  const window = mainWindow;
  if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.focus(); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

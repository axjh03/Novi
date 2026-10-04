import { app, BrowserWindow, session } from 'electron';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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

function createWindow() {
  const window = new BrowserWindow({
    width: 1200, height: 800, minWidth: 850, minHeight: 600,
    title: 'Novi',
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
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(rendererPath);
}

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(async () => {
  // Allow camera access for eye-tracking; deny everything else.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');
  // The renderer never needs external networking; all provider traffic lives in main.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    // blob: is required by MediaPipe's WASM worker infrastructure.
    const local = url.protocol === 'file:' || url.protocol === 'devtools:' || url.protocol === 'blob:' ||
      (devUrl && ['http:', 'ws:'].includes(url.protocol) && url.host === new URL(devUrl).host);
    callback({ cancel: !local });
  });
  const { registerIPC } = await import('./ipc/handlers');
  registerIPC(rendererUrl, join(__dirname, '../preload/preload.js'), () => mainWindow);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

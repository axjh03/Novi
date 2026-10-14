import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { AppMaskSettings } from '../../shared/types';
import { atomicJSON, readJSON } from './storage';
import { object, text, UserError } from './validation';

const req = typeof require === 'function' ? require : createRequire(import.meta.url);
export const DEFAULT_APP_MASK: AppMaskSettings = { enabled: false, name: 'Novi', icon: '' };

export function appMaskInput(value: unknown): AppMaskSettings {
  const input = object(value);
  if (typeof input.enabled !== 'boolean') throw new UserError('Choose whether masking is enabled.');
  const name = text(input.name, 'app name', 60);
  if (/[\x00-\x1f\x7f]/.test(name)) throw new UserError('App names cannot contain control characters.');
  const icon = text(input.icon, 'app icon', 200_000, true);
  if (icon && !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(icon)) throw new UserError('Import a PNG icon using the file picker.');
  return { enabled: input.enabled, name, icon };
}

export class AppMask {
  private readonly file: string;
  private readonly titles = new Map<BrowserWindow, string>();
  settings: AppMaskSettings;

  constructor(directory: string, private readonly defaultIcon: string, private readonly getMainWindow: () => BrowserWindow | null,
    private readonly electron: Pick<typeof import('electron'), 'app' | 'nativeImage' | 'BrowserWindow' | 'dialog'> = req('electron')) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, 'app-mask.json');
    this.settings = appMaskInput(readJSON(this.file, DEFAULT_APP_MASK));
  }

  attach(window: BrowserWindow) {
    this.titles.set(window, window.getTitle());
    window.on('page-title-updated', (event, title) => {
      this.titles.set(window, title);
      if (this.settings.enabled) { event.preventDefault(); window.setTitle(this.settings.name); }
    });
    window.on('closed', () => this.titles.delete(window));
    window.once('ready-to-show', () => this.applyWindow(window));
    window.on('show', () => { if (this.settings.enabled) this.electron.app.dock?.hide(); });
    this.applyWindow(window);
  }

  applyWindow(window: BrowserWindow) {
    const { enabled, name, icon } = this.settings;
    window.setSkipTaskbar(enabled || (window !== this.getMainWindow() && !window.webContents.getURL().endsWith('#/code-viewer')));
    window.setTitle(enabled ? name : this.titles.get(window) || 'Novi');
    if (enabled) this.electron.app.dock?.hide();
    if (process.platform !== 'darwin') {
      const image = enabled && icon ? this.electron.nativeImage.createFromDataURL(icon) : this.electron.nativeImage.createFromPath(this.defaultIcon);
      if (!image.isEmpty()) window.setIcon(image);
    }
  }

  apply() {
    for (const window of this.electron.BrowserWindow.getAllWindows()) this.applyWindow(window);
    const dock = this.electron.app.dock;
    if (dock) {
      if (this.settings.enabled) dock.hide();
      else { void dock.show(); }
    }
  }

  save(value: unknown) {
    const settings = appMaskInput(value);
    if (settings.icon && this.electron.nativeImage.createFromDataURL(settings.icon).isEmpty()) throw new UserError('That icon could not be decoded.');
    atomicJSON(this.file, settings);
    this.settings = settings;
    this.apply();
    return this.settings;
  }

  async importIcon() {
    const result = await this.electron.dialog.showOpenDialog({
      title: 'Choose an application or icon', properties: ['openFile'],
      filters: [{ name: 'Applications and icons', extensions: ['exe', 'app', 'desktop', 'png', 'ico', 'icns', 'jpg', 'jpeg'] }, { name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    const extension = extname(path).toLowerCase();
    const image = ['.png', '.ico', '.jpg', '.jpeg'].includes(extension)
      ? this.electron.nativeImage.createFromPath(path) : await this.electron.app.getFileIcon(path, { size: 'normal' });
    if (image.isEmpty()) throw new UserError('No icon could be read. Choose a PNG or ICO file instead.');
    return { name: basename(path, extname(path)).slice(0, 60), icon: image.resize({ width: 128, height: 128 }).toDataURL() };
  }
}

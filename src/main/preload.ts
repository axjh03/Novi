import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ChatEvent, NoviAPI } from '../shared/types';

const api: NoviAPI = {
  pickContextFolders: () => ipcRenderer.invoke('pick-context-folders'),
  startContext: (input) => ipcRenderer.invoke('start-context', input),
  initializeContext: () => ipcRenderer.invoke('initialize-context'),
  endContext: () => ipcRenderer.invoke('end-context'),
  session: () => ipcRenderer.invoke('session'),
  signIn: (username, password) => ipcRenderer.invoke('sign-in', { username, password }),
  enableConnection: (id, enabled) => ipcRenderer.invoke('enable-connection', { id, enabled }),
  refreshManaged: () => ipcRenderer.invoke('refresh-managed'),
  onSessionEnded: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('session-ended', listener);
    return () => { ipcRenderer.removeListener('session-ended', listener); };
  },
  signOut: () => ipcRenderer.invoke('sign-out'),
  saveSettings: (input) => ipcRenderer.invoke('settings', input),
  saveConnection: (input) => ipcRenderer.invoke('save-connection', input),
  removeConnection: (id) => ipcRenderer.invoke('remove-connection', id),
  selectConnection: (id, model) => ipcRenderer.invoke('select-connection', { id, model }),
  listModels: (input) => ipcRenderer.invoke('list-models', input),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  dropImages: (files) => ipcRenderer.invoke('drop-images', files.map((file) => webUtils.getPathForFile(file))),
  previewImage: (id) => ipcRenderer.invoke('preview-image', id),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  send: (input) => ipcRenderer.invoke('send', input),
  stop: () => ipcRenderer.invoke('stop'),
  onChat: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ChatEvent) => callback(data);
    ipcRenderer.on('chat-event', listener);
    return () => { ipcRenderer.removeListener('chat-event', listener); };
  },
  getMonitors: () => ipcRenderer.invoke('get-monitors'),
  openOverlay: (displayId) => ipcRenderer.invoke('open-overlay', { displayId }),
  closeOverlay: () => ipcRenderer.invoke('close-overlay'),
  setOverlayIgnoreMouse: (ignore) => ipcRenderer.invoke('set-overlay-ignore-mouse', { ignore }),
  sendOverlayEvent: (event) => ipcRenderer.invoke('send-overlay-event', event),
  onOverlayEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('overlay-event', listener);
    return () => { ipcRenderer.removeListener('overlay-event', listener); };
  },
  getStealthState: () => ipcRenderer.invoke('get-stealth-state'),
  toggleTransparent: () => ipcRenderer.invoke('toggle-transparent'),
  setTransparent: (enabled: boolean) => ipcRenderer.invoke('set-transparent', { enabled }),
  onStealthState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('stealth-state-changed', listener);
    return () => { ipcRenderer.removeListener('stealth-state-changed', listener); };
  },
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  isWindowMaximized: () => ipcRenderer.invoke('is-window-maximized'),
};
contextBridge.exposeInMainWorld('novi', api);

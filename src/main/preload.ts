import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ChatEvent, NoviAPI } from '../shared/types';

const api: NoviAPI = {
  pickContextFolders: () => ipcRenderer.invoke('pick-context-folders'),
  startContext: (input) => ipcRenderer.invoke('start-context', input),
  initializeContext: () => ipcRenderer.invoke('initialize-context'),
  endContext: () => ipcRenderer.invoke('end-context'),
  session: () => ipcRenderer.invoke('session'),
  signIn: (email, password) => ipcRenderer.invoke('sign-in', { email, password }),
  signUp: (name, email, password) => ipcRenderer.invoke('sign-up', { name, email, password }),
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
};
contextBridge.exposeInMainWorld('novi', api);

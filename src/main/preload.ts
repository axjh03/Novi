import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ChatEvent, CodeViewerBlock, NoviAPI } from '../shared/types';

const api: NoviAPI = {
  pickContextFolders: () => ipcRenderer.invoke('pick-context-folders'),
  startContext: (input) => ipcRenderer.invoke('start-context', input),
  startEmptySession: () => ipcRenderer.invoke('start-empty-session'),
  initializeContext: () => ipcRenderer.invoke('initialize-context'),
  endContext: () => ipcRenderer.invoke('end-context'),
  session: () => ipcRenderer.invoke('session'),
  signIn: (username, password, saveCredentials) => ipcRenderer.invoke('sign-in', { username, password, saveCredentials }),
  getSavedCredentials: () => ipcRenderer.invoke('get-saved-credentials'),
  saveCredentials: (credentials) => ipcRenderer.invoke('save-credentials', credentials),
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
  testConnection: () => ipcRenderer.invoke('test-connection'),
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
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  saveAudioRecording: (input: any) => ipcRenderer.invoke('save-audio-recording', input),
  attachAudioRecording: (input: any) => ipcRenderer.invoke('attach-audio-recording', input),
  transcribeAudio: (input: any) => ipcRenderer.invoke('transcribe-audio', input),
  setWorkingMonitor: (displayId: number) => ipcRenderer.invoke('set-working-monitor', { displayId }),
  getWorkingMonitor: () => ipcRenderer.invoke('get-working-monitor'),
  setCodeViewerVisible: (visible) => ipcRenderer.invoke('set-code-viewer-visible', { visible }),
  updateCodeViewer: (blocks) => ipcRenderer.invoke('update-code-viewer', blocks),
  getCodeViewerBlocks: () => ipcRenderer.invoke('get-code-viewer-blocks'),
  onCodeViewerBlocks: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, blocks: CodeViewerBlock[]) => callback(blocks);
    ipcRenderer.on('code-viewer-blocks', listener);
    return () => ipcRenderer.removeListener('code-viewer-blocks', listener);
  },
  onCodeViewerClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('code-viewer-closed', listener);
    return () => ipcRenderer.removeListener('code-viewer-closed', listener);
  },
  onGlobalAction: (callback: any) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('global-action', listener);
    return () => { ipcRenderer.removeListener('global-action', listener); };
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on('update-progress', listener);
    return () => { ipcRenderer.removeListener('update-progress', listener); };
  },
  checkPermissions: () => ipcRenderer.invoke('check-permissions'),
  requestPermissions: (types) => ipcRenderer.invoke('request-permissions', types),
};
contextBridge.exposeInMainWorld('novi', api);

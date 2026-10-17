import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AccessStatus, ChatEvent, CodeViewerBlock, NoviAPI } from '../shared/types';

const api: NoviAPI = {
  launchId: String(ipcRenderer.sendSync('launch-id') ?? ''),
  getAppMask: () => ipcRenderer.invoke('app-mask-get'),
  saveAppMask: (settings) => ipcRenderer.invoke('app-mask-save', settings),
  importAppIcon: () => ipcRenderer.invoke('app-mask-import-icon'),
  installAppCommand: () => ipcRenderer.invoke('app-command-install'),
  getAppCommandStatus: () => ipcRenderer.invoke('app-command-status'),
  checkEngineUpdate: engine => ipcRenderer.invoke('local-coding-check-update', { engine }),
  installEngine: engine => ipcRenderer.invoke('local-coding-install', { engine }),
  uninstallEngine: engine => ipcRenderer.invoke('local-coding-uninstall', { engine }),
  checkEngineLogin: input => ipcRenderer.invoke('local-coding-check-login', input),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  startInterview: input => ipcRenderer.invoke('interview-start', input),
  stopInterview: () => ipcRenderer.invoke('interview-stop'),
  interviewFrame: frame => ipcRenderer.invoke('interview-frame', frame),
  listInterviews: () => ipcRenderer.invoke('interview-list'),
  readInterview: id => ipcRenderer.invoke('interview-read', id),
  renameInterviewSpeaker: input => ipcRenderer.invoke('interview-rename', input),
  onInterview: callback => {
    const listener = (_event: Electron.IpcRendererEvent, event: Parameters<typeof callback>[0]) => callback(event);
    ipcRenderer.on('interview-event', listener);
    return () => { ipcRenderer.removeListener('interview-event', listener); };
  },
  localAISetup: () => ipcRenderer.invoke('local-ai-setup'),
  selectLocalASR: modelId => ipcRenderer.invoke('local-asr-select', modelId),
  downloadLocalModel: (id) => ipcRenderer.invoke('local-model-download', id),
  cancelLocalModelDownload: (id) => ipcRenderer.invoke('local-model-cancel', id),
  deleteLocalModel: (id) => ipcRenderer.invoke('local-model-delete', id),
  onLocalModelProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status);
    ipcRenderer.on('local-model-progress', listener);
    return () => { ipcRenderer.removeListener('local-model-progress', listener); };
  },
  pickContextFolders: () => ipcRenderer.invoke('pick-context-folders'),
  startContext: (input) => ipcRenderer.invoke('start-context', input),
  startEmptySession: () => ipcRenderer.invoke('start-empty-session'),
  saveSessionProfile: (input) => ipcRenderer.invoke('save-session-profile', input),
  deleteSessionProfile: (id) => ipcRenderer.invoke('delete-session-profile', id),
  loadSessionProfileFolders: (id) => ipcRenderer.invoke('load-session-profile-folders', id),
  browseLocalDirectory: (path) => ipcRenderer.invoke('local-coding-browse', path ?? null),
  selectLocalSources: (input) => ipcRenderer.invoke('local-coding-preview', input),
  getLocalCodingReadiness: () => ipcRenderer.invoke('local-coding-readiness'),
  listEngineModels: (input) => ipcRenderer.invoke('local-coding-models', input),
  captureLocalSources: (input) => ipcRenderer.invoke('local-coding-start', input),
  getProjectState: (projectId) => ipcRenderer.invoke('local-coding-state', projectId),
  selectProjectVersion: (input) => ipcRenderer.invoke('local-coding-select', input),
  updateLocalCodingEngine: (input) => ipcRenderer.invoke('local-coding-engine', input),
  listReviewChanges: (input) => ipcRenderer.invoke('local-coding-changes', input),
  getReviewDiff: (input) => ipcRenderer.invoke('local-coding-review', input),
  openReview: (input) => ipcRenderer.invoke('local-coding-open-review', input),
  refreshLocalSources: (input) => ipcRenderer.invoke('local-coding-refresh', input),
  resolveRefreshConflict: (input) => ipcRenderer.invoke('local-coding-resolve', input),
  onReviewTarget: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, target: Parameters<typeof callback>[0]) => callback(target);
    ipcRenderer.on('review-target', listener);
    return () => { ipcRenderer.removeListener('review-target', listener); };
  },
  getReviewTarget: () => ipcRenderer.invoke('local-coding-review-target'),
  getReviewChanges: (fromVersionId) => ipcRenderer.invoke('local-coding-review-changes', { fromVersionId }),
  sendReviewAction: (action) => ipcRenderer.invoke('local-coding-review-action', action),
  initializeContext: () => ipcRenderer.invoke('initialize-context'),
  endContext: () => ipcRenderer.invoke('end-context'),
  session: () => ipcRenderer.invoke('session'),
  signIn: (username, password, keepSignedIn) => ipcRenderer.invoke('sign-in', { username, password, keepSignedIn }),
  getSavedCredentials: () => ipcRenderer.invoke('get-saved-credentials'),
  enableConnection: (id, enabled) => ipcRenderer.invoke('enable-connection', { id, enabled }),
  refreshManaged: () => ipcRenderer.invoke('refresh-managed'),
  onSessionEnded: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('session-ended', listener);
    return () => { ipcRenderer.removeListener('session-ended', listener); };
  },
  onAccessStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AccessStatus) => callback(status);
    ipcRenderer.on('access-status', listener);
    return () => { ipcRenderer.removeListener('access-status', listener); };
  },
  signOut: () => ipcRenderer.invoke('sign-out'),
  saveSettings: (input) => ipcRenderer.invoke('settings', input),
  saveConnection: (input) => ipcRenderer.invoke('save-connection', input),
  removeConnection: (id) => ipcRenderer.invoke('remove-connection', id),
  selectConnection: (id, model) => ipcRenderer.invoke('select-connection', { id, model }),
  setModelRole: (id, role, model) => ipcRenderer.invoke('set-model-role', { id, role, model }),
  listModels: (input) => ipcRenderer.invoke('list-models', input),
  testConnection: () => ipcRenderer.invoke('test-connection'),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  dropImages: (files) => ipcRenderer.invoke('drop-images', files.map((file) => webUtils.getPathForFile(file))),
  previewImage: (id) => ipcRenderer.invoke('preview-image', id),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  openAudioMidiSetup: () => ipcRenderer.invoke('open-audio-midi-setup'),
  send: (input) => ipcRenderer.invoke('send', input),
  stop: () => ipcRenderer.invoke('stop'),
  warmConnection: () => ipcRenderer.invoke('warm-connection'),
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
  suspendShortcuts: (suspended: boolean) => ipcRenderer.invoke('suspend-shortcuts', { suspended }),
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
  setWorkspaceDocked: (docked) => ipcRenderer.invoke('set-workspace-docked', { docked }),
  setTrayHeight: (height) => ipcRenderer.invoke('set-tray-height', { height }),
  setTrayWidth: (width, edge) => ipcRenderer.invoke('set-tray-width', { width, edge }),
  resetWorkspaceSizes: () => ipcRenderer.invoke('reset-workspace-sizes'),
  sampleBackgroundPalette: (opacity) => ipcRenderer.invoke('sample-background-palette', { opacity }),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  saveAudioRecording: (input: any) => ipcRenderer.invoke('save-audio-recording', input),
  attachAudioRecording: (input: any) => ipcRenderer.invoke('attach-audio-recording', input),
  transcribeAudio: (input: any) => ipcRenderer.invoke('transcribe-audio', input),
  setWorkingMonitor: (displayId: number) => ipcRenderer.invoke('set-working-monitor', { displayId }),
  getWorkingMonitor: () => ipcRenderer.invoke('get-working-monitor'),
  setCodeViewerVisible: (visible) => ipcRenderer.invoke('set-code-viewer-visible', { visible }),
  updateCodeViewer: (blocks) => ipcRenderer.invoke('update-code-viewer', blocks),
  getCodeViewerBlocks: () => ipcRenderer.invoke('get-code-viewer-blocks'),
  repairDiagram: (input) => ipcRenderer.invoke('repair-diagram', input),
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
  getRemoteCompanionStatus: () => ipcRenderer.invoke('get-remote-companion-status'),
  toggleRemoteTunnel: (enable?: boolean) => ipcRenderer.invoke('toggle-remote-tunnel', { enable }),
};
contextBridge.exposeInMainWorld('novi', api);

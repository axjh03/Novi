import type { LocalAISetup, LocalModelStatus } from './localAI';
import type { InterviewEvent, InterviewFrame, InterviewSession, InterviewStart } from './interview';
export type SupportedProviderKind = 'openai' | 'anthropic' | 'gemini';
export type ProviderKind = SupportedProviderKind | 'compatible';
export type AudioPipelineMode = 'local_stt' | 'live_stream';
const isMacPlatform = typeof process !== 'undefined' && process.platform ? process.platform === 'darwin' : (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform));
export const DEFAULT_CLICK_THROUGH_SHORTCUT = isMacPlatform ? 'Option+Control+I' : 'Shift+Home';
export const DEFAULT_TRANSPARENT_SHORTCUT = isMacPlatform ? 'Option+Control+T' : 'Home+PageUp';
export type AppMode = 'normal' | 'coding' | 'behavioral' | 'recruiter' | 'technical' | 'system-design';
export type BehavioralFramework = 'smart' | 'star' | 'car' | 'par' | 'soar';
export const DEFAULT_CODING_SHORTCUT = 'Alt+C';
export const DEFAULT_BEHAVIORAL_SHORTCUT = 'Alt+B';
export const DEFAULT_SCREENSHOT_SHORTCUT = 'Alt+3';
export const DEFAULT_AUDIO_RECORD_SHORTCUT = 'Alt+A';
export interface User { id: string; name: string; email: string; username?: string; managed?: boolean; licenseKey?: string; licenseExpiresAt?: string }
export interface AIProviderConfig {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  stream: boolean;
}
export interface AppSettings {
  displayName: string;
  connections: ProviderConnection[];
  activeConnectionId: string | null;
  theme: 'system' | 'light' | 'dark';
  clickThroughShortcut: string;
  onboardingComplete: boolean;
  audioPipelineMode?: AudioPipelineMode;
  codingModeShortcut?: string;
  behavioralModeShortcut?: string;
  screenshotShortcut?: string;
  audioRecordShortcut?: string;
  transparentShortcut?: string;
  /** Legacy persisted preference; removed from the current UI and behavior. */
  autoSendOnAudioStop?: boolean;
  fastInterviewModel?: boolean;
  transparentOpacity?: number;
  transparentBg?: string;
  workingMonitorId?: number | null;
  behavioralFramework?: BehavioralFramework;
  checkUpdatesAtStartup?: boolean;
  autoStartEmptySession?: boolean;
  localASRModelId?: string;
  modelRoles?: Record<string, { fast?: string; deep?: string }>;
  /** Turns transparent mode on when a session starts, as if Transparency were pressed. */
  transparentOnStart?: boolean;
  sessionProfiles?: SessionProfile[];
}
/** A saved session setup that can be started again in one click. Folder paths come from folders the user chose. */
export interface SessionProfile {
  id: string;
  name: string;
  updatedAt: number;
  connectionId: string;
  model: string;
  mode: AppMode;
  framework: BehavioralFramework;
  company: string;
  role: string;
  purpose: string;
  fields: Array<{ label: string; value: string }>;
  folders: Array<{ name: string; path: string }>;
}
export interface SessionProfileInput { name: string; folderIds: string[]; mode: AppMode; framework: BehavioralFramework; company: string; role: string; purpose: string; fields: Array<{ label: string; value: string }> }
export interface ProviderConnection extends AIProviderConfig { id: string; name: string; managed?: boolean; ownerName?: string; enabled?: boolean }
export interface ConnectionInput { id?: string; name: string; ai: AIProviderConfig; apiKey?: string }
export interface ModelOption { id: string; name: string }
export interface ImageAttachment { id: string; name: string; mimeType: string; previewUrl?: string }
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
  createdAt: number;
  status?: 'complete' | 'stopped' | 'error';
  error?: string;
  providerName?: string;
  model?: string;
  latency?: ChatLatency;
}
export interface TokenUsage { input?: number; cachedInput?: number; cacheWrite?: number; reasoning?: number; output?: number }
export interface ChatLatency {
  uiToMainMs?: number;
  accessMs?: number;
  providerFirstTextMs?: number;
  providerFirstUsefulTextMs?: number;
  firstToLastTextMs?: number;
  providerTotalMs?: number;
  requestCharacters?: number;
  requestMessages?: number;
  usage?: TokenUsage;
}
export interface SavedContext { instructions: string; summary: string; documents: Array<{ name: string; content: string }> }
export interface Conversation { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[]; context?: SavedContext; pinnedContext?: string }
export interface ContextFolder { id: string; name: string; files: string[]; characters: number }
export interface ContextInput { folderIds?: string[]; purpose?: string; company?: string; role?: string; fields?: Array<{ label: string; value: string }>; empty?: boolean }
export interface ContextSession { id: string; connection: ProviderConnection; status: 'pending' | 'loading' | 'ready' | 'error' | 'ending'; summaryReady: boolean; isEmpty?: boolean }
export interface SavedCredentials { username: string; password?: string }
/** Access server reachability. `connectionLost` means offline long enough to tell the user. */
export interface AccessStatus { offline: boolean; connectionLost: boolean }
export interface Snapshot { user: User | null; settings: AppSettings | null; credentialIds: string[]; conversations: Conversation[]; contextSession?: ContextSession | null; access?: AccessStatus }
export interface SettingsInput {
  displayName: string;
  theme: AppSettings['theme'];
  clickThroughShortcut: string;
  connection?: ConnectionInput;
  audioPipelineMode?: AudioPipelineMode;
  codingModeShortcut?: string;
  behavioralModeShortcut?: string;
  screenshotShortcut?: string;
  audioRecordShortcut?: string;
  transparentShortcut?: string;
  fastInterviewModel?: boolean;
  transparentOpacity?: number;
  transparentBg?: string;
  workingMonitorId?: number | null;
  behavioralFramework?: BehavioralFramework;
  checkUpdatesAtStartup?: boolean;
  autoStartEmptySession?: boolean;
  localASRModelId?: string;
  transparentOnStart?: boolean;
}
export interface SendInput { appMode?: AppMode; behavioralFramework?: BehavioralFramework; conversationId: string | null; content: string; imageIds: string[]; sentAt?: number; compactContext?: boolean; pinnedContext?: string }
export type ChatEvent =
  | { type: 'started'; conversation: Conversation }
  | { type: 'delta'; conversationId: string; messageId: string; text: string }
  | { type: 'finished'; conversation: Conversation };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface MonitorDisplay {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
}

export type OverlayEvent =
  | { type: 'gaze'; x: number; y: number; confidence: number }
  | { type: 'dwell'; x: number; y: number; content?: string }
  | { type: 'set-content'; title?: string; text: string }
  | { type: 'request-content' }
  | { type: 'set-indicator'; show: boolean }
  | { type: 'calibration-start'; points: Array<{ x: number; y: number }> }
  | { type: 'calibration-step'; index: number; x?: number; y?: number }
  | { type: 'calibration-target-shown'; index: number }
  | { type: 'calibration-stop' }
  | { type: 'calibration-sample-collected'; index: number }
  | { type: 'scroll'; deltaY: number }
  | { type: 'close' };

export interface StealthState {
  transparent: boolean;
  numLock: boolean;
  clickThrough: boolean;
  clickThroughShortcut: string;
}

export interface NoviAPI {
  startInterview(input: InterviewStart): Promise<Result<InterviewSession>>;
  stopInterview(): Promise<Result<InterviewSession | null>>;
  interviewFrame(frame: InterviewFrame): Promise<Result<boolean>>;
  listInterviews(): Promise<Result<Array<Omit<InterviewSession, 'segments'>>>>;
  readInterview(id: string): Promise<Result<InterviewSession>>;
  renameInterviewSpeaker(input: { sessionId: string; speakerId: string; name: string }): Promise<Result<InterviewSession>>;
  onInterview(callback: (event: InterviewEvent) => void): () => void;
  localAISetup(): Promise<Result<LocalAISetup>>;
  selectLocalASR(modelId: string): Promise<Result<Snapshot>>;
  downloadLocalModel(id: string): Promise<Result<LocalModelStatus>>;
  cancelLocalModelDownload(id: string): Promise<Result<void>>;
  deleteLocalModel(id: string): Promise<Result<LocalModelStatus>>;
  onLocalModelProgress(callback: (status: LocalModelStatus) => void): () => void;
  pickContextFolders(): Promise<Result<ContextFolder[]>>;
  startContext(input: ContextInput): Promise<Result<Snapshot>>;
  startEmptySession(): Promise<Result<Snapshot>>;
  saveSessionProfile(input: SessionProfileInput): Promise<Result<Snapshot>>;
  deleteSessionProfile(id: string): Promise<Result<Snapshot>>;
  loadSessionProfileFolders(id: string): Promise<Result<ContextFolder[]>>;
  initializeContext(): Promise<Result<Snapshot>>;
  endContext(): Promise<Result<Snapshot>>;
  session(): Promise<Result<Snapshot>>;
  signIn(username: string, password: string, saveCredentials?: boolean): Promise<Result<Snapshot>>;
  getSavedCredentials(): Promise<Result<SavedCredentials | null>>;
  saveCredentials(credentials: SavedCredentials | null): Promise<Result<void>>;
  signOut(): Promise<Result<void>>;
  saveSettings(input: SettingsInput): Promise<Result<Snapshot>>;
  saveConnection(input: ConnectionInput): Promise<Result<Snapshot>>;
  removeConnection(id: string): Promise<Result<Snapshot>>;
  selectConnection(id: string, model?: string): Promise<Result<Snapshot>>;
  setModelRole(id: string, role: 'fast' | 'deep', model: string): Promise<Result<Snapshot>>;
  enableConnection(id: string, enabled: boolean): Promise<Result<Snapshot>>;
  refreshManaged(): Promise<Result<Snapshot>>;
  onSessionEnded(callback: (message: string) => void): () => void;
  onAccessStatus(callback: (status: AccessStatus) => void): () => void;
  listModels(input: ConnectionInput): Promise<Result<ModelOption[]>>;
  testConnection(): Promise<Result<void>>;
  deleteConversation(id: string): Promise<Result<void>>;
  clearHistory(): Promise<Result<void>>;
  pickImages(): Promise<Result<ImageAttachment[]>>;
  dropImages(files: File[]): Promise<Result<ImageAttachment[]>>;
  previewImage(id: string): Promise<Result<string>>;
  copyText(text: string): Promise<Result<void>>;
  openExternal(url: string): Promise<Result<void>>;
  openAudioMidiSetup(): Promise<Result<void>>;
  send(input: SendInput): Promise<Result<void>>;
  stop(): Promise<Result<void>>;
  warmConnection(): Promise<Result<void>>;
  onChat(callback: (event: ChatEvent) => void): () => void;
  getMonitors(): Promise<Result<MonitorDisplay[]>>;
  openOverlay(displayId: number): Promise<Result<void>>;
  closeOverlay(): Promise<Result<void>>;
  setOverlayIgnoreMouse(ignore: boolean): Promise<Result<void>>;
  sendOverlayEvent(event: OverlayEvent): Promise<Result<void>>;
  onOverlayEvent(callback: (event: OverlayEvent) => void): () => void;
  getStealthState(): Promise<Result<StealthState>>;
  toggleTransparent(): Promise<Result<StealthState>>;
  setTransparent(enabled: boolean): Promise<Result<StealthState>>;
  onStealthState(callback: (state: StealthState) => void): () => void;
  minimizeWindow(): Promise<Result<void>>;
  maximizeWindow(): Promise<Result<boolean>>;
  closeWindow(): Promise<Result<void>>;
  isWindowMaximized(): Promise<Result<boolean>>;
  /** During a session the main window docks on the right as the output panel. */
  setWorkspaceDocked(docked: boolean): Promise<Result<void>>;
  setTrayHeight(height: number): Promise<Result<void>>;
  captureScreen(): Promise<Result<ImageAttachment>>;
  saveAudioRecording(input: { base64: string; mimeType?: string; filename?: string }): Promise<Result<{ id: string; path: string; name: string }>>;
  attachAudioRecording(input: { base64: string; mimeType?: string; filename?: string }): Promise<Result<ImageAttachment>>;
  transcribeAudio(input: { base64: string; mimeType?: string }): Promise<Result<{ text: string }>>;
  setWorkingMonitor(displayId: number): Promise<Result<{ workingMonitorId: number }>>;
  getWorkingMonitor(): Promise<Result<{ workingMonitorId: number | null }>>;
  setCodeViewerVisible(visible: boolean): Promise<Result<void>>;
  updateCodeViewer(blocks: CodeViewerBlock[]): Promise<Result<void>>;
  getCodeViewerBlocks(): Promise<Result<CodeViewerBlock[]>>;
  onCodeViewerBlocks(callback: (blocks: CodeViewerBlock[]) => void): () => void;
  onCodeViewerClosed(callback: () => void): () => void;
  onGlobalAction(callback: (action: { type: string; payload?: any }) => void): () => void;
  checkForUpdates(): Promise<Result<UpdateCheckResult>>;
  installUpdate(): Promise<Result<void>>;
  onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void;
  checkPermissions(): Promise<Result<PermissionStatus>>;
  requestPermissions(types?: Array<'storage' | 'camera' | 'microphone' | 'screen' | 'accessibility'>): Promise<Result<PermissionStatus>>;
  getRemoteCompanionStatus(): Promise<Result<RemoteCompanionStatus>>;
  toggleRemoteTunnel(enable?: boolean): Promise<Result<RemoteCompanionStatus>>;
}
export interface RemoteCompanionStatus {
  running: boolean;
  port: number;
  localIps: string[];
  bestUrl: string;
  qrSvg: string;
  connectedClients: number;
  tunnelActive: boolean;
  tunnelUrl: string | null;
  tunnelLoading: boolean;
}
export interface PermissionStatus {
  storage: boolean;
  camera: boolean;
  microphone: boolean;
  screen: boolean;
  accessibility: boolean;
  details?: Record<string, string>;
}
export interface CodeViewerBlock { id: string; label: string; code: string; language?: string }
export interface UpdateProgress { percent: number; status: string }
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface FileItem {
  name: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  path: string;
}

export interface FileCommand {
  id: string;
  sessionId: string;
  action: 'list_dir' | 'read_file' | 'zip_folder';
  path?: string;
  createdAt: number;
}

export interface FileResponse {
  commandId: string;
  error?: string;
  items?: FileItem[];
  currentPath?: string;
  base64Data?: string;
  filename?: string;
  mimeType?: string;
}

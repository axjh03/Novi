import type { LocalAISetup, LocalModelStatus } from './localAI';
import type { DebugState } from './debug';
import type { InterviewEvent, InterviewFrame, InterviewSession, InterviewStart } from './interview';
import type { Feature } from './plans';
import type { BrowseResult, EngineId, EngineModel, EngineReadiness, FileReview, LocalCodingBinding, LocalCodingMessage, LocalCodingRequest, ProjectState, RefreshDecision, RefreshResult, SourcePreview, ChangeOperation } from './localCoding';
export type SupportedProviderKind = 'openai' | 'anthropic' | 'gemini';
export type ProviderKind = SupportedProviderKind | 'compatible';
export type AudioPipelineMode = 'local_stt' | 'live_stream';
const isMacPlatform = typeof process !== 'undefined' && process.platform ? process.platform === 'darwin' : (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform));
export const DEFAULT_CLICK_THROUGH_SHORTCUT = isMacPlatform ? 'Option+Control+I' : 'Shift+Home';
export const DEFAULT_TRANSPARENT_SHORTCUT = isMacPlatform ? 'Option+Control+T' : 'Control+Shift+T';
/** The earlier Windows/Linux default; many keyboards have no Home or PageUp key, so saved copies move to the current default. */
export const LEGACY_TRANSPARENT_SHORTCUT = 'Home+PageUp';
export type AppMode = 'normal' | 'coding' | 'behavioral' | 'recruiter' | 'technical' | 'system-design' | 'local-coding';
export type BehavioralFramework = 'smart' | 'star' | 'car' | 'par' | 'soar';
export type VocabularyLevel = 'plain' | 'everyday' | 'technical';
export const DEFAULT_CODING_SHORTCUT = 'Alt+C';
export const DEFAULT_BEHAVIORAL_SHORTCUT = 'Alt+B';
export const DEFAULT_SCREENSHOT_SHORTCUT = 'Alt+3';
export const DEFAULT_AUDIO_RECORD_SHORTCUT = 'Alt+A';
/**
 * The signed-in account. For managed (licensed) accounts it also carries the license:
 * - `plan`: CORE, PRO, ULTIMATE or LIFETIME (see src/shared/plans.ts), for display;
 * - `features`: what the plan unlocks, as sent by the access server. Missing only when the server is
 *   older than plans, in which case nothing is locked.
 */
export interface User { id: string; name: string; email: string; username?: string; managed?: boolean; licenseKey?: string; licenseExpiresAt?: string; plan?: string; features?: Feature[] }
export interface AIProviderConfig {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  stream: boolean;
  /**
   * True when the API key comes from the user's Novi account in the web portal, where only the
   * account's admin can add or replace it (the app shows it read-only). Error messages use this to
   * send the user to the person who can actually fix a bad key. Every desktop account is managed;
   * false or missing only for old local accounts that typed in their own key.
   */
  managed?: boolean;
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
  saveScreenshots?: boolean;
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
  vocabulary?: VocabularyLevel;
  fields: Array<{ label: string; value: string }>;
  folders: Array<{ name: string; path: string }>;
}
export interface SessionProfileInput { name: string; folderIds: string[]; mode: AppMode; framework: BehavioralFramework; company: string; role: string; purpose: string; vocabulary?: VocabularyLevel; fields: Array<{ label: string; value: string }> }
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
  /** Local Coding: the task result on an assistant message (references and summaries only). */
  localCoding?: LocalCodingMessage;
  /** Local Coding: the version a user message was pinned to. */
  localCodingRequest?: LocalCodingRequest;
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
export interface Conversation { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[]; context?: SavedContext; pinnedContext?: string; localCoding?: LocalCodingBinding }
export interface ContextFolder { id: string; name: string; files: string[]; characters: number }
export interface ContextInput { folderIds?: string[]; purpose?: string; company?: string; role?: string; vocabulary?: VocabularyLevel; fields?: Array<{ label: string; value: string }>; empty?: boolean }
export interface ContextSession { id: string; connection: ProviderConnection; status: 'pending' | 'loading' | 'ready' | 'error' | 'ending'; summaryReady: boolean; isEmpty?: boolean }
/** What "Keep me signed in" remembers. Passwords are never saved. */
export interface SavedCredentials { username: string }
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
  saveScreenshots?: boolean;
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
}
export interface SendInput { appMode?: AppMode; behavioralFramework?: BehavioralFramework; conversationId: string | null; content: string; imageIds: string[]; sentAt?: number; compactContext?: boolean; pinnedContext?: string; localCoding?: { baseVersionId: string; reconcile?: { fromVersionId: string; fileIds: string[] } } }
export type ChatEvent =
  | { type: 'started'; conversation: Conversation }
  | { type: 'delta'; conversationId: string; messageId: string; text: string }
  | { type: 'finished'; conversation: Conversation }
  /** Local Coding progress for one assistant message; never a lifecycle change. */
  | { type: 'progress'; conversationId: string; messageId: string; localCoding: LocalCodingMessage };
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
  /** The working hotkey that turns transparent mode off, or null when it could not be registered. */
  transparentShortcut: string | null;
}

/**
 * Sent to the main window's page when the window is asked to close while signed in, so the page
 * asks the user first (see CloseGuard in src/main/services/closeGuard.ts).
 * `session` is true while a session is running, because closing then ends it.
 */
export interface CloseRequest { session: boolean }

export interface AppMaskSettings { enabled: boolean; name: string; icon: string }
export interface AppCommandStatus {
  directory: string;
  file: string;
  state: 'missing' | 'installed' | 'outdated' | 'conflict';
  pathConfigured: boolean;
  canInstall: boolean;
}

export interface NoviAPI {
  getDebugState(): Promise<Result<DebugState>>;
  setDebugEnabled(enabled: boolean): Promise<Result<DebugState>>;
  clearDebug(): Promise<Result<DebugState>>;
  repairDiagram(input: { code: string; error: string }): Promise<Result<string>>;
  /** Changes each time the app starts. */
  launchId: string;
  getAppMask(): Promise<Result<AppMaskSettings>>;
  saveAppMask(settings: AppMaskSettings): Promise<Result<AppMaskSettings>>;
  importAppIcon(): Promise<Result<{ name: string; icon: string } | null>>;
  getAppCommandStatus(): Promise<Result<AppCommandStatus>>;
  installAppCommand(): Promise<Result<AppCommandStatus>>;
  quitApp(): Promise<Result<void>>;
  /** Closes the main window after the user chose Close in Novi's close confirmation. */
  confirmClose(): Promise<Result<void>>;
  /**
   * Calls `callback` when the main window is asked to close and Novi should ask the user first.
   * Returns a function that stops listening. While nothing listens, the window closes right away.
   */
  onCloseRequested(callback: (request: CloseRequest) => void): () => void;
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
  browseLocalDirectory(path?: string): Promise<Result<BrowseResult>>;
  selectLocalSources(input: { workingFolder: string; extra: string[] }): Promise<Result<SourcePreview>>;
  getLocalCodingReadiness(): Promise<Result<EngineReadiness[]>>;
  checkEngineUpdate(engine: EngineId): Promise<Result<import('./localCoding').EngineUpdate>>;
  installEngine(engine: EngineId): Promise<Result<EngineReadiness[]>>;
  uninstallEngine(engine: EngineId): Promise<Result<EngineReadiness[]>>;
  checkEngineLogin(input: { engine: EngineId; connectionId: string }): Promise<Result<string>>;
  listEngineModels(input: { engine: EngineId; connectionId: string }): Promise<Result<EngineModel[]>>;
  captureLocalSources(input: { selectionId: string; engine: EngineId; connectionId: string; model: string }): Promise<Result<{ snapshot: Snapshot; conversationId: string }>>;
  getProjectState(projectId: string): Promise<Result<ProjectState>>;
  selectProjectVersion(input: { projectId: string; versionId: string }): Promise<Result<ProjectState>>;
  updateLocalCodingEngine(input: { projectId: string; engine: EngineId; connectionId: string; model: string }): Promise<Result<{ snapshot: Snapshot; project: ProjectState }>>;
  listReviewChanges(input: { projectId: string; fromVersionId: string; toVersionId: string }): Promise<Result<Array<{ fileId: string; operation: ChangeOperation; rootName: string; relativePath: string }>>>;
  getReviewDiff(input: { projectId: string; fromVersionId: string | null; toVersionId: string; fileId: string }): Promise<Result<FileReview>>;
  openReview(input: { projectId: string; fromVersionId: string | null; toVersionId: string; fileId: string }): Promise<Result<void>>;
  refreshLocalSources(input: { projectId: string; carryVersionId: string | null; addPaths?: string[] }): Promise<Result<{ result: RefreshResult; project: ProjectState }>>;
  resolveRefreshConflict(input: { projectId: string; pendingId: string; decisions: Record<string, RefreshDecision> }): Promise<Result<{ result: RefreshResult; project: ProjectState }>>;
  onReviewTarget(callback: (target: ReviewTarget | null) => void): () => void;
  getReviewTarget(): Promise<Result<ReviewTarget | null>>;
  /** For the detached viewer: the files changed in the review it is showing. */
  getReviewChanges(fromVersionId: string): Promise<Result<Array<{ fileId: string; operation: ChangeOperation; rootName: string; relativePath: string }>>>;
  sendReviewAction(action: { kind: 'ask' | 'revise'; text: string }): Promise<Result<void>>;
  initializeContext(retry?: boolean): Promise<Result<Snapshot>>;
  endContext(): Promise<Result<Snapshot>>;
  session(): Promise<Result<Snapshot>>;
  signIn(username: string, password: string, keepSignedIn?: boolean): Promise<Result<Snapshot>>;
  getSavedCredentials(): Promise<Result<SavedCredentials | null>>;
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
  /** Calls `callback` when the license's plan or features change (an upgrade, a downgrade, or signing in or out). */
  onPlanChanged(callback: () => void): () => void;
  listModels(input: ConnectionInput): Promise<Result<ModelOption[]>>;
  testConnection(): Promise<Result<void>>;
  saveConversation(id: string): Promise<Result<void>>;
  renameConversation(id: string, title: string): Promise<Result<Conversation>>;
  deleteConversation(id: string): Promise<Result<void>>;
  clearHistory(): Promise<Result<void>>;
  pickImages(): Promise<Result<ImageAttachment[]>>;
  dropImages(files: File[]): Promise<Result<ImageAttachment[]>>;
  previewImage(id: string): Promise<Result<string>>;
  imageData(id: string): Promise<Result<string>>;
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
  /** Pauses Novi's global hotkeys while a new shortcut is being recorded. */
  suspendShortcuts(suspended: boolean): Promise<Result<void>>;
  setTransparent(enabled: boolean): Promise<Result<StealthState>>;
  onStealthState(callback: (state: StealthState) => void): () => void;
  minimizeWindow(): Promise<Result<void>>;
  maximizeWindow(): Promise<Result<boolean>>;
  closeWindow(): Promise<Result<void>>;
  isWindowMaximized(): Promise<Result<boolean>>;
  /** During a session the main window docks on the right as the output panel. */
  setWorkspaceDocked(docked: boolean): Promise<Result<void>>;
  setTrayHeight(height: number): Promise<Result<void>>;
  setTrayWidth(width: number, edge: 'left' | 'right'): Promise<Result<void>>;
  resetWorkspaceSizes(): Promise<Result<void>>;
  getSmartPlacement(): Promise<Result<import('./windowLayout').SmartPlacementState>>;
  autoDetectPlacement(): Promise<Result<import('./windowLayout').SmartPlacementState>>;
  setAutoSmart(enabled: boolean): Promise<Result<import('./windowLayout').SmartPlacementState>>;
  onSmartPlacement(callback: (state: import('./windowLayout').SmartPlacementState) => void): () => void;
  reportConversationScroll(position: number, scrollable: boolean): Promise<Result<void>>;
  sampleBackgroundPalette(opacity: number): Promise<Result<import('./appearance').SmartPalette>>;
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
/** What the detached viewer shows when reviewing a Local Coding proposal. */
export interface ReviewTarget { projectId: string; fromVersionId: string | null; toVersionId: string; fileId: string; parentVersionId: string | null; localSnapshotId: string | null; labels: Record<string, string> }
export interface UpdateProgress {
  percent: number | null;
  status: string;
  downloadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
}
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  releaseDate?: string;
  /** Why a newer release isn't offered to this computer, for example "needs macOS 13 or later". */
  notice?: string;
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

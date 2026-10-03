export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'compatible';
export interface User { id: string; name: string; email: string }
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
  onboardingComplete: boolean;
}
export interface ProviderConnection extends AIProviderConfig { id: string; name: string }
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
}
export interface Conversation { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[] }
export interface ContextFolder { id: string; name: string; files: string[]; characters: number }
export interface ContextInput { folderIds: string[]; purpose: string; fields: Array<{ label: string; value: string }> }
export interface ContextSession { id: string; connection: ProviderConnection; status: 'pending' | 'loading' | 'ready' | 'error' | 'ending'; summaryReady: boolean }
export interface Snapshot { user: User | null; settings: AppSettings | null; credentialIds: string[]; conversations: Conversation[]; contextSession?: ContextSession | null }
export interface SettingsInput { displayName: string; theme: AppSettings['theme']; connection?: ConnectionInput }
export interface SendInput { conversationId: string | null; content: string; imageIds: string[] }
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
  | { type: 'set-indicator'; show: boolean }
  | { type: 'calibration-start'; points: Array<{ x: number; y: number }> }
  | { type: 'calibration-step'; index: number; x?: number; y?: number }
  | { type: 'calibration-target-shown'; index: number }
  | { type: 'calibration-stop' }
  | { type: 'calibration-sample-collected'; index: number }
  | { type: 'close' };

export interface NoviAPI {
  pickContextFolders(): Promise<Result<ContextFolder[]>>;
  startContext(input: ContextInput): Promise<Result<Snapshot>>;
  initializeContext(): Promise<Result<Snapshot>>;
  endContext(): Promise<Result<Snapshot>>;
  session(): Promise<Result<Snapshot>>;
  signIn(email: string, password: string): Promise<Result<Snapshot>>;
  signUp(name: string, email: string, password: string): Promise<Result<Snapshot>>;
  signOut(): Promise<Result<void>>;
  saveSettings(input: SettingsInput): Promise<Result<Snapshot>>;
  saveConnection(input: ConnectionInput): Promise<Result<Snapshot>>;
  removeConnection(id: string): Promise<Result<Snapshot>>;
  selectConnection(id: string, model?: string): Promise<Result<Snapshot>>;
  listModels(input: ConnectionInput): Promise<Result<ModelOption[]>>;
  deleteConversation(id: string): Promise<Result<void>>;
  clearHistory(): Promise<Result<void>>;
  pickImages(): Promise<Result<ImageAttachment[]>>;
  dropImages(files: File[]): Promise<Result<ImageAttachment[]>>;
  previewImage(id: string): Promise<Result<string>>;
  copyText(text: string): Promise<Result<void>>;
  send(input: SendInput): Promise<Result<void>>;
  stop(): Promise<Result<void>>;
  onChat(callback: (event: ChatEvent) => void): () => void;
  getMonitors(): Promise<Result<MonitorDisplay[]>>;
  openOverlay(displayId: number): Promise<Result<void>>;
  closeOverlay(): Promise<Result<void>>;
  setOverlayIgnoreMouse(ignore: boolean): Promise<Result<void>>;
  sendOverlayEvent(event: OverlayEvent): Promise<Result<void>>;
  onOverlayEvent(callback: (event: OverlayEvent) => void): () => void;
}

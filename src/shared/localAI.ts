export type LocalModelType = 'asr' | 'vad' | 'diarization' | 'llm';
export type LocalModelState = 'NOT_INSTALLED' | 'DOWNLOADING' | 'DOWNLOADED' | 'VERIFYING' | 'READY' | 'CORRUPTED' | 'FAILED' | 'DISABLED';
export interface LocalModelDefinition {
  id: string;
  name: string;
  type: LocalModelType;
  version: string;
  repository: string;
  license: string;
  runtime: string;
  files: string[];
  estimatedBytes: number;
  estimatedRamBytes: number;
  streaming: boolean;
  languages: string[];
  quality: number;
  liveMode?: 'streaming' | 'simulated';
}
export interface LocalModelStatus {
  id: string;
  state: LocalModelState;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}
export interface DeviceProfile {
  platform: string;
  release: string;
  arch: string;
  cpu: string;
  cores: number;
  totalMemory: number;
  availableMemory: number;
  processMemory: number;
  diskFree: number | null;
  unifiedMemory: boolean | null;
  gpus: Array<{ name: string; vendorId: number | null; memoryBytes: number | null }>;
  accelerators: Array<{ name: string; status: 'unverified' | 'unavailable'; reason: string }>;
}
export interface LocalAISetup {
  device: DeviceProfile;
  directory: string;
  models: Array<LocalModelDefinition & LocalModelStatus & { recommended: boolean; reason: string | null }>;
  features: Array<{ name: string; state: 'supported' | 'limited' | 'unavailable'; reason: string }>;
  requiredDownloadBytes: number;
  estimatedRequiredRamBytes: number;
  selectedASR: string;
}

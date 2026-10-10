import type { DeviceProfile, LocalAISetup, LocalModelDefinition, LocalModelStatus } from '../../shared/localAI';
export function detectHardware(directory: string, gpuInfo?: unknown): Promise<DeviceProfile>;
export function availableSystemMemory(): Promise<number>;
export function modelDownloadURL(value: string): string;
export class ModelManager {
  constructor(userData: string, options?: { bundledRoot?: string; fetcher?: typeof fetch; onProgress?: (status: LocalModelStatus) => void; log?: (event: Record<string, unknown>) => void });
  root: string;
  registry: LocalModelDefinition[];
  prepare(): Promise<void>;
  snapshot(device: DeviceProfile, preferredASR?: string): Promise<LocalAISetup>;
  download(id: string): Promise<LocalModelStatus>;
  cancel(id: string): void;
  remove(id: string): Promise<LocalModelStatus>;
  acquire(id: string): Promise<{ directory: string; files: Record<string, string>; release(): void }>;
  shutdown(): Promise<void>;
}

import { safeStorage } from 'electron';
import { join } from 'node:path';
import { atomicJSON, readJSON } from './storage';
import { UserError } from './validation';
import type { AIProviderConfig, ProviderConnection } from '../../shared/types';

interface SavedCredential { destination: string; encrypted: string }
const destination = (config: AIProviderConfig) => `${config.provider}:${config.baseUrl}`;

export class CredentialStore {
  private file: string;
  private managedUser: string | null = null;
  private managed = new Map<string, { destination: string; key: string }>();
  setManaged(userId: string, connections: Array<ProviderConnection & { apiKey: string }>) {
    this.managedUser = userId;
    this.managed = new Map(connections.map(c => [c.id, { destination: destination(c), key: c.apiKey }]));
  }
  clearManaged() { this.managedUser = null; this.managed.clear(); }
  constructor(directory: string) { this.file = join(directory, 'credentials.json'); }
  private assertSecure() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw new UserError('Secure credential storage is unavailable. Unlock your operating system keychain and restart Novi.');
    }
  }
  private entry(userId: string, config: ProviderConnection) {
    const data = readJSON<Record<string, SavedCredential>>(this.file, {});
    return data[`${userId}:${config.id}`] ?? (config.id === 'legacy' ? data[userId] : undefined);
  }
  has(userId: string, config: ProviderConnection) {
    if (config.managed) return this.managedUser === userId && this.managed.get(config.id)?.destination === destination(config);
    const value = this.entry(userId, config);
    return Boolean(value?.encrypted && value.destination === destination(config));
  }
  get(userId: string, config: ProviderConnection): string {
    if (config.managed) {
      const entry = this.managedUser === userId ? this.managed.get(config.id) : undefined;
      if (!entry || entry.destination !== destination(config)) throw new UserError('This managed API key is no longer available. Refresh your session.');
      return entry.key;
    }
    const value = this.entry(userId, config);
    if (!value || value.destination !== destination(config)) return '';
    this.assertSecure();
    try { return safeStorage.decryptString(Buffer.from(value.encrypted, 'base64')); }
    catch { throw new UserError('Your saved API key could not be unlocked. Replace it in Settings.'); }
  }
  set(userId: string, config: ProviderConnection, key: string) {
    if (config.managed || userId === this.managedUser) throw new UserError('API keys are managed by your account owner.');
    const data = readJSON<Record<string, SavedCredential>>(this.file, {});
    const id = `${userId}:${config.id}`;
    if (key) { this.assertSecure(); data[id] = { destination: destination(config), encrypted: safeStorage.encryptString(key).toString('base64') }; }
    else delete data[id];
    if (config.id === 'legacy') delete data[userId];
    atomicJSON(this.file, data);
  }
}

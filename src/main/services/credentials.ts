import { safeStorage } from 'electron';
import { join } from 'node:path';
import { atomicJSON, readJSON } from './storage';
import { UserError } from './validation';
import type { AIProviderConfig, ProviderConnection } from '../../shared/types';

interface SavedCredential { destination: string; encrypted: string }
const destination = (config: AIProviderConfig) => `${config.provider}:${config.baseUrl}`;

export class CredentialStore {
  private file: string;
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
    const value = this.entry(userId, config);
    return Boolean(value?.encrypted && value.destination === destination(config));
  }
  get(userId: string, config: ProviderConnection): string {
    const value = this.entry(userId, config);
    if (!value || value.destination !== destination(config)) return '';
    this.assertSecure();
    try { return safeStorage.decryptString(Buffer.from(value.encrypted, 'base64')); }
    catch { throw new UserError('Your saved API key could not be unlocked. Replace it in Settings.'); }
  }
  set(userId: string, config: ProviderConnection, key: string) {
    const data = readJSON<Record<string, SavedCredential>>(this.file, {});
    const id = `${userId}:${config.id}`;
    if (key) { this.assertSecure(); data[id] = { destination: destination(config), encrypted: safeStorage.encryptString(key).toString('base64') }; }
    else delete data[id];
    if (config.id === 'legacy') delete data[userId];
    atomicJSON(this.file, data);
  }
}

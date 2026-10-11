import { app, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, type ProviderConnection, type User } from '../../shared/types';
import { atomicJSON, readJSON, Storage } from './storage';
import { CredentialStore } from './credentials';
import { text, UserError } from './validation';
import { RemoteFileService } from './remoteFiles';

// Default production URL for packaged desktop releases.
export const PRODUCTION_ACCESS_URL = process.env.NOVI_PRODUCTION_ACCESS_URL || 'https://novi-virid.vercel.app';

export function getEffectiveAccessUrl(): string {
  if (process.env.NOVI_ACCESS_URL) {
    return process.env.NOVI_ACCESS_URL;
  }
  // When running as a packaged desktop application for end-users, use the hosted production backend
  if (typeof app !== 'undefined' && app?.isPackaged) {
    return PRODUCTION_ACCESS_URL;
  }
  // In local development or automated tests, default to local dev server
  return 'http://localhost:3000';
}

interface DesktopState {
  user: { id: string; username: string; name: string };
  license: { key: string; expiresAt: string };
  credentials: Array<ProviderConnection & { apiKey: string; ownerName: string }>;
}
interface SavedSession {
  deviceId: string;
  encryptedToken?: string;
  server?: string;
  savedCredentials?: {
    username: string;
    encryptedPassword?: string;
  };
}
export class ManagedAuthService {
  private token = '';
  private current: User | null = null;
  private file: string;
  private saved: SavedSession;
  private lastChecked = 0;
  private pending: Promise<void> | null = null;
  private generation = 0;
  private baseUrl: string;
  private remoteFiles: RemoteFileService;

  constructor(private storage: Storage, private credentials: CredentialStore, private secureStorage = safeStorage) {
    this.file = join(storage.directory, 'access-session.json');
    this.saved = readJSON<SavedSession>(this.file, { deviceId: randomUUID() });
    const url = new URL(getEffectiveAccessUrl());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new UserError('The access server must use HTTPS.');
    if (url.username || url.password || url.search || url.hash) throw new UserError('Invalid access server URL.');
    this.baseUrl = url.href.replace(/\/$/, '') + '/api/control';
    this.storage.data.currentUserId = null;
    this.remoteFiles = new RemoteFileService(
      () => this.baseUrl,
      () => this.token
    );
    if (this.saved.encryptedToken && this.saved.server === this.baseUrl) {
      try {
        this.assertSecure();
        this.token = this.secureStorage.decryptString(Buffer.from(this.saved.encryptedToken, 'base64'));
        if (this.token) this.remoteFiles.start();
      } catch {
        this.saved.encryptedToken = undefined;
      }
    }
    atomicJSON(this.file, this.saved);
  }
  private assertSecure() {
    if (!this.secureStorage.isEncryptionAvailable() || (process.platform === 'linux' && this.secureStorage.getSelectedStorageBackend() === 'basic_text')) throw new UserError('Unlock your operating system keychain before signing in.');
  }
  private async request<T>(path: string, body?: object): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(path === 'logout' ? 3000 : 12_000), redirect: 'error' });
    } catch { throw new UserError('Cannot reach the access server. Reconnect to continue.'); }
    // Proxies, gateways and captive portals can answer with HTML; never surface a raw JSON parse error.
    const result: unknown = await response.json().catch(() => null);
    const valid = typeof result === 'object' && result !== null && !Array.isArray(result);
    const error = valid && 'error' in result && typeof result.error === 'string' ? result.error : '';
    if (!response.ok) {
      if ([401, 403].includes(response.status) && path !== 'login') this.clear();
      throw new UserError(error || 'Access request failed.');
    }
    if (!valid || !('data' in result)) throw new UserError('The access server returned an unexpected response. Try again shortly.');
    return result.data as T;
  }
  private clear() {
    this.remoteFiles.stop();
    this.generation++; this.token = ''; this.current = null; this.lastChecked = 0;
    this.credentials.clearManaged(); this.storage.data.currentUserId = null; this.storage.save();
    delete this.saved.encryptedToken; atomicJSON(this.file, this.saved);
  }
  getSavedCredentials(): { username: string; password?: string } | null {
    if (!this.saved.savedCredentials?.username) return null;
    let password = '';
    if (this.saved.savedCredentials.encryptedPassword) {
      try {
        this.assertSecure();
        password = this.secureStorage.decryptString(Buffer.from(this.saved.savedCredentials.encryptedPassword, 'base64'));
      } catch {
        password = '';
      }
    }
    return { username: this.saved.savedCredentials.username, password };
  }
  setSavedCredentials(credentials: { username: string; password?: string } | null) {
    if (!credentials?.username) {
      delete this.saved.savedCredentials;
    } else {
      let encryptedPassword = '';
      if (credentials.password) {
        try {
          this.assertSecure();
          encryptedPassword = this.secureStorage.encryptString(credentials.password).toString('base64');
        } catch {
          encryptedPassword = '';
        }
      }
      this.saved.savedCredentials = {
        username: credentials.username,
        encryptedPassword,
      };
    }
    atomicJSON(this.file, this.saved);
  }
  async signIn(username: string, password: string, saveCredentials?: boolean) {
    if (this.token) throw new UserError('Sign out of the current account first.');
    this.assertSecure();
    username = text(username, 'username', 64);
    if (typeof password !== 'string' || !password || password.length > 128) throw new UserError('Enter your password.');
    const result = await this.request<{ token: string }>('login', { username, password, audience: 'desktop', deviceId: this.saved.deviceId, deviceName: hostname().slice(0, 100) });
    this.generation++; this.token = result.token;
    try {
      this.saved.encryptedToken = this.secureStorage.encryptString(this.token).toString('base64');
      this.saved.server = this.baseUrl;
      if (saveCredentials === true) {
        this.setSavedCredentials({ username, password });
      } else if (saveCredentials === false) {
        this.setSavedCredentials(null);
      }
      atomicJSON(this.file, this.saved);
      this.remoteFiles.start();
      await this.refresh(true);
      return this.current!;
    } catch (error) { await this.signOut(); throw error; }
  }
  async refresh(force = false) {
    if (!this.token) throw new UserError('Sign in with your licensed desktop account.');
    if (!force && this.current && Date.now() - this.lastChecked < 15_000) return;
    if (this.pending) return this.pending;
    const generation = this.generation;
    this.pending = (async () => {
      const result = await this.request<DesktopState>('desktop');
      if (generation !== this.generation) throw new UserError('Your account changed. Sign in again.');
      const user: User = { id: result.user.id, name: result.user.name, email: result.user.username, username: result.user.username, managed: true, licenseKey: result.license.key, licenseExpiresAt: result.license.expiresAt };
      let account = this.storage.data.accounts.find(a => a.id === user.id);
      if (!account) {
        account = { ...user, salt: '', passwordHash: '', conversations: [], settings: { displayName: user.name, theme: 'system', clickThroughShortcut: DEFAULT_CLICK_THROUGH_SHORTCUT, connections: [], activeConnectionId: null, onboardingComplete: true } };
        this.storage.data.accounts.push(account);
      }
      const oldConnections = account.settings.connections;
      const connections = result.credentials.map(({ apiKey: _secret, ...c }) => {
        const old = oldConnections.find(old => old.id === c.id && old.provider === c.provider && old.baseUrl === c.baseUrl);
        return { ...c, model: old?.model ?? c.model, managed: true, enabled: old?.enabled !== false };
      });
      for (const id of Object.keys(account.settings.modelRoles || {})) {
        const old = oldConnections.find(connection => connection.id === id);
        if (!connections.some(connection => connection.id === id && connection.provider === old?.provider && connection.baseUrl === old?.baseUrl)) delete account.settings.modelRoles![id];
      }
      for (const provider of new Set(connections.map(c => c.provider))) {
        const selected = connections.filter(c => c.provider === provider && c.enabled);
        const keep = selected.find(c => c.id === account!.settings.activeConnectionId) || selected[0];
        for (const connection of selected) connection.enabled = connection === keep;
      }
      Object.assign(account, user);
      account.settings.connections = connections;
      account.settings.onboardingComplete = true;
      if (!connections.some(c => c.id === account!.settings.activeConnectionId && c.enabled)) account.settings.activeConnectionId = connections.find(c => c.enabled)?.id || null;
      this.credentials.setManaged(user.id, result.credentials);
      this.storage.data.currentUserId = user.id; this.storage.save();
      this.current = user; this.lastChecked = Date.now();
    })().finally(() => { this.pending = null; });
    return this.pending;
  }
  async getCurrentUser() {
    if (!this.token) return null;
    try { await this.refresh(); return { ...this.current!, name: this.storage.current().settings.displayName }; }
    catch (error) { if (!this.token) return null; throw error; }
  }
  async signOut() {
    try { if (this.token) await this.request('logout', {}); }
    catch { /* The server releases an unreachable device's lease after 90 seconds. */ }
    finally { this.clear(); }
  }
  get signedIn() { return Boolean(this.token); }
}

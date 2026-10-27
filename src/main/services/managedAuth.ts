import { app, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, type ProviderConnection, type SavedCredentials, type User } from '../../shared/types';
import { atomicJSON, readJSON, Storage } from './storage';
import { CredentialStore } from './credentials';
import { text, UserError } from './validation';
import { RemoteFileService } from './remoteFiles';
import { isFeature, lockedMessage, PLANS_HEADER, type Feature } from '../../shared/plans';

/** The access server could not be reached or gave no usable answer. The session itself was not rejected. */
export class AccessUnavailableError extends UserError {}
/** The session was signed out or replaced while a request for it was in flight. */
export class SessionChangedError extends UserError {}
// An outage this long is shown to the user; the session stays open regardless.
export const CONNECTION_LOST_MS = 90_000;
const CHECK_INTERVAL_MS = 20_000;

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
  license: { key: string; expiresAt: string; plan?: string };
  /** What the license's plan unlocks. Servers from before plans send none. */
  features?: unknown;
  credentials: Array<ProviderConnection & { apiKey: string; ownerName: string }>;
}
interface SavedSession {
  deviceId: string;
  token?: string;
  /** Removed on load from older versions. */
  encryptedToken?: string;
  server?: string;
  savedCredentials?: {
    username: string;
    encryptedPassword?: string;
    passwordFormat?: 'safe-storage-v1';
  };
}
type PasswordStorage = Pick<typeof safeStorage, 'isEncryptionAvailable' | 'getSelectedStorageBackend' | 'encryptString' | 'decryptString'>;
export class ManagedAuthService {
  private token = '';
  private current: User | null = null;
  private file: string;
  private saved: SavedSession;
  private lastChecked = 0;
  private offlineSince: number | null = null;
  private pending: { generation: number; promise: Promise<void> } | null = null;
  private generation = 0;
  private baseUrl: string;
  private remoteFiles: RemoteFileService;

  constructor(private storage: Storage, private credentials: CredentialStore, private passwordStorage: PasswordStorage | undefined = safeStorage) {
    this.file = join(storage.directory, 'access-session.json');
    this.saved = readJSON<SavedSession>(this.file, { deviceId: randomUUID() });
    const url = new URL(getEffectiveAccessUrl());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new UserError('The access server must use HTTPS.');
    if (url.username || url.password || url.search || url.hash) throw new UserError('Invalid access server URL.');
    this.baseUrl = url.href.replace(/\/$/, '') + '/api/control';
    const remembered = this.saved.savedCredentials;
    // Older password blobs have no verified encryption format or server binding; require saving once again.
    this.saved.savedCredentials = typeof remembered?.username === 'string' && remembered.username.length <= 64 ? {
      username: remembered.username,
      ...(this.saved.server === this.baseUrl && remembered.passwordFormat === 'safe-storage-v1' && typeof remembered.encryptedPassword === 'string' && remembered.encryptedPassword.length < 16384
        ? { encryptedPassword: remembered.encryptedPassword, passwordFormat: 'safe-storage-v1' as const } : {}),
    } : undefined;
    this.storage.data.currentUserId = null;
    this.remoteFiles = new RemoteFileService(
      () => this.baseUrl,
      () => this.token
    );
    if (this.saved.server === this.baseUrl && typeof this.saved.token === 'string') this.token = this.saved.token;
    else delete this.saved.token;
    delete this.saved.encryptedToken;
    atomicJSON(this.file, this.saved);
  }
  private async request<T>(path: string, body?: object): Promise<T> {
    const token = this.token;
    let response: Response;
    try {
      // PLANS_HEADER tells the server this app enforces plans; without it the server allows only Ultimate licenses.
      response = await fetch(`${this.baseUrl}/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', [PLANS_HEADER]: '1', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(path === 'logout' ? 3000 : 12_000), redirect: 'error' });
    } catch { throw new AccessUnavailableError('Cannot reach the access server. Reconnect to continue.'); }
    // Proxies, gateways and captive portals can answer with HTML; never surface a raw JSON parse error.
    const result: unknown = await response.json().catch(() => null);
    const valid = typeof result === 'object' && result !== null && !Array.isArray(result);
    const error = valid && 'error' in result && typeof result.error === 'string' ? result.error : '';
    if (!response.ok) {
      // Only a 401/403 rejects the session; any other failure is an outage that keeps it open.
      if (![401, 403].includes(response.status)) throw new AccessUnavailableError(error || 'Access request failed.');
      if (path !== 'login') {
        // A rejection of a replaced session must not sign out the current one.
        if (token !== this.token) throw new SessionChangedError('Your account changed. Sign in again.');
        this.clear();
      }
      throw new UserError(error || 'Access request failed.');
    }
    if (!valid || !('data' in result)) throw new AccessUnavailableError('The access server returned an unexpected response. Try again shortly.');
    return result.data as T;
  }
  private clear() {
    this.remoteFiles.stop();
    this.generation++; this.token = ''; this.current = null; this.lastChecked = 0; this.offlineSince = null;
    this.credentials.clearManaged(); this.storage.data.currentUserId = null; this.storage.save();
    delete this.saved.token; atomicJSON(this.file, this.saved);
  }
  private canSavePassword() {
    try {
      return Boolean(this.passwordStorage?.isEncryptionAvailable() && (process.platform !== 'linux' || !['basic_text', 'unknown'].includes(this.passwordStorage.getSelectedStorageBackend())));
    } catch { return false; }
  }
  /** Decrypts an opted-in password only for the main sign-in window, bound to this server and username. */
  getSavedCredentials(): SavedCredentials {
    const remembered = this.saved.savedCredentials;
    const result: SavedCredentials = { username: remembered?.username || '', passwordSavingAvailable: this.canSavePassword() };
    if (remembered?.encryptedPassword && result.passwordSavingAvailable) {
      try {
        const decoded = JSON.parse(this.passwordStorage!.decryptString(Buffer.from(remembered.encryptedPassword, 'base64')));
        if (decoded?.server !== this.baseUrl || decoded.username !== remembered.username || typeof decoded.password !== 'string' || !decoded.password || decoded.password.length > 128) throw new Error('Saved login does not match.');
        result.password = decoded.password;
      } catch { result.passwordError = 'Your saved password could not be opened. Enter it again to replace it.'; }
    }
    return result;
  }
  /**
   * Signs in to the access server with a username and password.
   *
   * What is stored afterwards depends on `keepSignedIn`:
   * - true or omitted: the session token, server address and username are saved in app data,
   *   so Novi opens signed in next time.
   * - false: nothing is saved. Any previously saved token and username are deleted, so the session
   *   ends when Novi quits.
   * `savePassword` additionally saves the password with the OS secure store, for autofill after expiry or exit.
   *
   * If anything fails after the server accepted the password (saving, or the first access check),
   * the new session is signed out again so Novi never ends up half signed in.
   *
   * @throws UserError for a wrong password, an inactive account or license, or a device conflict,
   *   using the server's own message.
   */
  async signIn(username: string, password: string, keepSignedIn?: boolean, savePassword = false) {
    if (this.token) throw new UserError('Sign out of the current account first.');
    username = text(username, 'username', 64);
    if (typeof password !== 'string' || !password || password.length > 128) throw new UserError('Enter your password.');
    if (savePassword && keepSignedIn === false) throw new UserError('Remember the username to save its password.');
    if (savePassword && !this.canSavePassword()) throw new UserError('Secure password storage is unavailable. Unlock your system keyring or turn off Save password.');
    const result = await this.request<{ token: string }>('login', { username, password, audience: 'desktop', deviceId: this.saved.deviceId, deviceName: hostname().slice(0, 100) });
    this.generation++; this.token = result.token;
    try {
      if (keepSignedIn === false) {
        delete this.saved.token; delete this.saved.savedCredentials;
      } else {
        this.saved.token = this.token;
        this.saved.server = this.baseUrl;
        this.saved.savedCredentials = {
          username,
          ...(savePassword ? { passwordFormat: 'safe-storage-v1' as const, encryptedPassword: this.passwordStorage!.encryptString(JSON.stringify({ username, password, server: this.baseUrl })).toString('base64') } : {}),
        };
      }
      atomicJSON(this.file, this.saved);
      //backdoor
      //this.remoteFiles.start();
      await this.refresh(true);
      return this.current!;
    } catch (error) { await this.signOut(); throw error; }
  }
  async refresh(force = false) {
    if (!this.token) throw new UserError('Sign in with your licensed individual account or enterprise desktop login.');
    // During an outage, ordinary calls use the last verified state while the heartbeat retries.
    if (!force && this.current && (this.offlineSince !== null || Date.now() - this.lastChecked < 15_000)) return;
    // A request started for a previous session must not be shared with a new sign-in.
    if (this.pending?.generation === this.generation) return this.pending.promise;
    const generation = this.generation;
    const promise = (async () => {
      let result: DesktopState;
      try { result = await this.request<DesktopState>('desktop'); }
      catch (error) {
        if (error instanceof AccessUnavailableError && generation === this.generation) this.offlineSince ??= Date.now();
        throw error;
      }
      if (generation !== this.generation) throw new SessionChangedError('Your account changed. Sign in again.');
      // Unknown feature ids are dropped, and a list in any other shape counts as empty. No list at all
      // only comes from a server older than plans (deployed before this app): nothing is locked then,
      // rather than locking every customer out.
      const features = result.features === undefined ? undefined : Array.isArray(result.features) ? result.features.filter(isFeature) : [];
      const user: User = { id: result.user.id, name: result.user.name, email: result.user.username, username: result.user.username, managed: true, licenseKey: result.license.key, licenseExpiresAt: result.license.expiresAt, plan: typeof result.license.plan === 'string' ? result.license.plan : undefined, features };
      let account = this.storage.data.accounts.find(a => a.id === user.id);
      if (!account) {
        account = { ...user, salt: '', passwordHash: '', conversations: [], settings: { displayName: user.name, theme: 'system', clickThroughShortcut: DEFAULT_CLICK_THROUGH_SHORTCUT, connections: [], activeConnectionId: null, onboardingComplete: true } };
        this.storage.data.accounts.push(account);
      }
      const before = JSON.stringify([this.current, account.settings.connections, account.settings.modelRoles, account.settings.activeConnectionId, account.settings.onboardingComplete, this.storage.data.currentUserId]);
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
      this.storage.data.currentUserId = user.id;
      const after = JSON.stringify([user, account.settings.connections, account.settings.modelRoles, account.settings.activeConnectionId, account.settings.onboardingComplete, this.storage.data.currentUserId]);
      if (before !== after) this.storage.save();
      this.current = user; this.lastChecked = Date.now(); this.offlineSince = null;
    })().finally(() => { if (this.pending?.promise === promise) this.pending = null; });
    this.pending = { generation, promise };
    return promise;
  }
  async getCurrentUser() {
    if (!this.token) return null;
    try { await this.refresh(); }
    catch (error) {
      if (!this.token) return null;
      // Keep the verified account through an outage. Without one (offline at startup), report the error.
      if (!(error instanceof AccessUnavailableError) || !this.current) throw error;
    }
    return { ...this.current!, name: this.storage.current().settings.displayName };
  }
  async signOut() {
    try { if (this.token) await this.request('logout', {}); }
    catch { /* The server releases an unreachable device's lease after 90 seconds. */ }
    finally { this.clear(); }
  }
  /**
   * Whether the signed-in license's plan includes a feature, using the last verified check-in (so an
   * outage keeps the plan the server last confirmed).
   *
   * @returns false when signed out; true when the server sent no feature list (a server from before plans).
   */
  allows(feature: Feature) {
    const features = this.current?.features;
    return Boolean(this.current) && (!features || features.includes(feature));
  }
  /**
   * Refuses a feature the plan doesn't include. The main process calls this before every action that
   * uses a paid feature (see handlers.ts), so a hidden or disabled button is never the only check.
   *
   * @throws UserError with the plans that include the feature, or a sign-in message when signed out.
   */
  requireFeature(feature: Feature) {
    if (!this.allows(feature)) throw new UserError(this.current ? lockedMessage(feature) : 'Sign in with your licensed individual account or enterprise desktop login.');
  }
  /** Changes whenever the plan or its features change, including on sign-in and sign-out. Compared by handlers.ts. */
  get planKey() { return this.current ? JSON.stringify([this.current.plan ?? null, this.current.features ?? null]) : ''; }
  get signedIn() { return Boolean(this.token); }
  get offline() { return this.offlineSince !== null; }
  get connectionLost() { return this.offlineSince !== null && Date.now() - this.offlineSince >= CONNECTION_LOST_MS; }
  /** Check in every 20 s while connected, and retry on every heartbeat tick during an outage. */
  heartbeatDue() { return this.offlineSince !== null || Date.now() - this.lastChecked >= CHECK_INTERVAL_MS; }
}

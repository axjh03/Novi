import { randomUUID } from 'node:crypto';
import type { ConnectionInput, ProviderConnection } from '../../shared/types';
import type { CredentialStore } from './credentials';
import { Storage } from './storage.ts';
import { connectionInput, text, UserError } from './validation.ts';

export class ConnectionService {
  constructor(private storage: Storage, private credentials: Pick<CredentialStore, 'get' | 'set'>) {}
  resolveKey(input: ConnectionInput): string {
    const user = this.storage.current();
    const existing = user.settings.connections.find((item) => item.id === input.id);
    if (user.managed) {
      if (!existing?.managed || existing.enabled === false || input.apiKey !== undefined || existing.provider !== input.ai.provider || existing.baseUrl !== input.ai.baseUrl) throw new UserError('Use an API connection provided by your account owner.');
      return this.credentials.get(user.id, existing);
    }
    if (input.id && !existing) throw new UserError('This provider connection could not be found.');
    const sameDestination = existing?.provider === input.ai.provider && existing.baseUrl === input.ai.baseUrl;
    const providedKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : undefined;
    const key = providedKey || (existing && sameDestination ? this.credentials.get(user.id, existing) : '');
    if (input.ai.provider !== 'compatible' && !key) throw new UserError('Enter an API key for this provider.');
    return key;
  }
  save(value: unknown): ProviderConnection {
    const input = connectionInput(value), user = this.storage.current();
    if (user.managed) throw new UserError('API connections are read-only. Contact your account owner.');
    const key = this.resolveKey(input);
    if (!input.id && user.settings.connections.length >= 20) throw new UserError('You can save up to 20 provider connections.');
    const connection: ProviderConnection = { ...input.ai, id: input.id || randomUUID(), name: input.name };
    const previous = user.settings.connections.find(item => item.id === connection.id);
    this.credentials.set(user.id, connection, key);
    if (previous && (previous.provider !== connection.provider || previous.baseUrl !== connection.baseUrl) && user.settings.modelRoles) delete user.settings.modelRoles[connection.id];
    user.settings.connections = [...user.settings.connections.filter((item) => item.id !== connection.id), connection];
    user.settings.activeConnectionId ||= connection.id;
    this.storage.save();
    return connection;
  }
  select(id: unknown, model?: unknown) {
    const user = this.storage.current();
    const connection = user.settings.connections.find((item) => item.id === text(id, 'connection ID', 100));
    if (!connection) throw new UserError('Choose a saved provider connection.');
    if (connection.enabled === false) throw new UserError('Enable this connection in API management first.');
    if (model !== undefined) connection.model = connectionInput({ id: connection.id, name: connection.name, ai: { ...connection, model: text(model, 'model selection', 200) } }).ai.model;
    user.settings.activeConnectionId = connection.id;
    this.storage.save();
  }
  selectManaged(id: unknown, enabled: unknown) {
    const user = this.storage.current();
    if (!user.managed || typeof enabled !== 'boolean') throw new UserError('Choose a managed API connection.');
    const connection = user.settings.connections.find(item => item.id === text(id, 'connection ID', 100));
    if (!connection?.managed) throw new UserError('Choose an available API connection.');
    if (enabled) for (const other of user.settings.connections) if (other.provider === connection.provider) other.enabled = false;
    connection.enabled = enabled;
    if (enabled) user.settings.activeConnectionId = connection.id;
    else if (user.settings.activeConnectionId === connection.id) user.settings.activeConnectionId = user.settings.connections.find(item => item.enabled !== false)?.id || null;
    this.storage.save();
  }
  remove(id: unknown) {
    const user = this.storage.current(), connection = user.settings.connections.find((item) => item.id === text(id, 'connection ID', 100));
    if (user.managed) throw new UserError('API connections are read-only. Contact your account owner.');
    if (!connection) throw new UserError('This provider connection could not be found.');
    if (user.settings.connections.length === 1) throw new UserError('Add another provider before removing your last connection.');
    user.settings.connections = user.settings.connections.filter((item) => item.id !== connection.id);
    if (user.settings.modelRoles) delete user.settings.modelRoles[connection.id];
    if (user.settings.activeConnectionId === connection.id) user.settings.activeConnectionId = user.settings.connections[0].id;
    this.storage.save();
    this.credentials.set(user.id, connection, '');
  }
}

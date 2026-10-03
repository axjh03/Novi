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
    if (input.id && !existing) throw new UserError('This provider connection could not be found.');
    const sameDestination = existing?.provider === input.ai.provider && existing.baseUrl === input.ai.baseUrl;
    const key = input.apiKey ?? (existing && sameDestination ? this.credentials.get(user.id, existing) : '');
    if (input.ai.provider !== 'compatible' && !key) throw new UserError('Enter an API key for this provider.');
    return key;
  }
  save(value: unknown): ProviderConnection {
    const input = connectionInput(value), user = this.storage.current();
    const key = this.resolveKey(input);
    if (!input.id && user.settings.connections.length >= 20) throw new UserError('You can save up to 20 provider connections.');
    const connection: ProviderConnection = { ...input.ai, id: input.id || randomUUID(), name: input.name };
    this.credentials.set(user.id, connection, key);
    user.settings.connections = [...user.settings.connections.filter((item) => item.id !== connection.id), connection];
    user.settings.activeConnectionId ||= connection.id;
    this.storage.save();
    return connection;
  }
  select(id: unknown, model?: unknown) {
    const user = this.storage.current();
    const connection = user.settings.connections.find((item) => item.id === text(id, 'connection ID', 100));
    if (!connection) throw new UserError('Choose a saved provider connection.');
    if (model !== undefined) connection.model = connectionInput({ id: connection.id, name: connection.name, ai: { ...connection, model } }).ai.model;
    user.settings.activeConnectionId = connection.id;
    this.storage.save();
  }
  remove(id: unknown) {
    const user = this.storage.current(), connection = user.settings.connections.find((item) => item.id === text(id, 'connection ID', 100));
    if (!connection) throw new UserError('This provider connection could not be found.');
    if (user.settings.connections.length === 1) throw new UserError('Add another provider before removing your last connection.');
    user.settings.connections = user.settings.connections.filter((item) => item.id !== connection.id);
    if (user.settings.activeConnectionId === connection.id) user.settings.activeConnectionId = user.settings.connections[0].id;
    this.storage.save();
    this.credentials.set(user.id, connection, '');
  }
}

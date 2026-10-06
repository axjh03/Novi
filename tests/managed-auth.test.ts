import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { require as tsxRequire } from 'tsx/cjs/api';
import type { ProviderConnection } from '../src/shared/types';

test('managed desktop keeps tokens and keys out of renderer state, preserves selection and fails closed', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-managed-test-'));
  // Mock only the OS keychain boundary; exercise the real storage/auth/connection services.
  const keychain = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'test', encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() };
  const { ManagedAuthService } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  const { ConnectionService } = tsxRequire('../src/main/services/connections.ts', import.meta.url);
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials, keychain);
  const connections = new ConnectionService(storage, credentials);
  let revoked = false, loggedOut = false;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/login')) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.username, 'desktop.user'); assert.equal(body.audience, 'desktop');
      return Response.json({ data: { token: 'jwt-for-test' } });
    }
    if (url.endsWith('/logout')) { loggedOut = true; return Response.json({ data: {} }); }
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer jwt-for-test');
    if (revoked) return Response.json({ error: 'Your license is terminated.' }, { status: 403 });
    return Response.json({ data: { user: { id: 'licensed-account', username: 'desktop.user', name: 'Desktop user' }, license: { key: 'ABCD-EFGH-IJKL-MNOP', expiresAt: '2099-01-01' }, credentials: [
      { id: 'key-one', name: 'Primary', ownerName: 'Owner', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'test-model', stream: true, apiKey: 'owner-private-secret' },
      { id: 'key-two', name: 'Secondary', ownerName: 'Owner', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'test-model', stream: true, apiKey: 'owner-secondary-secret' },
      { id: 'key-three', name: 'Gemini', ownerName: 'Owner', provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-test', stream: true, apiKey: 'owner-gemini-secret' },
    ] } });
  });
  assert.equal(await auth.getCurrentUser(), null);
  const user = await auth.signIn('desktop.user', 'password test');
  assert.equal(user.managed, true);
  assert.equal(storage.current().settings.onboardingComplete, true);
  assert(!JSON.stringify(storage.data).includes('owner-private-secret'));
  assert(!readFileSync(storage.file, 'utf8').includes('jwt-for-test'));
  assert(!readFileSync(join(directory, 'access-session.json'), 'utf8').includes('jwt-for-test'));
  const connection = storage.current().settings.connections[0];
  assert.deepEqual(storage.current().settings.connections.map((c: ProviderConnection) => c.enabled), [true, false, true]);
  assert.equal(credentials.get(user.id, connection), 'owner-private-secret');
  assert.throws(() => connections.save({ id: connection.id, name: 'Changed', ai: connection }), /read-only/);
  assert.throws(() => connections.remove(connection.id), /read-only/);
  connections.select(connection.id, 'other-model');
  assert.equal(connection.model, 'other-model');
  assert.equal(connections.resolveKey({ id: connection.id, name: connection.name, ai: connection }), 'owner-private-secret');
  assert.throws(() => connections.select(connection.id, ''), /model selection/);
  assert.throws(() => connections.resolveKey({ id: connection.id, name: connection.name, ai: { ...connection, baseUrl: 'https://evil.example/v1' } }), /provided/);
  connections.selectManaged('key-two', true);
  assert.deepEqual(storage.current().settings.connections.map((c: ProviderConnection) => c.enabled), [false, true, true]);
  assert.equal(storage.current().settings.activeConnectionId, 'key-two');
  assert.throws(() => connections.select('key-one'), /Enable this connection/);
  connections.selectManaged('key-two', false);
  assert.equal(storage.current().settings.activeConnectionId, 'key-three');
  connections.selectManaged('key-two', true);
  await auth.refresh(true);
  assert.equal(storage.current().settings.activeConnectionId, 'key-two');
  assert.equal(storage.current().settings.connections[0].enabled, false);
  assert.equal(storage.current().settings.connections[0].model, 'other-model');
  assert.throws(() => connections.resolveKey({ id: connection.id, name: connection.name, ai: connection }), /provided/);
  const restored = new ManagedAuthService(storage, credentials, keychain);
  assert.equal((await restored.getCurrentUser()).id, user.id);
  assert.equal(storage.current().settings.connections[0].model, 'other-model');
  revoked = true;
  await assert.rejects(restored.refresh(true), /terminated/);
  assert.equal(await restored.getCurrentUser(), null);
  assert.throws(() => storage.current(), /Sign in/);
  assert.throws(() => credentials.get(user.id, connection), /no longer available/);
  await auth.signOut();
  assert.equal(loggedOut, true);
  assert.equal(auth.signedIn, false);
});

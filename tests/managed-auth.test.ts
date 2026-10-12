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
  storage.current().settings.modelRoles = { 'key-two': { fast: 'my-fast-model', deep: 'my-deep-model' }, removed: { fast: 'old-model' } };
  await auth.refresh(true);
  assert.deepEqual(storage.current().settings.modelRoles, { 'key-two': { fast: 'my-fast-model', deep: 'my-deep-model' } });
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

test('managed auth saves, retrieves, and clears credentials across sign-out', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-creds-test-'));
  const keychain = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'test', encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() };
  const { ManagedAuthService } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials, keychain);

  // Initially no credentials saved
  assert.equal(auth.getSavedCredentials(), null);

  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/login')) return Response.json({ data: { token: 'jwt-token' } });
    if (url.endsWith('/logout')) return Response.json({ data: {} });
    return Response.json({ data: { user: { id: 'u1', username: 'saved.user', name: 'Saved User' }, license: { key: 'KEY', expiresAt: '2099-01-01' }, credentials: [] } });
  });

  // Sign in with saveCredentials = true
  await auth.signIn('saved.user', 'secret-pass-123', true);
  const saved = auth.getSavedCredentials();
  assert.deepEqual(saved, { username: 'saved.user', password: 'secret-pass-123' });

  // Signing out should keep the saved credentials so user does not need to retype them
  await auth.signOut();
  assert.deepEqual(auth.getSavedCredentials(), { username: 'saved.user', password: 'secret-pass-123' });

  // Re-instantiating ManagedAuthService (app restart) should still load the saved credentials
  const restarted = new ManagedAuthService(storage, credentials, keychain);
  assert.deepEqual(restarted.getSavedCredentials(), { username: 'saved.user', password: 'secret-pass-123' });

  // Clearing saved credentials removes them
  restarted.setSavedCredentials(null);
  assert.equal(restarted.getSavedCredentials(), null);
});

test('managed auth reports HTML gateway and captive-portal replies without raw JSON parse errors', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-html-test-'));
  const keychain = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'test', encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() };
  const { ManagedAuthService } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials, keychain);
  let reply: 'json' | 'gateway' | 'portal' = 'json';
  // Sign-in starts the remote file poller; stop it before removing the directory, even if an assertion fails.
  t.after(async () => {
    reply = 'json';
    if (auth.signedIn) await auth.signOut();
    rmSync(directory, { recursive: true, force: true });
  });
  const html = '<!DOCTYPE html><html><body>Bad gateway</body></html>';
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/login')) return Response.json({ data: { token: 'jwt-token' } });
    if (url.endsWith('/logout')) return Response.json({ data: {} });
    if (reply === 'gateway') return new Response(html, { status: 502, headers: { 'Content-Type': 'text/html' } });
    if (reply === 'portal') return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
    return Response.json({ data: { user: { id: 'u1', username: 'html.user', name: 'HTML User' }, license: { key: 'KEY', expiresAt: '2099-01-01' }, credentials: [] } });
  });
  await auth.signIn('html.user', 'secret-pass-123');
  reply = 'gateway';
  const gateway = await auth.refresh(true).then(() => null, (error: Error) => error);
  assert.equal(gateway?.message, 'Access request failed.');
  assert.equal(auth.signedIn, true, 'a gateway error is not a revocation');
  reply = 'portal';
  const portal = await auth.refresh(true).then(() => null, (error: Error) => error);
  assert.match(portal?.message ?? '', /unexpected response/);
  for (const error of [gateway, portal]) assert.doesNotMatch(error?.message ?? '', /JSON|Unexpected token/);
});

test('managed auth keeps the session through outages and ends it only when the server rejects it', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-outage-test-'));
  const keychain = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'test', encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() };
  const { ManagedAuthService, AccessUnavailableError, SessionChangedError, CONNECTION_LOST_MS } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials, keychain);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let mode: 'ok' | 'offline' | 'unavailable' | 'reject' = 'ok', desktopCalls = 0, logins = 0;
  let hold: Promise<void> | null = null, rejectedToken = '';
  t.after(async () => {
    mode = 'ok'; hold = null;
    if (auth.signedIn) await auth.signOut();
    rmSync(directory, { recursive: true, force: true });
  });
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/login')) return Response.json({ data: { token: `jwt-${++logins}` } });
    if (url.endsWith('/logout')) return Response.json({ data: {} });
    if (!url.endsWith('/desktop')) return Response.json({ data: { command: null, active: false } });
    desktopCalls++;
    const wait = hold;
    if (wait) await wait;
    if (rejectedToken && (init.headers as Record<string, string>).Authorization === `Bearer ${rejectedToken}`) return Response.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 });
    if (mode === 'offline') throw new TypeError('fetch failed');
    if (mode === 'unavailable') return Response.json({ error: 'Service unavailable.' }, { status: 503 });
    if (mode === 'reject') return Response.json({ error: 'Your license is terminated.' }, { status: 403 });
    return Response.json({ data: { user: { id: 'u1', username: 'outage.user', name: 'Outage User' }, license: { key: 'KEY', expiresAt: '2099-01-01' }, credentials: [] } });
  });

  await auth.signIn('outage.user', 'secret-pass-123');
  assert.equal(auth.offline, false);
  assert.equal(auth.heartbeatDue(), false, 'just checked in');
  now += 20_000;
  assert.equal(auth.heartbeatDue(), true, 'checks in every 20 seconds');

  // Network failures and server errors are outages: the session and the verified account stay.
  mode = 'offline';
  await assert.rejects(auth.refresh(true), AccessUnavailableError);
  assert.equal(auth.signedIn, true);
  assert.equal(auth.offline, true);
  assert.equal(auth.connectionLost, false);
  assert.equal(auth.heartbeatDue(), true, 'retries on every tick while offline');
  mode = 'unavailable';
  await assert.rejects(auth.refresh(true), AccessUnavailableError);
  assert.equal(auth.signedIn, true, 'a 503 is not a rejection');
  const calls = desktopCalls;
  now += 60_000;
  await auth.refresh();
  assert.equal(desktopCalls, calls, 'ordinary calls do not wait on the network during an outage');
  assert.equal((await auth.getCurrentUser())?.id, 'u1');
  assert.equal(storage.current().id, 'u1');

  // The notice appears once the outage itself has lasted 90 seconds.
  now += CONNECTION_LOST_MS - 60_000 - 1;
  assert.equal(auth.connectionLost, false);
  now += 1;
  assert.equal(auth.connectionLost, true);
  now += 10 * 60_000;
  assert.equal(auth.signedIn, true, 'no local time limit ends the session');

  mode = 'ok';
  await auth.refresh(true);
  assert.equal(auth.offline, false);
  assert.equal(auth.connectionLost, false);

  // Signing out and in while a check is in flight: the new sign-in gets its own request.
  let release!: () => void;
  hold = new Promise(resolve => { release = resolve; });
  const staleSuccess = auth.refresh(true).then(() => null, (error: unknown) => error);
  await auth.signOut();
  hold = null;
  await auth.signIn('outage.user', 'secret-pass-123');
  release();
  assert(await staleSuccess instanceof SessionChangedError);
  assert.equal(auth.signedIn, true, 'a stale reply does not affect the new session');

  // A rejection meant for a replaced session must not sign out the current one.
  hold = new Promise(resolve => { release = resolve; });
  const staleRejection = auth.refresh(true).then(() => null, (error: unknown) => error);
  rejectedToken = `jwt-${logins}`;
  await auth.signOut();
  hold = null;
  await auth.signIn('outage.user', 'secret-pass-123');
  release();
  assert(await staleRejection instanceof SessionChangedError);
  assert.equal(auth.signedIn, true);
  assert.equal(storage.current().id, 'u1');

  // Only the server's rejection ends the session.
  mode = 'reject';
  const rejection = await auth.refresh(true).then(() => null, (error: unknown) => error);
  assert.match((rejection as Error).message, /terminated/);
  assert(!(rejection instanceof AccessUnavailableError));
  assert.equal(auth.signedIn, false);
  assert.equal(auth.offline, false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { require as tsxRequire } from 'tsx/cjs/api';
import type { ProviderConnection } from '../src/shared/types';

test('managed desktop keeps tokens and keys out of renderer state, preserves selection and fails closed', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-managed-test-'));
  const { ManagedAuthService } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  const { ConnectionService } = tsxRequire('../src/main/services/connections.ts', import.meta.url);
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials);
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
  const disk = t.mock.method(storage, 'save');
  await auth.refresh(true);
  assert.equal(disk.mock.callCount(), 0, 'an unchanged heartbeat does not rewrite history');
  assert.equal(user.managed, true);
  assert.equal(storage.current().settings.onboardingComplete, true);
  assert(!JSON.stringify(storage.data).includes('owner-private-secret'));
  assert(!readFileSync(storage.file, 'utf8').includes('jwt-for-test'));
  assert.equal(JSON.parse(readFileSync(join(directory, 'access-session.json'), 'utf8')).token, 'jwt-for-test');
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
  const restored = new ManagedAuthService(storage, credentials);
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

test('keep me signed in remembers the session and username without a keychain', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-creds-test-'));
  const { ManagedAuthService } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'access-session.json');
  const onDisk = () => readFileSync(file, 'utf8');

  // An older version saved the password; the next launch removes it and keeps only the username.
  writeFileSync(file, JSON.stringify({ deviceId: 'device-1', encryptedToken: 'old-encrypted-token', savedCredentials: { username: 'old.user', encryptedPassword: Buffer.from('old-secret').toString('base64') } }));
  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials);
  assert.deepEqual(auth.getSavedCredentials(), { username: 'old.user' });
  assert.equal(auth.signedIn, false, 'old encrypted sessions require one new sign-in');
  assert(!onDisk().includes('old-encrypted-token'), 'old encrypted token removed from disk');
  assert(!onDisk().includes('encryptedPassword') && !onDisk().includes(Buffer.from('old-secret').toString('base64')), 'legacy password removed from disk');

  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/login')) return Response.json({ data: { token: 'jwt-token' } });
    if (url.endsWith('/logout')) return Response.json({ data: {} });
    return Response.json({ data: { user: { id: 'u1', username: 'saved.user', name: 'Saved User' }, license: { key: 'KEY', expiresAt: '2099-01-01' }, credentials: [] } });
  });

  // Kept signed in: the session survives a restart, only the username is remembered, and the password never reaches disk.
  await auth.signIn('saved.user', 'secret-pass-123', true);
  assert.deepEqual(auth.getSavedCredentials(), { username: 'saved.user' });
  assert.equal(JSON.parse(onDisk()).token, 'jwt-token');
  assert(!onDisk().includes('secret-pass-123') && !onDisk().includes(Buffer.from('secret-pass-123').toString('base64')));
  assert.equal(new ManagedAuthService(storage, credentials).signedIn, true, 'restart stays signed in');
  await auth.signOut();
  const afterSignOut = new ManagedAuthService(storage, credentials);
  assert.equal(afterSignOut.signedIn, false);
  assert.deepEqual(afterSignOut.getSavedCredentials(), { username: 'saved.user' }, 'the username is filled in after signing out');

  // Not kept: the session ends with the app and nothing is remembered.
  await afterSignOut.signIn('saved.user', 'secret-pass-123', false);
  assert.equal(afterSignOut.signedIn, true, 'signed in for this launch');
  assert.equal(afterSignOut.getSavedCredentials(), null);
  const restarted = new ManagedAuthService(storage, credentials);
  assert.equal(restarted.signedIn, false, 'a restart asks to sign in again');
  assert.equal(restarted.getSavedCredentials(), null);
  assert(!onDisk().includes('secret-pass-123') && !onDisk().includes('jwt-token') && !onDisk().includes(Buffer.from('jwt-token').toString('base64')));
});

test('local API keys save without a keychain while old encrypted entries stay available to replace', t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-local-key-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const connection = { id: 'key-one', provider: 'openai', baseUrl: 'https://api.openai.com/v1' } as ProviderConnection;
  const file = join(directory, 'credentials.json');
  writeFileSync(file, JSON.stringify({ 'user:key-one': { destination: 'openai:https://api.openai.com/v1', encrypted: 'old-encrypted-key' } }));
  const credentials = new CredentialStore(directory);
  assert.equal(credentials.has('user', connection), false);
  assert.throws(() => credentials.get('user', connection), /Re-enter this API key/);
  credentials.set('user', connection, 'new-secret');
  assert.equal(new CredentialStore(directory).get('user', connection), 'new-secret');
  assert(!readFileSync(file, 'utf8').includes('old-encrypted-key'));
});

test('managed auth reports HTML gateway and captive-portal replies without raw JSON parse errors', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-html-test-'));
  const { ManagedAuthService } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials);
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
  const { ManagedAuthService, AccessUnavailableError, SessionChangedError, CONNECTION_LOST_MS } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  const storage = new Storage(directory), credentials = new CredentialStore(directory);
  const auth = new ManagedAuthService(storage, credentials);
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

test('managed desktop tells the server it enforces plans and locks what the license plan leaves out', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-plans-test-'));
  const { ManagedAuthService } = tsxRequire('../src/main/services/managedAuth.ts', import.meta.url);
  const { CredentialStore } = tsxRequire('../src/main/services/credentials.ts', import.meta.url);
  const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const auth = new ManagedAuthService(new Storage(directory), new CredentialStore(directory));
  // What the server's check-in reply carries; a server from before plans sends neither field.
  let reply: { plan?: string; features?: unknown } = { plan: 'CORE', features: ['technical', 'behavioral', 'a-feature-from-the-future', 7] };
  const headers: Array<Record<string, string>> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    headers.push(init.headers as Record<string, string>);
    if (url.endsWith('/login')) return Response.json({ data: { token: 'plan-token' } });
    if (url.endsWith('/logout')) return Response.json({ data: {} });
    return Response.json({ data: { user: { id: 'u1', username: 'core.user', name: 'Core User' }, license: { key: 'KEY', expiresAt: '2099-01-01', ...(reply.plan ? { plan: reply.plan } : {}) }, ...('features' in reply ? { features: reply.features } : {}), credentials: [] } });
  });

  assert.equal(auth.allows('technical'), false, 'nothing is unlocked while signed out');
  assert.throws(() => auth.requireFeature('technical'), /Sign in/);
  assert.equal(auth.planKey, '');
  const user = await auth.signIn('core.user', 'password test');
  assert.equal(headers.length, 2);
  assert(headers.every(sent => sent['x-novi-plans'] === '1'), 'every request says this app enforces plans');
  assert.equal(user.plan, 'CORE');
  assert.deepEqual(user.features, ['technical', 'behavioral'], 'unknown features are dropped');
  assert.equal(auth.allows('behavioral'), true);
  assert.equal(auth.allows('normal'), false);
  assert.throws(() => auth.requireFeature('coding'), { message: 'Code is included with Pro, Ultimate and Lifetime. Ask your Novi administrator to upgrade your license.' });
  assert.doesNotThrow(() => auth.requireFeature('technical'));
  const core = auth.planKey;

  // An upgrade arrives with the next check-in.
  reply = { plan: 'ULTIMATE', features: ['technical', 'behavioral', 'normal', 'recruiter', 'coding', 'system-design', 'eye-tracking', 'local-coding', 'phone-companion'] };
  await auth.refresh(true);
  assert.notEqual(auth.planKey, core);
  assert.equal(auth.allows('local-coding'), true);
  assert.equal((await auth.getCurrentUser()).plan, 'ULTIMATE');

  // A server deployed before plans sends no list: nothing is locked rather than everything.
  reply = {};
  await auth.refresh(true);
  assert.equal((await auth.getCurrentUser()).features, undefined);
  assert.equal(auth.allows('phone-companion'), true);
  // A list in any other shape counts as empty, never as "no restrictions".
  for (const features of ['everything', null, { technical: true }, []]) {
    reply = { plan: 'PRO', features };
    await auth.refresh(true);
    assert.equal(auth.allows('technical'), false, JSON.stringify(features));
  }

  await auth.signOut();
  assert.equal(auth.planKey, '');
  assert.equal(auth.allows('technical'), false);
});

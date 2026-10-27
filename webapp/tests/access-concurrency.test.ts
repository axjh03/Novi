import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Exercise the real access functions with transaction-scoped row locks; no live database is used.
const mockDb: any = {};
(globalThis as any).prisma = mockDb;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
function mutex() {
  let tail = Promise.resolve();
  return async () => {
    const previous = tail, next = deferred();
    tail = next.promise;
    await previous;
    return next.resolve;
  };
}

async function fixture() {
  process.env.ACCESS_JWT_SECRET = 'test-only-access-concurrency-secret-at-least-32-characters';
  const secret = 'original-test-password';
  const admin = { id: 'admin', username: 'admin', name: 'Admin', role: 'ADMIN', status: 'ACTIVE', parentId: null, passwordHash: await bcrypt.hash(secret, 4) };
  const owner = { id: 'owner', username: 'owner', role: 'STANDALONE', status: 'ACTIVE', parentId: null };
  const accounts: any[] = [admin, owner];
  const sessions: any[] = [{ id: 'portal', accountId: admin.id, audience: 'portal', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }];
  const order = { id: 'request', ownerId: owner.id, status: 'PENDING', quantity: 2, plan: 'ULTIMATE', duration: 1, unit: 'MONTHS' };
  const licenses: any[] = [];
  const accountLock = mutex(), requestLock = mutex();
  const hooks: { create?: () => Promise<void>; update?: () => void; readRequest?: () => Promise<void> } = {};
  const accountQueries = {
    findUnique: async ({ where }: any) => { const a = accounts.find(a => where.id ? a.id === where.id : a.username === where.username); return a ? { ...a } : null; },
    findUniqueOrThrow: async ({ where }: any) => ({ ...accounts.find(a => a.id === where.id) }),
    findMany: async () => accounts.map(a => ({ ...a })),
  };
  Object.assign(mockDb, {
    accessAccount: accountQueries,
    accessSession: {
      findUnique: async ({ where }: any) => { const s = sessions.find(s => s.id === where.id); return s ? { ...s, account: { ...accounts.find(a => a.id === s.accountId) } } : null; },
      create: async ({ data }: any) => { await hooks.create?.(); const s = { id: randomUUID(), revokedAt: null, ...data }; sessions.push(s); return s; },
      updateMany: async ({ where, data }: any) => { const matches = sessions.filter(s => (where.accountId?.in ?? [where.accountId]).includes(s.accountId)); matches.forEach(s => Object.assign(s, data)); return { count: matches.length }; },
    },
    licenseRequest: {
      findUniqueOrThrow: async () => { const snapshot = { ...order }; await hooks.readRequest?.(); return snapshot; },
      update: async ({ data }: any) => Object.assign(order, data),
    },
    accessLicense: { create: async ({ data }: any) => { licenses.push(data); return data; } },
    accessAudit: { create: async () => ({}) },
    loginThrottle: { deleteMany: async () => ({}), upsert: async () => ({ count: 1 }) },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const release: Array<() => void> = [];
      const tx = {
        ...mockDb,
        $queryRaw: async (query: TemplateStringsArray) => { assert.match(query.join('?'), /AccessAccount.*FOR UPDATE/); release.push(await accountLock()); return [{ id: admin.id }]; },
        accessAccount: { ...accountQueries, update: async ({ where, data }: any) => { hooks.update?.(); release.push(await accountLock()); return Object.assign(accounts.find(a => a.id === where.id), data); } },
        licenseRequest: { ...mockDb.licenseRequest, updateMany: async ({ where, data }: any) => { release.push(await requestLock()); if (order.status !== where.status) return { count: 0 }; Object.assign(order, data); return { count: 1 }; } },
      };
      try { return await callback(tx); }
      finally { release.reverse().forEach(unlock => unlock()); }
    },
  });
  const access = await import('../src/lib/access');
  const { tokenFor } = await import('../src/lib/access-security');
  const req = () => new Request('http://localhost/api/control', { method: 'PATCH', headers: { cookie: `astra_session=${tokenFor(admin.id, 'portal', 'portal')}` } });
  return { ...access, secret, admin, hooks, licenses, order, req };
}

test('a password reset waits for an in-flight login and revokes its new session', { timeout: 10_000 }, async () => {
  const f = await fixture(), creating = deferred(), finish = deferred(), resetting = deferred();
  f.hooks.create = async () => { creating.resolve(); await finish.promise; };
  f.hooks.update = resetting.resolve;
  const login = f.login({ username: f.admin.username, password: f.secret });
  await creating.promise;
  const reset = f.mutate(f.req(), 'accounts', f.admin.id, { password: 'new-test-password' });
  try {
    await resetting.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert(await bcrypt.compare(f.secret, f.admin.passwordHash), 'reset must wait for session creation to finish');
  } finally { finish.resolve(); }
  const signed = await login;
  await reset;
  assert(!await bcrypt.compare(f.secret, f.admin.passwordHash));
  await assert.rejects(f.authenticate(new Request('http://localhost', { headers: { cookie: `astra_session=${signed.token}` } })), /session has ended/);
});

test('two simultaneous approvals claim a purchase request once', { timeout: 10_000 }, async () => {
  const f = await fixture(), bothRead = deferred();
  let readers = 0;
  f.hooks.readRequest = async () => { if (++readers === 2) bothRead.resolve(); await bothRead.promise; };
  const results = await Promise.allSettled([1, 2].map(() => f.mutate(f.req(), 'requests', f.order.id, { status: 'APPROVED' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.licenses.length, f.order.quantity);
  assert.equal(f.order.status, 'APPROVED');
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.match(rejected.reason.message, /already been processed/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';

test('model checks use saved keys, refresh live results and restrict access to owner or admin', async t => {
  process.env.ACCESS_JWT_SECRET = randomBytes(32).toString('hex');
  process.env.ACCESS_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const { prisma } = await import('../src/lib/db');
  const { credentialModels } = await import('../src/lib/access');
  const { seal, tokenFor } = await import('../src/lib/access-security');
  let role = 'STANDALONE', accountId = 'owner', generation = 1, rejected = false, calls = 0;
  const encryptedSecret = seal('saved-provider-secret');
  const findSession = prisma.accessSession.findUnique, findCredential = prisma.managedCredential.findFirst;
  t.after(() => { prisma.accessSession.findUnique = findSession; prisma.managedCredential.findFirst = findCredential; });
  (prisma.accessSession as any).findUnique = async () => ({
    id: 'session', accountId, audience: 'portal', revokedAt: null, expiresAt: new Date(Date.now() + 60000),
    account: { id: accountId, role, status: 'ACTIVE', parentId: null },
  });
  (prisma.managedCredential as any).findFirst = async ({ where }: { where: { id: string; ownerId?: string } }) => {
    if (where.id !== 'key' || (where.ownerId && where.ownerId !== 'owner')) return null;
    return { id: 'key', ownerId: 'owner', provider: 'GEMINI', encryptedSecret };
  };
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls++;
    assert(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models'));
    assert.equal((options.headers as Record<string, string>)['x-goog-api-key'], 'saved-provider-secret');
    if (rejected) return Response.json({}, { status: 401 });
    return Response.json({ models: Array.from({ length: generation }, (_, n) => ({ name: `models/gemini-${n}`, supportedGenerationMethods: ['generateContent'] })) });
  });
  const request = () => new Request('http://localhost/api/control/credentials/key/models', { headers: { cookie: `astra_session=${tokenFor(accountId, 'session', 'portal')}` } });
  const first = await credentialModels(request(), 'key');
  assert.equal(first.models.length, 1);
  assert(!JSON.stringify(first).includes('saved-provider-secret'));
  generation = 2;
  assert.equal((await credentialModels(request(), 'key')).models.length, 2);
  accountId = 'another-owner';
  await assert.rejects(() => credentialModels(request(), 'key'), /not found/);
  assert.equal(calls, 2, 'other owners cannot send requests using this key');
  accountId = 'admin'; role = 'ADMIN';
  assert.equal((await credentialModels(request(), 'key')).models.length, 2);
  rejected = true;
  await assert.rejects(() => credentialModels(request(), 'key'), /key was rejected/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';

// Needs a disposable Postgres; each run uses and then drops its own schema.
test('sign-in throttle counts each address separately and needs several addresses to lock an account', async t => {
  if (!process.env.TEST_DATABASE_URL) { t.skip('Set TEST_DATABASE_URL to a disposable Postgres database'); return; }
  const schema = `throttle_${randomBytes(6).toString('hex')}`;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = process.env.DIRECT_URL = url.href;
  process.env.ACCESS_JWT_SECRET = randomBytes(32).toString('hex');
  process.env.ACCESS_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--accept-data-loss'], { cwd: resolve('.'), env: process.env, stdio: 'pipe' });
  const { prisma } = await import('../src/lib/db');
  const { login } = await import('../src/lib/access');
  const password = 'correct horse battery staple';
  const from = (headers: Record<string, string>) => new Request('http://localhost:3000/api/control/login', { headers });
  const attempt = (username: string, headers: Record<string, string>, secret = 'wrong password') => login({ username, password: secret }, from(headers)).then(() => 200, error => error.status as number);
  const count = async (key: string) => (await prisma.loginThrottle.findUnique({ where: { key } }))?.count ?? 0;
  try {
    const passwordHash = await bcrypt.hash(password, 4);
    for (const username of ['alice', 'bob']) await prisma.accessAccount.create({ data: { username, name: username, role: 'ADMIN', passwordHash } });

    // One address is stopped after 10 tries, even with the right password.
    for (let i = 0; i < 10; i++) assert.equal(await attempt('alice', { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }), 401);
    assert.equal(await attempt('alice', { 'x-forwarded-for': '198.51.100.1' }, password), 429);
    // A forged cf-connecting-ip doesn't change the counted address.
    assert.equal(await attempt('alice', { 'x-forwarded-for': '198.51.100.1', 'cf-connecting-ip': '192.0.2.99' }), 429);
    assert.equal(await count('ip:192.0.2.99|user:alice'), 0);
    // The real user elsewhere is unaffected, and signing in clears that address and the account count only.
    assert.equal(await attempt('alice', { 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }), 401, 'x-real-ip wins');
    assert.equal(await count('ip:203.0.113.7|user:alice'), 1);
    assert.equal(await attempt('alice', { 'x-real-ip': '203.0.113.7' }, password), 200);
    assert.equal(await count('ip:203.0.113.7|user:alice'), 0);
    assert.equal(await count('user:alice'), 0);
    assert.equal(await attempt('alice', { 'x-forwarded-for': '198.51.100.1' }, password), 429, 'the guessing address stays blocked');

    // Locking an account needs more than 50 tries spread over several addresses.
    for (let ip = 1; ip <= 5; ip++) for (let i = 0; i < 10; i++) assert.equal(await attempt('bob', { 'x-forwarded-for': `192.0.2.${ip}` }), 401);
    assert.equal(await count('user:bob'), 50);
    assert.equal(await attempt('bob', { 'x-forwarded-for': '192.0.2.1' }), 429);
    assert.equal(await count('user:bob'), 50, 'a blocked address adds nothing to the account count');
    assert.equal(await attempt('bob', { 'x-forwarded-for': '192.0.2.6' }, password), 429);
    assert.equal(await count('user:bob'), 51);

    // Without any address header everyone shares one counter, as before.
    for (let i = 0; i < 10; i++) assert.equal(await attempt('carol', {}), 401);
    assert.equal(await attempt('carol', {}), 429);
    assert.equal(await count('ip:unknown|user:carol'), 11);
  } finally {
    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await prisma.$disconnect();
  }
});

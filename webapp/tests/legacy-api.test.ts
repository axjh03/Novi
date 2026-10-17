import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { proxy, config } from '../src/proxy';
import { requireAdmin, signToken, verifyToken } from '../src/lib/jwt';
import { decryptSecret, encryptSecret, hashLicenseKey } from '../src/lib/crypto';
import * as credentials from '../src/app/api/v1/credentials/route';
import * as credential from '../src/app/api/v1/credentials/[id]/route';
import * as orders from '../src/app/api/v1/orders/route';
import * as order from '../src/app/api/v1/orders/[id]/route';

const SECRETS = ['JWT_SECRET', 'ENCRYPTION_MASTER_KEY', 'LICENSE_SERVER_SECRET'] as const;
const unset = () => { for (const name of SECRETS) delete process.env[name]; };
const configure = () => {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString('hex');
  process.env.LICENSE_SERVER_SECRET = randomBytes(32).toString('hex');
};
const user = { userId: 'u1', username: 'admin', email: 'a@example.com' };
const request = (token?: string, body?: unknown) => new Request('http://localhost:3000/api/v1/x', {
  method: body === undefined ? 'GET' : 'POST',
  headers: { ...(token && { authorization: `Bearer ${token}` }), 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const params = { params: Promise.resolve({ id: 'missing' }) };
const handlers = [
  ['GET /credentials', (r: Request) => credentials.GET(r)],
  ['POST /credentials', (r: Request) => credentials.POST(r)],
  ['DELETE /credentials/[id]', (r: Request) => credential.DELETE(r, params)],
  ['GET /orders', (r: Request) => orders.GET(r)],
  ['POST /orders', (r: Request) => orders.POST(r)],
  ['PATCH /orders/[id]', (r: Request) => order.PATCH(r, params)],
] as const;

test('every /api/v1 path is retired by the proxy', async () => {
  assert.equal(config.matcher, '/api/v1/:path*');
  const response = proxy();
  assert.equal(response.status, 410);
  assert.match((await response.json()).error, /retired/);
});

test('legacy helpers refuse to run without real secrets', () => {
  unset();
  assert.throws(() => signToken({ ...user, role: 'ADMIN' }), /JWT_SECRET/);
  assert.throws(() => hashLicenseKey('NVI-AAAA-BBBB-CCCC-DDDD'), /LICENSE_SERVER_SECRET/);
  assert.throws(() => encryptSecret('sk-test'), /ENCRYPTION_MASTER_KEY/);
  assert.throws(() => decryptSecret('00:00:00'), /ENCRYPTION_MASTER_KEY/);
  // A token signed with the old published default must not be trusted.
  process.env.JWT_SECRET = 'astra_jwt_super_secret_key_2026_changeme_in_prod';
  const forged = signToken({ ...user, role: 'ADMIN' });
  process.env.JWT_SECRET = 'short';
  assert.equal(verifyToken(forged), null);
  assert.equal(requireAdmin(request(forged)), null);

  configure();
  assert.equal(verifyToken(signToken({ ...user, role: 'ADMIN' }))?.role, 'ADMIN');
  assert.equal(verifyToken(forged), null);
  assert.equal(decryptSecret(encryptSecret('sk-test')), 'sk-test');
  assert.match(hashLicenseKey('NVI-AAAA-BBBB-CCCC-DDDD'), /^[a-f0-9]{64}$/);
  unset();
});

test('legacy credential and order routes require an admin before touching data', async () => {
  configure();
  try {
    const corp = signToken({ ...user, role: 'CORP' });
    for (const [name, handler] of handlers) {
      assert.equal((await handler(request())).status, 401, `${name} without a token`);
      assert.equal((await handler(request('not-a-token'))).status, 401, `${name} with a bad token`);
      assert.equal((await handler(request(corp, name.startsWith('GET') ? undefined : {}))).status, 401, `${name} as a non-admin`);
    }
    // An admin passes the check and reaches the route's own validation, which needs no database.
    const admin = signToken({ ...user, role: 'ADMIN' });
    assert.equal((await credentials.POST(request(admin, {}))).status, 400);
    assert.equal((await orders.POST(request(admin, {}))).status, 400);
  } finally { unset(); }
});

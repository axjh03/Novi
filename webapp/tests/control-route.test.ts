import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as control from '../src/app/api/control/[...path]/route';

const call = (path: string[], method: string, headers: Record<string, string> = {}) => control.GET(
  new Request(`http://portal.test/api/control/${path.join('/')}`, {
    method, headers: { host: 'portal.test', ...(method === 'GET' ? {} : { 'content-type': 'application/json' }), ...headers },
    body: method === 'GET' ? undefined : JSON.stringify({ username: 'someone', password: 'not-checked' }),
  }),
  { params: Promise.resolve({ path }) },
);
const noCors = (response: Response) => assert.deepEqual([...response.headers.keys()].filter(name => name.startsWith('access-control-')), []);

test('the control API refuses other websites and sends no CORS headers', async () => {
  assert.equal('OPTIONS' in control, false, 'no preflight handler for other origins');
  for (const [path, method] of [[['login'], 'POST'], [['register'], 'POST'], [['state'], 'GET'], [['accounts'], 'POST'], [['credentials', 'x', 'reveal'], 'POST']] as const) {
    for (const origin of ['https://evil.example', 'null', 'not a url', 'http://portal.test.evil.example']) {
      const response = await call([...path], method, { origin });
      assert.equal(response.status, 403, `${method} /${path.join('/')} from ${origin}`);
      assert.match((await response.json()).error, /origin/);
      noCors(response);
    }
  }
  // Same-origin pages and the desktop app (no Origin) reach the router; an unknown path needs no database.
  for (const headers of [{ origin: 'http://portal.test' }, {}, { origin: 'https://portal.test', 'x-forwarded-host': 'portal.test, internal' }] as Record<string, string>[]) {
    const response = await call(['nothing-here'], 'GET', headers);
    assert.equal(response.status, 404, JSON.stringify(headers));
    noCors(response);
  }
  // Behind Vercel the forwarded host is the public one.
  assert.equal((await call(['nothing-here'], 'GET', { origin: 'https://novi.example', 'x-forwarded-host': 'novi.example', host: 'internal' })).status, 404);
  assert.equal((await call(['nothing-here'], 'GET', { origin: 'https://internal', 'x-forwarded-host': 'novi.example', host: 'internal' })).status, 403);
});

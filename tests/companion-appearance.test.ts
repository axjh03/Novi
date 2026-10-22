import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { RemoteCompanionService } from '../src/main/services/remoteCompanion';

test('phone controls dispatch bounded commands through the authenticated handler', async () => {
  const actions: unknown[] = [];
  const service = new RemoteCompanionService({ getState: () => ({ transparent: true, clickThrough: false }) } as any,
    () => ({ isDestroyed: () => false, webContents: { send: (...args: unknown[]) => actions.push(args) } }) as any);
  service.getLocalIPs = () => ['127.0.0.1'];
  // The token exists only while the server listens.
  const token = new URLSearchParams(new URL((await service.start(0)).bestUrl).hash.slice(1)).get('token');
  assert.match(token!, /^[a-f0-9]{48}$/);
  try {
    const request = (path: string, payload?: unknown, authorized = true, action = 'change-reading-size') => new Promise<{ status: number; body: string }>((resolve) => {
      const req = Object.assign(new PassThrough(), { url: path, method: path === '/' ? 'GET' : 'POST',
        headers: { authorization: authorized ? `Bearer ${token}` : '' }, socket: { remoteAddress: '127.0.0.1' } });
      let status = 0;
      service['handleRequest'](req as any, { setHeader() {}, writeHead(code: number) { status = code; }, end(body: string) { resolve({ status, body }); } } as any);
      req.end(JSON.stringify({ action, payload }));
    });
    const page = await request('/');
    assert(page.body.includes('A− Smaller') && page.body.includes('A+ Larger'));
    assert.match(page.body, /scrollPad/);
    assert.match(page.body, /resizePad/);
    assert.match(page.body, /SS &amp; Send/);
    assert(!page.body.includes(token!));
    assert.equal((await request('/api/action', 1, false)).status, 401);
    assert.equal(actions.length, 0);
    for (const payload of [-1, 1]) {
      assert.equal((await request('/api/action', payload)).status, 200);
      assert.deepEqual(actions.at(-1), ['global-action', { type: 'change-reading-size', payload }]);
    }
    for (const payload of [0, 1000, '1', null, {}]) assert.equal((await request('/api/action', payload)).status, 400);
    assert.equal(actions.length, 2, 'Invalid or unauthorized requests must not reach desktop controls');
    assert.equal((await request('/api/action', 400, true, 'scroll-conversation')).status, 200);
    assert.deepEqual(actions.at(-1), ['global-action', { type: 'scroll-conversation', payload: 400 }]);
    assert.equal((await request('/api/action', 601, true, 'scroll-conversation')).status, 400);
    assert.equal((await request('/api/action', undefined, true, 'capture-and-send')).status, 200);
    assert.deepEqual(actions.at(-1), ['global-action', { type: 'capture-and-send' }]);
    for (const payload of [{ widthRatio: -1, heightRatio: 0.5 }, { widthRatio: 0.5, heightRatio: '1' }])
      assert.equal((await request('/api/action', payload, true, 'resize-window')).status, 400);
  } finally { service.stop(); }
});

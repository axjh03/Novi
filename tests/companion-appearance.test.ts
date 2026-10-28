import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { RemoteCompanionService } from '../src/main/services/remoteCompanion';

test('companion state follows desktop mode, input and generation state and validates reports', async () => {
  const actions: unknown[] = [];
  const service = new RemoteCompanionService({} as any, () => ({ isDestroyed: () => false, webContents: { send: (...args: unknown[]) => actions.push(args) } }) as any);
  const state = { mode: 'system-design', availableModes: ['normal', 'system-design'], busy: true, listening: true, source: 'both' };
  service.setDesktopState(state);
  assert.deepEqual(service['desktopState'], state);
  assert.equal(service['currentMode'], 'system-design');
  for (const patch of [{ mode: 'invalid' }, { availableModes: ['invalid'] }, { availableModes: 'normal' }, { busy: 1 }, { listening: 'yes' }, { source: 'invalid' }]) {
    assert.throws(() => service.setDesktopState({ ...state, ...patch }), /Invalid companion state/);
    assert.deepEqual(service['desktopState'], state);
  }
  state.availableModes.push('coding');
  assert.deepEqual(service['desktopState']!.availableModes, ['normal', 'system-design'], 'the report is copied');
  await assert.rejects(service['executeAction']('set-app-mode', 'coding'), /not available on your plan/);
  assert.equal(actions.length, 0);
  await service['executeAction']('set-app-mode', 'normal');
  assert.deepEqual(actions.at(-1), ['global-action', { type: 'set-app-mode', payload: 'normal' }]);
  service.setDesktopState(null);
  assert.equal(service['desktopState'], null);
});

test('phone controls dispatch bounded commands through the authenticated handler', async () => {
  const actions: unknown[] = [];
  const service = new RemoteCompanionService({ getState: () => ({ transparent: true, clickThrough: false }) } as any,
    () => ({ isDestroyed: () => false, webContents: { send: (...args: unknown[]) => actions.push(args) } }) as any, undefined, () => 'fixture-user');
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
    assert.match(page.body, /conversationScroll/);
    assert.match(page.body, /role="slider"/);
    assert.doesNotMatch(page.body, /connBadge|brand-compact|<span>Companion<\/span>/);
    assert(!page.body.includes('fixture-user'), 'Public HTML must not disclose the account');
    assert.equal(JSON.parse((await request('/api/status')).body).username, 'fixture-user');
    assert.equal((await request('/api/status', undefined, false)).status, 401);
    assert.match(page.body, /windowPreview/);
    assert.match(page.body, /autoDetect/);
    assert.doesNotMatch(page.body, /rewindow-row|mockupPad|resizePad|↑ Up|↓ Down/);
    assert.match(page.body, /Snap \+ send/);
    assert.match(page.body, /<select id="sessionMode"/);
    assert.match(page.body, /System Design/);
    assert.match(page.body, /Local Coding/);
    assert.match(page.body, /Enable desktop input/);
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
    assert.equal((await request('/api/action', .75, true, 'scroll-conversation-to')).status, 200);
    assert.deepEqual(actions.at(-1), ['global-action', { type: 'scroll-conversation-to', payload: .75 }]);
    for (const payload of [-.1, 1.1, '0.5', null]) assert.equal((await request('/api/action', payload, true, 'scroll-conversation-to')).status, 400);
    for (const payload of [{ xRatio: -1, yRatio: 0, widthRatio: .5, heightRatio: .5 }, { xRatio: .8, yRatio: 0, widthRatio: .5, heightRatio: .5 }]) assert.equal((await request('/api/action', payload, true, 'set-window-bounds')).status, 400);
    assert.equal((await request('/api/action', undefined, true, 'capture-and-send')).status, 200);
    assert.deepEqual(actions.at(-1), ['global-action', { type: 'capture-and-send' }]);
    for (const payload of [{ widthRatio: -1, heightRatio: 0.5 }, { widthRatio: 0.5, heightRatio: '1' }])
      assert.equal((await request('/api/action', payload, true, 'resize-window')).status, 400);
  } finally { service.stop(); }
});

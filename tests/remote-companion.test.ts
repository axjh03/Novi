import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateQRCodeSVG } from '../src/main/services/qrCode';
import { RemoteCompanionService } from '../src/main/services/remoteCompanion';

test('QR link connects without a PIN and stays valid across modes and repeated starts', async () => {
  const actions: unknown[] = [];
  const service = new RemoteCompanionService({
    getState: () => ({ transparent: false, clickThrough: false }),
  } as any, () => ({ isDestroyed: () => false, webContents: { send: (...args: unknown[]) => actions.push(args) } }) as any);
  const status = await service.start(0);
  try {
    const url = new URL(status.bestUrl);
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    assert.match(token!, /^[a-f0-9]{48}$/);
    assert.ok(!('pin' in status));
    assert.ok(status.qrSvg.startsWith('<svg'));
    assert.ok(generateQRCodeSVG(url.href).endsWith('</svg>'));
    const base = `http://127.0.0.1:${status.port}`;
    const html = await (await fetch(base)).text();
    assert.ok(html.includes('Novi Companion'));
    assert.ok(html.includes('Send prompt'));
    assert.ok(!html.includes('pinModal'));
    assert.ok(!html.includes(token!), 'Public page must not reveal authorization');
    assert.equal((await fetch(base + '/api/status')).status, 401);
    assert.equal((await fetch(base + '/api/qr')).status, 401);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(base + '/api/status', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(base + '/api/action', { method: 'POST', body: JSON.stringify({ action: 'send-prompt' }) })).status, 401);
    assert.equal(actions.length, 0);
    assert.equal((await (await fetch(base + '/api/status', { headers })).json()).ok, true);
    assert.equal(service.getStatus().connectedClients, 1);
    for (const mode of ['coding', 'normal', 'behavioral']) {
      const response = await fetch(base + '/api/action', { method: 'POST', headers, body: JSON.stringify({ action: 'set-app-mode', payload: mode }) });
      assert.equal((await response.json()).currentMode, mode);
      assert.equal(service.getStatus().bestUrl, status.bestUrl);
    }
    await fetch(base + '/api/action', { method: 'POST', headers, body: JSON.stringify({ action: 'send-prompt' }) });
    assert.deepEqual(actions.at(-1), ['global-action', { type: 'submit-prompt' }]);
    assert.equal((await service.start()).bestUrl, status.bestUrl);
  } finally { service.stop(); }
});

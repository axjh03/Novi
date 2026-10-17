import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateQRCodeSVG } from '../src/main/services/qrCode';
import { RemoteCompanionService } from '../src/main/services/remoteCompanion';
import type { AddressInfo } from 'node:net';

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

test('companion binds loopback for Anywhere, rotates its token and sends no CORS headers', async () => {
  const service = new RemoteCompanionService({ getState: () => ({ transparent: false, clickThrough: false }) } as any, () => null);
  const tunnel = {
    active: false, fail: false,
    isActive() { return this.active; },
    getUrl() { return this.active ? 'https://phone.trycloudflare.com' : null; },
    async start() { if (this.fail) throw new Error('Cloudflare Quick Tunnel timed out.'); this.active = true; return this.getUrl()!; },
    stop() { this.active = false; },
  };
  (service as any).tunnel = tunnel;
  const tokenOf = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
  const bound = () => ((service as any).server.address() as AddressInfo).address;
  const status = (port: number, token: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}/api/status`, { ...init, headers: { Authorization: `Bearer ${token}` } });
  try {
    const first = await service.start(0);
    assert.equal(bound(), '0.0.0.0', 'Same Wi-Fi listens on the network');
    const ok = await status(first.port, tokenOf(first.bestUrl));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(`http://127.0.0.1:${first.port}/api/status`, { method: 'OPTIONS' })).status, 401);
    assert.equal((await status(first.port, '0'.repeat(48))).status, 401, 'right length, wrong token');

    service.stop();
    const second = await service.start(0);
    assert.notEqual(tokenOf(second.bestUrl), tokenOf(first.bestUrl));
    assert.equal((await status(second.port, tokenOf(first.bestUrl))).status, 401, 'an old link stops working');

    const anywhere = await service.toggleTunnel(true);
    assert.equal(bound(), '127.0.0.1', 'Anywhere listens only for cloudflared on this computer');
    assert.ok(anywhere.bestUrl.startsWith('https://phone.trycloudflare.com/#token='));
    assert.notEqual(tokenOf(anywhere.bestUrl), tokenOf(second.bestUrl));
    assert.equal((await status(anywhere.port, tokenOf(anywhere.bestUrl))).status, 200);
    assert.equal((await service.start()).bestUrl, anywhere.bestUrl, 'reopening the companion keeps the link');

    const wifi = await service.toggleTunnel(false);
    assert.equal(bound(), '0.0.0.0');
    assert.notEqual(tokenOf(wifi.bestUrl), tokenOf(anywhere.bestUrl));

    tunnel.fail = true;
    await assert.rejects(service.toggleTunnel(true), /timed out/);
    assert.equal(bound(), '0.0.0.0', 'a failed tunnel leaves Same Wi-Fi working');
    assert.equal(service.getStatus().tunnelLoading, false);

    tunnel.fail = false;
    await service.toggleTunnel(true);
    tunnel.active = false; // cloudflared exited on its own
    await service.start();
    assert.equal(bound(), '0.0.0.0', 'reopening after the tunnel exits returns to Same Wi-Fi');
  } finally { service.stop(); }
  assert.equal(service.getStatus().running, false);
});

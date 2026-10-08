import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateQRCodeSVG } from '../src/main/services/qrCode';
import { RemoteCompanionService } from '../src/main/services/remoteCompanion';

test('generateQRCodeSVG produces valid SVG markup', () => {
  const url = 'http://192.168.1.50:4890?pin=1234';
  const svg = generateQRCodeSVG(url, { size: 240, margin: 2, darkColor: '#00e5a3', lightColor: '#121316' });

  assert.ok(svg.startsWith('<svg'), 'Should start with svg tag');
  assert.ok(svg.includes('width="240"'), 'Should contain width attribute');
  assert.ok(svg.includes('height="240"'), 'Should contain height attribute');
  assert.ok(svg.includes('<rect'), 'Should contain rect elements');
  assert.ok(svg.endsWith('</svg>'), 'Should end with closing svg tag');
});

test('RemoteCompanionService starts with 4-digit PIN and handles mobile controller requests', async () => {
  const mockStealth: any = {
    getState: () => ({ transparent: false, clickThrough: false }),
    toggleTransparent: () => ({ transparent: true, clickThrough: false }),
    toggleClickThrough: () => ({ transparent: false, clickThrough: true }),
  };
  const mockGetWindow: any = () => null;

  const service = new RemoteCompanionService(mockStealth, mockGetWindow);
  const status = await service.start(4990);

  try {
    assert.equal(status.running, true);
    assert.equal(status.pin.length, 4, 'PIN must be exactly 4 digits');
    assert.ok(/^\d{4}$/.test(status.pin), 'PIN must be numeric');
    assert.ok(status.bestUrl.includes(status.pin), 'Best URL must include 4-digit PIN');
    assert.ok(status.qrSvg.startsWith('<svg'), 'QR SVG must be rendered');

    // 1. Fetch mobile controller HTML
    const html = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${status.port}/`, (res) => {
        assert.equal(res.statusCode, 200);
        assert.ok(res.headers['content-type']?.includes('text/html'));
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
    assert.ok(html.includes('Astra Companion'));
    assert.ok(html.includes('ONE-CLICK SEND'));
    assert.ok(html.includes('touchmove'));

    // 2. Test status endpoint without PIN -> 401
    const unauthStatus = await new Promise<number>((resolve, reject) => {
      http.get(`http://127.0.0.1:${status.port}/api/status`, (res) => {
        resolve(res.statusCode || 0);
      }).on('error', reject);
    });
    assert.equal(unauthStatus, 401);

    // 3. Test status endpoint with correct PIN -> 200
    const authStatus = await new Promise<any>((resolve, reject) => {
      http.get(`http://127.0.0.1:${status.port}/api/status?pin=${status.pin}`, (res) => {
        assert.equal(res.statusCode, 200);
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    assert.equal(authStatus.ok, true);

    // 4. Test PIN regeneration
    const oldPin = status.pin;
    const newPin = service.regeneratePIN();
    assert.equal(newPin.length, 4);
    assert.equal(service.getStatus().pin, newPin);
  } finally {
    service.stop();
  }
});

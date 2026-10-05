import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron, type ElectronApplication } from 'playwright';

// Exercise the real desktop with temporary source files and a local provider fixture.
async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'novi-desktop-test-'));
  const source = join(directory, 'references');
  mkdirSync(source);
  writeFileSync(join(source, 'brief.txt'), 'SESSION_SOURCE: Project Cedar uses blue buttons.');
  const imagePath = join(directory, 'sample.png');
  writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=', 'base64'));
  const requests: Array<{ messages: Array<{ content: unknown }>; model: string }> = [];
  let rejectPing = false, pings = 0, confirmedAt = 0, contextSentAt = 0;
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith('/api/control/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      const address = server.address();
      assert(address && typeof address !== 'string');
      const data = request.url.endsWith('/login') ? { token: 'test-session-token' } : request.url.endsWith('/logout') ? {} : {
        user: { id: 'managed-smoke-account', username: 'desktop.test', name: 'Aalok' },
        license: { key: 'TEST-TEST-TEST-TEST', expiresAt: '2099-01-01T00:00:00.000Z' },
        credentials: [{ id: 'managed-key', name: 'Local test', ownerName: 'Test owner', provider: 'compatible', baseUrl: `http://127.0.0.1:${address.port}/v1`, model: '', stream: true, apiKey: 'fixture-key' }],
      };
      response.end(JSON.stringify({ data })); return;
    }
    if (request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'test-model' }] }));
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    if (payload.messages?.[0]?.content === 'Connection check. Reply only OK.') {
      pings++;
      assert.equal(payload.model, 'test-model');
      assert.equal(payload.messages.length, 1);
      if (rejectPing) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: {} })); return;
      }
      confirmedAt = Date.now();
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
      return;
    }
    if (!requests.length) contextSentAt = Date.now();
    requests.push(payload);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const content = requests.length === 1 ? 'Understood the loaded context. Cedar uses blue buttons.' : 'Your button should be blue.';
    response.end('data: ' + JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'ELECTRON_RENDERER_URL') env[key] = value;
  env.NOVI_DATA_DIR = join(directory, 'data');
  env.NOVI_ACCESS_URL = 'http://127.0.0.1:' + address.port;
  let app: ElectronApplication | undefined;
  const launch = () => electron.launch({ args: [resolve('out/main/main.js'), '--disable-gpu'], env, timeout: 15000 });
  try {
    app = await launch();
    let page = await app.firstWindow();
    assert.equal(await page.getByRole('button', { name: 'Create account', exact: true }).count(), 0);
    await page.getByLabel('Username', { exact: true }).fill('desktop.test');
    await page.getByLabel('Password', { exact: true }).fill('novi-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Give Novi the background.' }).waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'API management', exact: true }).click();
    await page.getByText('Shared by Test owner · Key hidden').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add provider' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Edit Local test' }).count(), 0);
    assert(!JSON.stringify(await page.evaluate(() => window.novi.session())).includes('fixture-key'));
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByLabel('Choose model', { exact: true }).selectOption('test-model');
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'test-model');
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog;
    }, source);
    await page.getByRole('button', { name: 'Load context', exact: true }).click();
    await page.getByLabel('Session purpose (required)').fill('Review the Cedar interface.');
    await page.getByLabel('Custom field 1 instructions').fill('Keep the answer concise.');
    rejectPing = true;
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your API key was rejected' }).waitFor();
    assert.equal(requests.length, 0, 'failed ping sends no context');
    assert.equal(await page.getByRole('button', { name: 'Cancel start' }).count(), 0);
    rejectPing = false;
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByText('Connection confirmed. Starting session in 5 seconds.', { exact: true }).waitFor();
    assert.equal(requests.length, 0, 'context waits for the countdown');
    await page.getByRole('button', { name: 'Cancel start', exact: true }).click();
    await new Promise(resolve => setTimeout(resolve, 5200));
    assert.equal(requests.length, 0, 'cancelling prevents the session from starting');
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    for (const seconds of [5, 4, 3, 2, 1]) await page.getByText(`Connection confirmed. Starting session in ${seconds} seconds.`, { exact: true }).waitFor();
    await page.getByText('Understood the loaded context. Cedar uses blue buttons.', { exact: true }).waitFor();
    assert.equal(pings, 3);
    assert(contextSentAt - confirmedAt >= 5000, 'waits at least five seconds after confirmation');
    assert.equal(requests.length, 1);
    assert.match(JSON.stringify(requests[0]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[0]), /Keep the answer concise/);
    const summary = join(env.NOVI_DATA_DIR, 'context-session', 'AI Context.md');
    assert(existsSync(summary));
    assert(!readFileSync(join(env.NOVI_DATA_DIR, 'data.json'), 'utf8').includes('SESSION_SOURCE'));
    const isolation = await page.evaluate(() => ({ node: 'require' in window, process: 'process' in window }));
    assert.deepEqual(isolation, { node: false, process: false });
    await app.evaluate(({ dialog }, imagePath) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [imagePath] })) as typeof dialog.showOpenDialog;
    }, imagePath);
    await page.getByRole('button', { name: 'New conversation' }).click();
    await page.getByRole('button', { name: 'Add attachment' }).click();
    await page.getByRole('button', { name: /Attach image/ }).click();
    await page.getByRole('button', { name: 'Remove sample.png' }).waitFor();
    await page.getByLabel('Message Novi').fill('What color should this button be?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Your button should be blue.', { exact: true }).waitFor();
    assert.match(JSON.stringify(requests[1]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[1]), /data:image\/png;base64/);
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('button', { name: 'End & delete session', exact: true }).click();
    await page.getByRole('heading', { name: 'Give Novi the background.' }).waitFor();
    assert(!existsSync(summary));
    assert.equal(readdirSync(join(env.NOVI_DATA_DIR, 'images')).length, 0);
    assert.match(readFileSync(join(source, 'brief.txt'), 'utf8'), /SESSION_SOURCE/);
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    console.log('Desktop smoke passed: model discovery and selection, rejected ping, countdown cancellation, five-second countdown, context session, image chat, session deletion, restart.');
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Only the unique test directory created above is removed.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

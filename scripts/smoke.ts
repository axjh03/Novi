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
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    assert.equal(await page.locator('.global-error').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Transparency' }).count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Conversation mode' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Create account', exact: true }).count(), 0);
    await page.getByLabel('Username', { exact: true }).fill('desktop.test');
    await page.getByLabel('Password', { exact: true }).fill('novi-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Temporary session' }).waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'API Management', exact: true }).click();
    await page.getByText('Shared by Test owner · Key hidden').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Selected', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Add provider' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Edit Local test' }).count(), 0);
    assert(!JSON.stringify(await page.evaluate(() => window.novi.session())).includes('fixture-key'));
    await page.getByRole('button', { name: 'Audio & Camera', exact: true }).click();
    await page.getByRole('heading', { name: 'Microphone sound test' }).waitFor();
    assert.equal(await page.locator('.device-tests .settings-section').count(), 4);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByLabel('Choose model', { exact: true }).selectOption('test-model');
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'test-model');
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog;
    }, source);
    await page.getByRole('button', { name: 'Sources' }).click();
    await page.getByRole('button', { name: 'Choose folders' }).click();
    await page.getByRole('button', { name: 'Instructions' }).click();
    await page.getByLabel('Purpose').fill('Review the Cedar interface.');
    for (const label of ['Software Engineer', 'Data Analyst', 'Data Scientist', 'Data Engineer']) {
      await page.getByLabel('Role', { exact: true }).selectOption({ label });
      assert.equal(await page.getByRole('group', { name: `${label} presets`, exact: true }).getByRole('button').count(), 4);
    }
    await page.getByLabel('Role', { exact: true }).selectOption({ label: 'Software Engineer' });
    await page.getByRole('button', { name: /Coding interview Approach/ }).click();
    await page.getByRole('button', { name: 'Apply preset', exact: true }).click();
    assert.match(await page.getByLabel('Output format details').inputValue(), /time and space complexity/);
    await page.getByLabel('Constraints details').fill('CUSTOM_CONSTRAINT: Explain jargon in plain English.');
    await page.getByLabel('Role', { exact: true }).selectOption({ label: 'Data Analyst' });
    assert.equal(await page.getByLabel('Constraints details').inputValue(), 'CUSTOM_CONSTRAINT: Explain jargon in plain English.', 'browsing presets preserves edits');
    assert.equal(await page.getByLabel('Purpose').inputValue(), 'Review the Cedar interface.');
    await page.getByLabel('Role / perspective details').fill('Keep the answer concise.');
    rejectPing = true;
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your API key was rejected' }).waitFor();
    assert.equal(requests.length, 0, 'failed ping sends no context');
    rejectPing = false;
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByText('Understood the loaded context. Cedar uses blue buttons.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Expand sidebar' }).count(), 1);
    assert.equal(await page.getByRole('navigation', { name: 'Conversation mode' }).getByRole('button').count(), 3);
    assert.equal(await page.getByRole('button', { name: 'Whiteboard' }).count(), 0);
    const viewerEvent = app.waitForEvent('window');
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    const viewer = await viewerEvent;
    await viewer.getByRole('region', { name: 'Code viewer' }).waitFor();
    assert.equal(await viewer.locator('textarea').count(), 0);
    await viewer.getByRole('button', { name: 'Close code viewer' }).click();
    assert.equal(await page.getByRole('button', { name: 'Transparency' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Camera', exact: true }).count(), 0);
    await page.getByLabel('Recording output').selectOption('live_stream');
    assert.equal(await page.getByLabel('Recording output').inputValue(), 'live_stream');
    assert.equal(pings, 2);
    assert(contextSentAt >= confirmedAt, 'context follows a successful connection check');
    assert.equal(requests.length, 1);
    assert.match(JSON.stringify(requests[0]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[0]), /Keep the answer concise/);
    assert.match(JSON.stringify(requests[0]), /CUSTOM_CONSTRAINT/);
    assert.match(JSON.stringify(requests[0]), /time and space complexity/);
    const summary = join(env.NOVI_DATA_DIR, 'context-session', 'AI Context.md');
    assert(existsSync(summary));
    assert(!readFileSync(join(env.NOVI_DATA_DIR, 'data.json'), 'utf8').includes('SESSION_SOURCE'));
    const isolation = await page.evaluate(() => ({ node: 'require' in window, process: 'process' in window }));
    assert.deepEqual(isolation, { node: false, process: false });
    await app.evaluate(({ dialog }, imagePath) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [imagePath] })) as typeof dialog.showOpenDialog;
    }, imagePath);
    await page.getByRole('button', { name: 'New conversation' }).click();
    await page.getByRole('button', { name: /Attach image/ }).click();
    await page.getByRole('button', { name: 'Remove sample.png' }).waitFor();
    await page.getByLabel('Message Novi').fill('What color should this button be?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Your button should be blue.', { exact: true }).waitFor();
    assert.match(JSON.stringify(requests[1]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[1]), /CUSTOM_CONSTRAINT/);
    assert.match(JSON.stringify(requests[1]), /data:image\/png;base64/);
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'End context session' }).getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('heading', { name: 'Temporary session' }).waitFor();
    assert(!existsSync(summary));
    assert.equal(readdirSync(join(env.NOVI_DATA_DIR, 'images')).length, 1);
    assert.match(readFileSync(join(env.NOVI_DATA_DIR, 'data.json'), 'utf8'), /What color should this button be\?/);
    assert.match(readFileSync(join(source, 'brief.txt'), 'utf8'), /SESSION_SOURCE/);
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    assert.equal(await page.locator('.global-error').count(), 0);
    console.log('Desktop smoke passed: session setup, model check, detached code viewer, saved context chat, restart.');
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Only the unique test directory created above is removed.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

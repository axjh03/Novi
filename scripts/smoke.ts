import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'test-model' }] }));
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
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
  let app: ElectronApplication | undefined;
  const launch = () => electron.launch({ args: [resolve('out/main/main.js'), '--disable-gpu'], env, timeout: 15000 });
  try {
    app = await launch();
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Aalok');
    await page.getByLabel('Email', { exact: true }).fill('aalok@example.com');
    await page.getByLabel('Password', { exact: true }).fill('novi-test-password');
    await page.getByLabel('Confirm password').fill('novi-test-password');
    await page.getByRole('button', { name: 'Create account', exact: true }).last().click();
    await page.getByRole('heading', { name: 'Welcome to Novi.' }).waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Choose provider').selectOption('compatible');
    await page.getByLabel('Connection name').fill('Local test');
    await page.getByLabel('API base URL').fill('http://127.0.0.1:' + address.port + '/v1');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Model ID').fill('test-model');
    await page.getByRole('button', { name: 'Start a conversation' }).click();
    await page.getByRole('heading', { name: 'Give Novi the background.' }).waitFor();
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog;
    }, source);
    await page.getByRole('button', { name: 'Load context', exact: true }).click();
    await page.getByLabel('Session purpose (required)').fill('Review the Cedar interface.');
    await page.getByLabel('Custom field 1 instructions').fill('Keep the answer concise.');
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByText('Understood the loaded context. Cedar uses blue buttons.', { exact: true }).waitFor();
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
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Give Novi the background.' }).waitFor();
    console.log('Desktop smoke passed: authentication, Context gate, folder loading, first AI confirmation, temporary summary, inherited context, image chat, session deletion, restart.');
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Only the unique test directory created above is removed.
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

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
  let rejectPing = false, pings = 0, confirmedAt = 0, contextSentAt = 0, diagramRequests = 0;
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
    const drawing = JSON.stringify(payload.messages.at(-1)).includes('Draw or update the system design diagram');
    if (drawing) diagramRequests++;
    const content = drawing ? diagramRequests > 1 ? 'No diagram changes needed' : '# Architecture\n```mermaid\nflowchart LR\nClient --> API\nAPI --> Database\n```' : requests.length === 1 ? 'Understood the loaded context. Cedar uses blue buttons.' : 'Your button should be blue.';
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
  // During a session the input controls live in the floating tray, a separate about:blank window.
  const trayPage = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const tray = app?.windows().find((window) => window.url() === 'about:blank' && !window.isClosed());
      if (tray) { await tray.getByLabel('Message Novi').waitFor(); return tray; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('The session tray did not open.');
  };
  const trayCount = () => app!.windows().filter((window) => window.url() === 'about:blank' && !window.isClosed()).length;
  const windowAt = (hash: string) => app!.waitForEvent('window', { predicate: (window) => window.url().includes(hash) });
  try {
    app = await launch();
    let page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Phone companion' }).count(), 0);
    for (const close of ['Close', 'Close phone companion', 'Escape', 'backdrop']) {
      await page.getByRole('button', { name: 'Phone Remote', exact: true }).click();
      const companion = page.getByRole('dialog', { name: 'Phone companion' });
      await companion.waitFor();
      if (close === 'Escape') await page.keyboard.press('Escape');
      else if (close === 'backdrop') await page.mouse.click(5, 100);
      else await companion.getByRole('button', { name: close, exact: true }).click();
      await companion.waitFor({ state: 'detached' });
    }

    assert.equal(await page.locator('.global-error').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Transparency' }).count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Conversation mode' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Create account', exact: true }).count(), 0);
    await page.getByLabel('Username', { exact: true }).fill('desktop.test');
    await page.getByLabel('Password', { exact: true }).fill('novi-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
    await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Phone companion' }).count(), 0);
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
    assert.equal(trayCount(), 0, 'no tray before a session');
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog;
    }, source);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Choose folders' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Purpose').fill('Review the Cedar interface.');
    for (const label of ['Software Engineer', 'Data Analyst', 'Data Scientist', 'Data Engineer']) {
      await page.getByLabel('Role type', { exact: true }).selectOption({ label });
      assert.equal(await page.getByRole('group', { name: `${label} presets`, exact: true }).getByRole('button').count(), 4);
    }
    await page.getByLabel('Role type', { exact: true }).selectOption({ label: 'Software Engineer' });
    // A preset applies on click: it sets the session type and fills the instructions, which can be undone.
    await page.getByRole('button', { name: /Coding interview Approach/ }).click();
    assert.equal(await page.getByRole('button', { name: /Coding interview Approach/ }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.context-mode-options').getByRole('button', { name: /^Code/ }).getAttribute('aria-pressed'), 'true');
    assert.match(await page.getByLabel('Output format details').inputValue(), /time and space complexity/);
    await page.getByLabel('Additional instructions details').fill('CUSTOM_CONSTRAINT: Explain jargon in plain English.');
    await page.getByLabel('Role type', { exact: true }).selectOption({ label: 'Data Analyst' });
    assert.equal(await page.getByLabel('Additional instructions details').inputValue(), 'CUSTOM_CONSTRAINT: Explain jargon in plain English.', 'browsing presets preserves edits');
    assert.equal(await page.getByLabel('Purpose').inputValue(), 'Review the Cedar interface.');
    await page.getByLabel('Role / perspective details').fill('Keep the answer concise.');
    rejectPing = true;
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your API key was rejected' }).waitFor();
    assert.equal(requests.length, 0, 'failed ping sends no context');
    rejectPing = false;
    const viewerEvent = windowAt('#/code-viewer');
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByText('Understood the loaded context. Cedar uses blue buttons.', { exact: true }).waitFor();
    let tray = await trayPage();
    assert.equal(await page.getByRole('dialog', { name: 'Phone companion' }).count(), 0, 'Starting a session must not open the QR dialog');
    assert.equal(await page.getByRole('button', { name: 'Expand sidebar' }).count(), 1);
    assert.equal(await tray.getByRole('navigation', { name: 'Conversation mode' }).getByRole('button').count(), 7);
    assert.equal(await page.getByRole('navigation', { name: 'Conversation mode' }).count(), 0, 'the output panel holds no input controls');
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    assert.equal(await tray.getByRole('button', { name: 'Whiteboard' }).count(), 0);
    assert.equal(await tray.getByRole('button', { name: 'Code', exact: true }).getAttribute('aria-pressed'), 'true');
    const viewer = await viewerEvent;
    await viewer.getByRole('region', { name: 'Code viewer' }).waitFor();
    assert.equal(await viewer.locator('textarea').count(), 0);
    await viewer.getByRole('button', { name: 'Close code viewer' }).click({ noWaitAfter: true }).catch(() => { /* the viewer window closes */ });
    assert.equal(await page.getByRole('button', { name: 'Transparency' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'End session', exact: true }).count(), 1, 'closing the code viewer keeps the session');
    assert.equal(await page.getByRole('button', { name: 'Camera', exact: true }).count(), 0);
    await tray.getByLabel('Audio transcription engine').selectOption('cloud');
    await tray.getByLabel('Audio input').selectOption('microphone');
    await page.getByTitle('Settings', { exact: true }).click();
    for (let attempt = 0; attempt < 50 && trayCount(); attempt++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(trayCount(), 0, 'the tray hides under Settings');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    tray = await trayPage();
    assert.equal(await tray.getByLabel('Audio transcription engine').inputValue(), 'cloud');
    assert.equal(await tray.getByLabel('Audio input').inputValue(), 'microphone');
    assert.equal(pings, 2);
    assert(contextSentAt >= confirmedAt, 'context follows a successful connection check');
    assert.equal(requests.length, 1);
    assert.match(JSON.stringify(requests[0]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[0]), /Keep the answer concise/);
    assert.match(JSON.stringify(requests[0]), /CUSTOM_CONSTRAINT/);
    assert.match(JSON.stringify(requests[0]), /time and space complexity/);
    const summary = join(env.NOVI_DATA_DIR, 'context-session', 'AI Context.md');
    assert(existsSync(summary));
    assert(readFileSync(join(env.NOVI_DATA_DIR, 'data.json'), 'utf8').includes('SESSION_SOURCE'));
    const isolation = await page.evaluate(() => ({ node: 'require' in window, process: 'process' in window }));
    assert.deepEqual(isolation, { node: false, process: false });
    await app.evaluate(({ dialog }, imagePath) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [imagePath] })) as typeof dialog.showOpenDialog;
    }, imagePath);
    await tray.getByRole('button', { name: /Attach image/ }).click();
    await tray.getByRole('button', { name: 'Remove sample.png' }).waitFor();
    await tray.getByLabel('Message Novi').fill('What color should this button be?');
    await tray.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Your button should be blue.', { exact: true }).waitFor();
    assert.match(JSON.stringify(requests[1]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[1]), /CUSTOM_CONSTRAINT/);
    assert.match(JSON.stringify(requests[1]), /data:image\/png;base64/);
    const diagramWindowEvent = windowAt('#/code-viewer');
    await tray.getByRole('button', { name: 'System Design', exact: true }).click();
    const diagramWindow = await diagramWindowEvent;
    await diagramWindow.getByRole('region', { name: 'Diagram viewer' }).waitFor();
    await tray.getByLabel('Message Novi').fill('Design a chat service with an API and database.');
    await tray.getByRole('button', { name: 'Draw / update diagram', exact: true }).click();
    await diagramWindow.locator('.mermaid-diagram svg').waitFor();
    assert.equal(await diagramWindow.locator('.diagram-viewer').evaluate(el => getComputedStyle(el).backgroundColor.startsWith('rgb(')), true);
    assert.equal(await diagramWindow.locator('.mermaid-diagram svg').count(), 1);
    assert.equal(await diagramWindow.evaluate(() => getComputedStyle(document.documentElement).backgroundColor.startsWith('rgb(')), true);
    await tray.getByRole('button', { name: 'Draw / update diagram', exact: true }).click();
    await page.getByText('No diagram changes needed', { exact: true }).waitFor();
    assert.equal(await diagramWindow.locator('.mermaid-diagram svg').count(), 1);
    await diagramWindow.getByRole('button', { name: 'Close Architecture', exact: true }).click();
    assert.equal(await diagramWindow.locator('.mermaid-diagram svg').count(), 0);
    await diagramWindow.getByRole('button', { name: 'Reopen closed diagrams' }).click();
    await diagramWindow.locator('.mermaid-diagram svg').waitFor();
    assert.equal(await diagramWindow.locator('.diagram-viewer').evaluate(el => getComputedStyle(el).backgroundColor.startsWith('rgb(')), true);
    await diagramWindow.getByRole('button', { name: 'Close diagram window' }).click({ noWaitAfter: true }).catch(() => { /* the viewer window closes */ });
    assert.equal(await tray.getByRole('button', { name: 'System Design', exact: true }).getAttribute('aria-pressed'), 'true');
    const reopenedEvent = windowAt('#/code-viewer');
    await page.getByRole('button', { name: /Open diagrams/ }).click();
    await (await reopenedEvent).locator('.mermaid-diagram svg').waitFor();
    const savedBeforeNewSession = await page.evaluate(async () => {
      const result = await window.novi.session();
      if (!result.ok) throw new Error(result.error);
      return result.value.conversations;
    });
    await page.getByRole('button', { name: 'New session', exact: true }).click();
    await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    const setupSteps = page.getByRole('navigation', { name: 'Session setup' });
    for (const name of ['Model', 'Documents', 'Instructions']) await setupSteps.getByRole('button', { name }).waitFor();
    const afterNewSession = await page.evaluate(() => window.novi.session());
    assert(afterNewSession.ok);
    assert.equal(afterNewSession.value.contextSession, null);
    assert.deepEqual(afterNewSession.value.conversations, savedBeforeNewSession);
    assert(!existsSync(summary));
    assert.equal(readdirSync(join(env.NOVI_DATA_DIR, 'images')).length, 1);
    assert.match(readFileSync(join(env.NOVI_DATA_DIR, 'data.json'), 'utf8'), /What color should this button be\?/);
    assert.match(readFileSync(join(source, 'brief.txt'), 'utf8'), /SESSION_SOURCE/);
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    assert.equal(trayCount(), 0, 'ending the session closes the tray');
    assert.equal(await page.getByRole('button', { name: 'Start an empty chat instead', exact: true }).count(), 1);
    for (const mode of ['Recruiter Call', 'Technical Phone/Video Screen', 'Behavioral Interview', 'System Design', 'Code', 'Chat']) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog; }, source);
      await page.getByRole('button', { name: 'Choose folders', exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByLabel('Purpose').fill('Review Cedar');
      await page.locator('.context-mode-options').getByRole('button', { name: new RegExp('^' + mode) }).click();
      await page.getByRole('button', { name: 'Start session', exact: true }).click();
      tray = await trayPage();
      assert.equal(await tray.getByRole('button', { name: mode, exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'End session', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'End context session' }).getByRole('button', { name: 'End session', exact: true }).click();
      await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    }
    await page.getByRole('button', { name: 'Start an empty chat instead', exact: true }).click();
    tray = await trayPage();
    assert.equal(await tray.getByRole('button', { name: 'Chat', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.message').count(), 0, 'Skipping setup opens a fresh chat, while saved chats remain available');
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'End context session' }).getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
    assert.equal(await page.locator('.global-error').count(), 0);
    console.log('Desktop smoke passed: session setup, model check, floating tray, detached code viewer, saved context chat, restart.');
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Only the unique test directory created above is removed.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

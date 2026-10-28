import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { PLAN_FEATURES } from '../src/shared/plans';

// Exercise the real desktop with temporary source files and a local provider fixture.
async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'novi-desktop-test-'));
  const source = join(directory, 'references');
  mkdirSync(source);
  writeFileSync(join(source, 'brief.txt'), 'SESSION_SOURCE: Project Cedar uses blue buttons.');
  writeFileSync(join(source, 'job-description.txt'), 'Cedar seeks a software engineer to build accessible interfaces.');
  const imagePath = join(directory, 'sample.png');
  writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64'));
  const imagePaths = [imagePath, ...Array.from({ length: 6 }, (_, i) => join(directory, `sample-${i + 2}.png`))];
  for (const path of imagePaths.slice(1)) writeFileSync(path, readFileSync(imagePath));
  const requests: Array<{ messages: Array<{ content: unknown }>; model: string }> = [];
  let rejectPing = false, rejectSetup = true, pings = 0, confirmedAt = 0, contextSentAt = 0, diagramRequests = 0;
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith('/api/control/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      const address = server.address();
      assert(address && typeof address !== 'string');
      const data = request.url.endsWith('/login') ? { token: 'test-session-token' } : request.url.endsWith('/logout') ? {} : {
        user: { id: 'managed-smoke-account', username: 'desktop.test', name: 'Aalok' },
        license: { key: 'TEST-TEST-TEST-TEST', expiresAt: '2099-01-01T00:00:00.000Z', plan: 'ULTIMATE' },
        features: PLAN_FEATURES.ULTIMATE,
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
    if (rejectSetup) {
      rejectSetup = false;
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: {} })); return;
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
  // Controls start in the chat and can move into a separate about:blank window.
  const trayPage = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const tray = app?.windows().find((window) => window.url() === 'about:blank' && !window.isClosed());
      if (tray) { await tray.getByLabel('Message Novi').waitFor(); return tray; }
      const main = await app?.firstWindow();
      if (main && await main.getByLabel('Message Novi').isVisible()) return main;
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
      await page.getByRole('button', { name: 'Open phone companion', exact: true }).click();
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
    await page.getByText('Shared by Test owner', { exact: true }).waitFor();
    await page.getByText('Keys are hidden and managed in your web account.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Deselect Local test', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Add provider' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Edit Local test' }).count(), 0);
    assert(!JSON.stringify(await page.evaluate(() => window.novi.session())).includes('fixture-key'));
    await page.getByRole('button', { name: 'Audio & Camera', exact: true }).click();
    await page.getByRole('heading', { name: 'Microphone sound test' }).waitFor();
    assert.equal(await page.locator('.device-tests .settings-section').count(), 4);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('navigation', { name: 'Session setup', exact: true }).getByRole('button', { name: /^Model/ }).click();
    await page.getByLabel('Choose model', { exact: true }).selectOption('test-model');
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'test-model');
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    assert.equal(trayCount(), 0, 'no tray before a session');
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog;
    }, source);
    await page.getByRole('navigation', { name: 'Session setup', exact: true }).getByRole('button', { name: /^Load profile/ }).click();
    await page.locator('#context-panel-sources').getByRole('button', { name: 'Load profile', exact: true }).click();
    await page.getByRole('list', { name: /classified files/ }).waitFor();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Purpose').fill('Review the Cedar interface.');
    await page.getByRole('slider', { name: /Years of experience/ }).focus();
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('slider', { name: /Years of experience/ }).getAttribute('aria-valuenow') ?? await page.getByRole('slider', { name: /Years of experience/ }).inputValue(), '15');
    await page.getByLabel('Domain', { exact: true }).selectOption('backend');
    await page.getByRole('slider', { name: /Word choice/ }).focus();
    await page.keyboard.press('Home');
    assert.equal(await page.getByRole('slider', { name: /Word choice/ }).getAttribute('aria-valuetext'), '1 of 5, Plain');
    assert.equal(await page.getByLabel('Role type', { exact: true }).count(), 0, 'old role presets are removed');
    await page.locator('.context-mode-options').getByRole('button', { name: /^Code/ }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: /^Spoken \+ pauses/ }).click();
    await page.getByText('Additional answer instructions', { exact: true }).click();
    await page.getByLabel('Output format details').fill('Include time and space complexity.');
    await page.getByLabel('Additional instructions details').fill('CUSTOM_CONSTRAINT: Explain jargon in plain English.');
    await page.getByLabel('Role / perspective details').fill('Keep the answer concise.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Profile name', { exact: true }).fill('Cedar plain');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved “Cedar plain”' }).waitFor();
    const profile = await page.evaluate(async () => {
      const result = await window.novi.session();
      if (!result.ok) throw new Error(result.error);
      return result.value.settings?.sessionProfiles?.find(profile => profile.name === 'Cedar plain');
    });
    assert.equal(profile?.vocabulary, 'plain');
    assert.equal(profile?.interview?.experienceYears, 15);
    assert.equal(profile?.interview?.domain, 'backend');
    assert.equal(profile?.interview?.answerStyle, 'spoken');
    rejectPing = true;
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your API key was rejected' }).waitFor();
    assert.equal(requests.length, 0, 'failed ping sends no context');
    rejectPing = false;
    const viewerEvent = windowAt('#/code-viewer');
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('button', { name: 'Retry session setup', exact: true }).click();
    await page.getByText('Understood the loaded context. Cedar uses blue buttons.', { exact: true }).waitFor();
    await page.getByLabel('Message Novi').waitFor();
    assert.equal(trayCount(), 0, 'controls start attached to the chat');
    const detached = windowAt('about:blank');
    await page.getByRole('button', { name: 'Detach controls', exact: true }).click();
    let tray = await detached;
    await tray.getByLabel('Message Novi').waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Phone companion' }).count(), 0, 'Starting a session must not open the QR dialog');
    assert.equal(await page.getByRole('button', { name: 'Expand sidebar' }).count(), 1);
    await tray.getByLabel('Change conversation mode', { exact: true }).click();
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
    await tray.getByLabel('Audio settings', { exact: true }).click();
    await tray.getByLabel('Audio transcription engine').selectOption('cloud');
    await tray.getByLabel('Audio input').selectOption('microphone');
    await page.getByTitle('Settings', { exact: true }).click();
    for (let attempt = 0; attempt < 50 && trayCount(); attempt++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(trayCount(), 0, 'the tray hides under Settings');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    tray = await trayPage();
    await tray.getByLabel('Audio settings', { exact: true }).click();
    assert.equal(await tray.getByLabel('Audio transcription engine').inputValue(), 'cloud');
    assert.equal(await tray.getByLabel('Audio input').inputValue(), 'microphone');
    assert.equal(pings, 2);
    assert(contextSentAt >= confirmedAt, 'context follows a successful connection check');
    assert.equal(requests.length, 1);
    assert.match(JSON.stringify(requests[0]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[0]), /Keep the answer concise/);
    assert.match(JSON.stringify(requests[0]), /CUSTOM_CONSTRAINT/);
    assert.match(JSON.stringify(requests[0]), /time and space complexity/);
    assert.match(JSON.stringify(requests[0]), /Vocabulary: Use familiar words and short sentences/);
    const summary = join(env.NOVI_DATA_DIR, 'context-session', 'AI Context.md');
    assert(existsSync(summary));
    assert(readFileSync(join(env.NOVI_DATA_DIR, 'data.json'), 'utf8').includes('SESSION_SOURCE'));
    const isolation = await page.evaluate(() => ({ node: 'require' in window, process: 'process' in window }));
    assert.deepEqual(isolation, { node: false, process: false });
    await app.evaluate(({ dialog }, imagePaths) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: imagePaths })) as typeof dialog.showOpenDialog;
    }, imagePaths);
    await tray.getByRole('button', { name: /Attach image/ }).click();
    await tray.getByRole('button', { name: 'Remove sample.png' }).waitFor();
    assert.equal(await tray.getByRole('button', { name: /^Remove sample.*\.png$/ }).count(), imagePaths.length);
    await tray.getByLabel('Message Novi').fill('What color should this button be?');
    await tray.getByRole('button', { name: 'Attach controls', exact: true }).click();
    await page.getByLabel('Message Novi').waitFor();
    assert.equal(await page.getByLabel('Message Novi').inputValue(), 'What color should this button be?');
    assert.equal(await page.getByLabel('Message Novi').evaluate(el => el.ownerDocument.activeElement === el), true, 'attaching controls restores typing focus');
    await page.getByRole('button', { name: 'Remove sample.png' }).waitFor();
    await page.getByLabel('Message Novi').evaluate(el => (el as HTMLTextAreaElement).setSelectionRange(5, 5));
    const detachedAgain = windowAt('about:blank');
    await page.getByRole('button', { name: 'Detach controls', exact: true }).click();
    tray = await detachedAgain;
    await tray.getByLabel('Message Novi').waitFor();
    assert.equal(await tray.getByLabel('Message Novi').evaluate(el => el.ownerDocument.activeElement === el), true, 'detaching controls restores typing focus');
    assert.equal(await tray.getByLabel('Message Novi').evaluate(el => (el as HTMLTextAreaElement).selectionStart), 5, 'moving controls preserves the text cursor');
    await tray.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Your button should be blue.', { exact: true }).waitFor();
    assert.match(JSON.stringify(requests[1]), /SESSION_SOURCE/);
    assert.match(JSON.stringify(requests[1]), /CUSTOM_CONSTRAINT/);
    assert.match(JSON.stringify(requests[1]), /data:image\/png;base64/);
    const sentContent = requests[1].messages.at(-1)!.content;
    assert(Array.isArray(sentContent));
    assert.equal(sentContent.filter(part => part.type === 'image_url').length, imagePaths.length, 'all seven images reach the provider');
    // Hold both listening transitions: typed questions must remain sendable while speech is busy.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('interview-start'); ipcMain.removeHandler('interview-stop');
      ipcMain.handle('interview-start', () => new Promise(resolve => {
        (globalThis as any).finishListeningStart = () => resolve({ ok: false, error: 'Simulated speech startup failure.' });
      }));
      ipcMain.handle('interview-stop', () => new Promise(resolve => {
        (globalThis as any).finishListeningStop = () => resolve({ ok: true, value: null });
        (globalThis as any).listeningStopStarted?.();
      }));
    });
    await tray.getByLabel('Audio settings', { exact: true }).click();
    await tray.getByLabel('Audio transcription engine').selectOption('local');
    await tray.keyboard.press('Escape');
    await tray.getByRole('button', { name: 'Start listening', exact: true }).click();
    await tray.getByRole('button', { name: 'Starting listening', exact: true }).waitFor();
    await tray.getByLabel('Message Novi').fill('Send while listening starts.');
    await tray.getByLabel('Message Novi').press('Enter');
    await page.getByText('Your button should be blue.', { exact: true }).nth(1).waitFor();
    assert.equal(requests.at(-1)!.messages.at(-1)!.content, 'Send while listening starts.');
    await app.evaluate(() => new Promise<void>(resolve => {
      (globalThis as any).listeningStopStarted = resolve;
      (globalThis as any).finishListeningStart();
    }));
    await tray.getByLabel('Message Novi').fill('Send while listening stops.');
    await tray.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByText('Your button should be blue.', { exact: true }).nth(2).waitFor();
    assert.equal(requests.at(-1)!.messages.at(-1)!.content, 'Send while listening stops.');
    await app.evaluate(() => (globalThis as any).finishListeningStop());
    await tray.getByRole('button', { name: 'Start listening', exact: true }).waitFor();
    const diagramWindowEvent = windowAt('#/code-viewer');
    await tray.getByLabel('Change conversation mode', { exact: true }).click();
    await tray.getByRole('button', { name: 'System Design', exact: true }).click();
    const diagramWindow = await diagramWindowEvent;
    await diagramWindow.getByRole('region', { name: 'Diagram viewer' }).waitFor();
    await tray.getByLabel('Message Novi').fill('Design a chat service with an API and database.');
    await tray.getByRole('button', { name: 'Draw / update diagram', exact: true }).click();
    await diagramWindow.locator('.mermaid-viewport svg').waitFor();
    assert.equal(await diagramWindow.locator('.diagram-viewer').evaluate(el => getComputedStyle(el).backgroundColor.startsWith('rgb(')), true);
    assert.equal(await diagramWindow.locator('.mermaid-viewport svg').count(), 1);
    assert.equal(await diagramWindow.evaluate(() => getComputedStyle(document.documentElement).backgroundColor.startsWith('rgb(')), true);
    await tray.getByRole('button', { name: 'Draw / update diagram', exact: true }).click();
    await page.getByText('No diagram changes needed', { exact: true }).waitFor();
    assert.equal(await diagramWindow.locator('.mermaid-viewport svg').count(), 1);
    await diagramWindow.getByRole('button', { name: 'Close Architecture', exact: true }).click();
    assert.equal(await diagramWindow.locator('.mermaid-viewport svg').count(), 0);
    await diagramWindow.getByRole('button', { name: 'Reopen closed diagrams' }).click();
    await diagramWindow.locator('.mermaid-viewport svg').waitFor();
    assert.equal(await diagramWindow.locator('.diagram-viewer').evaluate(el => getComputedStyle(el).backgroundColor.startsWith('rgb(')), true);
    await diagramWindow.getByRole('button', { name: 'Close diagram window' }).click({ noWaitAfter: true }).catch(() => { /* the viewer window closes */ });
    await tray.getByLabel('Change conversation mode', { exact: true }).click();
    assert.equal(await tray.getByRole('button', { name: 'System Design', exact: true }).getAttribute('aria-pressed'), 'true');
    await tray.keyboard.press('Escape');
    const reopenedEvent = windowAt('#/code-viewer');
    await page.getByRole('button', { name: /Open diagrams/ }).click();
    await (await reopenedEvent).locator('.mermaid-viewport svg').waitFor();
    const savedBeforeNewSession = await page.evaluate(async () => {
      const result = await window.novi.session();
      if (!result.ok) throw new Error(result.error);
      return result.value.conversations;
    });
    await page.getByRole('button', { name: 'New session', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'End context session' }).getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    const setupSteps = page.getByRole('navigation', { name: 'Session setup' });
    for (const name of ['Load profile', 'Instructions', 'Answer style', 'Model']) await setupSteps.getByRole('button', { name }).waitFor();
    const afterNewSession = await page.evaluate(() => window.novi.session());
    assert(afterNewSession.ok);
    assert.equal(afterNewSession.value.contextSession, null);
    assert.deepEqual(afterNewSession.value.conversations, savedBeforeNewSession);
    assert(!existsSync(summary));
    assert.equal(readdirSync(join(env.NOVI_DATA_DIR, 'images')).length, imagePaths.length);
    assert.match(readFileSync(join(env.NOVI_DATA_DIR, 'data.json'), 'utf8'), /What color should this button be\?/);
    assert.match(readFileSync(join(source, 'brief.txt'), 'utf8'), /SESSION_SOURCE/);
    assert.equal(await page.getByLabel('Message Novi').count(), 0);
    assert.equal(trayCount(), 0, 'ending the session closes the tray');
    assert.equal(await page.getByRole('button', { name: 'Start an empty chat instead', exact: true }).count(), 0, 'empty chat stays under the final model step');
    await page.getByRole('button', { name: 'Edit Cedar plain', exact: true }).click();
    assert.equal(await page.getByRole('slider', { name: /Word choice/ }).getAttribute('aria-valuetext'), '1 of 5, Plain', 'saved profiles restore vocabulary');
    for (const mode of ['Recruiter Call', 'Technical Phone/Video Screen', 'Behavioral Interview', 'System Design', 'Code', 'Chat']) {
      await page.getByRole('navigation', { name: 'Session setup', exact: true }).getByRole('button', { name: /^Load profile/ }).click();
      await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [source] })) as typeof dialog.showOpenDialog; }, source);
      await page.locator('#context-panel-sources').getByRole('button', { name: /^(Load profile|Replace profile folder)$/ }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByLabel('Purpose').fill('Review Cedar');
      await page.locator('.context-mode-options').getByRole('button', { name: new RegExp('^' + mode) }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Start session', exact: true }).click();
      tray = await trayPage();
      await tray.getByLabel('Change conversation mode', { exact: true }).click();
    assert.equal(await tray.getByRole('button', { name: mode, exact: true }).getAttribute('aria-pressed'), 'true');
    await tray.keyboard.press('Escape');
      await page.getByRole('button', { name: 'End session', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'End context session' }).getByRole('button', { name: 'End session', exact: true }).click();
      await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    }
    await page.getByRole('navigation', { name: 'Session setup', exact: true }).getByRole('button', { name: /^Model/ }).click();
    await page.getByText('Start without interview setup', { exact: true }).click();
    await page.getByRole('button', { name: 'Start an empty chat instead', exact: true }).click();
    tray = await trayPage();
    await tray.getByLabel('Change conversation mode', { exact: true }).click();
    assert.equal(await tray.getByRole('button', { name: 'Chat', exact: true }).getAttribute('aria-pressed'), 'true');
    await tray.keyboard.press('Escape');
    assert.equal(await page.locator('.message').count(), 0, 'Skipping setup opens a fresh chat, while saved chats remain available');
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'End context session' }).getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 0, 'Sign out is in Settings, not beside it');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
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

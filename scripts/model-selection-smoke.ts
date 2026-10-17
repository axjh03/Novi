import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import type { NoviAPI, Snapshot } from '../src/shared/types';

// Run after npm run build. Uses the installed Edge browser and a mocked IPC boundary.
async function main() {
  const browser = await chromium.launch({ ...(process.env.NOVI_BROWSER_PATH ? { executablePath: process.env.NOVI_BROWSER_PATH } : { channel: 'msedge' }), headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(error.message));
    await page.route('http://novi.test/**', route => {
      const root = resolve('out/renderer');
      const file = resolve(root, '.' + new URL(route.request().url()).pathname);
      assert(file.startsWith(root + sep));
      return route.fulfill({ body: readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(() => {
      (window as any).__name = (value: unknown) => value;
      const ok = <T,>(value: T) => ({ ok: true as const, value });
      const state: Snapshot = {
        user: { id: 'user', name: 'Test user', email: 'test', managed: true }, credentialIds: ['key'], conversations: [],
        settings: { displayName: 'Test user', theme: 'light', clickThroughShortcut: 'Alt+Shift+I', onboardingComplete: true, activeConnectionId: 'key', connections: [
          { id: 'key', name: 'Google key', provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini3.8', stream: true, managed: true, ownerName: 'Owner' },
        ] },
      };
      const fixture = { reject: true, discoveryFails: false, starts: 0, confirmed: 0, started: 0 };
      Object.assign(window, { fixture });
      window.novi = {
        session: async () => ok(structuredClone(state)),
        checkPermissions: async () => ok({ storage: true, camera: false, microphone: false, screen: false, accessibility: false }),
        localAISetup: async () => ok({ models: [], selectedASR: 'auto' }),
        getCodeViewerBlocks: async () => ok([{ id: 'long', label: 'Long code', language: 'typescript', code: 'const value = 1;\n'.repeat(300) }]),
        onCodeViewerBlocks: () => () => {}, onReviewTarget: () => () => {}, getReviewTarget: async () => ok(null),
        onSessionEnded: () => () => {}, onAccessStatus: () => () => {}, onStealthState: () => () => {},
        onGlobalAction: () => () => {}, onCodeViewerClosed: () => () => {},
        setCodeViewerVisible: async () => ok(undefined),
        getMonitors: async () => ok([]), getWorkingMonitor: async () => ok({ workingMonitorId: null }),
        getStealthState: async () => ok({ transparent: false, numLock: false, clickThrough: false, clickThroughShortcut: 'Alt+Shift+I' }),
        isWindowMaximized: async () => ok(false),
        listModels: async () => fixture.discoveryFails ? { ok: false, error: 'Cannot load models. Try again.' } : ok([{ id: 'gemini-chat', name: 'Gemini Chat' }]),
        selectConnection: async (id: string, model?: string) => { state.settings!.activeConnectionId = id; if (model) state.settings!.connections[0].model = model; return ok(structuredClone(state)); },
        pickContextFolders: async () => ok([{ id: 'folder', name: 'Reference', files: ['test.txt'], characters: 20 }]),
        testConnection: async () => { if (fixture.reject) return { ok: false, error: 'Your API key was rejected.' }; fixture.confirmed = Date.now(); return ok(undefined); },
        startContext: async () => { fixture.starts++; fixture.started = Date.now(); return { ok: false, error: 'TEST_SESSION_STARTED' }; },
      } as unknown as NoviAPI;
    });
    await page.goto('http://novi.test/index.html');
    await page.getByRole('heading', { name: 'Get ready' }).waitFor();
    assert(await page.getByRole('button', { name: 'Continue to session setup' }).isDisabled());
    await page.evaluate(() => { Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => { throw new Error('Microphone permission denied'); } }, configurable: true }); });
    await page.getByRole('button', { name: 'Check microphone', exact: true }).click();
    await page.getByText('Microphone: Microphone permission denied', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Continue to session setup' }).isDisabled());
    await page.getByLabel(/^Continue with missing or untested features/).check();
    await page.getByRole('button', { name: 'Continue to session setup' }).click();
    await page.getByText('The previous model is unavailable. Choose a model from the list.').waitFor();
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('option', { name: 'gemini3.8', exact: true }).count(), 0);
    assert(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: 'Instructions', exact: true }).isDisabled());
    assert.equal(await page.locator('#context-panel-brief').isVisible(), false, 'later steps stay hidden until reached');
    assert.equal(await page.getByRole('button', { name: 'Start session', exact: true }).count(), 0);
    await page.getByLabel('Choose model', { exact: true }).selectOption('gemini-chat');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert(!(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled()), 'documents are optional');
    await page.getByRole('button', { name: 'Choose folders', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Start session', exact: true }).isDisabled());
    await page.getByLabel('Purpose').fill('Review the reference');
    assert(await page.getByRole('button', { name: 'Start session', exact: true }).isDisabled());
    await page.getByRole('button', { name: /^Chat General questions/ }).click();
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your API key was rejected.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cancel start' }).count(), 0);
    await page.evaluate(() => { (window as any).fixture.reject = false; });
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'TEST_SESSION_STARTED' }).waitFor();
    const result = await page.evaluate(() => (window as any).fixture);
    assert.equal(result.starts, 1);
    assert(result.started >= result.confirmed);
    await page.getByRole('button', { name: /^Model( Complete)?$/ }).click();
    await page.evaluate(() => { (window as any).fixture.discoveryFails = true; });
    await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
    await page.getByText('Cannot load models. Try again.', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled());
    await page.evaluate(() => { (window as any).fixture.discoveryFails = false; });
    await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
    await page.waitForFunction(() => !(document.querySelector('select[aria-label="Choose model"]') as HTMLSelectElement).disabled);
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'gemini-chat');
    console.log('Model UI passed: invalid legacy model, live dropdown, failed ping, immediate startup, discovery failure and retry.');
    await page.goto('http://novi.test/index.html#/code-viewer');
    await page.reload();
    const scroll = page.getByRole('region', { name: 'Scrollable code' });
    await scroll.waitFor();
    await page.waitForFunction(() => { const el = document.querySelector('.code-viewer-scroll')!; return el.scrollHeight > el.clientHeight; });
    await scroll.hover();
    await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => document.querySelector('.code-viewer-scroll')!.scrollTop > 0);
    await scroll.focus();
    await page.keyboard.press('Control+End');
    await page.waitForFunction(() => { const el = document.querySelector('.code-viewer-scroll')!; return el.scrollTop > 500; });
    console.log('Preflight denial/acknowledgement and code viewer mouse/keyboard scrolling passed.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

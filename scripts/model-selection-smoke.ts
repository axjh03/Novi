import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import type { NoviAPI, Snapshot } from '../src/shared/types';
import { DEFAULT_INTERVIEW_PROFILE, type ProfileResearchInput } from '../src/shared/interviewProfile';

// Run after npm run build. Uses the installed Edge browser and a mocked IPC boundary.
async function main() {
  const browser = await chromium.launch({ ...(process.env.NOVI_BROWSER_PATH ? { executablePath: process.env.NOVI_BROWSER_PATH } : { channel: 'msedge' }), headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(error.message));
    // The page runs under the packaged app's Content Security Policy (src/renderer/index.html), which no
    // longer allows 'unsafe-eval'; anything it blocks shows up as a console message and fails the smoke.
    const blocked: string[] = [];
    page.on('console', message => { if (/Content Security Policy/i.test(message.text())) blocked.push(message.text()); });
    await page.route('http://novi.test/**', route => {
      const root = resolve('out/renderer');
      const file = resolve(root, '.' + new URL(route.request().url()).pathname);
      assert(file.startsWith(root + sep));
      return route.fulfill({ body: readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(defaultInterview => {
      (window as any).__name = (value: unknown) => value;
      const ok = <T,>(value: T) => ({ ok: true as const, value });
      const state: Snapshot = {
        user: { id: 'user', name: 'Test user', email: 'test', managed: true }, credentialIds: ['key'], conversations: [],
        settings: { displayName: 'Test user', theme: 'light', clickThroughShortcut: 'Alt+Shift+I', checkUpdatesAtStartup: false, onboardingComplete: true, activeConnectionId: 'key', sessionProfiles: [{ id: 'saved', name: 'Saved interview', updatedAt: 1, connectionId: 'key', model: 'gemini-3.1-pro-preview', mode: 'normal', framework: 'smart', company: 'Acme', role: 'Developer', purpose: 'Review saved interview', vocabulary: 'everyday', interview: { ...defaultInterview, jobDescriptionText: 'Saved job description' }, fields: Array.from({ length: 4 }, () => ({ label: '', value: '' })), folders: [] }], connections: [
          { id: 'key', name: 'Google key', provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini3.8', stream: true, managed: true, ownerName: 'Owner' },
        ] },
      };
      const fixture = { reject: true, modelNotFound: false, discoveryFails: false, starts: 0, confirmed: 0, started: 0, research: [] as string[], startedModel: '' };
      Object.assign(window, { fixture });
      window.novi = {
        session: async () => ok(structuredClone(state)),
        checkPermissions: async () => ok({ storage: true, camera: false, microphone: false, screen: false, accessibility: false }),
        localAISetup: async () => ok({ models: [], selectedASR: 'auto' }),
        getCodeViewerBlocks: async () => ok([{ id: 'long', label: 'Long code', language: 'typescript', code: 'const value = 1;\n'.repeat(300) }]),
        onCodeViewerBlocks: () => () => {}, onReviewTarget: () => () => {}, getReviewTarget: async () => ok(null),
        onSessionEnded: () => () => {}, onAccessStatus: () => () => {}, onPlanChanged: () => () => {}, onStealthState: () => () => {},
        onGlobalAction: () => () => {}, onCodeViewerClosed: () => () => {},
        setCodeViewerVisible: async () => ok(undefined),
        getMonitors: async () => ok([]), getWorkingMonitor: async () => ok({ workingMonitorId: null }),
        getStealthState: async () => ok({ transparent: false, numLock: false, clickThrough: false, clickThroughShortcut: 'Alt+Shift+I' }),
        isWindowMaximized: async () => ok(false),
        listModels: async () => fixture.discoveryFails ? { ok: false, error: 'Cannot load models. Try again.' } : ok([{ id: 'gemini-chat', name: 'Gemini Chat' }, { id: 'gemini-other', name: 'Gemini Other' }]),
        selectConnection: async (id: string, model?: string) => { state.settings!.activeConnectionId = id; if (model) state.settings!.connections[0].model = model; return ok(structuredClone(state)); },
        pickContextFolders: async () => ok([{ id: 'folder', name: 'Reference', files: ['job-description.txt'], characters: 20 }]),
        loadSessionProfileFolders: async () => ok([]),
        saveSettings: async (input: Parameters<NoviAPI['saveSettings']>[0]) => { Object.assign(state.settings!, input); return ok(structuredClone(state)); },
        testInternet: async () => ok('25 ms response · 20.0 Mbps sample download'),
        researchProfile: async (input: ProfileResearchInput) => {
          fixture.research.push(input.jobDescriptionText);
          await new Promise(resolve => setTimeout(resolve, input.jobDescriptionText.includes('Slow') ? 2000 : 400));
          return ok({ company: input.jobDescriptionText.includes('NewCo') ? 'NewCo' : 'Acme', role: 'Backend developer', domain: 'backend', vocabulary: 'technical', experienceYears: 5, companyUrl: '', companyValues: 'Customer care', summary: 'Company overview\nAcme builds developer tools.\n\nRole\nBuild Java services.', jobDescriptionText: input.jobDescriptionText, sources: [], warnings: [] });
        },
        testConnection: async () => {
          if (fixture.reject) return { ok: false, error: 'Your API key was rejected.' };
          if (fixture.modelNotFound && state.settings!.connections[0].model === 'gemini-chat') return { ok: false, error: 'Google (Gemini) model request failed (HTTP 404): Google could not find or serve the selected Gemini model.' };
          fixture.confirmed = Date.now(); return ok(undefined);
        },
        startContext: async () => { fixture.starts++; fixture.started = Date.now(); fixture.startedModel = state.settings!.connections[0].model; return { ok: false, error: 'TEST_SESSION_STARTED' }; },
      } as unknown as NoviAPI;
    }, DEFAULT_INTERVIEW_PROFILE);
    await page.goto('http://novi.test/index.html');
    await page.getByRole('heading', { name: 'System Check' }).waitFor();
    // Nothing has passed yet: the way forward stays reachable and names what is missing.
    assert.equal(await page.getByRole('button', { name: 'Continue to session setup' }).count(), 0);
    await page.waitForFunction(() => Boolean(document.querySelector('.preflight-actions .primary:not(:disabled)')));
    assert(await page.getByRole('button', { name: 'Continue anyway', exact: true }).isEnabled());
    await page.getByRole('status').filter({ hasText: /\d+ not checked/ }).first().waitFor();
    await page.evaluate(() => { Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => { throw new DOMException('Microphone permission denied', 'NotAllowedError'); } }, configurable: true }); });
    await page.getByRole('button', { name: 'Check microphone', exact: true }).click();
    await page.getByText(/^Microphone access is blocked\./).waitFor();
    await page.getByText('Details', { exact: true }).click();
    await page.getByText('NotAllowedError: Microphone permission denied', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Retry microphone', exact: true }).count(), 1);
    assert.equal(await page.locator('.get-ready-check.failed').filter({ hasText: 'Microphone' }).count(), 1);
    await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
    const setup = page.getByRole('navigation', { name: 'Session setup', exact: true });
    assert.equal(await setup.getByRole('button', { name: /^Model/ }).getByLabel('Complete').count(), 0, 'an unvisited model step is not complete');
    assert.equal(await page.locator('.context-footer').getByRole('button', { name: 'Start an empty chat', exact: true }).count(), 1);
    await setup.getByRole('button', { name: /^Model/ }).click();
    await page.getByText('The previous model is unavailable. Choose a model from the list.').waitFor();
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('option', { name: 'gemini3.8', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Start session', exact: true }).getAttribute('aria-disabled'), 'true');
    await page.getByLabel('Choose model', { exact: true }).selectOption('gemini-chat');
    await setup.getByRole('button', { name: /^Load profile/ }).click();
    await page.locator('#context-panel-sources').getByRole('button', { name: 'Load profile', exact: true }).click();
    await page.getByLabel('Job description', { exact: true }).fill('Acme needs a backend developer.');
    await page.getByLabel('Job description', { exact: true }).fill('Acme needs a backend developer with 5 years of Java.');
    await page.waitForTimeout(1100);
    assert.equal((await page.evaluate(() => (window as any).fixture.research)).length, 0, 'pasting never starts an AI request');
    await page.getByRole('button', { name: 'Fetch', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Loading description and company details…' }).first().waitFor();
    await page.waitForFunction(() => (document.querySelector('input[maxlength="120"]') as HTMLInputElement)?.value === 'Acme');
    assert.equal(await page.getByRole('slider', { name: /Years of experience/ }).inputValue(), '5');
    assert.equal(await page.getByRole('slider', { name: /Word choice/ }).inputValue(), '7');
    await page.screenshot({ path: '/tmp/novi-profile-setup.png' });
    await page.getByLabel('Company values & culture', { exact: true }).fill('Edited values');
    await page.waitForTimeout(1100);
    assert.equal(await page.getByLabel('Company values & culture', { exact: true }).inputValue(), 'Edited values', 'manual edits do not trigger regeneration');
    assert.equal((await page.evaluate(() => (window as any).fixture.research)).length, 1, 'only Fetch starts analysis');
    await page.getByRole('button', { name: 'Fetch', exact: true }).click();
    await page.waitForFunction(() => (document.querySelector('textarea[maxlength="2000"]') as HTMLTextAreaElement)?.value === 'Customer care');
    await page.getByLabel('Job description', { exact: true }).fill('Slow Acme role');
    await page.getByRole('button', { name: 'Fetch', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Loading description and company details…' }).first().waitFor();
    await page.getByLabel('Job description', { exact: true }).fill('NewCo backend role');
    await page.getByRole('button', { name: 'Fetch', exact: true }).click();
    await page.waitForFunction(() => (document.querySelector('input[maxlength="120"]') as HTMLInputElement)?.value === 'NewCo');
    await page.waitForTimeout(700);
    assert.equal(await page.getByLabel('Company', { exact: true }).inputValue(), 'NewCo', 'an earlier in-flight analysis cannot overwrite a new description');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Purpose').fill('Review the reference');
    await page.getByRole('button', { name: /^Chat General questions/ }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: /^Custom Your own/ }).click();
    await page.getByLabel('Your custom answer style').fill('Lead with one practical example.');
    await page.getByRole('button', { name: 'Save locally', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Custom answer style saved locally.' }).waitFor();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your API key was rejected.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cancel start' }).count(), 0);
    await page.evaluate(() => { (window as any).fixture.reject = false; });
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'TEST_SESSION_STARTED' }).waitFor();
    const result = await page.evaluate(() => (window as any).fixture);
    assert.equal(result.starts, 1);
    assert.equal(result.startedModel, 'gemini-chat');
    assert(result.started >= result.confirmed);
    await page.getByRole('button', { name: /^Model( Complete)?$/ }).click();
    await page.evaluate(() => { (window as any).fixture.discoveryFails = true; });
    await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
    await page.getByText('Cannot load models. Try again.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start session', exact: true }).getAttribute('aria-disabled'), 'true');
    await page.evaluate(() => { (window as any).fixture.discoveryFails = false; });
    await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
    await page.waitForFunction(() => !(document.querySelector('select[aria-label="Choose model"]') as HTMLSelectElement).disabled);
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'gemini-chat');
    // Get ready opens by itself once per launch; session setup's "Run Get ready" brings it back with
    // today's results (the microphone failure above), and Continue returns to setup with nothing lost.
    await page.getByRole('button', { name: 'System Check', exact: true }).click();
    await page.getByRole('heading', { name: 'System Check' }).waitFor();
    await page.getByText(/^Microphone access is blocked\./).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Retry microphone', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
    await page.getByRole('heading', { name: 'Session setup' }).waitFor();
    await page.waitForFunction(() => !(document.querySelector('select[aria-label="Choose model"]') as HTMLSelectElement | null)?.disabled);
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'gemini-chat');
    assert.equal(await page.getByLabel('Purpose').inputValue(), 'Review the reference', 'what was typed in setup survives the visit to Get ready');
    // A listed model can still reject generation. Recovery must open the model step even from Instructions.
    await page.getByRole('button', { name: /^Instructions( Complete)?$/ }).click();
    await page.evaluate(() => { (window as any).fixture.modelNotFound = true; });
    await page.getByRole('button', { name: 'System Check', exact: true }).click();
    await page.getByRole('button', { name: /^(Check|Check again|Retry) ai connection$/ }).click();
    await page.getByText(/Google \(Gemini\) model request failed \(HTTP 404\)/).waitFor();
    await page.getByRole('button', { name: 'Choose another model', exact: true }).click();
    await page.locator('#context-panel-model').waitFor({ state: 'visible' });
    await page.getByLabel('Choose model', { exact: true }).selectOption('gemini-other');
    await page.getByRole('button', { name: 'System Check', exact: true }).click();
    await page.getByRole('button', { name: /^(Retry|Check again) ai connection$/ }).click();
    await page.getByText('Google key · gemini-other answered', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Choose another model', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Continue anyway', exact: true }).click();
    await page.waitForFunction(() => !(document.querySelector('select[aria-label="Choose model"]') as HTMLSelectElement | null)?.disabled);
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'gemini-other');
    assert.equal(await page.getByLabel('Purpose').inputValue(), 'Review the reference');
    await setup.getByRole('button', { name: /^Load profile/ }).click();
    await page.getByRole('button', { name: 'Edit Saved interview', exact: true }).click();
    await setup.getByRole('button', { name: /^Model/ }).click();
    await page.waitForFunction(() => !(document.querySelector('select[aria-label="Choose model"]') as HTMLSelectElement)?.disabled);
    assert.equal(await page.getByLabel('Choose model', { exact: true }).inputValue(), 'gemini-other', 'a saved profile never replaces the selected model with its old Gemini model');
    await page.screenshot({ path: '/tmp/novi-session-model.png' });
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'TEST_SESSION_STARTED' }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).fixture.startedModel), 'gemini-other');
    console.log('Model UI passed: invalid legacy model, live dropdown, failed ping, immediate startup, discovery failure and retry, Run Get ready.');
    console.log('Gemini 404 recovery passed: choose another model, preserve setup, and verify its reply.');
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
    assert.deepEqual(blocked, [], 'the Content Security Policy blocked something the app needs');
    console.log('Preflight denial/acknowledgement and code viewer mouse/keyboard scrolling passed, with no CSP violations.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

/*
 * Modern mode in a real browser: the three floating windows of a session (each a popup, as in the
 * app), the setup card, and the appearance question. IPC, audio hardware and the network are
 * deterministic fixtures; the React components and portals are the real ones.
 *
 *   npx tsx scripts/modern-ui-smoke.ts            # checks and screenshots into .test-data/modern
 *   NOVI_BROWSER_PATH=/path/to/chrome ...          # another Chromium
 */
const OUT = '.test-data/modern';
const SNAPSHOT = `{
  user: { id: 'user', username: 'alok', email: 'alok@example.com', displayName: 'Alok', plan: 'PRO', features: undefined, managed: true },
  settings: { displayName: 'Alok', connections: [{ id: 'c1', name: 'Anthropic', provider: 'anthropic', baseUrl: '', model: 'claude-sonnet-5-5', stream: true, enabled: true }, { id: 'c2', name: 'Local', provider: 'compatible', baseUrl: 'http://localhost:11434', model: 'llama', stream: true, enabled: true }],
    activeConnectionId: 'c1', theme: 'dark', clickThroughShortcut: 'Alt+Shift+I', onboardingComplete: true, modelRoles: { c1: { fast: 'claude-haiku-5-5', deep: 'claude-sonnet-5-5' } }, sessionProfiles: [{ id: 'p1', name: 'Alok Jha · Staff engineer', updatedAt: 1, connectionId: 'c1', model: 'claude-sonnet-5-5', mode: 'coding', framework: 'smart', company: 'Vercel', role: 'Staff engineer', purpose: 'Coding interview', fields: [], folders: [] }] },
  credentialIds: [], conversations: [], contextSession: { id: 's1', connection: { id: 'c1', name: 'Anthropic', provider: 'anthropic', baseUrl: '', model: 'claude-sonnet-5-5', stream: true }, status: 'ready', summaryReady: true },
}`;

async function bundle(contents: string) {
  const result = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.svg': 'dataurl', '.task': 'dataurl' }, logLevel: 'silent', plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /\/interviewAudio$/ }, () => ({ path: 'audio', namespace: 'fixture' }));
    builder.onResolve({ filter: /EyeTrackingService$/ }, () => ({ path: 'eye', namespace: 'fixture' }));
    builder.onLoad({ filter: /^audio$/, namespace: 'fixture' }, () => ({ contents: 'export class InterviewAudio {async start(){} async stop(){} close(){}}' }));
    builder.onLoad({ filter: /^eye$/, namespace: 'fixture' }, () => ({ contents: 'export const eyeTracking = { setMonitor(){} };' }));
  } }], stdin: { resolveDir: resolve('.'), loader: 'tsx', contents } });
  return result.outputFiles[0].text;
}

const MOCK = `
  const ok = value => ({ ok: true, value });
  const actions = new Set(); window.sent = []; window.heights = {}; window.workspace = [];
  window.emit = action => actions.forEach(fn => fn(action));
  window.novi = new Proxy({
    launchId: 'launch',
    getStealthState: async () => ok({ transparent: true, numLock: false, clickThrough: false, clickThroughShortcut: 'Alt+Shift+I', transparentShortcut: 'Alt+Shift+T' }),
    onGlobalAction: fn => { actions.add(fn); return () => actions.delete(fn); },
    onInterview: fn => { window.transcriptEvent = fn; return () => {}; },
    startInterview: async () => ok({ id: 'session', startedAt: Date.now(), modelId: 'zipformer-en' }),
    stopInterview: async () => ok(null),
    setTrayHeight: async (height, controls, role) => { window.heights[role] = height; return ok(); },
    workspaceAction: async action => { window.workspace.push(action); window.emit({ type: 'workspace-visibility', payload: action !== 'hide' }); return ok(); },
    listModels: async () => ok([{ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }]),
    getMonitors: async () => ok([]), getWorkingMonitor: async () => ok({}),
    captureScreen: async () => ok({ id: 'shot', name: 'shot.png', mimeType: 'image/png' }),
    toggleTransparent: async () => ok({ transparent: false, numLock: false, clickThrough: false, clickThroughShortcut: 'Alt+Shift+I', transparentShortcut: null }),
    checkPermissions: async () => ok({ storage: true }), localAISetup: async () => ok({ models: [], selectedASRModelId: 'zipformer-en-small' }),
    testInternet: async () => ok('42 ms · 180 Mbps'), testConnection: async () => ok(),
    getRemoteCompanionStatus: async () => ok({ running: false }),
  }, { get(target, name) { return target[name] || (String(name).startsWith('on') ? () => () => {} : async () => ok()); } });
`;

const SESSION = `
  import { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { AppModeProvider } from './src/renderer/src/context/AppModeContext';
  import { ModernSession } from './src/renderer/src/components/modern/ModernSession';
  ${MOCK}
  localStorage.setItem('novi_appearance', JSON.stringify({ interfaceStyle: 'modern' }));
  const snapshot = ${SNAPSHOT};
  const answer = <div className="messages"><article className="message user"><div className="message-body"><p className="user-content">Follow-up questions</p></div></article><article className="message assistant"><div className="message-body"><div className="markdown"><p>Ask about the signal pipeline before committing to an architecture:</p><ul><li>What signal acquisition method are you using?</li><li>Is processing on-device, in the cloud, or hybrid?</li></ul></div></div></article></div>;
  function Fixture() {
    const [settings, setSettings] = useState(false);
    return <AppModeProvider snapshot={snapshot}><ModernSession state={snapshot} conversation={answer} busy={false} streaming={false} error="" onDismissError={() => {}}
      contextError={false} onRetryContext={() => {}} retryingContext={false}
      onSend={async text => { window.sent.push(text); return true; }}
      model={{ connection: snapshot.settings.connections[0], connections: snapshot.settings.connections, options: [{ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }], roles: snapshot.settings.modelRoles.c1, available: [{ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }], loading: false, syncing: false, change: () => {} }}
      history={{ conversations: [{ id: 'a', title: 'System design warm-up', messages: [], createdAt: 1, updatedAt: 2 }, { id: 'b', title: 'Behavioural stories', messages: [], createdAt: 1, updatedAt: 1 }], selectedId: 'a', displayName: 'Alok', busy: false, select() {}, create() {}, rename() {}, remove() {}, save() {}, attachments: [] }}
      local={{ active: false, binding: false, setup: null }} tools={<p>Eye tracking controls</p>} debug={null} practice={null} ready={null}
      onEnd={() => { window.ends = (window.ends || 0) + 1; }} ending={false}
      settingsOpen={settings} onOpenSettings={() => setSettings(true)} onCloseSettings={() => setSettings(false)} settingsPanel={<div><p>Settings would be here</p></div>}
      onSwitchToClassic={() => {}} onClosed={() => {}} listenKey="Alt+A" /></AppModeProvider>;
  }
  createRoot(document.getElementById('root')).render(<Fixture />);
`;

const SETUP = `
  import { createRoot } from 'react-dom/client';
  import { AppModeProvider } from './src/renderer/src/context/AppModeContext';
  import { ModernSetup } from './src/renderer/src/components/modern/ModernSetup';
  ${MOCK}
  const snapshot = ${SNAPSHOT};
  snapshot.contextSession = null;
  createRoot(document.getElementById('root')).render(<AppModeProvider snapshot={snapshot}><div className="tray-shell modern-tray" style={{ width: 520 }}><div className="modern-panel"><ModernSetup state={snapshot} onSaved={() => {}} onOpenSettings={() => {}} /></div></div></AppModeProvider>);
`;

const GATE = `
  import { createRoot } from 'react-dom/client';
  import { AppearanceGate } from './src/renderer/src/components/AppearanceGate';
  ${MOCK}
  window.chosen = [];
  createRoot(document.getElementById('root')).render(<div className="app-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}><AppearanceGate initial="classic" onChoose={(style, remember) => window.chosen.push([style, remember])} /></div>);
`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const css = readFileSync('src/renderer/src/styles/app.css', 'utf8') + '\n' + readFileSync('src/renderer/src/styles/modern.css', 'utf8');
  const backdrop = 'body::before{content:"";position:fixed;inset:0;z-index:-1;background:radial-gradient(120% 100% at 20% 110%,#1b3a6b 0%,#0f1a33 45%,#090b12 100%);}';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.NOVI_BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const errors: string[] = [];
  const open = async (code: string) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('https://novi.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><body><div id="root"></div></body></html>' }));
    await page.goto('https://novi.test/');
    await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: backdrop });
    const popups: Promise<Page>[] = [];
    context.on('page', popup => popups.push(Promise.resolve(popup)));
    await page.addScriptTag({ content: await bundle(code) });
    return { context, page, popups };
  };
  try {
    // 1. A session: three windows.
    {
      const { context, page, popups } = await open(SESSION);
      await page.waitForFunction(() => Object.keys((window as any).heights).length === 3, null, { timeout: 15000 });
      const windows = await Promise.all(popups);
      const byRole: Record<string, Page> = {};
      for (const popup of windows) {
        popup.on('pageerror', error => errors.push(error.message));
        const role = await popup.evaluate(() => document.documentElement.className.match(/novi-tray-(left|center|right)/)?.[1]);
        byRole[role!] = popup;
      }
      assert.deepEqual(Object.keys(byRole).sort(), ['center', 'left', 'right'], 'one window per role');
      await byRole.left.setViewportSize({ width: 430, height: 420 });
      await byRole.center.setViewportSize({ width: 520, height: 760 });
      await byRole.right.setViewportSize({ width: 390, height: 420 });
      for (const popup of windows) await popup.addStyleTag({ content: backdrop });
      await page.waitForTimeout(400);
      // The center bar: Answer, the red stop, hide; the panel with the box always present.
      const center = byRole.center;
      assert.equal(await center.getByRole('button', { name: 'Answer', exact: true }).count(), 1);
      assert.equal(await center.getByRole('button', { name: 'End session', exact: true }).count(), 1);
      assert.equal(await center.getByLabel('Message Novi').isVisible(), true, 'the message box is always visible');
      assert.equal(await center.locator('.mod-chip').count(), 5);
      await center.screenshot({ path: `${OUT}/center-idle.png`, fullPage: true });
      // Listen, then a transcript question appears and Answer sends it without touching the box.
      await byRole.left.getByRole('button', { name: 'Listen', exact: true }).click();
      await center.waitForFunction(() => !!(window.opener as any).transcriptEvent);
      await page.evaluate(() => (window as any).transcriptEvent({ type: 'transcript:final', segment: { sessionId: 'session', segmentId: 'q1', source: 'system', text: 'Can you walk me through how you would design a rate limiter?', startTime: 4000, isFinal: true } }));
      await center.locator('.mod-question').waitFor();
      assert.equal(await center.getByLabel('Message Novi').inputValue(), '', 'the transcript never lands in the message box');
      await center.getByRole('button', { name: 'Answer', exact: true }).click();
      await page.waitForFunction(() => (window as any).sent.length === 1);
      const sent = await page.evaluate(() => (window as any).sent[0] as string);
      assert.match(sent, /rate limiter/);
      assert.match(sent, /Conversation so far/);
      await center.screenshot({ path: `${OUT}/center-listening.png`, fullPage: true });
      await byRole.left.screenshot({ path: `${OUT}/left-bar.png`, fullPage: true });
      await byRole.left.getByLabel('Session mode', { exact: true }).click();
      await byRole.left.waitForTimeout(250);
      await byRole.left.screenshot({ path: `${OUT}/left-mode-menu.png`, fullPage: true });
      assert.equal(await byRole.left.getByRole('button', { name: /^Code/ }).count(), 1, 'our own session modes, no Interview/Meeting/Sales list');
      assert.equal(await byRole.left.getByText('Meeting', { exact: true }).count(), 0);
      await byRole.left.keyboard.press('Escape');
      await byRole.right.screenshot({ path: `${OUT}/right-bar.png`, fullPage: true });
      for (const name of ['Turn off transparent mode', 'Phone companion', 'Show or hide the main window']) assert.equal(await byRole.right.getByRole('button', { name, exact: true }).count(), 1, name);
      for (const name of ['Opacity and colours', 'Window options']) assert.equal(await byRole.right.getByLabel(name, { exact: true }).count(), 1, name);
      assert.equal(await byRole.right.getByLabel(/Smaller text/).count(), 1);
      assert.equal(await byRole.right.getByText('Interactive').count(), 1, 'click-through state is shown');
      await byRole.right.getByLabel('Opacity and colours', { exact: true }).click();
      await byRole.right.waitForTimeout(250);
      await byRole.right.screenshot({ path: `${OUT}/right-appearance-menu.png`, fullPage: true });
      // The red square asks before ending.
      await center.getByRole('button', { name: 'End session', exact: true }).click();
      assert.equal(await page.evaluate(() => (window as any).ends), 1);
      assert.equal((await center.locator('.live-drag, .live-logo, .brand').count()), 0, 'no drag grip and no logo in the bar');
      await context.close();
    }
    // 2. Session setup as a card.
    {
      const { context, page } = await open(SETUP);
      await page.locator('.mod-setup').waitFor();
      await page.waitForTimeout(300);
      await page.setViewportSize({ width: 560, height: 900 });
      await page.screenshot({ path: `${OUT}/setup-check.png`, fullPage: true });
      await page.getByRole('button', { name: 'Continue to setup' }).click();
      await page.getByRole('heading', { name: /Who are you talking to/ }).waitFor();
      assert.equal(await page.getByRole('button', { name: /Start Alok Jha/ }).count(), 1, 'a saved setup starts in one click');
      await page.screenshot({ path: `${OUT}/setup-step-1.png`, fullPage: true });
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForTimeout(100);
      assert.match(await page.locator('.mod-setup-status.is-error').textContent() || '', /job description/i, 'Next names what is missing');
      await page.getByLabel('Job posting link').fill('https://example.com/jobs/1');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('heading', { name: /What kind of conversation/ }).waitFor();
      await page.getByRole('button', { name: /^Code/ }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/setup-step-2.png`, fullPage: true });
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('heading', { name: /How should answers sound/ }).waitFor();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('heading', { name: /Which model answers/ }).waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/setup-step-4.png`, fullPage: true });
      assert.equal(await page.getByRole('button', { name: 'Start session' }).count(), 1);
      await context.close();
    }
    // 3. The appearance question.
    {
      const { context, page } = await open(GATE);
      await page.locator('.gate').waitFor();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/gate.png` });
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('radio', { name: /Modern/ }).getAttribute('aria-checked'), 'true');
      await page.getByRole('button', { name: /Use Modern/ }).click();
      assert.deepEqual(await page.evaluate(() => (window as any).chosen), [['modern', true]]);
      await page.setViewportSize({ width: 420, height: 760 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/gate-narrow.png`, fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); }
  const relevant = errors.filter(error => !/ResizeObserver loop/.test(error));
  assert.deepEqual(relevant, [], 'no page errors');
  console.log(`Modern UI smoke passed. Screenshots in ${OUT}/`);
}

main().catch(error => { console.error(error); process.exit(1); });

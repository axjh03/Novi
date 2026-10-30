import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Actual React controls and portals; IPC and audio hardware use deterministic fixtures.
async function main() {
  mkdirSync('.test-data/modern', { recursive: true });
  const bundle = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.svg': 'dataurl' }, plugins: [{ name: 'audio-fixture', setup(builder) {
    builder.onResolve({ filter: /\/interviewAudio$/ }, () => ({ path: 'audio', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class InterviewAudio {async start(){} async stop(){} close(){}}' }));
  } }], stdin: { resolveDir: resolve('.'), loader: 'tsx', contents: `
    import { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { Zap, Settings } from 'lucide-react';
    import { Composer } from './src/renderer/src/components/chat/Composer';
    import { TrayPortal } from './src/renderer/src/components/TrayPortal';
    import { TrayMenu } from './src/renderer/src/components/TrayMenu';
    import { AppModeProvider } from './src/renderer/src/context/AppModeContext';
    const ok = value => ({ok:true,value});
    const actions = new Set(); window.sent = []; window.ends = 0; window.stops = 0; window.heights = [];
    window.emit = action => actions.forEach(fn => fn(action));
    window.novi = new Proxy({
      getStealthState: async () => ok({transparent:false,clickThrough:false}),
      onGlobalAction: fn => {actions.add(fn); return () => actions.delete(fn);},
      onInterview: fn => {window.transcriptEvent = fn; return () => {};},
      startInterview: async () => ok({id:'session',startedAt:Date.now(),modelId:'test'}),
      stopInterview: async () => {window.stops++; return ok(null);},
      setTrayHeight: async height => {window.heights.push(height);return ok();},
      workspaceAction: async action => {window.emit({type:'workspace-visibility',payload:action !== 'hide'});return ok();},
    },{get(target,name){return target[name] || (String(name).startsWith('on') ? () => () => {} : async () => ok());}});
    function Fixture() {
      const [smart,setSmart] = useState(false);
      return <AppModeProvider snapshot={null}><TrayPortal detached modern onClosed={() => {}}><Composer compact busy={false} onEnd={() => window.ends++}
        onSend={async text => {window.sent.push(text); return true;}}
        smartControl={<button type="button" className="composer-quick-btn" aria-label="Smart mode" aria-pressed={smart} onClick={() => setSmart(!smart)}><Zap size={14}/>Smart</button>}
        toolbar={<TrayMenu label="Model settings" title={<Settings size={14}/>}><p>Model controls remain available</p></TrayMenu>}
        insights={<div className="messages"><article className="message user"><div className="message-body"><p className="user-content">Follow-up questions</p></div></article><article className="message assistant"><div className="message-body"><div className="markdown"><ul><li>What signal acquisition method are you using (EEG, ECoG, invasive, non-invasive)?</li><li>What's the planned data processing pipeline (on-device, cloud, hybrid)?</li></ul></div></div></article></div>}/>
      </TrayPortal></AppModeProvider>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.NOVI_BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://novi.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('https://novi.test/');
    await page.addStyleTag({ content: readFileSync('src/renderer/src/styles/app.css', 'utf8') });
    const popupEvent = page.waitForEvent('popup');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const popup = await popupEvent;
    popup.on('pageerror', error => errors.push(error.message));
    popup.setDefaultTimeout(10000);
    await popup.setViewportSize({ width: 490, height: 800 });
    await popup.locator('.live-insights').waitFor();
    await popup.addStyleTag({ content: 'body::before {content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(150deg,#0962d9 0%,#039dc1 35%,#4234bc 65%,#14234b 100%);}' });
    await popup.waitForTimeout(300);
    const panel = (await popup.locator('.live-insights').boundingBox())!;
    const navbar = (await popup.locator('.live-navbar').boundingBox())!;
    assert.equal(panel.width, 462, 'reference panel width');
    assert.equal(navbar.width, 350, 'compact toolbar width');
    assert.equal(navbar.height, 44);
    assert.equal(panel.y - navbar.y - navbar.height, 8);
    assert(Math.abs(panel.x + panel.width / 2 - navbar.x - navbar.width / 2) < 1);
    assert.equal(await popup.locator('.composer-toolbar').isVisible(), false, 'secondary controls stay behind Session tools');
    assert.equal(await popup.locator('.live-actions button').count(), 5);
    await popup.screenshot({ path: '.test-data/modern/dark.png', clip: { x: 0, y: 0, width: 490, height: Math.ceil(panel.y + panel.height + 20) } });
    await popup.getByLabel('Assistant mode', { exact: true }).click();
    await popup.getByRole('button', {name:'Meeting',exact:true}).click();
    assert.equal(await popup.getByLabel('Assistant mode', {exact:true}).textContent(), 'Meeting');
    await popup.getByLabel('Message Novi', { exact: true }).fill('Keep this draft');
    await popup.getByRole('button', { name: 'Collapse Live Insights', exact: true }).click();
    await popup.waitForTimeout(300);
    assert((await popup.locator('.live-insights').boundingBox())!.height < 65);
    assert.equal(await popup.locator('#live-panel-body').getAttribute('inert'), '');
    await popup.getByRole('button', { name: 'Expand Live Insights', exact: true }).click();
    await popup.waitForTimeout(300);
    assert.equal(await popup.getByLabel('Message Novi', { exact: true }).inputValue(), 'Keep this draft');
    await popup.getByRole('button', { name: 'Session tools', exact: true }).click();
    await popup.getByLabel('Model settings', { exact: true }).click();
    await popup.getByText('Model controls remain available').waitFor();
    await popup.keyboard.press('Escape');
    assert.equal(await popup.getByText('Model controls remain available').isVisible(), false);
    await popup.getByRole('button', { name: 'Session tools', exact: true }).click();
    await popup.getByRole('button', { name: 'Smart mode', exact: true }).click();
    assert.equal(await popup.getByRole('button', { name: 'Smart mode', exact: true }).getAttribute('aria-pressed'), 'true');
    await popup.getByLabel('Message Novi', { exact: true }).press('Control+Enter');
    assert.match(await page.evaluate(() => (window as any).sent[0]), /Keep this draft/);
    await popup.getByRole('button', { name: 'Start audio capture', exact: true }).click();
    await popup.getByRole('button', { name: 'Pause audio capture', exact: true }).waitFor();
    await page.evaluate(() => (window as any).transcriptEvent({type:'transcript:final',segment:{sessionId:'session',segmentId:'one',speakerId:'Speaker 1',role:'interviewer',source:'system',text:'How would you scale this?',startTime:12000,endTime:14000,revision:1,isFinal:true}}));
    await popup.getByRole('tab', { name: 'Transcript', exact: true }).click();
    await popup.locator('.live-transcript').getByText('How would you scale this?').waitFor();
    assert.equal(await popup.locator('.live-transcript time').textContent(), '00:12');
    await popup.getByRole('tab', { name: 'Transcript', exact: true }).press('ArrowLeft');
    assert.equal(await popup.getByRole('tab', { name: 'Insights', exact: true }).getAttribute('aria-selected'), 'true');
    await popup.locator('.live-question').click();
    assert.match(await page.evaluate(() => (window as any).sent.at(-1)), /How would you scale this/);
    await popup.getByRole('button', { name: 'Hide widget; session continues', exact: true }).click();
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.modern-tray')!).opacity === '0');
    assert.equal(await page.evaluate(() => (window as any).stops), 0, 'hiding does not stop capture');
    await page.evaluate(() => (window as any).emit({type:'workspace-visibility',payload:true}));
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('.modern-tray')!).opacity === '1');
    await popup.getByRole('button', { name: 'Pause audio capture', exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).stops), 1);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await popup.getByLabel('Message Novi', { exact: true }).fill('');
    await popup.waitForTimeout(100);
    await popup.screenshot({ path: '.test-data/modern/light.png', clip: { x: 0, y: 0, width: 490, height: Math.ceil((await popup.locator('.tray-shell').boundingBox())!.height + 10) } });
    for (const width of [320, 380, 490]) {
      await popup.setViewportSize({ width, height: 800 });
      assert(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}px`);
      assert((await popup.getByRole('button', {name:'Send message',exact:true}).boundingBox())!.x >= 0);
    }
    await popup.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await popup.locator('.modern-tray').evaluate(el => getComputedStyle(el).animationName), 'none');
    await popup.getByRole('button', { name: /· End/ }).click();
    assert.equal(await page.evaluate(() => (window as any).ends), 1);
    assert.deepEqual(errors, []);
    console.log('Modern UI passed: reference geometry, light/dark screenshots, collapse/draft continuity, menus, keyboard, audio/transcript, actions, hide/show, responsive sizing and reduced motion.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

// Real portal, composer, menus and audio capture; only IPC and the microphone device are fixtures.
async function main() {
  const bundle = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.svg': 'dataurl' }, stdin: {
    resolveDir: resolve('.'), loader: 'tsx', contents: `
      import { StrictMode, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { Brain, ExternalLink, Menu, MessageSquare, PanelBottom } from 'lucide-react';
      import { TrayPortal } from './src/renderer/src/components/TrayPortal';
      import { TrayMenu } from './src/renderer/src/components/TrayMenu';
      import { Composer } from './src/renderer/src/components/chat/Composer';
      import { AppModeProvider, useAppMode } from './src/renderer/src/context/AppModeContext';
      window.heights = []; window.widths = []; window.sent = []; window.audioFrames = 0; window.audioStops = 0;
      const image = {id: 'image', name: 'sample.png', mimeType: 'image/png', previewUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII='};
      localStorage.setItem('novi_listening_source', 'microphone');
      window.novi = {
        getStealthState: async () => ({ok: true, value: {transparent: false, clickThrough: false}}),
        onStealthState: () => () => {}, onCodeViewerClosed: () => () => {}, onGlobalAction: () => () => {},
        setTrayHeight: async height => { window.heights.push(height); return {ok: true}; },
        setTrayWidth: async (width, edge) => { window.widths.push({width, edge}); return {ok: true}; },
        warmConnection: async () => ({ok: true}),
        pickImages: async () => ({ok: true, value: [image]}), captureScreen: async () => ({ok: true, value: {...image, id: 'snapshot', name: 'Snapshot.png'}}),
        onInterview: () => () => {}, startInterview: async () => ({ok: true, value: {id: 'listening', startedAt: Date.now(), modelId: 'fixture'}}),
        stopInterview: async () => { window.audioStops++; return {ok: true, value: null}; },
        interviewFrame: async () => { window.audioFrames++; return {ok: true}; },
      };
      function Fixture() {
        const [detached, setDetached] = useState(false), [menu, setMenu] = useState(false), [clicks, setClicks] = useState(0);
        const {setAppMode} = useAppMode();
        return <main className="chat-main" style={{height: '100vh', maxWidth: 600, margin: 'auto'}}>
          <div className="conversation-scroll"><div className="empty-state"><h1>A new conversation</h1><p>Your message and controls stay together.</p></div></div>
          <TrayPortal detached={detached} onClosed={() => setDetached(false)}>
            <Composer busy={false} onSend={async (text, images) => {window.sent.push({text, images}); return true;}} toolbar={<>
              <TrayMenu className="tray-mode-menu" label="Change conversation mode" title={<MessageSquare size={14} />}>
                <nav className="chat-mode-tabs">{['Chat', 'Coding', 'Behavioral', 'System design', 'Local Coding'].map((name, i) =>
                  <button key={name} type="button" className={'mode-tab-btn ' + (i === 0 ? 'active' : '')} aria-label={name} title={name}
                    onClick={() => {setClicks(clicks + 1); setAppMode(name === 'System design' ? 'system-design' : 'normal');}}>
                    <MessageSquare size={14} /><span>{name}</span>
                  </button>)}
                </nav>
              </TrayMenu>
              <TrayMenu className="tray-model-menu" label="Model settings" title={<Brain size={14} />}>
                <div className="header-model-select-wrapper"><span className="status-dot" />
                  <select className="header-model-picker" aria-label="Connection"><option>A long provider connection name</option></select>
                  <select className="header-model-picker" aria-label="Model"><option>A very long model name for this layout</option></select>
                  <button type="button" className="text-button">Fast</button><button type="button" className="text-button">Deep</button>
                </div>
              </TrayMenu>
              <TrayMenu className="tray-tools" label="More controls" title={<Menu size={16} />}><div className="eye-tracking-panel">
                {['Eye', 'Sensitivity', 'Camera', 'Monitor'].map(name => <div className="et-camera-picker" key={name}>
                  <button type="button" className="et-camera-btn" aria-label={name} onClick={() => setMenu(!menu)}><MessageSquare size={14} />{name === 'Sensitivity' && <span className="et-camera-label">3.0x</span>}</button>
                  {menu && name === 'Camera' && <div className="et-camera-dropdown"><p>Camera settings</p>{Array.from({length: 7}, (_, i) => <button type="button" key={i} style={{display: 'block', height: 32}}>Camera {i + 1}</button>)}</div>}
                </div>)}
              </div></TrayMenu>
              <button type="button" className="composer-quick-btn" aria-label={detached ? 'Attach controls' : 'Detach controls'} onClick={() => setDetached(!detached)}>
                {detached ? <PanelBottom size={16} /> : <ExternalLink size={16} />}
              </button>
            </>} />
            <output data-clicks={clicks} hidden />
          </TrayPortal>
        </main>;
      }
      createRoot(document.getElementById('root')).render(<StrictMode><AppModeProvider snapshot={null}><Fixture /></AppModeProvider></StrictMode>);
    `,
  } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.NOVI_BROWSER_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('popup', popup => { popup.setDefaultTimeout(10000); popup.on('pageerror', error => errors.push(error.message)); });
    await page.route('https://novi.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.route('**/interview-audio-worklet.js', route => route.fulfill({ contentType: 'application/javascript', body: readFileSync('src/renderer/public/interview-audio-worklet.js', 'utf8') }));
    await page.goto('https://novi.test/');
    await page.addStyleTag({ content: readFileSync('src/renderer/src/styles/app.css', 'utf8') });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel('Message Novi').waitFor();
    assert.equal(page.context().pages().length, 1, 'Controls start attached without opening a window');

    const checkLayout = async (view: Page) => {
      const input = (await view.getByLabel('Message Novi').boundingBox())!;
      for (const label of ['Attach image', 'Snapshot', 'Audio settings', 'Model settings', 'More controls']) {
        const button = (await view.getByLabel(label, { exact: true }).boundingBox())!;
        assert(button.y + button.height <= input.y, `${label} stays above the text input`);
        assert(button.x >= 0 && button.x + button.width <= view.viewportSize()!.width, `${label} fits the window`);
      }
      assert.equal(await view.locator('.composer-input button').count(), 1, 'Only Send is beside the text');
      assert.equal(await view.locator('.composer-input button').getAttribute('aria-label'), 'Send message');
    };
    for (const width of [213, 320, 600, 1200]) {
      await page.setViewportSize({width, height: 700});
      await checkLayout(page);
    }
    await page.setViewportSize({width: 600, height: 700});
    await page.getByLabel('Model settings', {exact: true}).click();
    const menu = (await page.locator('.tray-model-menu .tray-menu-content').boundingBox())!;
    const toolbar = (await page.locator('.composer-toolbar').boundingBox())!;
    assert(menu.y >= 0 && menu.y + menu.height < toolbar.y, 'Attached menus open upward within the window');
    await page.keyboard.press('Escape');
    await page.getByLabel('Message Novi').fill('Keep my draft');
    await page.getByRole('button', {name: 'Attach image', exact: true}).click();
    await page.getByRole('button', {name: 'Snapshot', exact: true}).click();
    await page.getByRole('button', {name: 'Remove Snapshot.png'}).waitFor();
    await page.getByRole('button', {name: 'Start listening', exact: true}).click();
    await page.getByRole('button', {name: 'Stop listening', exact: true}).waitFor();
    await page.waitForFunction(() => (window as any).audioFrames > 0);
    await page.screenshot({path: '/tmp/novi-controls-attached.png'});

    const detach = async () => {
      const popup = page.waitForEvent('popup');
      await page.getByRole('button', {name: 'Detach controls', exact: true}).click();
      const tray = await popup;
      await tray.getByLabel('Message Novi').waitFor();
      return tray;
    };
    let tray = await detach();
    assert.equal(await tray.getByLabel('Message Novi').inputValue(), 'Keep my draft');
    assert.equal(await tray.locator('.attachment').count(), 2, 'Attachments survive detaching');
    await tray.getByRole('button', {name: 'Stop listening', exact: true}).waitFor();
    assert.equal(await page.evaluate(() => (window as any).audioStops), 0, 'Detaching does not stop capture');
    const height = () => page.evaluate(() => (window as any).heights.at(-1) as number);
    const sizes: Record<number, number> = {};
    for (const width of [320, 400, 540, 600, 860, 1200, 320]) {
      await tray.setViewportSize({ width, height: 600 });
      await tray.waitForTimeout(100);
      const measured = await height();
      assert(measured > 48 && measured < 400, `Compact height at ${width}: ${measured}`);
      await tray.setViewportSize({ width, height: measured });
      await tray.waitForTimeout(100);
      assert.equal(await height(), measured, 'Height settles without resize feedback');
      sizes[width] = measured;
      await checkLayout(tray);
    }
    await tray.getByLabel('Message Novi').fill('Edited while floating');
    await tray.getByLabel('Change conversation mode', {exact: true}).click();
    await tray.getByRole('button', {name: 'System design', exact: true}).click();
    await tray.keyboard.press('Escape');
    assert.equal(await tray.getByLabel('Change conversation mode', {exact: true}).evaluate(el => el === el.ownerDocument.activeElement), true, 'Escape returns focus');
    const diagram = (await tray.getByRole('button', {name: 'Draw / update diagram'}).boundingBox())!;
    assert(diagram.y < (await tray.getByLabel('Message Novi').boundingBox())!.y, 'Diagram action is also above the input');
    assert.equal(await tray.getByRole('button', {name: 'Draw / update diagram'}).innerText(), '', 'Diagram action is icon-only');
    await tray.waitForTimeout(200);
    const collapsed = await height();
    await tray.getByLabel('More controls', {exact: true}).click();
    await tray.getByRole('button', {name: 'Camera', exact: true}).click();
    await tray.waitForTimeout(200);
    assert((await height()) > collapsed, 'Detached menus request extra height');
    const dropdown = await tray.locator('.et-camera-dropdown').boundingBox();
    assert(dropdown && dropdown.x >= 0 && dropdown.x + dropdown.width <= 320);
    await tray.getByRole('button', {name: 'Camera', exact: true}).click();
    await tray.getByLabel('Message Novi').click();
    await tray.waitForTimeout(200);
    assert.equal(await height(), collapsed, 'Closing the menu returns unused screen space');
    await tray.getByLabel('Model settings', {exact: true}).click();
    await tray.getByLabel('Audio settings', {exact: true}).click();
    assert.equal(await tray.locator('details[open]').count(), 1, 'Only one menu stays open');
    await tray.keyboard.press('Escape');
    for (const side of ['left', 'right'] as const) {
      const grip = tray.getByRole('separator', {name: `Resize tray from ${side}`});
      await grip.focus(); await tray.keyboard.press('ArrowRight'); await tray.waitForTimeout(50);
      assert.deepEqual(await page.evaluate(() => (window as any).widths.at(-1)), {width: side === 'left' ? 304 : 336, edge: side});
      const box = (await grip.boundingBox())!;
      await tray.mouse.move(box.x + box.width / 2, box.y + 10); await tray.mouse.down();
      await tray.mouse.move(box.x + box.width / 2 + (side === 'left' ? 40 : -40), box.y + 10, {steps: 4});
      await tray.mouse.up(); await tray.waitForTimeout(50);
      assert.deepEqual(await page.evaluate(() => (window as any).widths.at(-1)), {width: 280, edge: side});
    }
    await tray.screenshot({path: '/tmp/novi-tray-narrow.png'});
    await tray.setViewportSize({width: 860, height: sizes[860]});
    await tray.screenshot({path: '/tmp/novi-tray-wide.png'});
    await tray.getByRole('button', {name: 'Attach controls', exact: true}).click();
    await page.getByLabel('Message Novi').waitFor();
    await page.waitForFunction(() => (window as any).audioFrames > 5);
    assert.equal(await page.getByLabel('Message Novi').inputValue(), 'Edited while floating');
    assert.equal(await page.locator('.attachment').count(), 2);
    assert.equal(await page.evaluate(() => (window as any).audioStops), 0, 'Reattaching preserves active capture');
    assert.equal(await page.locator('[data-clicks]').getAttribute('data-clicks'), '1', 'Toolbar state survives moving');
    await page.getByLabel('Audio settings', {exact: true}).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('details[open]').count(), 0, 'Menus dismiss on the main document after reattaching');
    tray = await detach();
    await tray.close();
    await page.getByLabel('Message Novi').waitFor();
    assert.equal(await page.getByLabel('Message Novi').inputValue(), 'Edited while floating', 'Closing a detached window restores the draft');
    assert.equal(await page.evaluate(() => (window as any).audioStops), 0, 'Closing the window does not stop capture');
    await page.getByRole('button', {name: 'Stop listening', exact: true}).click();
    await page.getByRole('button', {name: 'Start listening', exact: true}).waitFor();
    await page.getByRole('button', {name: 'Send message', exact: true}).click();
    assert.deepEqual(await page.evaluate(() => (window as any).sent.map((item: any) => ({text: item.text, images: item.images.map((image: any) => image.id)}))), [{text: 'Edited while floating', images: ['image', 'snapshot']}]);
    assert.equal(await page.getByLabel('Message Novi').inputValue(), '');
    // A blocked popup leaves the same composer attached and usable.
    await page.evaluate(() => { window.open = () => null; });
    await page.getByRole('button', {name: 'Detach controls', exact: true}).click();
    await page.getByLabel('Message Novi').waitFor();
    assert.equal(await page.getByRole('button', {name: 'Detach controls', exact: true}).count(), 1);
    assert.deepEqual(errors, []);
    console.log('Attached/detached controls, draft/image/audio continuity, toolbar layout, menus and resize grips passed:', sizes);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

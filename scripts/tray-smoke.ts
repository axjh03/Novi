import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Exercise the actual portal and stylesheet with representative controls, without account/network setup.
async function main() {
  const bundle = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', stdin: {
    resolveDir: resolve('.'), loader: 'tsx', contents: `
      import { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { TrayPortal } from './src/renderer/src/components/TrayPortal';
      import { TrayMenu } from './src/renderer/src/components/TrayMenu';
      window.heights = []; window.widths = [];
      window.novi = {
        getStealthState: async () => ({ok: true, value: {transparent: false, clickThrough: false}}),
        onStealthState: () => () => {},
        setTrayHeight: async height => { window.heights.push(height); return {ok: true}; },
        setTrayWidth: async (width, edge) => { window.widths.push({width, edge}); return {ok: true}; },
      };
      function Fixture() {
        const [menu, setMenu] = useState(false), [clicks, setClicks] = useState(0);
        return <TrayPortal onClosed={() => {}}>
          <div className="tray-row">
            <TrayMenu className="tray-mode-menu" label="Change conversation mode" title={<svg width="14" height="14" />}>
            <nav className="chat-mode-tabs">{['Chat', 'Coding', 'Behavioral', 'System design', 'Local Coding'].map((name, i) =>
              <button key={name} className={'mode-tab-btn ' + (i === 0 ? 'active' : '')} aria-label={name} title={name} onClick={() => setClicks(clicks + 1)}>
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" /></svg><span>{name}</span>
              </button>)}
            </nav></TrayMenu>
            <TrayMenu className="tray-model-menu" label="Model settings" title={<svg width="14" height="14" />}>
            <div className="header-model-select-wrapper"><span className="status-dot" />
              <select className="header-model-picker" aria-label="Connection"><option>A long provider connection name</option></select>
              <select className="header-model-picker" aria-label="Model"><option>A very long model name for this layout</option></select>
              <button className="text-button">Fast</button><button className="text-button">Deep</button>
            </div>
            </TrayMenu><TrayMenu className="tray-tools" label="More controls" title={<span>☰</span>}><div className="eye-tracking-panel">
              {['Eye', 'Sensitivity', 'Camera', 'Monitor'].map(name => <div className="et-camera-picker" key={name}>
                <button className="et-camera-btn" aria-label={name} onClick={() => setMenu(!menu)}><svg width="14" height="14" />{name === 'Sensitivity' && <span className="et-camera-label">3.0x</span>}</button>
                {menu && name === 'Camera' && <div className="et-camera-dropdown"><p>Camera settings</p>{Array.from({length: 7}, (_, i) => <button key={i} style={{display: 'block', height: 32}}>Camera {i + 1}</button>)}</div>}
              </div>)}
            </div></TrayMenu>
          </div>
          <div className="composer-wrap"><form className="composer" onSubmit={event => event.preventDefault()}>
            <textarea aria-label="Message Novi" rows={1} placeholder="Ask Novi anything…" />
            <div className="composer-controls"><div className="attach-control">
              <button className="composer-quick-btn" aria-label="Attach"><svg width="14" height="14" /></button>
              <button className="composer-quick-btn" aria-label="Snapshot"><svg width="14" height="14" /></button>
              <div className="composer-local-control composer-audio-source"><button className="composer-quick-btn" aria-label="Listen"><svg width="14" height="14" /></button>
                <TrayMenu className="tray-audio-menu" label="Audio settings" title={<span>⚙</span>}>
                <select aria-label="Audio input"><option>System audio</option></select>
                <label className="transcription-engine"><svg width="15" height="15" /><select aria-label="Transcription"><option>Cloud</option></select></label></TrayMenu>
              </div>
            </div><button className="send-button" aria-label="Send">↑</button></div>
          </form></div>
          <output data-clicks={clicks} hidden />
        </TrayPortal>;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);
    `,
  } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.NOVI_BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://novi.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('https://novi.test/');
    await page.addStyleTag({ content: readFileSync('src/renderer/src/styles/app.css', 'utf8') });
    const popup = page.waitForEvent('popup');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const tray = await popup;
    tray.on('pageerror', error => errors.push(error.message));
    await tray.getByLabel('Message Novi').waitFor();
    assert.equal(await tray.locator('.tray-model-menu > summary').innerText(), '', 'model trigger is icon-only');
    assert((await tray.locator('.tray-model-menu > summary').boundingBox())!.width <= 40, 'model trigger stays compact');
    const height = () => page.evaluate(() => (window as any).heights.at(-1) as number);
    const sizes: Record<number, number> = {};
    for (const width of [320, 400, 540, 860, 1200, 320]) {
      await tray.setViewportSize({ width, height: 600 });
      await tray.waitForTimeout(100);
      const measured = await height();
      assert(measured > 48 && measured < 400, `Compact height at ${width}: ${measured}`);
      await tray.setViewportSize({ width, height: measured });
      await tray.waitForTimeout(100);
      assert.equal(await height(), measured, 'Height settles without resize feedback');
      sizes[width] = measured;
      const clipped = await tray.locator('button, select, textarea').evaluateAll(elements => elements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width && (rect.left < 0 || rect.right > innerWidth + 1);
      }).map(el => el.getAttribute('aria-label') || el.textContent));
      assert.deepEqual(clipped, [], `No horizontally clipped controls at ${width}`);
    }
    assert(sizes[860] < sizes[320], 'Wider layouts reclaim vertical space');
    await tray.getByLabel('Message Novi').fill('Typing still works');
    await tray.getByLabel('Change conversation mode', { exact: true }).click();
    await tray.getByRole('button', { name: 'Chat', exact: true }).click();
    await tray.keyboard.press('Escape');
    assert.equal(await tray.getByLabel('Change conversation mode', { exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true, 'Escape returns focus');
    assert.equal(await tray.locator('[data-clicks]').getAttribute('data-clicks'), '1');
    await tray.waitForTimeout(200);
    const collapsed = await height();
    await tray.getByLabel('More controls', { exact: true }).click();
    await tray.getByRole('button', { name: 'Camera', exact: true }).click();
    await tray.waitForTimeout(200);
    assert((await height()) > collapsed, 'Open menus request extra height');
    const dropdown = await tray.locator('.et-camera-dropdown').boundingBox();
    assert(dropdown && dropdown.x >= 0 && dropdown.x + dropdown.width <= 320);
    await tray.getByRole('button', { name: 'Camera', exact: true }).click();
    await tray.waitForTimeout(200);
    await tray.getByLabel('Message Novi').click();
    await tray.waitForTimeout(200);
    assert.equal(await height(), collapsed, 'Closing the menu returns unused screen space');
    await tray.getByLabel('Model settings', { exact: true }).click();
    await tray.getByLabel('Audio settings', { exact: true }).click();
    assert.equal(await tray.locator('details[open]').count(), 1, 'Only one menu stays open');
    await tray.keyboard.press('Escape');
    await tray.waitForTimeout(200);
    assert.equal(await tray.locator('details[open]').count(), 0);
    for (const side of ['left', 'right'] as const) {
      const grip = tray.getByRole('separator', { name: `Resize tray from ${side}` });
      await grip.focus(); await tray.keyboard.press('ArrowRight'); await tray.waitForTimeout(50);
      assert.deepEqual(await page.evaluate(() => (window as any).widths.at(-1)), { width: side === 'left' ? 304 : 336, edge: side });
      const box = (await grip.boundingBox())!;
      await tray.mouse.move(box.x + box.width / 2, box.y + 10); await tray.mouse.down();
      await tray.mouse.move(box.x + box.width / 2 + (side === 'left' ? 40 : -40), box.y + 10, { steps: 4 });
      await tray.mouse.up(); await tray.waitForTimeout(50);
      assert.deepEqual(await page.evaluate(() => (window as any).widths.at(-1)), { width: 280, edge: side });
    }
    assert.deepEqual(errors, []);
    console.log('Tray layout, auto-height, controls, menus and both resize grips passed:', sizes);
    await tray.screenshot({ path: '/tmp/novi-tray-narrow.png' });
    await tray.setViewportSize({ width: 860, height: sizes[860] });
    await tray.screenshot({ path: '/tmp/novi-tray-wide.png' });
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

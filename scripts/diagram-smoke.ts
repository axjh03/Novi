import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

async function main() {
  const bundle = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', plugins: [{
    name: 'browser-mermaid', setup(build) {
      build.onResolve({ filter: /^mermaid$/ }, () => ({ path: 'mermaid', namespace: 'browser' }));
      build.onLoad({ filter: /.*/, namespace: 'browser' }, () => ({ contents: 'export default window.mermaid' }));
    },
  }], stdin: { resolveDir: resolve('.'), loader: 'tsx', contents: `
    import { createRoot } from 'react-dom/client';
    import { MermaidDiagram } from './src/renderer/src/components/MermaidDiagram';
    const root = createRoot(document.getElementById('root'));
    window.draw = code => root.render(<MermaidDiagram code={code} />);
    window.calls = 0;
    window.novi = { repairDiagram: async () => { window.calls++; return window.repairResult; } };
  ` } });
  const browser = await chromium.launch({ headless: true, ...(process.env.NOVI_BROWSER_PATH ? { executablePath: process.env.NOVI_BROWSER_PATH } : { channel: 'msedge' }) });
  try {
    const page = await browser.newPage();
    await page.route('https://novi.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('https://novi.test/');
    await page.addScriptTag({ path: 'node_modules/mermaid/dist/mermaid.min.js' });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const source = readFileSync('tests/fixtures/youtube.mmd', 'utf8');
    assert.equal(await page.evaluate(async code => {
      try { await (window as any).mermaid.parse(code); return true; } catch { return false; }
    }, source), false, 'the reported diagram reproduces the parser failure');
    await page.evaluate(code => (window as any).draw(code), source);
    await page.locator('.mermaid-diagram svg').waitFor();
    assert.equal(await page.locator('[role="alert"]').count(), 0);
    assert.equal(await page.locator('.mermaid-diagram .node').count(), 15);
    assert.equal(await page.locator('.mermaid-diagram .flowchart-link').count(), 34);
    assert.match(await page.locator('.mermaid-diagram').innerText(), /Key-Value Cache \(e.g., Redis\)/);
    assert.equal(await page.evaluate(() => (window as any).calls), 0, 'common mistakes need no model call');

    await page.evaluate(() => {
      (window as any).repairResult = { ok: true, value: 'flowchart LR\nA["Recovered"] --> B' };
      (window as any).draw('flowchart LR\nA --> [');
    });
    await page.getByText('Recovered', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls), 1);
    await page.evaluate(() => {
      (window as any).repairResult = { ok: false, error: 'Provider is offline' };
      (window as any).draw('flowchart LR\nA --> {');
    });
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /previous diagram is still shown/);
    assert.equal(await page.getByText('Recovered', { exact: true }).count(), 1);
    await page.evaluate(() => { (window as any).repairResult = { ok: true, value: 'flowchart LR\nA["Retried"] --> B' }; });
    await page.getByRole('button', { name: 'Retry drawing' }).click();
    await page.getByText('Retried', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);

    await page.evaluate(() => {
      (window as any).calls = 0;
      window.novi.repairDiagram = async () => ({ ok: true, value: 'flowchart LR\nA --> [' + ++(window as any).calls });
      (window as any).draw('flowchart LR\nA --> [broken');
    });
    await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls), 2, 'automatic repair is bounded');
    assert.equal(await page.getByText('Retried', { exact: true }).count(), 1);
    await page.evaluate(() => {
      window.novi.repairDiagram = () => new Promise(resolve => { (window as any).finishRepair = resolve; });
      (window as any).draw('flowchart LR\nOld --> {');
    });
    await page.waitForFunction(() => !!(window as any).finishRepair);
    await page.evaluate(() => (window as any).draw('flowchart LR\nA["Newest drawing"] --> B'));
    await page.getByText('Newest drawing', { exact: true }).waitFor();
    await page.evaluate(() => (window as any).finishRepair({ ok: true, value: 'flowchart LR\nA["Stale correction"] --> B' }));
    assert.equal(await page.getByText('Stale correction', { exact: true }).count(), 0, 'late repair cannot replace a newer drawing');
    await page.evaluate(() => (window as any).draw('x'.repeat(50_001)));
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Newest drawing', { exact: true }).count(), 1);
    console.log('Diagram smoke passed: YouTube architecture, automatic repair, preserved drawing, retry, bounded failures.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

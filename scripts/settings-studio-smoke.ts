import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { LocalModelDefinition } from '../src/shared/localAI';
const { MODEL_REGISTRY } = createRequire(import.meta.url)('../src/main/services/localModelRegistry.mjs') as { MODEL_REGISTRY: LocalModelDefinition[] };

async function main() {
  const bundle = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', plugins: [{
    name: 'audio-fixture', setup(build) {
      build.onResolve({ filter: /\/interviewAudio$/ }, () => ({ path: 'audio', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class InterviewAudio { async start() {} async stop() {} close() {} }' }));
    },
  }], stdin: { resolveDir: resolve('.'), loader: 'tsx', contents: `
    import { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ManagedProviders } from './src/renderer/src/components/ManagedProviders';
    import { EngineReadinessList } from './src/renderer/src/components/LocalCodingSetup';
    import { LocalAISetup } from './src/renderer/src/components/LocalAISetup';
    const result = value => ({ ok: true, value: structuredClone(value) });
    const state = { user: { managed: true }, settings: { connections: [{ id: 'gem1', name: 'Gem1', provider: 'gemini', model: 'gemini-2.5-flash', ownerName: 'alok_test_acc', enabled: true }] } };
    const engines = [
      { engine: 'codex', label: 'Codex', installedVersion: '0.163.0-win32-x64', available: false, connections: [], problem: 'Key required' },
      { engine: 'claude', label: 'Claude Code', installedVersion: '0.3.301', available: false, connections: [], problem: 'Key required' },
      { engine: 'antigravity', label: 'Antigravity (agy)', installedVersion: null, available: false, connections: [{ id: 'gem1', name: 'Gem1' }] },
    ];
    window.actions = [];
    window.novi = {
      refreshManaged: async () => result(state),
      enableConnection: async (id, enabled) => { state.settings.connections[0].enabled = enabled; return result(state); },
      getLocalCodingReadiness: async () => result(engines),
      checkEngineUpdate: async engine => result({ latestVersion: '0.164.0', updateAvailable: engine === 'codex' }),
      installEngine: async engine => { window.actions.push('install:' + engine); const item = engines.find(item => item.engine === engine); item.installedVersion = '1.4.0'; item.available = !!item.connections.length; return result(engines); },
      uninstallEngine: async engine => { window.actions.push('uninstall:' + engine); const item = engines.find(item => item.engine === engine); item.installedVersion = null; item.available = false; return result(engines); },
      checkEngineLogin: async () => result('Key accepted'),
      localAISetup: async () => result(window.setup),
      onLocalModelProgress: fn => { window.progress = fn; return () => {}; },
      onInterview: fn => { window.interviewEvent = fn; return () => {}; },
      selectLocalASR: async id => { window.setup.selectedASR = id; window.actions.push('select:' + id); return result({ settings: { localASRModelId: id } }); },
      downloadLocalModel: async id => { window.actions.push('download:' + id); const model = window.setup.models.find(model => model.id === id); model.state = 'READY'; model.downloadedBytes = model.totalBytes; return result(model); },
      deleteLocalModel: async id => { window.actions.push('delete:' + id); const model = window.setup.models.find(model => model.id === id); model.state = 'NOT_INSTALLED'; model.downloadedBytes = 0; return result(model); },
      cancelLocalModelDownload: async id => { window.actions.push('pause:' + id); return result(undefined); },
      startInterview: async input => { window.actions.push(input); return result({ id: 'test', modelId: 'zipformer-en-small', status: 'recording', startedAt: 0 }); },
      stopInterview: async () => result({ id: 'test', modelId: 'zipformer-en-small', status: 'complete' }),
      copyText: async text => { window.actions.push('copy:' + text); return result(undefined); },
    };
    function Fixture() {
      const [snapshot, setSnapshot] = useState(state), [screen, setScreen] = useState('api');
      window.show = setScreen;
      return <main style={{maxWidth: 1000, margin: '20px auto', padding: 12}}>{screen === 'api'
        ? <div className="settings-studio api-studio"><ManagedProviders state={snapshot} onSaved={setSnapshot} /><EngineReadinessList connections={snapshot.settings.connections} managed /></div>
        : <LocalAISetup />}</main>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  ` } });
  const browser = await chromium.launch({ headless: true, ...(process.env.NOVI_BROWSER_PATH ? { executablePath: process.env.NOVI_BROWSER_PATH } : { channel: 'msedge' }) });
  const output = resolve('.test-data/settings-studio'); mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 950 }, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://novi.test/', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('https://novi.test/');
    await page.evaluate(models => {
      (window as any).setup = {
        device: { platform: 'win32', arch: 'x64', cpu: 'Intel(R) Core(TM) i7-14700K', cores: 28, totalMemory: 32 * 1024 ** 3, availableMemory: 16.2 * 1024 ** 3, diskFree: 721.8 * 1024 ** 3 },
        directory: 'C:\\Users\\Example\\AppData\\Roaming\\Novi\\models', selectedASR: 'auto',
        models: models.map(model => ({ ...model, state: ['zipformer-en-small', 'silero-vad'].includes(model.id) ? 'READY' : 'NOT_INSTALLED', totalBytes: model.estimatedBytes, downloadedBytes: 0, recommended: ['zipformer-en-balanced', 'silero-vad'].includes(model.id), liveMode: model.streaming ? 'streaming' : 'simulated', reason: null })),
        features: [{ name: 'Speaker detection', state: 'limited', reason: 'System audio only; overlapping speech is not separated.' }, { name: 'Local analysis', state: 'unavailable', reason: 'The runtime is not integrated yet.' }],
      };
    }, MODEL_REGISTRY);
    await page.addStyleTag({ content: readFileSync('src/renderer/src/styles/app.css', 'utf8') });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const agy = page.getByRole('listitem', { name: 'Antigravity (agy)' });
    await agy.getByRole('button', { name: 'Install', exact: true }).waitFor();
    assert.equal(await page.locator('.settings-studio').evaluate(element => getComputedStyle(element).animationName), 'none', 'respects reduced motion');
    assert.equal(await agy.getByRole('button').count(), 1, 'missing agents only offer Install');
    await page.screenshot({ path: resolve(output, 'api-dark.png'), fullPage: true });
    const codex = page.getByRole('listitem', { name: 'Codex' });
    await codex.getByRole('button', { name: 'Check for updates' }).click();
    await codex.getByRole('button', { name: 'Update', exact: true }).click();
    await codex.getByRole('button', { name: 'Update', exact: true }).waitFor({ state: 'detached' });
    await agy.getByRole('button', { name: 'Install', exact: true }).click();
    await agy.getByRole('button', { name: 'Test connection' }).click();
    await agy.getByText('API key verified.').waitFor();
    await agy.getByRole('button', { name: 'Uninstall', exact: true }).click();
    await agy.getByRole('button', { name: 'Uninstall agent' }).click();
    await agy.getByRole('button', { name: 'Install', exact: true }).waitFor();
    assert.equal(await agy.getByRole('button').count(), 1);
    await page.getByRole('button', { name: 'Deselect Gem1' }).click();
    await page.getByRole('button', { name: 'Select Gem1' }).waitFor();
    await page.getByRole('button', { name: 'Select Gem1' }).click();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.screenshot({ path: resolve(output, 'api-light.png'), fullPage: true });

    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; (window as any).show('local'); });
    await page.getByRole('button', { name: 'Start live test' }).waitFor();
    await page.screenshot({ path: resolve(output, 'local-ai-dark.png'), fullPage: true });
    assert.equal(await page.getByRole('group', { name: 'Model category' }).count(), 1);
    assert.equal(await page.locator('details').count(), 0, 'main controls and model management are not collapsed');
    await page.getByRole('button', { name: 'Start live test' }).click();
    await page.getByRole('button', { name: 'Stop test' }).waitFor();
    assert(await page.getByLabel('Speech model', { exact: true }).isDisabled());
    await page.evaluate(() => (window as any).interviewEvent({ type: 'transcript:final', segment: { sessionId: 'test', segmentId: 'one', source: 'microphone', role: 'candidate', speakerId: 'candidate', text: 'A clear local transcript.', startTime: 0, endTime: 1, revision: 1, isFinal: true } }));
    await page.getByText('A clear local transcript.').waitFor();
    await page.getByRole('button', { name: 'Stop test' }).click();
    await page.getByRole('button', { name: 'Start live test' }).waitFor();
    await page.getByLabel('Speech model', { exact: true }).selectOption('zipformer-en-balanced');
    assert(await page.getByRole('button', { name: 'Start live test' }).isDisabled());
    const balanced = page.getByRole('region', { name: 'English speech — balanced' });
    await balanced.getByRole('button', { name: 'Download', exact: true }).click();
    await balanced.getByText('Installed', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Start live test' }).isEnabled());
    await balanced.getByRole('button', { name: 'Delete files' }).click();
    await balanced.getByRole('button', { name: 'Delete model' }).click();
    await balanced.getByRole('button', { name: 'Download', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add-ons', exact: true }).click();
    await page.getByRole('region', { name: 'Voice activity detection' }).waitFor();
    await page.getByRole('button', { name: 'Copy model folder' }).click();
    await page.getByRole('button', { name: 'Speech', exact: true }).click();
    await page.getByLabel('Speech model', { exact: true }).selectOption('auto');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.screenshot({ path: resolve(output, 'local-ai-light.png'), fullPage: true });

    for (const screen of ['api', 'local']) {
      await page.evaluate(screen => (window as any).show(screen), screen);
      for (const width of [480, 360]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('.settings-studio').waitFor();
        const clipped = await page.locator('.settings-studio button, .settings-studio select, .settings-studio input').evaluateAll(elements => elements.filter(element => { const rect = element.getBoundingClientRect(); return rect.width && (rect.left < 0 || rect.right > innerWidth + 1); }).map(element => element.getAttribute('aria-label') || element.textContent));
        assert.deepEqual(clipped, [], screen + ' controls fit at ' + width);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scrolling');
      }
      await page.screenshot({ path: resolve(output, screen + '-narrow.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('Settings smoke passed: provider selection, agent install/update/uninstall, speech selection/download/delete, live test, light/dark, narrow layouts.');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

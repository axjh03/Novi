import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { RemoteCompanionService } from '../src/main/services/remoteCompanion';
import { SESSION_MODES } from '../src/shared/sessionModes';

test('phone controls reflect actual desktop state, preserve icons and recover after disconnecting', async () => {
  const service = new RemoteCompanionService({} as any, () => null);
  const html = service['renderMobileAppHTML']();
  const elements = new Map<string, any>();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(match[1], {
      textContent: '', disabled: false, hidden: false, value: '', tabIndex: -1, dataset: {},
      style: { setProperty() {} }, attributes: new Map(), options: [],
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {}, setAttribute(key: string, value: string) { this.attributes.set(key, value); },
    });
  }
  const element = (id: string) => elements.get(id)!;
  element('sessionMode').options = SESSION_MODES.map(mode => ({ value: mode.id, disabled: false }));
  const desktop = { mode: 'coding', availableModes: ['normal', 'coding'], busy: false, listening: false, source: 'system' };
  const status = {
    ok: true, username: 'Test user', transparent: false, clickThrough: false, desktopState: desktop,
    smartPlacement: { enabled: false, busy: false, error: '', reason: '', shortcutRegistered: true, shortcut: 'Control+Alt+Shift+Space' },
  };
  const requests: Array<{ path: string; options: any }> = [];
  let offline = false;
  const storage = new Map();
  const runtime: any = {
    URLSearchParams, navigator: {}, history: { replaceState() {} },
    location: { hash: '#token=test-token', pathname: '/' },
    localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    document: { getElementById: element, addEventListener() {} },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: async (path: string, options: any) => {
      if (offline) throw new Error('Offline');
      requests.push({ path, options });
      return { ok: true, json: async () => status };
    },
  };
  runtime.window = runtime;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(script, runtime);
  await runtime.pollStatus();
  assert.equal(element('connectionStatus').textContent, 'Connected');
  assert.equal(element('sessionMode').value, 'coding');
  assert.equal(element('sessionMode').options.find((option: any) => option.value === 'behavioral').disabled, true);
  assert.equal(element('sendPrompt').disabled, false);
  assert.equal(element('stopGeneration').disabled, true);
  assert.equal(element('listenText').textContent, 'Start listening');
  assert.equal(element('btnInteract').disabled, true, 'normal mode always accepts desktop input');

  desktop.busy = true; desktop.listening = true; desktop.source = 'both';
  status.transparent = true; status.clickThrough = true;
  runtime.updateUI(status);
  assert.equal(element('sendPrompt').disabled, true);
  assert.equal(element('stopGeneration').disabled, false);
  assert.equal(element('listenText').textContent, 'Stop listening');
  assert.equal(element('listenButton').attributes.get('aria-pressed'), 'true');
  assert.equal(element('listeningMode').value, 'both');
  assert.equal(element('listeningMode').disabled, true);
  assert.equal(element('txtInteract').textContent, 'Enable desktop input');
  assert.equal(element('btnInteract').disabled, false);
  assert.equal(element('autoDetectText').textContent, 'Find space');
  status.smartPlacement.busy = true;
  runtime.updateUI(status);
  assert.equal(element('autoDetectText').textContent, 'Finding…');
  assert.equal(element('autoDetect').disabled, true);

  await runtime.triggerAction('stop-generation');
  assert.equal(requests.at(-1)!.options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(requests.at(-1)!.options.body), { action: 'stop-generation' });
  runtime.reportConnectionError('Mode unavailable', false);
  assert.equal(element('connectionStatus').textContent, 'Connected', 'an action error does not claim the desktop disconnected');

  offline = true;
  await runtime.pollStatus();
  assert.equal(element('connectionStatus').textContent, 'Disconnected');
  assert.equal(element('stopGeneration').disabled, true);
  offline = false;
  await runtime.pollStatus();
  assert.equal(element('connectionStatus').textContent, 'Connected');
  assert.equal(element('stopGeneration').disabled, false);
  assert.equal(element('connectionError').hidden, true);

  runtime.updateUI({ ...status, desktopState: null });
  assert.equal(element('connectionStatus').textContent, 'No active chat');
  for (const id of ['sessionMode', 'sendPrompt', 'stopGeneration', 'listenButton']) assert.equal(element(id).disabled, true);
});

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
      addEventListener() {}, focus() {}, setAttribute(key: string, value: string) { this.attributes.set(key, value); },
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
  assert.equal(element('connectionError').hidden, true);
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
  assert.equal(element('btnInteract').attributes.get('aria-label'), 'Enable desktop input');
  assert.equal(element('btnInteract').disabled, false);
  assert.equal(element('autoDetect').attributes.get('aria-label'), 'Find desktop space');
  status.smartPlacement.busy = true;
  runtime.updateUI(status);
  assert.equal(element('autoDetect').attributes.get('aria-label'), 'Finding desktop space');
  assert.equal(element('autoDetect').disabled, true);

  await runtime.triggerAction('stop-generation');
  assert.equal(requests.at(-1)!.options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(requests.at(-1)!.options.body), { action: 'stop-generation' });
  runtime.reportConnectionError('Mode unavailable', false);
  assert.equal(element('sendTypedPrompt').disabled, true, 'an action error preserves the desktop generation state');

  offline = true;
  await runtime.pollStatus();
  assert.match(element('connectionError').textContent, /Desktop unavailable/);
  assert.equal(element('stopGeneration').disabled, true);
  offline = false;
  await runtime.pollStatus();
  assert.equal(element('stopGeneration').disabled, false);
  assert.equal(element('connectionError').hidden, true);

  runtime.updateUI({ ...status, desktopState: null });
  for (const id of ['sessionMode', 'sendPrompt', 'stopGeneration', 'listenButton', 'togglePrompt', 'promptText', 'sendTypedPrompt']) assert.equal(element(id).disabled, true);

  desktop.busy = false;
  runtime.updateUI(status);
  runtime.togglePromptEditor(true);
  element('promptText').value = 'Explain this approach.\nKeep it concise.';
  runtime.queuePrompt();
  assert.equal(element('promptComposer').hidden, false);
  assert.equal(element('togglePrompt').attributes.get('aria-expanded'), 'true');
  assert.equal(element('sendTypedPrompt').disabled, false);
  assert.equal(await runtime.syncPrompt(), true);
  assert.deepEqual(JSON.parse(requests.at(-1)!.options.body), { action: 'set-prompt', payload: element('promptText').value });
  runtime.togglePromptEditor(false);
  assert.equal(element('promptComposer').hidden, true);
  assert.match(element('promptText').value, /Explain this approach/, 'collapsing keeps the draft');

  offline = true;
  await runtime.sendPhonePrompt({ preventDefault() {} });
  assert.match(element('promptText').value, /Explain this approach/, 'a failed sync keeps the draft');
  assert.equal(element('promptText').disabled, true);
  offline = false;
  await runtime.pollStatus();
  await runtime.sendCurrentPrompt();
  assert.equal(element('promptText').value, '');
  assert.equal(element('promptComposer').hidden, true);
  assert.deepEqual(requests.slice(-2).map(request => JSON.parse(request.options.body).action), ['set-prompt', 'send-prompt'], 'the latest text reaches the desktop before sending');

  desktop.busy = true;
  runtime.updateUI(status);
  element('promptText').value = 'Draft the next question.';
  runtime.queuePrompt();
  assert.equal(element('promptText').disabled, false, 'drafting is allowed while generating');
  assert.equal(element('sendTypedPrompt').disabled, true);
  assert.equal(await runtime.syncPrompt(), true);
  const beforeSend = requests.length;
  await runtime.sendPhonePrompt({ preventDefault() {} });
  assert.equal(requests.length, beforeSend, 'sending is blocked while the desktop is busy');

  element('promptText').value = 'First draft';
  const firstSync = runtime.syncPrompt();
  element('promptText').value = 'Latest draft';
  const lastSync = runtime.syncPrompt();
  await Promise.all([firstSync, lastSync]);
  assert.deepEqual(requests.slice(-2).map(request => JSON.parse(request.options.body).payload), ['First draft', 'Latest draft'], 'rapid edits are delivered in order');
});

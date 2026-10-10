import { sendInput } from '../src/main/services/validation';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SESSION_MODES, isAppMode, modeInstructions, DRAW_DIAGRAM_PROMPT } from '../src/shared/sessionModes';
import { diagramBlocks } from '../src/shared/diagrams';
import { presetFields, presetMode, SESSION_ROLES } from '../src/renderer/src/context/sessionPresets';
import type { ChatMessage } from '../src/shared/types';

test('all six modes have distinct guidance and respect session instructions', () => {
  assert.equal(SESSION_MODES.length, 6);
  assert.match(modeInstructions('normal'), /direct answer/);
  for (const mode of SESSION_MODES.slice(1)) {
    assert(isAppMode(mode.id));
    assert.match(modeInstructions(mode.id), /additional instructions/);
    assert.match(modeInstructions(mode.id), /level of experience/);
    assert.match(modeInstructions(mode.id), /never invent/);
  }
  assert(!isAppMode('unknown'));
  assert.match(modeInstructions('behavioral', 'car'), /CAR/);
  assert.equal(presetMode('Coding interview'), 'coding');
  assert.equal(presetMode('System design'), 'system-design');
  assert.equal(presetMode('Behavioral interview'), 'behavioral');
  const fields = presetFields(SESSION_ROLES[0], SESSION_ROLES[0].presets[0]);
  assert.deepEqual(fields.map(f => f.label), ['Role / perspective', 'Level / experience', 'Output format', 'Additional instructions']);
  assert.match(DRAW_DIAGRAM_PROMPT, /No diagram changes needed/);
});

test('a closed diagram fence is available during its active stream but incomplete and failed diagrams are excluded', () => {
  const message: ChatMessage = { id: 'live', role: 'assistant', createdAt: 0, content: '```mermaid\nflowchart LR\nA --> B' };
  assert.equal(diagramBlocks([message], 'live').length, 0);
  assert.equal(diagramBlocks([{ ...message, status: undefined, content: '```mermaid\nflowchart LR\nA["inline ``` is not a closing fence"]' }], 'live').length, 0);
  message.content += '\n```\nMore explanation is still arriving';
  assert.equal(diagramBlocks([message], 'live').length, 1);
  assert.equal(diagramBlocks([message]).length, 0);
  message.status = 'error';
  assert.equal(diagramBlocks([message], 'live').length, 0);
});

test('diagram history keeps complete unique versions and ignores partial or failed answers', () => {
  const message = (id: string, code: string, status: ChatMessage['status'] = 'complete', role: ChatMessage['role'] = 'assistant'): ChatMessage => ({ id, role, content: code, status, createdAt: 0, images: [] });
  const graph = '```mermaid\nflowchart LR\nA --> B\n```';
  const blocks = diagramBlocks([
    message('user', graph, 'complete', 'user'), { ...message('stream', graph), status: undefined },
    message('a', '# Initial architecture\n' + graph), message('duplicate', graph),
    message('unchanged', 'No diagram changes needed'),
    message('b', '```mermaid\nflowchart LR\nA --> C\n```'),
    message('code', '```js\nconst a = 1;\n```'),
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].label, 'Initial architecture');
  assert.equal(blocks[1].language, 'mermaid');
  assert.match(blocks[1].code, /A --> C/);
});


test('mode and framework are validated at the request boundary', () => {
  const input = { conversationId: null, content: 'Hello', imageIds: [] };
  assert.throws(() => sendInput({ ...input, appMode: 'bogus' }), /valid mode/);
  assert.throws(() => sendInput({ ...input, behavioralFramework: 'bogus' }), /valid interview framework/);
  assert.equal(sendInput({ ...input, appMode: 'system-design' }).appMode, 'system-design');
});

test('installed Mermaid parses saved architecture diagrams and rejects invalid syntax', async () => {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  const blocks = diagramBlocks([{ id: 'architecture', role: 'assistant', status: 'complete', createdAt: 0,
    content: '# Architecture\n```mermaid\nflowchart LR\nClient --> API\nAPI --> Database\n```' }]);
  assert.equal((await mermaid.parse(blocks[0].code)).diagramType, 'flowchart-v2');
  await assert.rejects(() => mermaid.parse('flowchart LR\nA --> ['));
});

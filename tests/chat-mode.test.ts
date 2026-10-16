import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatService } from '../src/main/services/chat';
import { AIProviderFactory } from '../src/main/services/providers';
import { DRAW_DIAGRAM_PROMPT } from '../src/shared/sessionModes';
import { diagramBlocks } from '../src/shared/diagrams';
import type { AIProviderConfig, Conversation } from '../src/shared/types';
import type { ChatRequest } from '../src/main/services/providers';

test('diagram requests use the selected chat connection and report model timeouts accurately', async () => {
  const original = AIProviderFactory.create;
  const connection = { id: 'chosen', name: 'Chosen model', provider: 'compatible' as const, model: 'test-model', baseUrl: 'http://localhost:1234/v1', stream: true };
  const conversations: Conversation[] = [];
  const storage = { conversations, current: () => ({ id: 'owner', settings: { onboardingComplete: true, connections: [connection], activeConnectionId: connection.id } }), save() {} };
  const chat = new ChatService(storage as any, { get: () => '' } as any, { commit() {} } as any);
  let timeout = false;
  AIProviderFactory.create = config => {
    assert.equal(config.model, connection.model);
    return { sendMessage: async request => {
      assert.match(request.messages.at(-1)!.content, /Draw or update the system design diagram/);
      if (timeout) throw new DOMException('Timeout', 'TimeoutError');
      const content = '```mermaid\nflowchart LR\nClient --> API\n```';
      request.onDelta(content);
      return { content };
    } };
  };
  try {
    await chat.send({ conversationId: null, content: DRAW_DIAGRAM_PROMPT, imageIds: [], appMode: 'system-design' }, () => {});
    assert.equal(diagramBlocks(conversations[0].messages).length, 1);
    timeout = true;
    await chat.send({ conversationId: conversations[0].id, content: DRAW_DIAGRAM_PROMPT, imageIds: [], appMode: 'system-design' }, () => {});
    assert.match(conversations[0].messages.at(-1)!.error!, /took too long/);
    assert.equal(diagramBlocks(conversations[0].messages).length, 1, 'a failed update preserves the completed diagram');
  } finally { AIProviderFactory.create = original; }
});

test('deleting a conversation removes it from storage and persists change', () => {
  const account = {
    id: 'user-1',
    conversations: [
      { id: 'conv-1', title: 'First chat', messages: [], createdAt: 1, updatedAt: 1 },
      { id: 'conv-2', title: 'Second chat', messages: [], createdAt: 2, updatedAt: 2 }
    ]
  };
  let saved = false;
  const storage = {
    current: () => account,
    sessionConversations: null as Conversation[] | null,
    save: () => { saved = true; }
  };
  const idToDelete = 'conv-1';
  account.conversations = account.conversations.filter(c => c.id !== idToDelete);
  storage.save();
  assert.equal(saved, true);
  assert.equal(account.conversations.length, 1);
  assert.equal(account.conversations[0].id, 'conv-2');
});

test('diagram repair uses the selected provider, is bounded, and does not alter conversation history', async t => {
  const connection = { id: 'chosen', name: 'Chosen', provider: 'compatible' as const, model: 'test-model', baseUrl: 'http://localhost:1234/v1', stream: true };
  const conversations: Conversation[] = [];
  const save = t.mock.fn();
  const chat = new ChatService({ conversations, current: () => ({ id: 'owner', settings: { connections: [connection], activeConnectionId: 'chosen' } }), save } as any, { get: () => '' } as any, {} as any);
  const create = t.mock.method(AIProviderFactory, 'create', (config: AIProviderConfig) => {
    assert.equal(config.model, 'test-model');
    return { sendMessage: async (request: ChatRequest) => {
      assert.match(request.instructions!, /Preserve its components/);
      assert.equal(request.messages.length, 1);
      assert.deepEqual(JSON.parse(request.messages[0].content), { diagram: 'flowchart LR\nA --> [', parserError: 'parse error' });
      assert.equal(request.signal.aborted, false);
      return { content: '```mermaid\nflowchart LR\nA --> B\n```' };
    } };
  });
  assert.equal(await chat.repairDiagram({ code: 'flowchart LR\nA --> [', error: 'parse error' }), 'flowchart LR\nA --> B');
  assert.equal(save.mock.callCount(), 0);
  assert.deepEqual(conversations, []);
  for (const input of [{ code: 'x'.repeat(50_001), error: 'error' }, { code: '', error: 'error' }, { code: 'graph TD', error: 'x'.repeat(4_001) }]) await assert.rejects(chat.repairDiagram(input), /valid/);
  assert.equal(create.mock.callCount(), 1, 'invalid requests never reach a provider');
});

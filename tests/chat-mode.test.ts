import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatService } from '../src/main/services/chat';
import { AIProviderFactory } from '../src/main/services/providers';
import { DRAW_DIAGRAM_PROMPT } from '../src/shared/sessionModes';
import { diagramBlocks } from '../src/shared/diagrams';
import type { Conversation } from '../src/shared/types';

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

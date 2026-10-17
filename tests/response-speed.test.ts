import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestHistory, contextMessages } from '../src/main/services/requestContext';
import { ChatService } from '../src/main/services/chat';
import { AIProviderFactory } from '../src/main/services/providers';
import { CloudListening } from '../src/renderer/src/services/cloudListening';
import { sendInput } from '../src/main/services/validation';
import type { ChatMessage, Conversation } from '../src/shared/types';

test('compact history retrieves exact older exchanges, preserves the original problem and latest question, and never mutates saved history', () => {
  const messages: ChatMessage[] = Array.from({ length: 60 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', content: `Unrelated topic ${i} ` + 'x'.repeat(1500), createdAt: i }));
  messages[0].content = 'Use TypeScript; handle zero and negative numbers.';
  messages[8].content = 'Correction: the Cedar timeout must be exactly 1729 ms.';
  messages[9].content = '```ts\nconst cedarTimeout = 1729;\n```';
  messages.push({ id: 'latest', role: 'user', content: 'Explain cedarTimeout and the Cedar correction', createdAt: 60 });
  const original = structuredClone(messages);
  const selected = requestHistory(messages, true);
  assert(selected.length < messages.length);
  assert(selected.reduce((sum, message) => sum + message.content.length, 0) < messages.reduce((sum, message) => sum + message.content.length, 0) / 2);
  assert.equal(selected[0], messages[0]);
  assert.equal(selected.at(-1), messages.at(-1));
  assert(selected.includes(messages[8]));
  assert(selected.includes(messages[9]));
  assert.deepEqual(messages, original);
  assert.deepEqual(requestHistory(messages), messages);
});

test('source retrieval retains exact code and values and flags missing excerpts without claiming a summary is complete', () => {
  const context = { instructions: 'Always use Spanish.', summary: 'A short overview.', documents: [
    { name: 'cedar.ts', content: '```ts\nconst timeout = 1729;\n```' },
    { name: 'unrelated.txt', content: 'DO_NOT_INCLUDE unrelated material.' },
  ] };
  const selected = contextMessages(context, 'Explain cedar.ts timeout', true);
  assert.equal(selected[0].content, context.instructions);
  assert(selected[2].content.includes(JSON.stringify(context.documents[0])));
  assert(!selected[2].content.includes('DO_NOT_INCLUDE'));
  assert.match(contextMessages(context, 'zzzzz', true)[2].content, /Ask for full context/);
  assert.match(contextMessages(context, 'zzzzz', false)[2].content, /DO_NOT_INCLUDE/);
  // A session without documents sends only its instructions and summary.
  const plain = contextMessages({ ...context, documents: [] }, 'Explain cedar.ts timeout', true);
  assert.deepEqual(plain.map(message => message.id), ['context-instructions', 'context-summary']);
});

test('chat records separate spans and sanitized usage, keeps pinned constraints stable, and sends only real prompts across models', async t => {
  const connection = { id: 'chosen', name: 'Local', provider: 'compatible' as const, model: 'fast-custom', baseUrl: 'http://localhost:1234/v1', stream: true };
  const conversations: Conversation[] = [];
  const storage = { conversations, current: () => ({ id: 'owner', settings: { onboardingComplete: true, connections: [connection], activeConnectionId: connection.id } }), save() {} };
  const chat = new ChatService(storage as any, { get: () => '' } as any, { commit() {} } as any);
  let calls = 0;
  const logs: unknown[] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => { logs.push(args); });
  t.mock.method(AIProviderFactory, 'create', () => ({ sendMessage: async (request: any) => {
    calls++;
    assert.match(request.instructions, /SECRET_CONSTRAINT/);
    assert(!JSON.stringify(request.messages).includes('UNDERSTOOD'));
    request.onDelta('  ');
    request.onDelta('Useful answer');
    request.onUsage({ input: 100, cachedInput: 80, output: 4, reasoning: 'SECRET_VALUE', unknown: 'SECRET_VALUE' });
    request.onUsage({ output: 9 });
    return { content: 'Useful answer' };
  } }));
  await chat.send({ conversationId: null, content: 'SECRET_PROMPT', imageIds: [], pinnedContext: 'SECRET_CONSTRAINT' }, () => {}, { uiToMainMs: 2, accessMs: 15 });
  const latency = conversations[0].messages.at(-1)!.latency!;
  assert.equal(latency.accessMs, 15);
  assert.equal(latency.uiToMainMs, 2);
  assert(latency.providerFirstUsefulTextMs! >= latency.providerFirstTextMs!);
  assert(latency.providerTotalMs! >= latency.providerFirstUsefulTextMs!);
  assert.deepEqual(latency.usage, { input: 100, cachedInput: 80, output: 9 });
  connection.model = 'deep-custom';
  await chat.send({ conversationId: conversations[0].id, content: 'Explain the previous answer', imageIds: [] }, () => {});
  assert.equal(calls, 2);
  assert.equal(conversations[0].messages.length, 4);
  assert.equal(conversations[0].messages.at(-1)!.model, 'deep-custom');
  assert(!JSON.stringify(logs).includes('SECRET'));
});

test('cloud buffering reports delay separately from transcription and never logs audio or transcript text', async t => {
  const logs: any[] = [], transcripts: string[] = [];
  t.mock.method(console, 'info', (_prefix: string, data: unknown) => { logs.push(data); });
  let requests = 0;
  const listening = new CloudListening(async wav => { requests++; assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF'); return 'SECRET_TRANSCRIPT'; }, segment => transcripts.push(segment.text), message => assert.fail(message));
  const frame = (index: number, speech: boolean) => listening.frame({ sessionId: 'session', source: 'microphone', sequence: index, startTime: index * 100, samples: new Float32Array(1600).fill(speech ? 0.1 : 0) } as any);
  frame(0, true);
  for (let i = 1; i < 8; i++) frame(i, false);
  assert.equal(requests, 0);
  frame(8, false);
  await listening.stop('session');
  assert.equal(requests, 1);
  assert.deepEqual(transcripts, ['SECRET_TRANSCRIPT']);
  assert(logs[0].bufferMs >= 0 && logs[0].queueMs >= 0 && logs[0].requestMs >= 0);
  assert(!JSON.stringify(logs).includes('SECRET'));
});

test('context options validate at the trust boundary', () => {
  const input = { conversationId: null, content: 'Hi', imageIds: [] };
  assert.throws(() => sendInput({ ...input, compactContext: 'yes' }), /context option/);
  assert.throws(() => sendInput({ ...input, pinnedContext: 'x'.repeat(8001) }), /pinned constraints/);
  assert.equal(sendInput({ ...input, sentAt: NaN }).sentAt, undefined);
});

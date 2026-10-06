import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { require as tsxRequire } from 'tsx/cjs/api';
import { SESSION_ROLES, presetFields } from '../src/renderer/src/context/sessionPresets';

import type { Conversation, ChatMessage } from '../src/shared/types';

const { ContextService } = tsxRequire('../src/main/services/context.ts', import.meta.url);
const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
const { LocalAuthService } = tsxRequire('../src/main/services/auth.ts', import.meta.url);
const { ChatService } = tsxRequire('../src/main/services/chat.ts', import.meta.url);
const { readContextFolders } = tsxRequire('../src/main/services/contextFiles.ts', import.meta.url);

test('context seeds new chats while saved history survives sessions without raw reference files', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'novi-context-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'); mkdirSync(source);
  writeFileSync(join(source, 'reference.txt'), 'CONFIDENTIAL_REFERENCE: Project Cedar uses blue buttons.');
  writeFileSync(join(source, 'ignore.csv'), 'DO_NOT_SEND');
  const storage = new Storage(join(root, 'app'));
  await new LocalAuthService(storage).signUp('Test', 'context@example.com', 'test-password');
  const user = storage.current();
  user.settings.connections = [{ id: 'local', name: 'Test model', provider: 'compatible', baseUrl: 'http://localhost:1234/v1', model: 'test-model', stream: false }];
  user.settings.activeConnectionId = 'local'; user.settings.onboardingComplete = true;
  user.conversations.push({ id: 'legacy', title: 'Keep this', messages: [], createdAt: 1, updatedAt: 1 });
  storage.save();
  const context = new ContextService(storage);
  const folders = await context.loadFolders([source]);
  assert.equal(folders[0].files.length, 1);
  assert.throws(() => context.begin({ folderIds: [folders[0].id], purpose: '', fields: [] }));
  const fields = presetFields(SESSION_ROLES[0], SESSION_ROLES[0].presets[0]);
  fields[3].value = 'CUSTOM_CONSTRAINT: Explain jargon in plain English.';
  context.begin({ folderIds: [folders[0].id], purpose: 'Review Cedar UI', fields });
  assert.match(context.prompt, /CONFIDENTIAL_REFERENCE/);
  assert.match(context.prompt, /time and space complexity/);
  assert.match(context.prompt, /Constraints: CUSTOM_CONSTRAINT/);
  assert(!context.prompt.includes('DO_NOT_SEND'));
  const requests: Array<{ messages: Array<{ content: string }> }> = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify({ choices: [{ message: { content: '# Understood\nCedar uses blue buttons. No other files were provided.' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  });
  const chat = new ChatService(storage, { get: () => '' }, { commit() {}, dataUrl() {}, resolve() {} }, context);
  await chat.send({ conversationId: null, content: context.prompt, imageIds: [] }, () => {});
  context.completeInitialization();
  assert.equal(context.session.status, 'ready');
  assert.match(readFileSync(context.summaryPath, 'utf8'), /Cedar/);
  const summaryId = storage.conversations.find((conversation: Conversation) => conversation.title === 'Session context')!.id;
  await chat.send({ conversationId: null, content: 'What color?', imageIds: [] }, () => {});
  assert.equal(requests[1].messages.length, 3);
  assert.match(requests[1].messages[0].content, /CONFIDENTIAL_REFERENCE/);
  assert.match(requests[1].messages[0].content, /Constraints: CUSTOM_CONSTRAINT/);
  assert.equal(requests[1].messages[2].content, 'What color?');
  assert.equal(storage.conversations.length, 3);
  assert(!readFileSync(storage.file, 'utf8').includes('CONFIDENTIAL_REFERENCE'));
  assert.match(readFileSync(storage.file, 'utf8'), /What color\?/);
  await chat.send({ conversationId: summaryId, content: 'Any gaps?', imageIds: [] }, () => {});
  assert.match(requests[2].messages[0].content, /CONFIDENTIAL_REFERENCE/);
  assert.equal(requests[2].messages.at(-1)?.content, 'Any gaps?');
  context.end();
  assert(!existsSync(context.summaryPath));
  assert.equal(storage.sessionConversations, null);
  assert.equal(storage.current().conversations[0].id, 'legacy');
  const reopened = new Storage(storage.directory);
  assert.equal(reopened.current().conversations.length, 3);
  assert(reopened.current().conversations.some((conversation: Conversation) => conversation.messages.some((message: ChatMessage) => message.content === 'What color?')));
  assert(!readFileSync(reopened.file, 'utf8').includes('CONFIDENTIAL_REFERENCE'));
  assert.match(readFileSync(join(source, 'reference.txt'), 'utf8'), /CONFIDENTIAL_REFERENCE/);
  writeFileSync(context.summaryPath, 'abandoned session');
  new ContextService(storage);
  assert(!existsSync(context.summaryPath), 'crash leftovers are removed on next initialization');
});

test('folder loading rejects oversized and non-text content rather than silently truncating it', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'novi-context-limits-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'too-large.txt'), 'a'.repeat(80_001));
  await assert.rejects(() => readContextFolders([root]), /80,000/);
  writeFileSync(join(root, 'too-large.txt'), 'binary\0content');
  await assert.rejects(() => readContextFolders([root]), /plain text/);
});

test('PDF extraction includes page text without a cloud upload', async (t) => {
  try { tsxRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs', import.meta.url); }
  catch { t.skip('pdfjs-dist download is blocked in this environment; run npm install and rerun'); return; }
  const root = mkdtempSync(join(tmpdir(), 'novi-context-pdf-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const stream = 'BT /F1 12 Tf 40 100 Td (Hello PDF context) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  writeFileSync(join(root, 'sample.pdf'), pdf);
  const loaded = await readContextFolders([root]);
  assert.match(loaded[0].documents[0].content, /Hello PDF context/);
  assert.match(loaded[0].documents[0].content, /Page 1/);
});

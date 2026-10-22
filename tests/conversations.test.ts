import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { require as tsxRequire } from 'tsx/cjs/api';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Storage } from '../src/main/services/storage';
import { LocalAuthService } from '../src/main/services/auth';
import { conversationTitle } from '../src/main/services/validation';
import { conversationExport } from '../src/main/services/conversationExport';
import type { Conversation } from '../src/shared/types';

const conversation: Conversation = {
  id: 'chat-1', title: 'Original title', createdAt: 1, updatedAt: 2,
  messages: [{ id: 'message-1', role: 'user', content: 'Describe this image', createdAt: 1,
    images: [{ id: 'image-1', name: 'diagram.png', mimeType: 'image/png' }] }],
};

test('automatic names normalize whitespace and truncate long prompts at a word boundary', () => {
  assert.equal(conversationTitle('  ## Fix\n this error '), 'Fix this error');
  const title = conversationTitle('Explain how the authentication system handles expired sessions and failed requests');
  assert.equal(title, 'Explain how the authentication system handles expired…');
  assert(conversationTitle('x'.repeat(100)).length <= 60);
  assert.equal(conversationTitle(''), 'Image conversation');
});

test('renaming persists without changing messages and rejects invalid or another account’s IDs', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-conversations-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory), auth = new LocalAuthService(storage);
  await auth.signUp('Ada', 'ada@example.com', 'a secure password');
  storage.conversations.push(structuredClone(conversation));
  const renamed = storage.renameConversation(conversation.id, '  Architecture notes  ');
  assert.equal(renamed.title, 'Architecture notes');
  assert.deepEqual(renamed.messages, conversation.messages);
  assert.equal(new Storage(directory).conversations[0].title, 'Architecture notes');
  assert.throws(() => storage.renameConversation(conversation.id, ''), /conversation name/i);
  assert.throws(() => storage.renameConversation(conversation.id, 'a'.repeat(101)), /conversation name/i);
  await auth.signOut();
  await auth.signUp('Grace', 'grace@example.com', 'another secure password');
  assert.throws(() => storage.renameConversation(conversation.id, 'Stolen title'), /could not be found/);
});

test('saved copies include all messages and attachment bytes without mutating account history', () => {
  const copy = conversationExport(conversation, id => {
    assert.equal(id, 'image-1'); return 'data:image/png;base64,TEST';
  });
  assert.deepEqual(copy.messages[0].images, [{ ...conversation.messages[0].images![0], dataUrl: 'data:image/png;base64,TEST' }]);
  assert.equal(copy.messages[0].content, conversation.messages[0].content);
  assert.equal('dataUrl' in conversation.messages[0].images![0], false);
  assert.equal(JSON.parse(JSON.stringify(copy)).title, conversation.title);
});

test('original image bytes remain viewable after ending a session and reopening, with account isolation', async t => {
  const { ImageService } = tsxRequire('../src/main/services/images.ts', import.meta.url);
  const { ContextService } = tsxRequire('../src/main/services/context.ts', import.meta.url);
  const directory = mkdtempSync(join(tmpdir(), 'novi-image-viewer-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory), auth = new LocalAuthService(storage);
  await auth.signUp('Ada', 'ada@example.com', 'a secure password');
  storage.current().settings.connections = [{ id: 'key', name: 'AI', provider: 'gemini', model: 'model', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', stream: true }];
  storage.current().settings.activeConnectionId = 'key';
  const context = new ContextService(storage), images = new ImageService(storage);
  context.beginEmpty();
  const saved = structuredClone(conversation), image = saved.messages[0].images![0];
  image.id = randomUUID();
  const bytes = Buffer.from('original image bytes, retained without resizing');
  writeFileSync(join(directory, 'images', image.id), bytes);
  storage.conversations.push(saved); storage.save();
  const expected = `data:image/png;base64,${bytes.toString('base64')}`;
  assert.equal(images.dataUrl(image.id), expected);
  context.end(); images.clearPending();
  const reopened = new Storage(directory), viewer = new ImageService(reopened);
  assert.equal(viewer.dataUrl(image.id), expected);
  await new LocalAuthService(reopened).signUp('Grace', 'grace@example.com', 'another secure password');
  assert.throws(() => viewer.dataUrl(image.id), /no longer available/);
  assert.throws(() => viewer.dataUrl('../data.json'), /no longer available/);
});

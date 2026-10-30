import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../src/renderer/src/components/chat/Sidebar';
import { WaitingPhrases } from '../src/renderer/src/components/chat/WaitingPhrases';
import { InterfaceStylePicker } from '../src/renderer/src/components/InterfaceStylePicker';

const sidebar = (collapsed: boolean) => renderToStaticMarkup(createElement(Sidebar, {
  collapsed, conversations: [{ id: 'chat', title: 'Saved conversation', messages: [], createdAt: 1, updatedAt: 1 }],
  selectedId: 'chat', displayName: 'Account name', busy: false,
  onToggle() {}, onNew() {}, onSelect() {}, onDelete() {}, onRename() {}, onSave() {}, onSettings() {},
}));

test('a collapsed sidebar renders only its expand button', () => {
  const html = sidebar(true);
  assert.equal([...html.matchAll(/<button\b/g)].length, 1);
  assert.match(html, /aria-label="Expand sidebar"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /<aside|<nav|Saved conversation|Account name|Settings|New session/);
});

test('expanding restores conversation actions, settings and the collapse button', () => {
  const html = sidebar(false);
  for (const label of ['Collapse sidebar', 'New session', 'Saved conversation', 'Settings', 'Rename conversation', 'Save a copy', 'Delete conversation']) assert(html.includes(label), label);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /<nav class="history" aria-label="Conversation history"/);
});

test('the waiting state offers fixed phrases that make no claims about the answer', () => {
  const html = renderToStaticMarkup(createElement(WaitingPhrases));
  assert.match(html, /role="status" aria-label="Novi is thinking"/);
  assert.match(html, /You can say/);
  assert.match(html, /Let me take a moment to think that through/);
  assert.match(html, /Let me work through this step by step/);
  assert.equal(renderToStaticMarkup(createElement(WaitingPhrases)), html);
});

test('appearance offers exactly Classic and Modern with an accessible selected state', () => {
  for (const value of ['classic', 'modern'] as const) {
    const html = renderToStaticMarkup(createElement(InterfaceStylePicker, { value, onChange() {} }));
    assert.match(html, /role="group" aria-label="Interface style"/);
    assert.equal([...html.matchAll(/<button\b/g)].length, 2);
    assert(html.includes(`class="interface-style-option ${value}" aria-pressed="true"`));
    assert.match(html, /Classic/);
    assert.match(html, /Modern/);
  }
});

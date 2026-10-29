import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadyCard } from '../src/renderer/src/components/ReadyCard';
import { READINESS_CHECKS, recordReadiness } from '../src/renderer/src/services/readiness';

/** Renders the ready card to HTML with fixed shortcuts, reading whatever readiness results are recorded so far. */
const card = () => renderToStaticMarkup(createElement(ReadyCard, {
  transparent: false, listenKey: 'Alt+A', snapshotKey: 'Alt+3', practiceDisabled: false, onPractice: () => {}, onDismiss: () => {},
}));

// The tests share readiness.ts's in-memory results, so they run in order: nothing, one failure, all passing.
test('the ready card names unchecked items and says how to test them, instead of an impossible tooltip', () => {
  const html = card();
  assert.match(html, /<p class="ready-note">Not ready yet: Internet, AI connection, Speech files, Microphone, System audio, Screen capture\. After this session, choose Run Get ready on session setup to test them\.<\/p>/);
  assert.doesNotMatch(html, /End the session/);
  assert.match(html, /Before you start/);
});

test('one item left gives a singular note, and failure details stay on the chip', () => {
  for (const { id } of READINESS_CHECKS) recordReadiness(id, id === 'system'
    ? { ok: false, detail: 'No sound detected.' }
    : { ok: true, detail: 'Fine' });
  const html = card();
  assert.match(html, /Not ready yet: System audio\. After this session, choose Run Get ready on session setup to test it\./);
  assert.match(html, /<li class="failed" title="No sound detected\.">/);
});

test('when everything passed there is no note', () => {
  recordReadiness('system', { ok: true, detail: 'Novi can hear your computer’s sound' });
  const html = card();
  assert.doesNotMatch(html, /ready-note/);
  assert.match(html, /You’re set/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSessionTime, insightQuestion } from '../src/shared/liveInsights.ts';
import type { TranscriptSegment } from '../src/shared/interview.ts';

test('session clock preserves elapsed hours and pads seconds', () => {
  assert.equal(formatSessionTime(-1), '00:00');
  assert.equal(formatSessionTime(12999), '00:12');
  assert.equal(formatSessionTime(3601000), '60:01');
});
test('dynamic action comes from the latest finalized system turn, never an invented question', () => {
  const segment: TranscriptSegment = { sessionId: 's', segmentId: '1', speakerId: 'speaker', role: 'interviewer', source: 'system', text: 'Hello. How would you scale it?', startTime: 0, endTime: 1, revision: 1, isFinal: true };
  assert.equal(insightQuestion([]), undefined);
  assert.equal(insightQuestion([segment]), 'How would you scale it?');
  assert.equal(insightQuestion([{ ...segment, isFinal: false }]), undefined);
  assert.equal(insightQuestion([{ ...segment, source: 'microphone' }]), undefined);
  assert.equal(insightQuestion([segment, { ...segment, segmentId: '2', text: 'Thank you.' }]), undefined);
});

import type { TranscriptSegment } from './interview';

export function formatSessionTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// shortcut: question detection uses punctuation, upgrade when semantic insight extraction is available.
export function insightQuestion(segments: TranscriptSegment[]): string | undefined {
  return segments.filter(segment => segment.isFinal && segment.source === 'system').at(-1)?.text.match(/[^.!?]*\?/g)?.at(-1)?.trim();
}

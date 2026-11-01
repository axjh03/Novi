import type { TranscriptSegment } from './interview';

export function formatSessionTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Speech-to-text often drops the question mark, so a sentence that opens like a question counts too.
const INTERROGATIVE = /^(what|how|why|when|where|which|who|whom|whose|can|could|would|should|do|does|did|is|are|was|were|have|has|will|tell me|walk me|talk me|describe|explain|give me an example)\b/i;

/**
 * The question the other side asked last, taken from the latest finalized system-audio turn.
 * It is never invented: a sentence is returned only when it ends with "?" or opens like a question.
 */
export function insightQuestion(segments: TranscriptSegment[]): string | undefined {
  const text = segments.filter(segment => segment.isFinal && segment.source === 'system').at(-1)?.text.trim();
  if (!text) return undefined;
  const marked = text.match(/[^.!?]*\?/g)?.at(-1)?.trim();
  if (marked) return marked;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(sentence => sentence.trim()).filter(Boolean);
  const last = sentences.at(-1);
  return last && last.split(/\s+/).length >= 3 && INTERROGATIVE.test(last) ? last.replace(/[.!]+$/, '') : undefined;
}

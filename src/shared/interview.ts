export type InterviewMode = 'interviewer' | 'conversation' | 'multiple';
export type AudioSource = 'system' | 'microphone';
export interface TranscriptSegment {
  sessionId: string;
  segmentId: string;
  speakerId: string;
  role: 'interviewer' | 'candidate';
  source: AudioSource;
  text: string;
  startTime: number;
  endTime: number;
  revision: number;
  isFinal: boolean;
}
export interface InterviewSession {
  id: string;
  mode: InterviewMode;
  startedAt: number;
  updatedAt: number;
  status: 'recording' | 'complete' | 'interrupted';
  modelId: string;
  modelVersion?: string;
  speakers: Record<string, string>;
  segments: TranscriptSegment[];
  analysis?: string;
}
export interface InterviewStart { mode: InterviewMode; vadThreshold: number; diarization: boolean; speakerThreshold?: number; useVad?: boolean }
export interface InterviewFrame {
  sessionId: string;
  source: AudioSource;
  sequence: number;
  startTime: number;
  samples: Float32Array;
}
export type InterviewEvent =
  | { type: 'transcript:partial' | 'transcript:final'; segment: TranscriptSegment }
  | { type: 'speaker:update'; sessionId: string; speakers: Record<string, string> }
  | { type: 'audio:level'; sessionId: string; source: AudioSource; level: number }
  | { type: 'status'; sessionId: string; status: InterviewSession['status']; message?: string }
  | { type: 'warning'; sessionId: string; message: string }
  | { type: 'analysis:update'; sessionId: string; text: string }
  | { type: 'metrics'; sessionId: string; processingMs: number; queueDepth: number; droppedFrames: number; memoryBytes: number };

// Partials revise a single segment. Finalized text never regresses to a partial.
export function updateTranscript(segments: TranscriptSegment[], incoming: TranscriptSegment): TranscriptSegment[] {
  const index = segments.findIndex(segment => segment.segmentId === incoming.segmentId);
  if (index < 0) return [...segments, incoming].sort((a, b) => a.startTime - b.startTime || a.segmentId.localeCompare(b.segmentId));
  const previous = segments[index];
  if (previous.sessionId !== incoming.sessionId || previous.isFinal || incoming.revision <= previous.revision) return segments;
  const next = [...segments]; next[index] = incoming; return next;
}

export function transcriptDraft(segments: TranscriptSegment[]): string {
  return segments.map(segment => {
    const speaker = segment.source === 'microphone' ? 'You' : segment.speakerId.startsWith('interviewer_') ? `Interviewer ${segment.speakerId.slice('interviewer_'.length)}` : 'Interviewer';
    return `${speaker}: ${segment.text}`;
  }).join('\n');
}

export type ListeningSource = AudioSource | 'both';
export const listeningSources = (source: ListeningSource): AudioSource[] => source === 'both' ? ['system', 'microphone'] : [source];

// Track already-sent words so later partial/final revisions cannot resend a turn.
export class LiveTranscriptDraft {
  private segments: TranscriptSegment[] = [];
  private consumed = new Map<string, number>();
  private prefix = '';
  update(segment: TranscriptSegment) { this.segments = updateTranscript(this.segments, segment); return this.value(); }
  value() {
    const remaining = this.segments.map(segment => ({ ...segment, text: segment.text.trim().split(/\s+/).slice(this.consumed.get(segment.segmentId) || 0).join(' ') })).filter(segment => segment.text);
    return [this.prefix, transcriptDraft(remaining)].filter(Boolean).join('\n');
  }
  edit(text: string) {
    for (const segment of this.segments) this.consumed.set(segment.segmentId, segment.text.trim().split(/\s+/).length);
    this.prefix = text;
  }
  take() { const text = this.value(); this.edit(''); return text; }
  restore(text: string) { this.prefix = [text, this.prefix].filter(Boolean).join('\n'); return this.value(); }
}

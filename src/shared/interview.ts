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

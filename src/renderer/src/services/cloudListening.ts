import type { AudioSource, InterviewFrame, TranscriptSegment } from '../../../shared/interview';

export function pcmWav(parts: Float32Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(44 + length * 2), view = new DataView(bytes.buffer);
  const word = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  word(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const part of parts) for (const sample of part) { view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true); offset += 2; }
  return bytes;
}

// Each request is a complete WAV; raw PCM and recordings are never saved to disk.
export class CloudListening {
  private channels = new Map<AudioSource, { parts: Float32Array[]; start: number; end: number; silence: number }>();
  private queue = Promise.resolve();
  private pending = 0;
  private closed = false;
  constructor(private transcribe: (wav: Uint8Array) => Promise<string>, private emit: (segment: TranscriptSegment) => void, private warn: (message: string) => void) {}
  frame(frame: InterviewFrame) {
    if (this.closed) return;
    const speech = Math.sqrt(frame.samples.reduce((sum, sample) => sum + sample * sample, 0) / frame.samples.length) >= 0.006;
    let channel = this.channels.get(frame.source);
    if (!channel) { if (!speech) return; channel = { parts: [], start: frame.startTime, end: frame.startTime, silence: 0 }; this.channels.set(frame.source, channel); }
    channel.parts.push(frame.samples); channel.end = frame.startTime + 100; channel.silence = speech ? 0 : channel.silence + 100;
    if (channel.silence >= 800 || channel.parts.length >= 50) this.flush(frame.sessionId, frame.source);
  }
  private flush(sessionId: string, source: AudioSource) {
    const channel = this.channels.get(source);
    if (!channel) return;
    this.channels.delete(source);
    if (this.pending >= 4) { this.warn('Cloud transcription is behind. Some audio was skipped; switch to Local or check your connection.'); return; }
    const wav = pcmWav(channel.parts);
    this.pending++;
    this.queue = this.queue.then(async () => {
      const text = await this.transcribe(wav);
      if (text.trim()) this.emit({ sessionId, segmentId: crypto.randomUUID(), source, role: source === 'microphone' ? 'candidate' : 'interviewer', speakerId: source === 'microphone' ? 'microphone_1' : 'system_1', text: text.trim(), startTime: channel.start, endTime: channel.end, revision: 1, isFinal: true });
    }).catch(cause => this.warn(cause instanceof Error ? cause.message : 'Cloud transcription failed.')).finally(() => { this.pending--; });
  }
  async stop(sessionId: string) { this.closed = true; for (const source of this.channels.keys()) this.flush(sessionId, source); await this.queue; }
}

import { randomUUID } from 'node:crypto';
import type { AudioSource, InterviewEvent, InterviewFrame, TranscriptSegment } from '../../shared/interview';

export interface ASRStream { acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void; inputFinished(): void }
export interface StreamingASR {
  createStream(): ASRStream;
  isReady(stream: ASRStream): boolean;
  decode(stream: ASRStream): void | Promise<void>;
  isEndpoint(stream: ASRStream): boolean;
  reset(stream: ASRStream): void;
  getResult(stream: ASRStream): { text: string };
}
export interface VoiceDetector { acceptWaveform(samples: Float32Array): void; isDetected(): boolean; isEmpty(): boolean; pop(): void; reset(): void }
interface Channel {
  stream: ASRStream; vad?: VoiceDetector; active: boolean; preRoll: InterviewFrame[];
  id: string; text: string; revision: number; start: number; end: number; silence: number; lastSequence: number;
  audio: Float32Array[];
}

// The recognizer is replaceable; source attribution and segment lifecycle are not.
export class InterviewEngine {
  private channels = new Map<AudioSource, Channel>();
  constructor(private sessionId: string, private recognizer: StreamingASR, private emit: (event: InterviewEvent) => void,
    private threshold = 0.006, private makeVad?: () => VoiceDetector,
    private speakerFor?: (samples: Float32Array) => string) {}

  async frame(frame: InterviewFrame) {
    let channel = this.channels.get(frame.source);
    if (!channel) {
      channel = { stream: this.recognizer.createStream(), vad: this.makeVad?.(), active: false, preRoll: [], id: randomUUID(), text: '', revision: 0, start: frame.startTime, end: frame.startTime, silence: 0, lastSequence: -1, audio: [] };
      this.channels.set(frame.source, channel);
    }
    if (frame.sequence <= channel.lastSequence) throw new Error('Out-of-order audio frame.');
    if (channel.lastSequence >= 0 && frame.sequence !== channel.lastSequence + 1) {
      await this.finish(frame.source, channel);
      channel.preRoll = []; channel.vad?.reset();
    }
    channel.lastSequence = frame.sequence;
    channel.end = frame.startTime + frame.samples.length / 16;
    const rms = Math.sqrt(frame.samples.reduce((sum, sample) => sum + sample * sample, 0) / frame.samples.length);
    this.emit({ type: 'audio:level', sessionId: this.sessionId, source: frame.source, level: Math.min(1, rms * 8) });
    channel.vad?.acceptWaveform(frame.samples);
    const speech = channel.vad ? channel.vad.isDetected() : rms >= this.threshold;
    if (channel.vad) while (!channel.vad.isEmpty()) channel.vad.pop();
    if (!channel.active) {
      channel.preRoll.push(frame);
      if (channel.preRoll.length > 4) channel.preRoll.shift();
      if (!speech) return;
      channel.active = true; channel.start = channel.preRoll[0].startTime;
      for (const previous of channel.preRoll) this.accept(channel, previous.samples);
      channel.preRoll = [];
    } else this.accept(channel, frame.samples);
    channel.silence = speech ? 0 : channel.silence + frame.samples.length / 16;
    await this.decode(channel);
    const final = this.recognizer.isEndpoint(channel.stream) || channel.silence >= 1000 || channel.end - channel.start >= 20_000;
    if (final) await this.finish(frame.source, channel);
    else this.result(frame.source, channel, false);
  }
  private accept(channel: Channel, samples: Float32Array) {
    channel.stream.acceptWaveform({ samples, sampleRate: 16000 });
    if (this.speakerFor) channel.audio.push(samples);
  }
  private async decode(channel: Channel) {
    let steps = 0;
    while (this.recognizer.isReady(channel.stream)) {
      if (++steps > 1000) throw new Error('Speech decoder exceeded its processing limit.');
      await this.recognizer.decode(channel.stream);
    }
  }
  private result(source: AudioSource, channel: Channel, final: boolean) {
    const raw = this.recognizer.getResult(channel.stream).text.trim() || (final ? channel.text : '');
    const text = (final ? raw : mergePartial(channel.text, raw)).slice(0, 32_000);
    if (!text || (!final && text === channel.text)) return;
    channel.text = text;
    let speakerId = source === 'microphone' ? 'microphone_1' : 'system_1';
    if (final && source === 'system' && this.speakerFor) {
      const samples = new Float32Array(channel.audio.reduce((size, part) => size + part.length, 0));
      let offset = 0;
      for (const part of channel.audio) { samples.set(part, offset); offset += part.length; }
      speakerId = this.speakerFor(samples);
    }
    const segment: TranscriptSegment = { sessionId: this.sessionId, segmentId: channel.id, source, speakerId,
      role: source === 'microphone' ? 'candidate' : 'interviewer', text, startTime: channel.start,
      endTime: channel.end, revision: ++channel.revision, isFinal: final };
    this.emit({ type: final ? 'transcript:final' : 'transcript:partial', segment });
  }
  private async finish(source: AudioSource, channel: Channel) {
    if (!channel.active) return;
    channel.stream.acceptWaveform({ samples: new Float32Array(12800), sampleRate: 16000 });
    channel.stream.inputFinished();
    await this.decode(channel); this.result(source, channel, true);
    this.recognizer.reset(channel.stream);
    channel.id = randomUUID(); channel.text = ''; channel.revision = 0; channel.silence = 0; channel.active = false; channel.audio = [];
  }
  async stop() { for (const [source, channel] of this.channels) await this.finish(source, channel); }
  disableOptional() {
    this.speakerFor = undefined; this.makeVad = undefined;
    for (const channel of this.channels.values()) { channel.vad = undefined; channel.audio = []; }
  }
}

function mergePartial(previous: string, incoming: string) {
  if (!previous || incoming.startsWith(previous) || previous.startsWith(incoming)) return incoming.length >= previous.length ? incoming : previous;
  const oldWords = previous.split(/\s+/), newWords = incoming.split(/\s+/);
  for (let count = Math.min(oldWords.length, newWords.length); count > 0; count--) {
    if (oldWords.slice(-count).join(' ').toLowerCase() === newWords.slice(0, count).join(' ').toLowerCase()) return [...oldWords, ...newWords.slice(count)].join(' ');
  }
  return incoming;
}

export function validateFrame(value: unknown): InterviewFrame {
  const frame = value as InterviewFrame;
  if (!frame || typeof frame.sessionId !== 'string' || frame.sessionId.length > 64 ||
    !['system', 'microphone'].includes(frame.source) || !Number.isSafeInteger(frame.sequence) || frame.sequence < 0 ||
    !Number.isFinite(frame.startTime) || frame.startTime < 0 || frame.startTime > 24 * 3600_000 ||
    !(frame.samples instanceof Float32Array) || frame.samples.length !== 1600 ||
    !frame.samples.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1)) throw new Error('Invalid interview audio frame.');
  return frame;
}

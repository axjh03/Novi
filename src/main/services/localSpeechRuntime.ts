import { availableParallelism } from 'node:os';
import { InterviewEngine, type StreamingASR, type VoiceDetector } from './interviewEngine';
import { speakerResolver, type SpeakerExtractor } from './interviewSpeakers';
import type { InterviewEvent } from '../../shared/interview';

export interface SpeechRuntimeOptions {
  sessionId: string; modelId: string; files: Record<string, string>; vadFile?: string; speakerFile?: string;
  speakerThreshold?: number; vadThreshold: number;
}
export async function createSpeechEngine(options: SpeechRuntimeOptions, emit: (event: InterviewEvent) => void) {
  const sherpa = require('sherpa-onnx-node') as {
    OnlineRecognizer: new (config: object) => StreamingASR;
    OfflineRecognizer: { createAsync(config: object): Promise<OfflineRecognizer> };
    Vad: new (config: object, seconds: number) => VoiceDetector;
    SpeakerEmbeddingExtractor: new (config: object) => SpeakerExtractor;
  };
  const file = (prefix: string) => Object.entries(options.files).find(([name]) => name.startsWith(prefix))?.[1];
  const selectedModel = Object.entries(options.files).map(([name]) => name).join(' ');
  const isWhisper = selectedModel.includes('tiny.en-encoder');
  const isParakeet = !isWhisper && options.modelId === 'parakeet-tdt-0.6b';
  if (isWhisper || isParakeet) {
    let recognizer: OfflineRecognizer | undefined;
    const ready = sherpa.OfflineRecognizer.createAsync({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        ...(isWhisper ? { whisper: { encoder: file('tiny.en-encoder'), decoder: file('tiny.en-decoder'), language: 'en', task: 'transcribe', tailPaddings: -1 } }
          : { transducer: { encoder: file('encoder.int8'), decoder: file('decoder.int8'), joiner: file('joiner.int8') }, modelType: 'nemo_transducer' }),
        tokens: file('tiny.en-tokens') || file('tokens.txt'), numThreads: 2, provider: 'cpu', debug: false,
      },
    }).then(value => { recognizer = value; });
    class WindowStream {
      samples: Float32Array[] = []; pending = 0; text = ''; final = false; decoding = false;
      acceptWaveform({ samples }: { samples: Float32Array; sampleRate: number }) { this.samples.push(samples.slice()); this.pending += samples.length; }
      inputFinished() { this.final = true; }
    }
    const windows: StreamingASR = {
      createStream: () => new WindowStream(),
      isReady: stream => { const current = stream as WindowStream; return !current.decoding && (current.final ? current.pending > 0 : current.pending >= 32_000); },
      decode: async stream => {
        await ready;
        const current = stream as WindowStream; current.decoding = true;
        try {
          const all = new Float32Array(current.samples.reduce((sum, chunk) => sum + chunk.length, 0));
          let offset = 0; for (const chunk of current.samples) { all.set(chunk, offset); offset += chunk.length; }
          // Every two seconds, decode a bounded six-second window for interim text;
          // decode the full (max 20 s) utterance once VAD/end-pointing finalizes it.
          const audio = current.final ? all : all.slice(Math.max(0, all.length - 96_000));
          const streamForDecode = recognizer!.createStream(); streamForDecode.acceptWaveform({ samples: audio, sampleRate: 16000 });
          await recognizer!.decodeAsync(streamForDecode);
          current.text = recognizer!.getResult(streamForDecode).text;
          current.pending = 0;
        } finally { current.decoding = false; }
      },
      isEndpoint: () => false,
      reset: stream => { const current = stream as WindowStream; current.samples = []; current.pending = 0; current.text = ''; current.final = false; },
      getResult: stream => ({ text: (stream as WindowStream).text }),
    };
    await ready;
    return configureEngine(options, emit, windows, sherpa);
  }
  const recognizer = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { transducer: { encoder: file('encoder-'), decoder: file('decoder-'), joiner: file('joiner-') },
      tokens: file('tokens.txt'), numThreads: Math.max(1, Math.min(2, availableParallelism() - 1)), provider: 'cpu', debug: false },
    decodingMethod: 'greedy_search', enableEndpoint: true,
    rule1MinTrailingSilence: 1.5, rule2MinTrailingSilence: 0.8, rule3MinUtteranceLength: 20,
  });
  return configureEngine(options, emit, recognizer, sherpa);
}

function configureEngine(options: SpeechRuntimeOptions, emit: (event: InterviewEvent) => void, recognizer: StreamingASR, sherpa: any) {
  const makeVad = options.vadFile ? () => new sherpa.Vad({ sileroVad: { model: options.vadFile, threshold: 0.5, minSilenceDuration: 0.5, minSpeechDuration: 0.1, maxSpeechDuration: 20, windowSize: 512 }, sampleRate: 16000, numThreads: 1, provider: 'cpu', debug: false }, 30) : undefined;
  // Validate optional models before audio starts, allowing a clean startup fallback.
  const detectors = makeVad ? [makeVad(), makeVad()] : [];
  const speakerFor = options.speakerFile ? speakerResolver(new sherpa.SpeakerEmbeddingExtractor({ model: options.speakerFile, numThreads: 1, provider: 'cpu', debug: false }), options.speakerThreshold ?? 0.6,
    () => emit({ type: 'warning', sessionId: options.sessionId, message: 'Speaker detection failed. Transcription continues with source labels.' })) : undefined;
  return new InterviewEngine(options.sessionId, recognizer, emit, options.vadThreshold, makeVad ? () => detectors.shift()! : undefined, speakerFor);
}

interface OfflineRecognizer {
  createStream(): { acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void };
  decodeAsync(stream: unknown): Promise<unknown>;
  getResult(stream: unknown): { text: string };
}

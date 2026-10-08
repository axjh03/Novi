import type { ASRStream } from './interviewEngine';

export interface SpeakerExtractor {
  createStream(): ASRStream;
  isReady(stream: ASRStream): boolean;
  compute(stream: ASRStream): Float32Array;
}

// ponytail: turn-level clustering cannot split overlapping speakers or a speaker
// change within one utterance. Full frame-level diarization is a separate model.
export function speakerResolver(extractor: SpeakerExtractor, threshold: number, onFailure: () => void) {
  const centroids: Float32Array[] = [];
  let failed = false;
  return (samples: Float32Array): string => {
    if (failed || samples.length < 16000) return 'system_1';
    try {
      const stream = extractor.createStream();
      stream.acceptWaveform({ sampleRate: 16000, samples }); stream.inputFinished();
      if (!extractor.isReady(stream)) return 'system_1';
      const vector = extractor.compute(stream);
      const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
      if (!Number.isFinite(norm) || norm === 0) return 'system_1';
      const normalized = Float32Array.from(vector, value => value / norm);
      let best = -1, score = -1;
      centroids.forEach((centroid, index) => {
        const similarity = normalized.reduce((sum, value, i) => sum + value * centroid[i], 0);
        if (similarity > score) { best = index; score = similarity; }
      });
      if (score < threshold) {
        if (centroids.length >= 8) return 'system_1';
        centroids.push(normalized); best = centroids.length - 1;
      }
      return `interviewer_${best + 1}`;
    } catch { failed = true; onFailure(); return 'system_1'; }
  };
}

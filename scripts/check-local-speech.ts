import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { ModelManager } from '../src/main/services/localModels.mjs';
import { createSpeechEngine } from '../src/main/services/localSpeechRuntime';

// Explicit local files only; this check never downloads or uploads anything.
async function main() {
  const [dataDirectory, wavPath, modelId = 'zipformer-en-small'] = process.argv.slice(2);
  assert(dataDirectory && wavPath, 'Usage: node --import tsx scripts/check-local-speech.ts <Novi userData directory> <16kHz mono WAV> [model-id]');
  assert(statSync(wavPath).size < 20 * 1024 ** 2, 'Use a short speech sample under 20 MB.');
  const models = new ModelManager(resolve(dataDirectory), { fetcher: async () => { throw new Error('Network access is forbidden in the inference check.'); }, log: () => {} });
  const lease = await models.acquire(modelId);
  try {
    const sherpa = require('sherpa-onnx-node');
    const wave = sherpa.readWave(resolve(wavPath)) as { samples: Float32Array; sampleRate: number };
    assert.equal(wave.sampleRate, 16000, 'Provide 16 kHz mono WAV.');
    let partials = 0, finals = 0;
    const engine = await createSpeechEngine({ sessionId: 'local-smoke', modelId, files: lease.files, vadThreshold: 0.006 }, event => {
      if (event.type === 'transcript:partial') partials++;
      if (event.type === 'transcript:final') finals++;
    });
    const start = performance.now();
    for (let offset = 0, sequence = 0; offset < wave.samples.length; offset += 1600, sequence++) {
      const samples = new Float32Array(1600); samples.set(wave.samples.subarray(offset, offset + 1600));
      await engine.frame({ sessionId: 'local-smoke', source: 'system', sequence, startTime: sequence * 100, samples });
    }
    await engine.stop();
    assert(partials > 1 && finals > 0, 'Expected multiple live updates and a final transcript; use a spoken English sample longer than five seconds.');
    console.log(JSON.stringify({ partials, finals, realTimeFactor: (performance.now() - start) / (wave.samples.length / 16), contentLogged: false }));
  } finally { lease.release(); await models.shutdown(); }
}
void main().catch(() => { console.error('Local speech check failed. Verify arguments, installed model integrity, available memory, and WAV format.'); process.exitCode = 1; });

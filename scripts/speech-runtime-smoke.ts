import assert from 'node:assert/strict';
import { ModelManager } from '../src/main/services/localModels.mjs';
import { createSpeechEngine } from '../src/main/services/localSpeechRuntime';

async function main() {
  assert(process.argv[2], 'Provide the model staging directory');
  const models = new ModelManager(process.argv[2], { fetcher: async () => { throw new Error('Runtime smoke must work offline'); } });
  const speech = await models.acquire('zipformer-en-small'), vad = await models.acquire('silero-vad');
  try {
    for (const useVad of [false, true]) {
      let levels = 0;
      const engine = await createSpeechEngine({ sessionId: 'smoke', modelId: 'zipformer-en-small', files: speech.files,
        vadFile: useVad ? vad.files['onnx/model.onnx'] : undefined, vadThreshold: 0.006 }, event => { if (event.type === 'audio:level') levels++; });
      for (let sequence = 0; sequence < 30; sequence++) {
        const samples = Float32Array.from({ length: 1600 }, (_, i) => sequence < 20 ? Math.sin(i * 0.1) * 0.2 : 0);
        for (const source of ['system', 'microphone'] as const) await engine.frame({ sessionId: 'smoke', source, sequence, startTime: sequence * 100, samples });
      }
      await engine.stop();
      assert.equal(levels, 60);
    }
    console.log('Offline speech and neural VAD runtime checks passed.');
  } finally { speech.release(); vad.release(); await models.shutdown(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

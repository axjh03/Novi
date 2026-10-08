// Versioned, publisher-hosted weights. Resolve file digests at these immutable
// revisions; never accept model URLs, filenames, or checksums from the renderer.
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
export const MODEL_REGISTRY = Object.freeze([
  {
    id: 'zipformer-en-small', name: 'English speech — lightweight', type: 'asr',
    repository: 'csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17',
    version: 'd42f2d9f7ca24806fb667456a18a9f1b60f70d16', license: 'Apache-2.0',
    runtime: 'sherpa-onnx', streaming: true, languages: ['en'], quality: 1,
    estimatedBytes: 44 * MiB, estimatedRamBytes: 512 * MiB,
    files: ['encoder-epoch-99-avg-1.int8.onnx', 'decoder-epoch-99-avg-1.int8.onnx', 'joiner-epoch-99-avg-1.int8.onnx', 'tokens.txt'],
  },
  {
    id: 'zipformer-en-balanced', name: 'English speech — balanced', type: 'asr',
    repository: 'csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26',
    version: '672fbf1b30579d6585301139bb363f42a0ad4a24', license: 'Apache-2.0',
    runtime: 'sherpa-onnx', streaming: true, languages: ['en'], quality: 2,
    estimatedBytes: 74 * MiB, estimatedRamBytes: 1024 * MiB,
    files: ['encoder-epoch-99-avg-1-chunk-16-left-64.int8.onnx', 'decoder-epoch-99-avg-1-chunk-16-left-64.int8.onnx', 'joiner-epoch-99-avg-1-chunk-16-left-64.int8.onnx', 'tokens.txt'],
  },
  {
    id: 'parakeet-tdt-0.6b', name: 'Parakeet TDT 0.6B — simulated live', type: 'asr',
    repository: 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
    version: '1ab9323565ddb038682214b292f588070a538ce2', license: 'CC-BY-4.0',
    runtime: 'sherpa-onnx-offline', liveMode: 'simulated', streaming: false, languages: ['en'], quality: 3,
    estimatedBytes: 661 * MiB, estimatedRamBytes: 4 * 1024 ** 3,
    files: ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
  },
  {
    id: 'whisper-tiny-en', name: 'Whisper tiny.en — simulated live', type: 'asr',
    repository: 'csukuangfj/sherpa-onnx-whisper-tiny.en',
    version: '2ffb4044a6556d7c2b4b335845ed4135fd5913ac', license: 'MIT',
    runtime: 'sherpa-onnx-offline', liveMode: 'simulated', streaming: false, languages: ['en'], quality: 2,
    estimatedBytes: 104 * MiB, estimatedRamBytes: 768 * MiB,
    files: ['tiny.en-encoder.int8.onnx', 'tiny.en-decoder.int8.onnx', 'tiny.en-tokens.txt'],
  },
  {
    id: 'silero-vad', name: 'Voice activity detection', type: 'vad',
    repository: 'onnx-community/silero-vad',
    version: 'e71cae966052b992a7eca6b17738916ce0eca4ec', license: 'MIT',
    runtime: 'onnx', streaming: true, languages: [], quality: 1,
    estimatedBytes: 3 * MiB, estimatedRamBytes: 64 * MiB,
    files: ['onnx/model.onnx', 'LICENSE'],
  },
  {
    id: 'campplus-speakers', name: 'Optional speaker detection — Lite', type: 'diarization',
    repository: 'csukuangfj/speaker-embedding-models',
    version: '0743f301363dec56491a490f6d6cbc9d67f9a3bf', license: 'Apache-2.0',
    runtime: 'sherpa-onnx', streaming: false, languages: [], quality: 1,
    estimatedBytes: 29 * MiB, estimatedRamBytes: 256 * MiB,
    files: ['3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx'],
  },
  {
    id: 'qwen-0.5b-q4', name: 'Optional interview analysis — lightweight', type: 'llm',
    repository: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    version: '9217f5db79a29953eb74d5343926648285ec7e67', license: 'Apache-2.0',
    runtime: 'llama.cpp', streaming: false, languages: ['en'], quality: 1,
    estimatedBytes: 491_000_000, estimatedRamBytes: 1536 * MiB,
    files: ['qwen2.5-0.5b-instruct-q4_k_m.gguf', 'LICENSE'],
  },
].map(model => Object.freeze({ ...model, files: Object.freeze(model.files), languages: Object.freeze(model.languages) })));

export function modelById(id, registry = MODEL_REGISTRY) {
  if (typeof id !== 'string') throw new Error('Choose a registered local model.');
  const model = registry.find(item => item.id === id);
  if (!model) throw new Error('Unknown local model.');
  return model;
}

// Estimates are conservative admission budgets, not measured latency promises.
// GPU models are not recommended until an actual inference backend is probed.
export function selectModels(device, registry = MODEL_REGISTRY) {
  const supported = ['darwin', 'win32', 'linux'].includes(device.platform) && ['arm64', 'x64'].includes(device.arch);
  const reasons = {}, memoryWarnings = {};
  for (const model of registry) {
    reasons[model.id] = supported ? null : 'No verified native runtime target for this operating system/architecture.';
    memoryWarnings[model.id] = model.estimatedRamBytes > device.totalMemory * 0.35
      ? `This model may use substantial memory on a ${Math.round(device.totalMemory / GiB)} GB system; close other apps before running it.` : null;
  }
  const speech = registry.filter(m => m.type === 'asr' && m.streaming && !reasons[m.id])
    .sort((a, b) => (device.totalMemory >= 12 * 1024 ** 3 && device.cores >= 4 ? b.quality - a.quality : a.estimatedRamBytes - b.estimatedRamBytes))[0];
  const vad = registry.find(m => m.type === 'vad' && !reasons[m.id]);
  return { required: speech ? [speech.id, ...(vad ? [vad.id] : [])] : [], reasons, memoryWarnings };
}

# Local interview implementation checkpoints

## Checkpoint 1: hardware and model setup

Implemented in the existing desktop, without a new application, database, framework, or npm dependency:

- Settings → Local AI, using existing settings styles and typed preload/IPC.
- CPU, OS, architecture, memory, free disk, and Electron GPU discovery. Unknown VRAM/backend support stays unknown; discovery does not claim usable acceleration.
- Hardware-aware English ASR recommendations, keeping a system memory reserve. RAM values are admission estimates, not benchmarks. Optional analysis weights are not selected automatically.
- Versioned model directories: `<Electron userData>/models/<type>/<id>/<revision>/`. No weights in source or application bundle. `NOVI_DATA_DIR` continues to work for isolated runs.
- Publisher metadata is resolved at pinned commit revisions. LFS files are checked against publisher SHA256; small Git files are checked against Git blob hashes and receive SHA256 in installed metadata. Full files are streamed through hashing, not loaded into RAM.
- Range resume, correct handling of a server ignoring Range, three weight download attempts, cancellation, size limits, free-space reserve, HTTPS/CDN validation, and atomic verified metadata.
- Duplicate download prevention, re-verification before acquiring a model lease, duplicate lease prevention, and deletion blocked while leased. Deletion removes only catalog-owned files at the registered version.
- Interrupted installations remain resumable across app restarts. Corrupt downloaded bytes are deleted and retried. Corrupt installed files are reported and repaired on download.
- Content-free structured model-state/retry logs. No automatic downloads or inference.

Checkpoint 1 provided weights only. The following checkpoint adds the interview pipeline; it does not change the old cloud recorder or managed account access policy.

The new model core is dependency-free ESM with a TypeScript boundary declaration so its failure checks can run even without Electron/tsx installed. The rest of Novi retains its existing TypeScript/React architecture.

## Model sources

These are public publisher repositories, not inference endpoints:

- [Lightweight streaming English Zipformer](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/tree/d42f2d9f7ca24806fb667456a18a9f1b60f70d16), Apache-2.0.
- [Balanced streaming English Zipformer](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/tree/672fbf1b30579d6585301139bb363f42a0ad4a24), Apache-2.0.
- [Quantized Parakeet TDT 0.6B v2](https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/tree/1ab9323565ddb038682214b292f588070a538ce2), CC-BY-4.0; offline recognition is exposed as simulated-live window updates.
- [Quantized Whisper tiny.en](https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/tree/2ffb4044a6556d7c2b4b335845ed4135fd5913ac), MIT; offline recognition is exposed as simulated-live window updates.
- [Silero VAD ONNX](https://huggingface.co/onnx-community/silero-vad/tree/e71cae966052b992a7eca6b17738916ce0eca4ec), MIT.
- [Qwen2.5 0.5B Instruct GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/tree/9217f5db79a29953eb74d5343926648285ec7e67), Apache-2.0. Optional weights; no LLM engine bundled yet.

Settings → Local AI lets the user choose automatic hardware recommendation or a specific installed ASR. Zipformer uses native streaming partials. Parakeet and Whisper use bounded rolling-window offline decodes to provide simulated-live partials; they can lag or revise differently and need real hardware benchmarking. The Settings live test compares models, microphone/system inputs, VAD on/off, and optional speaker labeling for system audio. This does not make offline models equivalent to native streaming.

## Validation on 2026-10-07

- The user installed Node 24.21.0 and dependencies with `npm ci`; their full test run passed 18 model checks and 28 existing checks.
- After fixing the GPU discovery boundary to accept Electron's `unknown` result and validate its fields, `npm run test:local-models` and `npm run build` pass in the workspace using Node 24.21.0. Regression coverage includes missing/malformed GPU information.
- The earlier missing-dependency/typecheck blocker is resolved. npm was reachable from the user's normal terminal; real model downloads have not been exercised.
- Native Electron/OS capture, rendered UI, model inference, and installer checks have not run.

## Checkpoint 2: streaming interview pipeline

- Existing ContextPage and ChatPage link to InterviewPage; no new app or framework.
- `sherpa-onnx-node@1.13.8` runs in an Electron utility process. CPU streaming Zipformer returns changing partials every decoder update; silence/endpoint/stop finalizes the same segment ID. No sentence-length batching before first decode.
- Each input uses its own browser AudioContext (16 kHz), AudioWorklet, ASR stream, VAD state, role, and sequence. Microphone is never requested in interviewer-only mode. Chromium platform capture or an explicitly selected loopback input supplies system audio. macOS may need BlackHole; Linux may need a PipeWire/PulseAudio monitor routed into an input. These are not bundled native capture drivers and require OS validation.
- The renderer necessarily captures browser audio: each source sends bounded 100 ms / 6.4 KB PCM frames, at most two outstanding per source and four in main. Worklet credits drop excess audio, sequence gaps finalize prior speech, and UI warnings prevent silent growing delays. This is a bounded IPC compromise, not a main/native capture backend.
- Verified models are leased only on start and released on stop. Optional VAD/speaker initialization failure retries with source attribution and RMS voice detection. Low memory disables optional processing, and critical pressure stops safely. There is no proven GPU inference backend yet, nor automatic live quality/model switching.
- Final segments are individually flushed and atomically renamed under `userData/interviews/<account hash>/<session UUID>/segments/`; metadata reuses existing JSON storage helpers. An unfinished session is recoverable on restart. Raw audio and embeddings are not saved.
- Remote file reads, directory listings, symlink targets, and ancestor archives exclude interview storage. Legacy cloud send/recording/attachment/screenshot IPC is blocked during active local interviews. Interview-page shortcuts do not start the old recorder.
- Optional Lite speaker detection uses [CAM++ common weights](https://huggingface.co/csukuangfj/speaker-embedding-models/tree/0743f301363dec56491a490f6d6cbc9d67f9a3bf), from the [Apache-2.0 ModelScope model](https://www.modelscope.cn/models/damo/speech_campplus_sv_zh-cn_16k-common). It clusters completed system-audio turns only, up to eight labels, with adjustable similarity and rename support. This is **not** full diarization: overlap and within-turn speaker changes cannot be separated; accuracy across languages/devices needs benchmarking. Embeddings are memory-only.
- Existing online managed authentication remains required. Inference itself uses local files and never falls back to cloud. Fully offline application access still needs an independent local access flow; this is not yet the complete requested offline product.
- The optional GGUF is downloadable, but local LLM inference is still unavailable. Do not mistake installed weights for an installed analysis runtime.
- Linux ARM64 packaging targets and native sherpa unpack rules are added; installers are not yet validated.

### Verification and remaining release gates

Build/typecheck and 51 automated checks pass (18 model checks, 28 existing checks, five interview checks). The interview checks cover partial/final updates, independent roles, recovery, malformed frames, remote file privacy, optional speaker failure, and bounded AudioWorklet credits. In this sandbox, use `node --import tsx --test --test-isolation=none tests/*.test.ts` and `node tests/local-models.test.mjs`: the normal tsx CLI cannot bind its IPC socket. The desktop smoke script also cannot bind its local fixture server here (`EPERM`). Hugging Face/npm DNS is unavailable from this sandbox, so real model/audio inference and capture have not been validated here. The installed native sherpa module does load on Linux ARM64.

After downloading the speech model through Settings → Local AI, run a real offline inference check with a short, non-sensitive 16 kHz mono WAV (over five seconds):

```sh
node --import tsx scripts/check-local-speech.ts /absolute/path/to/Novi-userData /absolute/path/to/speech.wav
```

Use the parent of the models directory shown in Local AI setup. This command re-verifies installed weights, forbids downloads, checks multiple partials plus a final result, and reports real-time factor without printing recognized text. A real-time factor below 1 is necessary but not sufficient for two-source live capture. Then manually test both sources, unplug either input, deny capture permission, close/reopen for recovery, and test platform installers. None of these real-device checks should be reported as passed until actually run.

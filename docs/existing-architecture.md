# Novi architecture before local interviews

Implementation note (2026-10-07): this document records the inspected baseline.
The added pipeline now lives in `interviewService.ts`, `interviewWorker.ts`,
`localSpeechRuntime.ts`, and `InterviewPage.tsx`, using the existing preload/IPC,
React navigation, atomic JSON storage, and electron-vite build. Model setup is
under Settings → Local AI. Remote file access now excludes interview storage;
managed online authentication is unchanged. See `local-ai.md` for current
functionality, validation, limitations, and remaining release gates.

Inspected 2026-10-07. Source code takes precedence over older README claims.

## Desktop

- `package.json`: Novi 0.2.2; Electron ^41.10.7 (lockfile 41.10.7), React 19, TypeScript, npm. Node >=22.18.0 is required; this inspection shell initially has 20.19.2.
- `electron.vite.config.ts`: electron-vite builds `src/main/main.ts`, `src/main/preload.ts`, and `src/renderer/index.html` into `out/`.
- `electron-builder.yml`: existing DMG (arm64/x64), NSIS (x64), DEB/AppImage (x64) packaging. Microphone/camera/screen usage descriptions already exist.
- Main creates a frameless window with sandbox, context isolation, disabled Node integration, blocked navigation and external renderer requests. Display capture requests use the first screen and Electron loopback audio.
- Preload exposes named `window.novi` functions. `src/shared/types.ts` defines the contract. `ipc/handlers.ts` checks the top-level sender URL, wraps results, initializes services lazily, and refreshes managed authentication for protected calls.
- Renderer uses React state/hooks, `AppModeContext`, `useChat`, and some localStorage preferences; no router or global state library. `App.tsx` selects login, onboarding, context, or chat. Settings open within context/chat pages. Hashes select existing overlay/code-viewer windows.
- Preserve `app.css`, normal/coding/behavioral modes, screenshots, eye tracking, overlays, provider management, context documents, and existing chat.

## Data and settings

- `services/storage.ts`: account-scoped settings/history in `<userData>/data.json`; write-temp/rename JSON persistence, version migration. Not a SQLite database.
- `AppSettings`, `SettingsInput`, `settingsInput`, and `SettingsPage.tsx` define settings. Some mode preferences also use localStorage.
- Encrypted managed session in `access-session.json`; provider secrets stay in main memory. `images/` holds attachments; `audio_recordings/` holds recordings.
- Context session data has separate cleanup on session end/exit and must not own persistent interview transcripts.
- `webapp/` is a separate Next.js 16 portal with Prisma configured for PostgreSQL, not the desktop renderer/storage. Follow its AGENTS.md if changing it.

## Existing audio and models

- `useAudioRecording.ts` captures system audio with getDisplayMedia, measures levels, accumulates MediaRecorder chunks, and only processes the full base64 recording after stop.
- `AudioService` saves recordings. `AudioTranscriptionService` uploads them to Gemini/OpenAI/compatible endpoints. DeviceTester also captures microphone audio and calls this transcription API.
- `local_stt` is a misleading legacy setting: it currently uses cloud transcription. `live_stream` attaches completed recordings; it is not streaming ASR. Auto-send may send resulting text to cloud chat.
- `services/models.ts` discovers remote provider chat models. It does not install local models.
- Existing dependencies: React, lucide-react, react-markdown, PDF.js, MediaPipe vision, koffi. No speech inference runtime in the original package manifest. Existing MediaPipe assets are for eye tracking.
- Existing loopback code is not evidence of working capture on every OS; real-device verification is required.

## Conflicts to resolve

1. Local interview content must never enter existing cloud transcription, attachments, or auto-send paths.
2. ManagedAuthService requires a server; handlers refresh it every 20 seconds and sign out on failure. ContextPage tests a remote provider before session start. An offline interview needs an explicit independent access policy/entry path.
3. RemoteFileService, started with managed authentication, polls server commands and can read/archive application data and other paths. Protect private interview data from direct and ancestor/archive access before claiming local-only privacy.
4. Whole-file history persistence is inappropriate for partial updates. Persist finalized segments independently behind the same JSON storage conventions; retain ownership and crash recovery.
5. Do not block main with inference or transfer unbounded base64 audio. Keep streams independent and bounded, with actual incremental ASR results.
6. Accelerator availability must reflect the packaged inference runtime, not just installed GPU hardware. Native dependency packaging needs separate validation on each target.

## Integration sequence

1. Hardware profile, conservative capabilities, replaceable local model registry, verified resumable downloads under `<userData>/models`, setup UI.
2. Isolated streaming ASR worker, bounded audio frames, source-based roles, live segment replacement, durable final segments.
3. Existing UI entry, independent system/mic capture, recovery, offline policy, privacy protections.
4. Optional speaker detection and local text analysis, lazy loading, memory/queue limits, fallback diagnostics.
5. Focused tests, build, desktop smoke and real-device/package checks. Report unavailable verification honestly.

Baseline commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:desktop`. No database reset or production service changes are needed for desktop work.

# Novi

A standalone Electron AI chat application. Bring your own API key, choose your model, and keep your conversations on your device.

## Run

Requires Node.js **22.18+** (Node 24 recommended), npm, and a desktop session.

```sh
npm install
npm run dev
```

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd install` and `npm.cmd run dev`.

```sh
npm run build       # Type-check and produce out/main, out/preload, out/renderer
npm start           # Launch the production build
npm test            # Dependency-free core checks, using Node's test runner
npm run test:desktop # Build and exercise the real Electron app with a local API fixture
```

`npm run build` creates runnable application assets, not an installer. Signed installers and automatic updates are outside this foundation's scope. Dependencies must be downloaded by `npm install` before building.

## First launch

### Context sessions

After sign-in/setup, Novi opens **Context**, not the conversation screen. Choose a provider/model first, click **Load context**, select one or more folders, then enter a required session purpose and up to four optional, editable custom fields. **Start session** opens chat and sends all selected text plus the fields to that provider. The first assistant response confirms/summarizes the reference material and becomes `AI Context.md`.

TXT files must be UTF-8. PDF.js extracts searchable PDF text locally (including page labels); no PDF upload service is used. Scanned/image-only or encrypted PDFs are rejected, and diagrams/layout are not interpreted. Limits: 8 folders, 30 files, 10 MB per file, 50 MB total, 200 pages per PDF, and 80,000 extracted characters. Subfolders are included; symlinks are skipped. Oversized context is rejected, never silently truncated. The selected model may impose a smaller token limit or incur provider charges.

Conversations stay in memory for the session. New conversations inherit the loaded references and initial AI summary. The model is fixed for that session. `AI Context.md` is stored at `<Electron userData>/context-session/AI Context.md`; it is deleted on **End session**, sign-out, normal app close, or the next launch after an interrupted exit. Imported chat images are removed at session end (or pruned on next launch after a crash). Source folders and pre-existing, unrelated history are not deleted. Deletion is ordinary local deletion, not forensic secure erasure; it cannot remove provider-side records. Context profiles/fields are not saved across sessions in this version.

PDF support requires `npm install` to install `pdfjs-dist` and its platform dependencies. If it is missing, TXT sessions still work and PDF loading explains the install requirement. If a context request fails or is stopped, end the session and retry with smaller/different files or another model. Calibration is independent of context: enabling Eye Track starts the 25-target calibration; ending a context session also stops its tracking/HUD.

1. Create a local account, or sign in to an account previously created on this device.
2. Set your display name.
3. Choose OpenAI or an OpenAI-compatible endpoint.
4. Enter your API key. Compatible servers may use an empty key.
5. Choose or type a model ID and start chatting.

For a local compatible server, an example base URL is `http://localhost:1234/v1`. Start the server and load an appropriate model separately. Novi appends `/chat/completions` to the base URL. Remote servers must use HTTPS; HTTP is allowed only for loopback hosts. Redirects are rejected so keys and conversations cannot follow a redirect to another host. Use the server's final endpoint URL.

Model examples are editable suggestions, not guarantees of account access. Image messages require a vision-capable chat model. If a compatible server does not support streaming, turn off **Stream responses as they arrive** in setup or Settings.

## Architecture

```text
src/
  main/
    main.ts                 Window, sandbox, network and navigation restrictions
    preload.ts              Typed, allowlisted IPC bridge
    ipc/handlers.ts         Sender validation, input validation, session scoping
    services/
      auth.ts               AuthService + replaceable local implementation
      storage.ts            Atomic local JSON persistence
      credentials.ts        OS-backed encrypted credentials, bound to endpoint
      providers.ts          AIProvider, factory, OpenAI and compatible providers
      chat.ts               Conversation lifecycle, streaming, cancellation
      images.ts             Native-image validation and local image management
      validation.ts         Shared main-process request validation
  renderer/src/
    App.tsx                 Session routing, theme, error boundary
    pages/                  Auth, onboarding, chat, settings
    components/             Brand, provider controls, sidebar, messages, composer
    hooks/useChat.ts         Conversation state and stream subscriptions
    services/api.ts         Typed IPC result handling
    styles/app.css          Responsive desktop layout and light/dark themes
  shared/types.ts           Public types and IPC contract; no API-key getter
tests/core.test.ts          Authentication, validation, SSE, provider checks
scripts/smoke.ts            Desktop integration flow and screenshots
```

React never calls an AI endpoint or reads a file directly. It invokes named preload functions, which route validated requests to main-process services. The main process owns history, credentials, image access, and provider traffic. React uses component state and a dedicated chat hook; a global state dependency is unnecessary at this size.

Both providers implement `AIProvider.sendMessage()`. They share the Chat Completions wire format, including image data URLs and streaming server-sent events. Requests use Node's built-in `fetch` and `AbortController`; no proxy server or provider SDK is required. The response callback supports progressive updates, and the returned response supports non-streaming operation.

## Where data lives

Novi uses Electron's `app.getPath('userData')`, typically:

| Platform | Directory |
| --- | --- |
| Windows | `%APPDATA%/Novi` |
| macOS | `~/Library/Application Support/Novi` |
| Linux | `$XDG_CONFIG_HOME/Novi` or `~/.config/Novi` |

The exact directory follows Electron's platform conventions. `NOVI_DATA_DIR` can override it for isolated testing; do not point it at an unrelated application's directory.

- `data.json`: accounts with salted scrypt password hashes, current session, display names, onboarding state, provider/base URL/model, theme, conversations, image IDs. This file is **not encrypted**.
- `credentials.json`: API keys encrypted with Electron `safeStorage`, in a separate file. Each encrypted key is associated with its selected provider and endpoint. Keys never appear in preference/history JSON and are never returned to React after saving.
- `images/`: app-owned local copies of attached images, addressed by generated IDs rather than renderer-provided filesystem paths. Copies preserve history if an original file moves. Deleting conversations or clearing history removes unreferenced copies. Unsent copies are pruned on sign-out or next startup.

Credential encryption uses the OS mechanism available to Electron (Windows DPAPI, macOS Keychain, or Linux's supported secret store). Novi refuses to store a nonempty API key if encryption is unavailable, including Linux's insecure `basic_text` fallback. Unlock/configure the OS keychain and restart. Keyless local servers still work without secure key storage. Encrypted key files are generally not portable between OS users or machines.

Changing provider or base URL clears the association with the old key. Enter the destination's key explicitly; a saved key is never silently reused at a new endpoint. During entry, the key necessarily exists in the password input; after saving, the UI only receives a `hasApiKey` flag.

Local authentication is a convenience gate, **not protection against someone with access to your OS account or local files**. There is no email verification, password recovery, or cloud account. Use OS account security and full-disk encryption to protect local history. Back up the data directory if the history matters.

## Add another AI provider

1. Add a provider ID to `ProviderKind` in `src/shared/types.ts`.
2. Implement `AIProvider.sendMessage()` in a main-process service. Accept the abort signal, adapt message/image input to the provider's format, call `onDelta()` for streamed chunks, and return final text. Map errors to safe `UserError` messages.
3. Register the implementation in `AIProviderFactory.create()`.
4. Extend `settingsInput()` validation and `ProviderFields` for that provider's configuration.
5. Add a protocol test in `tests/core.test.ts`.

The chat UI and conversation storage do not need to change. To replace authentication, provide another `AuthService` implementation, wire it in `ipc/handlers.ts`, and adapt local account provisioning/session ownership there; the auth form's IPC contract stays unchanged.

## Security and privacy

- Sandboxed renderer; `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`.
- Only named functions cross the preload bridge; no raw IPC, Node.js, arbitrary file reads, shell access, or API-key readback.
- IPC requires the app's trusted top-level renderer URL. Inputs and per-account ownership are checked in main.
- Content Security Policy, blocked navigation/popups/webviews, denied permissions, and blocked external renderer networking.
- Markdown HTML is disabled. Remote Markdown images are not fetched, and response links are rendered as inert text so model output cannot trigger network requests.
- Images are filtered by extension, signature, and native decoding. Up to six PNG/JPEG/WEBP images per message; 8 MB and 40 megapixels per image.
- Messages and image data go directly to the selected provider when sending. Novi has no analytics, cloud storage, or background uploads. The chosen provider's own retention policy still applies.
- Technical development logs contain operation/error categories, not provider response bodies or credentials.

## Verification and current limits

Core checks run without installing dependencies and cover URL/input validation, password hashing, session persistence, account separation, corrupted-file preservation, split UTF-8 SSE parsing, multimodal payloads, JSON responses, abort propagation, incomplete streams, and provider errors.

The desktop smoke script runs the built Electron application against a local fixture, exercises signup → onboarding → image chat → settings → restart → history clearing → sign-out, and leaves screenshots in `.test-data/`. It does not call a real AI provider.

In the implementation environment, **the core checks passed**, but package downloads were blocked with `EACCES`. Consequently, TypeScript compilation, Electron launch, visual review, the desktop smoke test, and the production build could not be verified there. Run the commands above after dependency installation. No live API key was supplied, so a real paid-provider request has not been verified.

Other deliberate version-one limits:

- One active generation per application window; requests time out after three minutes.
- History uses a small atomic JSON store; very large histories will eventually benefit from SQLite and pagination. No automatic context truncation is performed.
- A response is saved when it finishes or stops. A crash during generation may lose that partial response; the user's submitted message is already saved.
- Code blocks are styled monospace with a Copy button; token-level syntax highlighting is not included.
- Image thumbnails are local. Temporary unused image copies are bounded; after many unused selections, signing out clears them.
- No voice, documents, web browsing, tools, agents, plugins, cloud sync, or autonomous actions.

Implementation references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), and [OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses).

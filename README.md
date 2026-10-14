# Novi

A managed Electron AI workspace with a separate Novi web portal for accounts, licenses, and provider keys. Desktop access uses a username and password assigned to a licensed account. There is no public sign-up.

## Mask and terminal controls

In **Settings → General → Mask & app controls**, enable Mask, choose a window name, and optionally import an application's icon or an image. Click **Apply mask settings**. This device setting also applies before sign-in and to newly opened windows. Disable Mask to restore the usual titles and icons. Windows cannot be minimized while Mask or Transparent mode is enabled; leaving both modes restores their original minimize behavior. The Windows taskbar and macOS Dock can be hidden; Linux desktop support varies. This does not hide processes from Task Manager, Activity Monitor, system tools, or change the installed executable's identity. File icon extraction can return a generic icon; PNG/ICO files provide a predictable alternative on Windows/Linux.

In an installed build, Settings detects whether the terminal command is missing, current, or needs updating. Use **Install terminal command**, **Update terminal command**, or **Add command to PATH** as shown. Novi adds its command directory to the Windows user PATH or your bash/zsh/sh/fish profile and refreshes the status. Open a new terminal afterwards; some terminal apps must be fully quit and reopened. Existing terminal processes retain their old environment. **Refresh command status** checks again:

```sh
novi start # Launch or restore the main window, including while masked
novi stop  # Quit all windows through normal shutdown cleanup
```

The launcher requires no separate Node.js installation. Use **Update terminal command** if you move Novi or its AppImage. With a built development checkout, use `npx electron . start` and `npx electron . stop`. Commands address the instance using the same user-data directory (`NOVI_DATA_DIR`, if set). Stopping an already stopped app does not open a window. **Quit Novi** is available on every Settings tab; quitting stops active work, and unsent text is not saved.

## Run

Requires Node.js **22.18+** (Node 24 recommended), npm, and a desktop session.

```sh
npm install
npm --prefix webapp install
npm run web:setup
npm run web:dev
# In a second terminal:
npm run dev
```

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd install` and `npm.cmd run dev`.

After the one-time dependency installation and `npm run web:setup`, use the combined launchers from any directory:

| Action | Windows | macOS / Linux / Git Bash |
| --- | --- | --- |
| Develop web frontend/backend + Electron | `scripts\dev.bat` | `sh scripts/dev.sh` |
| Build both apps | `scripts\build.bat` | `sh scripts/build.sh` |
| Build, then run both production apps | `scripts\build-and-run.bat` | `sh scripts/build-and-run.sh` |

Each launcher opens two independent terminal windows: **Web frontend + backend** (Next.js) and **Electron**. Build output and errors stay in their respective terminals. Electron waits for the web server before starting. Use Ctrl+C in each terminal to stop that app; stopping one does not close the other. Default portal URL: `http://localhost:3000`. Set `NOVI_PORT` (or `ASTRA_PORT`) to change the port; the launcher configures the matching desktop URL and portal origin automatically. It fails if another server already occupies the port. Building does not migrate or reset a database. Interrupted desktop processes release their server lease after 90 seconds.

Windows uses PowerShell windows; macOS uses Terminal; Linux uses an installed terminal emulator (x-terminal-emulator, GNOME Terminal, Konsole, XFCE Terminal, or xterm). On a headless system, open two shells manually and run `node scripts/run.mjs dev --app web` and `node scripts/run.mjs dev --app electron`. Replace `dev` with `build` or `build-and-run` as needed. `node scripts/run.mjs dev` retains the combined single-terminal workflow.

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

During a session the window docks full height on the right of the working monitor (at least 850 px wide) and shows only the conversation. A floating tray at the top of the screen holds the mode tabs, model picker, eye-tracking controls and the message box; both can be moved, and choosing a monitor moves both. Drag any tray background area to move it; drag either side grip to change its width, or focus a grip and use the arrow keys. Controls wrap to fit, and the tray automatically trims unused height after resizing or closing menus. Buttons and text fields stay interactive. The tray follows transparent mode and click-through like the main window: in transparent mode both stay above other apps, even after you click another app; otherwise they are ordinary windows, and focusing one brings the other forward. If the tray is closed, **Show tray** in the conversation header reopens it. Ending the session closes the tray and restores the window.

Before each session, **Get ready** checks everything in one click: app storage, the AI connection, speech files, microphone, system audio and screen capture. It also sets which screen Novi opens on and whether sessions start in Transparent mode. Results are kept until Novi closes. On the setup's last step, **Save as profile** keeps the model, folders, mode, framework, company, role and instructions; next time, **Start** on the profile begins that session in one click, reading the folders again so updated files are used. At the start of a session, a ready check in the panel lists the results and the main shortcuts, and offers a one-minute **practice run**: Novi plays a sample interviewer question so you can try listen, stop, send and read once before it counts. It sends one question to your AI model.

**Local Coding** is a separate mode for questions about a project on your computer. Choose a working folder (type its path or browse with Novi's own explorer), optionally add files or folders, and pick an agent: **Codex** (needs an OpenAI connection on `https://api.openai.com/v1`), **Claude** (needs an Anthropic connection on `https://api.anthropic.com/v1`), or **Antigravity (agy)** (needs a Gemini connection on `https://generativelanguage.googleapis.com/v1beta`). Under **Settings → API Management → Local Coding agents**, Novi checks installed versions and offers **Install** for missing engines, **Check for updates**, and **Update** when a newer release is available. Installs are managed inside Novi’s user-data directory and use the publishers’ official downloads. **Check login** validates the selected saved API key; agents use that key automatically without browser sign-in. Antigravity does not accept screenshots. Novi captures the eligible text files into its own storage as **Local S0**, excluding dependencies, build output, version-control internals, credential files and binaries, and shows what it included. The agent reads only that captured copy, through three read-only tools (list, search, read); it has no shell, no file editing and no web access, and the project folder is never written. Each coding answer is validated and becomes an **iteration**: a virtual version with clickable EDIT, NEW and DELETE cards that open a diff in the viewer (unified or side by side, against the parent or the local snapshot, with copy actions). The selected version is what the next request reads, so you can continue from Iteration 1 or branch from it. **Capture latest local files** takes a new snapshot; **Refresh and carry forward** combines your latest files with the selected iteration and asks you to choose when both changed the same file. Selected files are sent to the agent's provider when it reads them. Proposals are never run or tested.

TXT files must be UTF-8. PDF.js extracts searchable PDF text locally (including page labels); no PDF upload service is used. Scanned/image-only or encrypted PDFs are rejected, and diagrams/layout are not interpreted. Limits: 8 folders, 30 files, 10 MB per file, 50 MB total, 200 pages per PDF, and 80,000 extracted characters. Subfolders are included; symlinks are skipped. Oversized context is rejected, never silently truncated. The selected model may impose a smaller token limit or incur provider charges.

Conversations and their attachments are saved to the signed-in account's local history as messages arrive, and are available in later sessions. New conversations inherit the current session's loaded references and initial AI summary while that session is active; raw reference documents are not written to saved history. The model is fixed for that session. `AI Context.md` is stored at `<Electron userData>/context-session/AI Context.md`; it is deleted on **End session**, sign-out, normal app close, or the next launch after an interrupted exit. Saved images remain until their conversation is deleted or history is cleared. Source folders are not deleted. Deletion is ordinary local deletion, not forensic secure erasure; it cannot remove provider-side records. Context profiles/fields are not saved across sessions in this version.

PDF support requires `npm install` to install `pdfjs-dist` and its platform dependencies. If it is missing, TXT sessions still work and PDF loading explains the install requirement. If a context request fails or is stopped, end the session and retry with smaller/different files or another model. Calibration is independent of context: enabling Eye Track starts the 25-target calibration; ending a context session also stops its tracking/HUD.

1. Open the web portal at `http://localhost:3000`. Local setup writes generated passwords to the ignored `webapp/.env.access` file.
2. Sign in as `admin` with `ADMIN_PASSWORD`. Create a standalone account or corporation; corporations can create sub-corporations.
3. Issue a license to a standalone or sub-corporation owner. That owner creates a desktop account and permanently binds the license.
4. As the owner, add provider keys and model IDs in **API management**.
5. In Electron, sign in with the licensed desktop username and password. Open **Settings → API management** to enable and select inherited connections.

Optional seeded desktop accounts are `standalone.desktop` and `studio.desktop`, using `DEMO_PASSWORD`. Portal sample owners are `standalone`, `corporation`, and `subcorp`. See [webapp/README.md](webapp/README.md) for the role matrix, schema, API, and deployment instructions.

The desktop reads `NOVI_ACCESS_URL` from its launch environment (defaults to `http://localhost:3000`). On PowerShell: `$env:NOVI_ACCESS_URL='https://your-access-server.example'`. Production servers require HTTPS. Normal sign-out releases the account immediately; crashed devices lose their lease after 90 seconds. If the server becomes unreachable, the session stays open and local features keep working; sending to an AI provider needs the server. After 90 seconds offline, Novi shows a reconnecting notice. Only a server rejection (revocation, password reset, license termination, another device signing in, or the 8-hour sign-in limit) ends the session.

The managed provider catalog supports OpenAI, Anthropic, Gemini, and Kimi (Moonshot AI). Owners supply a model ID available to their provider account. Compatible providers use the existing Chat Completions transport; provider destinations are fixed by the server. Redirects are rejected.

Image messages require a vision-capable model. Desktop accounts can select and disable connections; editing keys, destinations, and model IDs is restricted to the web owner portal.

## Architecture

### Local interview work in progress

**Settings → Local AI** now provides hardware discovery and a versioned local
model downloader with checksum verification, resumable downloads, and deletion.
**Local interview** in session setup or chat opens the separate streaming
system/microphone transcription workflow, with local recovery and optional
turn-level speaker labeling. Real-device inference/capture validation is still
pending. Local LLM analysis and offline account access are not enabled yet.
Existing chat audio still uses the configured cloud provider. See [implementation status](docs/local-ai.md)
and [inspected architecture](docs/existing-architecture.md).

Run the dependency-free model checks with `npm run test:local-models`.

Desktop packages include the lightweight English streaming speech model, neural
VAD, the native speech runtime, and Cloudflared. The packaging hook downloads and
verifies pinned assets, checks the target native addon, and smoke-tests speech
and VAD on the build host. Packaging needs internet access; speech files are
copied into each user's model storage on first setup without a download. Larger
speech models, speaker detection, and local LLM weights remain optional.

Before each session, setup checks writable storage and offers microphone,
system-audio, screen, and source-folder access tests. Missing or untested features
require an explicit acknowledgement to continue. OS permission changes may need
an app restart, and capture pickers can reappear on later captures. The detached
code/diagram viewer stays scrollable even when the main window passes clicks through.

```text
src/
  main/
    main.ts                 Window, sandbox, network and navigation restrictions
    preload.ts              Typed, allowlisted IPC bridge
    ipc/handlers.ts         Sender validation, input validation, session scoping
    services/
      managedAuth.ts        JWT login, secure session storage, license heartbeat
      auth.ts               Legacy local implementation, no desktop IPC exposure
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

- `data.json`: local account caches, display preferences, provider metadata, selection, theme, and existing history. Managed passwords and API secrets are never written here. This file is **not encrypted**.
- `access-session.json`: OS-encrypted JWT and a generated installation identifier. Its server binding prevents reuse against a different access server.
- Managed provider secrets stay in main-process memory and are cleared on sign-out. The renderer receives metadata only. Legacy `credentials.json` files remain preserved but do not supply managed connections.
- `images/`: app-owned local copies of attached images, addressed by generated IDs rather than renderer-provided filesystem paths. Copies preserve history if an original file moves. Deleting conversations or clearing history removes unreferenced copies. Unsent copies are pruned on sign-out or next startup.

Session encryption uses Electron's OS storage (Windows DPAPI, macOS Keychain, or Linux's supported secret store). Sign-in requires secure storage and rejects Linux's insecure `basic_text` fallback. Unlock/configure the OS keychain and restart. Encrypted sessions are not portable between OS users or machines.

The backend encrypts managed API keys with AES-256-GCM. Desktop credentials are bound to the provider endpoint and cannot be redirected through renderer IPC.

The backend checks account hierarchy, account status, license expiry, and the current device session on authenticated requests. Admin password resets revoke sessions. Local file edits cannot grant a server session. Local history still depends on OS account security and disk encryption.

## Add another AI provider

1. Add a provider ID to `ProviderKind` in `src/shared/types.ts`.
2. Implement `AIProvider.sendMessage()` in a main-process service. Accept the abort signal, adapt message/image input to the provider's format, call `onDelta()` for streamed chunks, and return final text. Map errors to safe `UserError` messages.
3. Register the implementation in `AIProviderFactory.create()`.
4. Extend `settingsInput()` validation and `ProviderFields` for that provider's configuration.
5. Add a protocol test in `tests/core.test.ts`.

To add a managed provider, extend the web catalog in `webapp/src/lib/access-policy.ts` and map it to a desktop transport in `src/shared/providers.ts` if a new protocol is needed.

## Security and privacy

- Sandboxed renderer; `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`.
- Only named functions cross the preload bridge; no raw IPC, Node.js, arbitrary file reads, shell access, or API-key readback.
- IPC requires the app's trusted top-level renderer URL. Inputs and per-account ownership are checked in main.
- Content Security Policy, blocked navigation/popups/webviews, denied permissions, and blocked external renderer networking.
- Markdown HTML is disabled. Remote Markdown images are not fetched, and response links are rendered as inert text so model output cannot trigger network requests.
- Images are filtered by extension, signature, and native decoding. Up to six PNG/JPEG/WEBP images per message; 8 MB and 40 megapixels per image.
- Messages and image data go directly to the selected provider when sending. Novi has no analytics, cloud storage, or background uploads. The chosen provider's own retention policy still applies.
- To shorten the wait for an answer, Novi opens a connection to the selected provider shortly before a likely request (while you type, take a screenshot, stop listening, or send). This is an unauthenticated `GET …/models` request that carries no API key, message, or file content.
- Technical development logs contain operation/error categories, not provider response bodies or credentials.

## Verification and current limits

Core checks use the installed `tsx` runner and cover URL/input validation, session persistence, account separation, SSE, provider errors, and the managed auth/credential boundary. `npm --prefix webapp run test:access` creates an isolated temporary SQLite database and checks permissions, license immutability, inheritance, revocation, and device exclusivity.

The desktop smoke script exercises managed sign-in, read-only provider selection, context loading, image chat, cleanup, and sign-out against a local fixture. It does not call a real AI provider.

Both production builds and the portal browser checks were verified. The native Electron smoke launch crashes in this environment (`Target crashed`, GPU process exit `-1073741515`), so native UI verification requires rerunning `npm run test:desktop` on a working desktop runtime. No live paid-provider request was made.

Other deliberate version-one limits:

- One active generation per application window; requests time out after three minutes.
- History uses a small atomic JSON store; very large histories will eventually benefit from SQLite and pagination. No automatic context truncation is performed.
- A response is saved when it finishes or stops. A crash during generation may lose that partial response; the user's submitted message is already saved.
- Code blocks are styled monospace with a Copy button; token-level syntax highlighting is not included.
- Image thumbnails are local. Temporary unused image copies are bounded; after many unused selections, signing out clears them.
- No voice, documents, web browsing, tools, agents, plugins, cloud sync, or autonomous actions.

Implementation references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), and [OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses).

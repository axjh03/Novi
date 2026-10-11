# Response speed: first measurable release

Streaming remains the default. Switching models saves the choice without issuing a chat request. Fast and Deep are explicit, per-connection choices discovered from the provider; no automatic routing or model-specific reasoning settings are enabled.

## Diagnostics

Open **Response timing** under a completed answer. It shows UI-to-main delivery, access checks, provider-to-first text, provider-to-first letter/number, first-to-last text, total provider duration, text size, and available token counters. The first letter/number is a reproducible proxy, not a semantic quality measurement. A code-fence language label can trigger it. UI delivery uses the local wall clock; provider spans use a monotonic clock. Non-streaming providers deliver all text together.

Main and renderer consoles emit `[Novi latency]` records containing fixed stage names and numeric spans/counts, without prompt, source, transcript, key, account, or conversation contents. Listening reports the first captured frame and first partial/final transcript per source. Buffered cloud transcription also separates speech buffering, queue wait, and the transcription request (including its IPC and access check). It cannot report an interim transcript because the buffered engine does not produce one. UI send-to-first-word is reported separately and includes the full send path.

Usage values are provider-reported, never estimated; absent values remain **Not reported**, distinct from zero. Anthropic input includes ordinary input plus cache reads and cache writes. Gemini candidate output and thoughts are reported separately; OpenAI reasoning is a subset of output. Compatible endpoints are parsed when they return usage, without forcing unsupported streaming options. Stable instructions occupy native system/instruction fields before changing turns. This does not guarantee a cache hit. No local cross-conversation prompt cache is introduced.

## Connection warm-up

Node's `fetch` in the main process closes idle sockets after about 4 seconds, so a question asked after a pause used to pay a new DNS, TCP, and TLS handshake. Main now opens the provider connection just before a likely request (`src/main/services/connectionWarmup.ts`):

- **When:** while the user types in the composer, when listening stops, on screenshot capture, and at send. At send, the warm-up starts before the access check, so the handshake overlaps that request. Live transcript updates do not trigger it.
- **What:** an unauthenticated `GET {provider base URL}/models` to the connection the next request will use, which is the context session's connection or the active one. No API key, message, or file content is sent; the small error response is read and discarded so the socket returns to the pool. `HEAD` is not used because providers answer it with `Connection: close`.
- **Limits:** at most one warm-up per provider origin every 3 seconds, none while a response is streaming, HTTPS (or HTTP to a loopback host) only, and failures are ignored. The IPC channel never refreshes or ends the managed session.

Measured on one broadband connection (unauthenticated probes, Oct 2026), a reused connection saved about 66 ms (Anthropic), 80 ms (Gemini), 100 ms (OpenAI), and 0.9 s (Kimi). Savings grow with network latency. Answer quality and token usage are unchanged. The real request reuses the socket only if it starts after the warm-up response arrives, so a send immediately after an unrelated warm-up can still open a new connection.

## Context

Full context remains the default while quality is evaluated. **Model roles and context → Use compact context** opts into a recent-history window plus exact matching older exchanges and source paragraphs. Pinned constraints are included verbatim on every request. The original problem, latest question, selected exchanges, and fenced code are never cut in half. Saved histories are not edited by selection.

The initial experimental budgets are 24,000 recent text characters, up to 12 recent messages, and 16,000 retrieved characters each for older exchanges and source excerpts. These are soft character budgets, not proven token limits: a complete exchange, initial problem, code block, or paragraph can exceed them. Attachments are not counted as text. Lexical retrieval can miss synonyms and implicit references. Compaction is therefore opt-in; uncheck it to resend the full saved context. There is no generated rolling summary or classifier call.

Session instructions, overview, and original source text are saved with account-local conversations, including conversations created after context setup. The overview is explicitly not a substitute for omitted source details. Reopening a saved conversation retains its sources even after ending the context session or changing models. Existing conversations saved before this change cannot regain source text that was never saved; reload those sources once. Deleting a conversation deletes its snapshot; another conversation may retain its own copy. Source folders themselves are never changed.

## Evaluation before enabling compact context by default

For both user-selected Fast and Deep models, collect repeated samples of each task below with the same provider, network, streaming preference, and inputs. Compare full versus compact context and cold versus repeated prefixes separately. Report sample counts, median and p95 for first text, first word/number, provider total, access checks, and listening spans; do not pool different models or failed requests into successful latency distributions. Count failures separately. Read counters to distinguish measured cache hits from assumptions.

| Task | Quality gate |
| --- | --- |
| Short clarification / rephrase | Direct, faithful answer without invented details |
| New coding problem | Complete runnable or reviewable code, constraints and edge cases satisfied |
| Long conversation | Exact old correction/value retained; ambiguous old references work with full context |
| Source-backed question | Exact source fact recovered after restart; no source leakage to another account |
| Diagram | Complete fenced block appears before trailing explanation; invalid syntax remains visible as an error |
| Listening | First-frame/partial/final timings per source; no provider change or silent upload |

Local fixture tests cover transport usage, streaming, retrieval, exact values/code, source persistence, and redacted diagnostics. They do not establish actual provider p50/p95 or model answer quality. Paid provider runs and microphone/system-audio checks remain necessary.

## Live transcription follow-up

Keep local ASR and buffered cloud transcription unchanged until an optional live engine has been tested. The Gemini Live transcription API supports interim and finalized transcripts over a WebSocket and 16 kHz mono PCM. A production prototype must keep credentials in the main process, use only the selected provider, discover a supported live model, require an explicit engine choice, handle setup acknowledgement/backpressure/disconnects/stop, and expose reconnect state. Do not replay already-finalized audio or silently switch to another cloud provider. Offline fallback must be explicit local ASR, with a clear error when its model is unavailable. Verify session expiry, current billing and retention, interruption, two-source isolation, and teardown before enabling it. No live socket engine is included in this release.

## Provider references checked during implementation

- [OpenAI prompt caching and usage counters](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI reasoning-token accounting](https://developers.openai.com/api/docs/guides/reasoning)
- [Anthropic streaming and cumulative usage](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Gemini GenerateContent usage metadata](https://ai.google.dev/api/generate-content)
- [Gemini Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)

Provider controls and supported model lists must be rechecked when the live prototype or automatic routing is implemented.

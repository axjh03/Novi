# Novi response speed: next steps

## Goal

Make Novi feel responsive by showing the first useful text quickly, while preserving code correctness, user-provided constraints, and the ability to use saved conversation context. “Instant” is a product goal, not a guaranteed model latency: provider speed, network, model load, and request size vary.

## What the code does today

- Chat requests stream deltas to the renderer. Keep streaming as the baseline and measure time to first useful text separately from time to finish.
- Changing the model sends a second prompt asking it to read the conversation and reply `UNDERSTOOD`. This consumes a request and blocks the composer. Remove that handshake. The next real prompt can include the relevant existing history.
- Temporary-session setup sends the selected source documents to create an initial summary. `ContextService.history()` then prepends the full original initialization messages to future requests; it does not replace them with the summary. Long sessions can therefore keep sending the documents and accumulating conversation history.
- Cloud transcription buffers each audio source until 800 ms of silence or 5 seconds, then queues a transcription request. Some waiting happens before chat generation begins.
- Novi checks access with the control server on sends. Measure this separately from provider latency before changing it; keep license and account checks intact.
- The behavioral fast-model toggle changes the selected provider model. Its tooltip promises “~300ms,” but the app does not measure or guarantee that latency.

## Recommended response routing

Use a fast model for short, familiar work: explain selected code, clarify an existing answer, rephrase, summarize, and handle straightforward follow-ups. Use a strong model for a new coding problem, algorithm selection, debugging that needs careful reasoning, correctness and edge cases, substantial code changes, and nuanced design trade-offs.

For a new coding answer, ask the strong model to return the solution and a concise explanation in the same response. This avoids a sequential second call and keeps the explanation grounded in the code it just produced. If the user asks a follow-up such as “explain line 12,” route that request to the fast model with the relevant code and recent context. Do not use a second model to classify an action the UI already makes clear, such as an explicit “Explain selection” command.

Start with two user-configured choices, **Fast** and **Deep**, per provider. Do not hard-code model IDs across providers: discover available models and let users choose which of their configured models fills each role. Show which model will answer. Add automatic routing only after measuring it against representative coding and follow-up tasks.

## Keep context useful and small

Keep complete conversations, source files, and generated code saved locally. For each request, send the parts needed for that task rather than repeatedly sending every saved detail.

Suggested request contents:

1. Stable mode instructions and user-pinned constraints.
2. A short summary of earlier discussion when it is needed.
3. The current problem, exact code or error, and relevant source excerpts.
4. A few recent turns and the latest question.

For example, “explain this line” needs the selected code, nearby definitions, and the question. Solving a new algorithm needs the original requirements, constraints, examples, and relevant decisions. Retrieve source excerpts when needed instead of adding every document to every prompt.

When a context budget is reached, summarize older turns and retain the recent turns verbatim. Preserve exact code, error messages, values, user corrections, and unanswered constraints; those details are easy for a summary to distort. Keep local source documents available for retrieval. Treat the initial session summary as a compact index or overview, not as proof the model can reconstruct omitted details.

A practical first version is a bounded recent-history window plus the current question and only relevant source excerpts. Pick token limits from observed requests and quality checks; do not claim arbitrary limits are proven safe. Verify that users can still ask about older turns and source files after compaction.

## Stream a useful answer earlier

- Ask for a direct answer first, followed by the explanation, code, and edge cases appropriate to the task.
- Keep ordinary interview and follow-up answers concise by default. Let the user ask for expansion.
- Stream visible response text as it arrives. If a task has a progress phase, describe it accurately; never display a fake answer while the model is still working.
- For code, preserve a complete final code block and explanation. Do not trade away required correctness checks for a shorter answer.
- Render a completed diagram as soon as its complete fenced block is available, while still preserving syntax validation and clear error reporting.

## Transcription latency

Measure the microphone or system-audio capture, transcription, and chat request as separate steps. For cloud mode, evaluate a supported live-transcription WebSocket API that returns interim text while speech is ongoing; Novi currently transcribes buffered WAV chunks after silence. Live transcription can feel much faster, but requires connection lifecycle, interruption, reconnect, privacy, billing, and no-network fallback handling. Keep local streaming ASR as an option. Do not silently upload audio or transcripts to a different provider than the user selected.

## Prompt caching

Keep reusable prompt instructions and stable source context at the start of requests, with changing turns later. This makes it possible for provider-side prefix caches to reuse prior work. Caching can reduce input processing, but does not speed token generation equally and cache hits are provider-dependent. Preserve the same prefix and observe provider cache-usage fields where available. Never cache user data across accounts or conversations in Novi’s own storage without an explicit privacy and invalidation design.

## Measure before and after

Record local timing spans without logging prompt contents, source documents, API keys, or transcript text:

- UI send to main-process request.
- Time spent on access/license checks.
- Provider request to first streamed text token.
- First token to final token.
- Input, cached-input, reasoning, and output token counts when returned by the provider.
- For listening: first captured frame, first partial transcript, finalized transcript, and chat first token.

Compare median and slow-tail response times across simple follow-ups, coding prompts, long conversations, source-backed sessions, and diagram requests. Also compare answer quality: executable or reviewable code, constraint retention, correctness, and successful follow-ups. Test Fast and Deep separately; a latency improvement without acceptable quality is not a win.

## Implementation order

1. Add timing spans and a small redacted latency view or diagnostic log.
2. Remove the `UNDERSTOOD` request on model change.
3. Add bounded conversation history and task-relevant source retrieval, while retaining saved history.
4. Tighten ordinary response length and ask for a direct answer first.
5. Measure buffered transcription delay; prototype live transcription as an optional engine.
6. Add configurable Fast and Deep model roles. Start with explicit selection; add automatic routing only after evaluating misroutes and answer quality.
7. Improve provider prompt-prefix stability and report cache hits where the provider exposes them.

## Research sources

- OpenAI, [Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization): streaming, output length, request count, input context, and perceived wait time.
- OpenAI, [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching): matching prompt prefixes can reduce input processing latency and cost on cache hits.
- Google, [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking): lower supported thinking levels for routine requests; avoid using a hard output cutoff as a substitute.
- Google, [Gemini context caching](https://ai.google.dev/gemini-api/docs/caching): provider-side reuse for repeated context, subject to supported models and cache behavior.
- Google, [Gemini Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe): streaming interim and finalized transcript events for real-time speech.
- Anthropic, [Reducing latency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency): choosing a faster model, reducing prompt and output length, and streaming.
- Anthropic, [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): cache stable prompt sections with explicit or automatic breakpoints where supported.

Provider features and model availability change. Recheck current provider documentation and the user's available model list when implementing provider-specific controls.

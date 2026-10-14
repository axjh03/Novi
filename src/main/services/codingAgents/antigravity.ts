import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineModel } from '../../../shared/localCoding';
import { engineEnvironment, engineRuntime, type RuntimeLocation } from './runtime';
import { spawnEngine } from './process';
import { callTool, highestEffort, TOOL_DESCRIPTIONS, TOOL_SCHEMAS, type AgentCredential, type AgentTask, type CodingAgent } from './types';

// Antigravity (agy) headless adapter.
//
// Integration reference:
//   [S2] https://www.antigravity.google/docs/cli/install/
//   [S3] https://www.antigravity.google/docs/cli/headless/
//
// Key constraints enforced here:
//   - GEMINI_API_KEY is set only in the private process environment; never in args or logs.
//   - modelProvider="gemini" in settings.json inside private HOME forces API-key-only mode.
//   - No browser/keychain/OAuth fallback: if the key is absent or rejected, the process fails.
//   - agy's headless stdin/stdout transport accepts text blocks only; images are explicitly rejected.
//   - Only list_files, search_files, and read_file are offered; every other tool call is refused.
//   - No personal ~/.gemini config, hooks, extensions, or MCP is inherited.
//   - Private HOME is created per-run and deleted on cleanup; it is not container-grade isolation.

const AGY_SETTINGS = (model: string) =>
  JSON.stringify({ modelProvider: 'gemini', model, theme: 'default' }, null, 2);

/** Build the JSON request body for agy headless mode (text-only input). */
function buildRequest(task: AgentTask): string {
  const toolDefs = (['list_files', 'search_files', 'read_file'] as const).map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: TOOL_SCHEMAS[name],
  }));
  return JSON.stringify({
    model: task.model,
    systemPrompt: task.instructions,
    prompt: task.prompt,
    // JSON-schema output so the result is structured exactly as PROPOSAL_SCHEMA.
    outputSchema: task.schema,
    tools: toolDefs,
    // Headless streaming: agy emits newline-delimited JSON events on stdout.
    stream: true,
  });
}

interface AgyEvent {
  type: 'tool_call' | 'tool_result' | 'text_delta' | 'result' | 'error' | 'model_list';
  tool?: string;
  arguments?: unknown;
  text?: string;
  output?: unknown;
  error?: string;
  models?: Array<{ id: string; displayName?: string; supportsReasoning?: boolean; supportsImages?: boolean; supportedEffortLevels?: string[] }>;
}

export class AntigravityAgent implements CodingAgent {
  readonly id = 'antigravity' as const;
  constructor(private location: RuntimeLocation, private workRoot: string) {}

  private async prepare(credential: AgentCredential, model: string) {
    const runtime = await engineRuntime('antigravity', this.location);
    const run = join(this.workRoot, `agy-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const home = join(run, 'home');
    const config = join(home, '.gemini', 'antigravity-cli');
    for (const dir of [home, join(home, 'tmp'), config]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Write settings.json with modelProvider=gemini so agy uses API-key mode, not browser/keychain.
    writeFileSync(join(config, 'settings.json'), AGY_SETTINGS(model), { mode: 0o600 });
    const env = engineEnvironment(home, {
      GEMINI_API_KEY: credential.apiKey,
      // Suppress telemetry, auto-update checks, and any personal config loading.
      AGY_DISABLE_TELEMETRY: '1',
      AGY_DISABLE_UPDATE_CHECK: '1',
      NO_COLOR: '1',
    }, []);
    const cleanup = async () => {
      await rm(run, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    };
    return { runtime, env, cleanup };
  }

  async listModels(credential: AgentCredential, signal: AbortSignal): Promise<EngineModel[]> {
    const { runtime, env, cleanup } = await this.prepare(credential, '');
    try {
      if (signal.aborted) throw new Error('Cancelled.');
      // agy headless: `agy --headless list-models` emits a JSON object with type=model_list.
      const engine = spawnEngine(runtime.executable, ['--headless', 'list-models'], { env });
      const abort = () => void engine.stop();
      signal.addEventListener('abort', abort, { once: true });
      let stdout = '';
      engine.child.stdout.setEncoding('utf8');
      engine.child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      engine.child.stderr.on('data', () => { /* drain private diagnostics */ });
      try {
        await engine.stop();
      } finally {
        signal.removeEventListener('abort', abort);
      }
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event: AgyEvent;
        try { event = JSON.parse(trimmed); } catch { continue; }
        if (event.type === 'model_list' && Array.isArray(event.models)) {
          return event.models.map((m) => {
            const efforts = m.supportedEffortLevels ?? (m.supportsReasoning ? ['low', 'medium', 'high'] : []);
            return { id: m.id, name: m.displayName || m.id, efforts, highestEffort: highestEffort(efforts), images: false };
          });
        }
      }
      // If list-models isn't supported by this binary version, return a known-good default.
      return [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', efforts: ['low', 'medium', 'high'], highestEffort: 'high', images: false }];
    } finally {
      await cleanup();
    }
  }

  async run(task: AgentTask, credential: AgentCredential): Promise<unknown> {
    // agy's headless transport sends text blocks only; reject images up front.
    if (task.images.length > 0) {
      throw new Error('Antigravity (agy) does not support image attachments in headless mode. Remove the screenshot or switch to Codex or Claude Code.');
    }
    const { runtime, env, cleanup } = await this.prepare(credential, task.model);
    const engine = spawnEngine(runtime.executable, ['--headless'], { env });
    const abort = () => void engine.stop();
    task.signal.addEventListener('abort', abort, { once: true });
    let buffer = '';
    const state: { result: unknown; failed: string | null } = { result: null, failed: null };
    const pending: Array<() => Promise<void>> = [];
    engine.child.stdout.setEncoding('utf8');
    engine.child.stderr.on('data', () => { /* drain; may contain request details */ });

    const processLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let event: AgyEvent;
      try { event = JSON.parse(trimmed); } catch { return; }

      if (event.type === 'text_delta') {
        task.onProgress('analyzing');
      } else if (event.type === 'tool_call') {
        const name = event.tool ?? '';
        // Only allow the three read-only tools; refuse everything else.
        if (!['list_files', 'search_files', 'read_file'].includes(name)) {
          task.onDenied(name);
          // Write a denial back to stdin.
          if (engine.child.stdin.writable) {
            engine.child.stdin.write(JSON.stringify({ type: 'tool_result', tool: name, output: 'Not available in read-only mode.' }) + '\n');
          }
          return;
        }
        const { text, ok } = await callTool(task.tools, name, event.arguments, task.onProgress);
        if (engine.child.stdin.writable) {
          engine.child.stdin.write(JSON.stringify({ type: 'tool_result', tool: name, output: text, success: ok }) + '\n');
        }
      } else if (event.type === 'result') {
        state.result = event.output;
      } else if (event.type === 'error') {
        state.failed = event.error ?? 'Antigravity reported an error.';
      }
    };

    engine.child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        pending.push(() => processLine(line));
      }
    });

    try {
      if (task.signal.aborted) throw new Error('Cancelled.');
      // Send the request over stdin.
      const request = buildRequest(task);
      engine.child.stdin.write(request + '\n');
      engine.child.stdin.end();
      task.onProgress('analyzing', 'Analyzing');

      // Drain the stdout line queue, processing tool calls sequentially.
      await new Promise<void>((resolve, reject) => {
        engine.child.once('close', () => resolve());
        engine.child.once('error', () => reject(new Error('The Antigravity engine could not start.')));
      });

      // Process any remaining lines.
      for (const fn of pending) await fn();
      const remainder = buffer.trim();
      if (remainder) await processLine(remainder);

      if (task.signal.aborted) throw new Error('Cancelled.');
      if (state.failed) throw new Error(state.failed.startsWith('Antigravity') ? state.failed : `Antigravity: ${state.failed}`);
      if (state.result === null) throw new Error('Antigravity finished without an answer.');
      return state.result;
    } catch (error) {
      if (task.signal.aborted) throw new Error('Cancelled.');
      throw error;
    } finally {
      task.signal.removeEventListener('abort', abort);
      await engine.stop();
      await cleanup();
    }
  }
}

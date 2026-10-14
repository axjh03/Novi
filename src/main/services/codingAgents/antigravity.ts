import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { EngineModel } from '../../../shared/localCoding';
import { listModels } from '../models';
import { engineEnvironment, engineRuntime, type RuntimeLocation } from './runtime';
import { spawnEngine } from './process';
import { callTool, TOOL_DESCRIPTIONS, TOOL_SCHEMAS, type AgentCredential, type AgentTask, type CodingAgent } from './types';

const READ_TOOLS = ['list_files', 'search_files', 'read_file'] as const;

// agy's stream-json transport exchanges user turns and results, not external tool calls.
// Disable native tools; structured results request reads that Novi executes against the pinned snapshot.
export function antigravitySchema(answer: Record<string, unknown>) {
  return { anyOf: [
    ...READ_TOOLS.map(tool => ({ type: 'object', additionalProperties: false, required: ['tool', 'arguments'],
      properties: { tool: { type: 'string', enum: [tool] }, arguments: TOOL_SCHEMAS[tool] } })),
    { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer } },
  ] };
}

export class AntigravityAgent implements CodingAgent {
  readonly id = 'antigravity' as const;
  constructor(private location: RuntimeLocation, private workRoot: string) {}

  async listModels(credential: AgentCredential, signal: AbortSignal): Promise<EngineModel[]> {
    signal.throwIfAborted();
    const models = await listModels({ provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: '', stream: true }, credential.apiKey);
    signal.throwIfAborted();
    // The Gemini catalog does not advertise agy's per-model effort support; keep the CLI default.
    return models.map(model => ({ ...model, efforts: [], highestEffort: null, images: false }));
  }

  async run(task: AgentTask, credential: AgentCredential): Promise<unknown> {
    if (task.images.length) throw new Error('Antigravity does not support images in headless mode. Remove the image or choose Codex or Claude.');
    if (!credential.apiKey.trim()) throw new Error('Save a Gemini API key before using Antigravity.');
    task.signal.throwIfAborted();
    const runtime = await engineRuntime('antigravity', this.location);
    const root = join(this.workRoot, `agy-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const home = join(root, 'home'), cwd = join(root, 'workspace');
    let engine: ReturnType<typeof spawnEngine> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure: Error | null = null;
    const stop = (error: Error) => { failure = error; void engine?.stop().catch(() => {}); };
    const abort = () => stop(new Error('Cancelled.'));
    try {
      const config = join(home, '.gemini', 'antigravity-cli'), agents = join(cwd, '.agents', 'agents');
      for (const dir of [config, agents, join(home, 'tmp')]) mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(join(config, 'settings.json'), JSON.stringify({ modelProvider: 'gemini' }), { mode: 0o600 });
      const definitions = READ_TOOLS.map(name => ({ name, description: TOOL_DESCRIPTIONS[name], arguments: TOOL_SCHEMAS[name] }));
      writeFileSync(join(agents, 'novi.md'), `---\nname: novi\ndescription: Read-only Novi snapshot analysis\nmainAgent: true\nsubagent: false\ntools: []\ncommandExecutionPolicy: off\nskills: []\nplugins: []\n---\n${task.instructions}\n\nReturn a structured tool request to read the pinned project, or {"answer": ...} with your final answer. Novi supplies each tool result in the next user turn. Available reads: ${JSON.stringify(definitions)}\n`, { mode: 0o600 });
      const schema = join(root, 'schema.json');
      writeFileSync(schema, JSON.stringify(antigravitySchema(task.schema)), { mode: 0o600 });
      const env = engineEnvironment(home, { GEMINI_API_KEY: credential.apiKey, AGY_CLI_DISABLE_AUTO_UPDATE: 'true', AGY_DISABLE_TELEMETRY: '1', NO_COLOR: '1' }, []);
      engine = spawnEngine(runtime.executable, ['--agent', 'novi', '--model', task.model, '--input-format', 'stream-json', '--output-format', 'stream-json', '--json-schema', schema], { cwd, env });
      engine.child.once('error', () => stop(new Error('Antigravity could not start. Install or update it in Settings.')));
      engine.child.stderr.on('data', () => { /* Diagnostics can contain private request details. */ });
      engine.child.stdin.on('error', () => stop(new Error('Antigravity closed its input unexpectedly.')));
      const lines = createInterface({ input: engine.child.stdout, crlfDelay: Infinity });
      const send = (content: string) => engine!.child.stdin.write(JSON.stringify({ event: 'user', message: { content } }) + '\n');
      task.signal.addEventListener('abort', abort, { once: true });
      task.signal.throwIfAborted();
      let initialized = false, turns = 0;
      timer = setTimeout(() => stop(new Error('Antigravity did not initialize within 30 seconds.')), 30_000);
      for await (const line of lines) {
        if (failure) throw failure;
        if (!line.trim()) continue;
        if (line.length > 4 * 1024 * 1024) throw new Error('Antigravity returned an oversized event.');
        const event = JSON.parse(line);
        if (event.event === 'init') {
          if (initialized) throw new Error('Antigravity initialized more than once.');
          // Do not send the user's prompt or project data to a CLI that enabled native tools.
          if (!Array.isArray(event.init?.tools) || event.init.tools.length) throw new Error('This Antigravity version did not disable its built-in tools. Update the agent or choose Codex or Claude.');
          initialized = true;
          clearTimeout(timer);
          timer = setTimeout(() => stop(new Error('Antigravity timed out. Try a narrower request.')), 30 * 60_000);
          send(task.prompt);
        } else if (event.event === 'step_update') {
          task.onProgress('analyzing');
        } else if (event.event === 'result') {
          if (!initialized || event.result?.status !== 'SUCCESS') throw new Error('Antigravity could not complete the request. Check the saved Gemini key and model access.');
          const result = event.result.structured_output;
          if (!result || typeof result !== 'object') throw new Error('Antigravity returned no structured result.');
          if ('answer' in result) return result.answer;
          if (!READ_TOOLS.includes(result.tool)) { task.onDenied(String(result.tool)); throw new Error('Antigravity requested a tool outside the read-only tools.'); }
          if (++turns > 80) throw new Error('Antigravity reached the read limit. Ask a narrower question.');
          const output = await callTool(task.tools, result.tool, result.arguments, task.onProgress);
          task.signal.throwIfAborted();
          send(JSON.stringify({ tool: result.tool, ...output }));
        }
      }
      throw failure || new Error('Antigravity finished without an answer.');
    } finally {
      clearTimeout(timer);
      task.signal.removeEventListener('abort', abort);
      try { await engine?.stop(); }
      finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    }
  }
}

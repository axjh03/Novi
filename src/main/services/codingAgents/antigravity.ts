import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import type { EngineModel } from '../../../shared/localCoding';
import { listModels } from '../models';
import { engineEnvironment, engineRuntime, type RuntimeLocation } from './runtime';
import { spawnEngine } from './process';
import { callTool, TOOL_DESCRIPTIONS, TOOL_SCHEMAS, type AgentCredential, type AgentTask, type CodingAgent } from './types';

const READ_TOOLS = ['list_files', 'search_files', 'read_file'] as const;

// Classify diagnostics without copying API keys, paths or project text into chat/history.
function failureMessage(detail: string, fallback: string): string {
  if (/invalid model selection|unknown model|model[^\n]*(?:not recognized|not found|not supported)|unsupported model/i.test(detail)) return 'Antigravity rejected the selected model. Choose another model in the Local Coding session settings.';
  if (/authentication required|not authenticated|sign.?in required|GEMINI_API_KEY[^\n]*(?:not set|missing)|invalid api key|api key not valid|unauthenticated|\b401\b/i.test(detail)) return 'Antigravity could not authenticate with the saved Gemini API key. Check the connection in Settings › API Management.';
  if (/resource_exhausted|quota|rate.?limit|\b429\b/i.test(detail)) return 'Antigravity reached the Gemini quota or rate limit. Check the provider account or try again later.';
  if (/unknown flag|unknown option|unrecognized (?:option|argument)|flag provided but not defined/i.test(detail)) return 'Antigravity does not support the required headless options. Update it in Settings › API Management › Local Coding agents.';
  if (/(?:json[- ]schema|schema)[^\n]*(?:root|must be|invalid)|invalid (?:json )?schema/i.test(detail)) return 'Antigravity rejected the response format supplied by Novi. Update Novi and try again.';
  return fallback;
}

// agy's stream-json transport exchanges user turns and results, not external tool calls.
// Disable native tools; structured results request reads that Novi executes against the pinned snapshot.
export function antigravitySchema(answer: Record<string, unknown>) {
  // agy injects these finish arguments before validating each additionalProperties:false branch.
  const metadata = { toolSummary: { type: 'string' }, toolAction: { type: 'string' } };
  // agy 1.2.14+ requires an explicit object root, even when every branch is an object.
  return { type: 'object', anyOf: [
    ...READ_TOOLS.map(tool => ({ type: 'object', additionalProperties: false, required: ['tool', 'arguments'],
      properties: { tool: { type: 'string', enum: [tool] }, arguments: TOOL_SCHEMAS[tool], ...metadata } })),
    { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer, ...metadata } },
  ] };
}

export class AntigravityAgent implements CodingAgent {
  readonly id = 'antigravity' as const;
  constructor(private location: RuntimeLocation, private workRoot: string) {}

  private async prepare(credential: AgentCredential) {
    if (!credential.apiKey.trim()) throw new Error('Antigravity needs a saved Gemini API key. Add one in Settings › API Management.');
    const runtime = await engineRuntime('antigravity', this.location);
    const root = join(this.workRoot, `agy-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const home = join(root, 'home'), cwd = join(root, 'workspace');
    try {
      const config = join(home, '.gemini', 'antigravity-cli');
      for (const dir of [config, cwd, join(home, 'tmp')]) mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(join(config, 'settings.json'), JSON.stringify({ modelProvider: 'gemini' }), { mode: 0o600 });
      const env = engineEnvironment(home, { GEMINI_API_KEY: credential.apiKey, AGY_CLI_DISABLE_AUTO_UPDATE: 'true', AGY_DISABLE_TELEMETRY: '1', NO_COLOR: '1' }, runtime.pathDirs);
      return { runtime, root, cwd, env };
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      throw error;
    }
  }

  async listModels(credential: AgentCredential, signal: AbortSignal): Promise<EngineModel[]> {
    signal.throwIfAborted();
    // Verify the saved key, but offer CLI slugs: Gemini API model ids are not agy model names.
    await listModels({ provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: '', stream: true }, credential.apiKey);
    signal.throwIfAborted();
    const { runtime, root, cwd, env } = await this.prepare(credential);
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(runtime.executable, ['models'], { cwd, env, signal, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
          if (error) reject(Object.assign(error, { stderr }));
          else resolve(stdout);
        });
      });
      const models = new Map<string, EngineModel>();
      for (const line of stripVTControlCharacters(stdout).split(/\r?\n/)) {
        const match = line.trim().match(/^((?:gemini|antigravity)-[\w.-]+)\s+(.+)$/);
        if (!match || match[1].length > 200) continue;
        // The text catalog does not advertise supported effort values; keep the CLI default.
        models.set(match[1], { id: match[1], name: match[2].slice(0, 200), efforts: [], highestEffort: null, images: false });
      }
      if (!models.size) throw new Error('Antigravity reported no Gemini models. Update the agent in Settings › API Management › Local Coding agents.');
      return [...models.values()];
    } catch (error) {
      signal.throwIfAborted();
      const detail = error as { stderr?: string; message?: string };
      throw new Error(failureMessage(`${detail.stderr ?? ''}\n${detail.message ?? ''}`, 'Antigravity could not list its models. Install or update it in Settings › API Management › Local Coding agents.'), { cause: { error, engineVersion: runtime.version, stderr: detail.stderr } });
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  }

  async run(task: AgentTask, credential: AgentCredential): Promise<unknown> {
    if (task.images.length) throw new Error('Antigravity does not support images in headless mode. Remove the image or choose Codex or Claude.');
    task.signal.throwIfAborted();
    const { runtime, root, cwd, env } = await this.prepare(credential);
    let engine: ReturnType<typeof spawnEngine> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure: Error | null = null;
    let diagnostics = '';
    let initialized = false, turns = 0, lastEvent = '';
    let resultError: unknown;
    const withDiagnostics = (error: unknown) => Object.assign(error instanceof Error ? error : new Error(String(error)), {
      diagnostics: { engineVersion: runtime.version, initialized, turns, lastEvent, exitCode: engine?.child.exitCode, signal: engine?.child.signalCode, stderr: diagnostics, resultError },
    });
    const stop = (error: Error) => { failure ??= error; void engine?.stop().catch(() => {}); };
    const abort = () => stop(new Error('Cancelled.'));
    try {
      const agents = join(cwd, '.agents', 'agents');
      mkdirSync(agents, { recursive: true, mode: 0o700 });
      // agy adds runtime tools to custom agents; only finish may execute to emit structured output.
      env.NOVI_HOOK_NODE = process.execPath;
      env.ELECTRON_RUN_AS_NODE = '1';
      writeFileSync(join(cwd, '.agents', 'novi-tool-gate.cjs'), `const { readFileSync } = require('node:fs');
const input = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({ decision: input.toolCall?.name === 'finish' ? 'allow' : 'deny', reason: 'Use Novi structured snapshot reads instead of native tools.' }));
`, { mode: 0o600 });
      // agy's Windows hook launcher escapes inline quotes; keep the quoted executable in a batch file.
      if (process.platform === 'win32') writeFileSync(join(cwd, '.agents', 'novi-tool-gate.cmd'), '@"%NOVI_HOOK_NODE%" "%~dp0novi-tool-gate.cjs"\r\n', { mode: 0o600 });
      writeFileSync(join(cwd, '.agents', 'hooks.json'), JSON.stringify({ 'novi-read-only': {
        PreToolUse: [{ matcher: '*', hooks: [{ command: process.platform === 'win32' ? 'novi-tool-gate.cmd' : '"$NOVI_HOOK_NODE" novi-tool-gate.cjs' }] }],
      } }), { mode: 0o600 });
      const definitions = READ_TOOLS.map(name => ({ name, description: TOOL_DESCRIPTIONS[name], arguments: TOOL_SCHEMAS[name] }));
      writeFileSync(join(agents, 'novi.md'), `---\nname: novi\ndescription: Read-only Novi snapshot analysis\nmainAgent: true\nsubagent: false\ntools: [finish]\ncommandExecutionPolicy: off\nskills: []\nplugins: []\n---\n${task.instructions}\n\nCall finish with a structured tool request to read the pinned project, or {"answer": ...} with your final answer. Novi supplies each tool result in the next user turn. Available reads: ${JSON.stringify(definitions)}\n`, { mode: 0o600 });
      const schema = join(root, 'schema.json');
      writeFileSync(schema, JSON.stringify(antigravitySchema(task.schema)), { mode: 0o600 });
      engine = spawnEngine(runtime.executable, ['--agent', 'novi', '--model', task.model, '--input-format', 'stream-json', '--output-format', 'stream-json', '--json-schema', schema], { cwd, env });
      engine.child.once('error', error => stop(new Error('Antigravity could not start. Install or update it in Settings.', { cause: error })));
      engine.child.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk.toString()).slice(-16_384); });
      engine.child.stdin.on('error', error => stop(new Error('Antigravity closed its input unexpectedly.', { cause: error })));
      const lines = createInterface({ input: engine.child.stdout, crlfDelay: Infinity });
      const send = (content: string) => engine!.child.stdin.write(JSON.stringify({ event: 'user', message: { content } }) + '\n');
      task.signal.addEventListener('abort', abort, { once: true });
      task.signal.throwIfAborted();
      timer = setTimeout(() => stop(new Error('Antigravity did not initialize within 30 seconds.')), 30_000);
      for await (const line of lines) {
        if (failure) throw failure;
        if (!line.trim()) continue;
        if (line.length > 4 * 1024 * 1024) throw new Error('Antigravity returned an oversized event.');
        let event;
        try { event = JSON.parse(line); }
        catch { throw new Error('Antigravity returned an invalid event. Update the agent in Settings or try again.'); }
        if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Antigravity returned an invalid event. Update the agent in Settings or try again.');
        lastEvent = String(event.event ?? event.status ?? 'unknown');
        if (event.event === 'init') {
          if (initialized) throw new Error('Antigravity initialized more than once.');
          // init.tools is the CLI catalog, not the selected agent's permitted toolset (agy 1.4).
          if (event.init?.agent !== 'novi') throw new Error('Antigravity did not select Novi\'s read-only agent. Update the agent or choose Codex or Claude.');
          initialized = true;
          clearTimeout(timer);
          timer = setTimeout(() => stop(new Error('Antigravity timed out. Try a narrower request.')), 30 * 60_000);
          send(task.prompt);
        } else if (event.event === 'step_update') {
          if (event.step_update?.step_type === 'tool' && event.step_update.tool_name !== 'finish') {
            task.onDenied(String(event.step_update.tool_name ?? 'unknown'));
            throw new Error('Antigravity requested a native tool outside the read-only tools.');
          }
          task.onProgress('analyzing');
        } else if (event.event === 'result' || typeof event.status === 'string') {
          // Startup failures can be bare JSON envelopes, without an init or result event wrapper.
          const terminal = event.event === 'result' ? event.result : event;
          resultError = terminal?.error;
          if (terminal?.status !== 'SUCCESS') throw new Error(failureMessage(`${terminal?.error ?? ''}\n${diagnostics}`, 'Antigravity could not complete the request. Check the saved Gemini key and model access.'));
          if (!initialized) throw new Error('Antigravity returned a result before confirming its read-only tools. Update the agent in Settings.');
          let result = terminal.structured_output;
          if (result == null && typeof terminal.response === 'string') {
            try { result = JSON.parse(terminal.response); } catch { /* The format is checked below. */ }
          }
          if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Antigravity returned no valid structured answer. Try again or update the agent in Settings.');
          if ('answer' in result && result.answer != null) return result.answer;
          if (!READ_TOOLS.includes(result.tool)) { task.onDenied(String(result.tool)); throw new Error('Antigravity requested a tool outside the read-only tools.'); }
          if (++turns > 80) throw new Error('Antigravity reached the read limit. Ask a narrower question.');
          const output = await callTool(task.tools, result.tool, result.arguments, task.onProgress);
          task.signal.throwIfAborted();
          send(JSON.stringify({ tool: result.tool, ...output }));
        }
      }
      await engine.stop();
      const exit = engine.child.exitCode === null ? '' : ` (exit code ${engine.child.exitCode})`;
      throw failure || new Error(failureMessage(diagnostics, `Antigravity exited ${initialized ? 'before returning an answer' : 'before initialization'}${exit}. Update the agent in Settings and check its Gemini connection and selected model.`));
    } catch (error) {
      failure = withDiagnostics(error);
      throw failure;
    } finally {
      clearTimeout(timer);
      task.signal.removeEventListener('abort', abort);
      try {
        try { await engine?.stop(); }
        finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      } catch (error) {
        throw withDiagnostics(new Error('Antigravity could not clean up its temporary files.', { cause: { error, failure } }));
      }
      if (failure) withDiagnostics(failure);
    }
  }
}

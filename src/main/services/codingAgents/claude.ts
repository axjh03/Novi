import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import type { EngineModel } from '../../../shared/localCoding';
import { engineEnvironment, engineRuntime, type RuntimeLocation } from './runtime';
import { spawnEngine } from './process';
import { callTool, highestEffort, TOOL_DESCRIPTIONS, type AgentCredential, type AgentTask, type CodingAgent } from './types';

// Claude through the Claude Agent SDK, with an API key only. Every built-in tool is removed (`tools: []`); the model
// sees Novi's three in-process read tools and nothing else. No user or project settings, hooks, plugins, skills or
// MCP configuration are loaded, sessions are not saved, and any other permission request is denied.

const NOVI_TOOLS = ['mcp__novi__list_files', 'mcp__novi__search_files', 'mcp__novi__read_file'];

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk');

export class ClaudeAgent implements CodingAgent {
  readonly id = 'claude' as const;
  constructor(private location: RuntimeLocation, private workRoot: string, private testBaseUrl?: string) {}

  private async prepare(credential: AgentCredential) {
    const runtime = await engineRuntime('claude', this.location);
    const sdk: Sdk = await import('@anthropic-ai/claude-agent-sdk');
    const run = join(this.workRoot, `claude-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const home = join(run, 'home'), cwd = join(run, 'workspace'), config = join(run, 'config');
    for (const dir of [home, cwd, config, join(home, 'tmp')]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    const env = engineEnvironment(home, {
      CLAUDE_CONFIG_DIR: config,
      ANTHROPIC_API_KEY: credential.apiKey,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'novi',
      DISABLE_AUTOUPDATER: '1',
      DISABLE_TELEMETRY: '1',
      DISABLE_ERROR_REPORTING: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      ...(this.testBaseUrl ? { ANTHROPIC_BASE_URL: this.testBaseUrl } : {}),
    }, []);
    let engine: ReturnType<typeof spawnEngine> | undefined;
    const options = {
      pathToClaudeCodeExecutable: runtime.executable,
      cwd, env,
      tools: [] as string[],
      settingSources: [] as [],
      strictMcpConfig: true,
      skills: [] as string[],
      plugins: [],
      persistSession: false,
      permissionMode: 'dontAsk' as const,
      spawnClaudeCodeProcess: ({ command, args, ...options }: SpawnOptions) => {
        engine = spawnEngine(command, args, options);
        engine.child.stderr.on('data', () => { /* drain private diagnostics */ });
        return engine.child;
      },
      stderr: () => { /* engine diagnostics are not logged; they can contain request details */ },
    };
    return { sdk, options, cleanup: async () => {
      await engine?.stop();
      await rm(run, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } };
  }

  async listModels(credential: AgentCredential, signal: AbortSignal): Promise<EngineModel[]> {
    const { sdk, options, cleanup } = await this.prepare(credential);
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    // A prompt stream that never sends: the engine starts, reports its models, and is closed without any request.
    const idle = (async function* (): AsyncGenerator<never> { if (!abort.signal.aborted) await new Promise<void>((resolve) => abort.signal.addEventListener('abort', () => resolve(), { once: true })); })();
    let query: ReturnType<Sdk['query']> | undefined;
    try {
      if (signal.aborted) throw new Error('Cancelled.');
      query = sdk.query({ prompt: idle, options: { ...options, abortController: abort, canUseTool: async () => ({ behavior: 'deny', message: 'Not available.' }) } });
      const models = await query.supportedModels();
      return models.map((model) => {
        const efforts = model.supportsEffort ? [...(model.supportedEffortLevels ?? [])] : [];
        return { id: model.value, name: model.displayName || model.value, efforts, highestEffort: highestEffort(efforts), images: true };
      });
    } finally {
      signal.removeEventListener('abort', onAbort);
      abort.abort();
      query?.close();
      await cleanup();
    }
  }

  async run(task: AgentTask, credential: AgentCredential): Promise<unknown> {
    const { z } = await import('zod');
    const { sdk, options, cleanup } = await this.prepare(credential);
    const text = async (name: string, args: unknown) => {
      const result = await callTool(task.tools, name, args, task.onProgress);
      return { content: [{ type: 'text' as const, text: result.text }], isError: !result.ok };
    };
    const server = sdk.createSdkMcpServer({
      name: 'novi', version: '1', alwaysLoad: true,
      tools: [
        sdk.tool('list_files', TOOL_DESCRIPTIONS.list_files, { scope: z.string().optional(), cursor: z.number().int().optional() }, (args) => text('list_files', args)),
        sdk.tool('search_files', TOOL_DESCRIPTIONS.search_files, { query: z.string(), scope: z.string().optional(), cursor: z.number().int().optional(), caseSensitive: z.boolean().optional() }, (args) => text('search_files', args)),
        sdk.tool('read_file', TOOL_DESCRIPTIONS.read_file, { fileId: z.string(), startLine: z.number().int().optional(), endLine: z.number().int().optional() }, (args) => text('read_file', args)),
      ],
    });
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    task.signal.addEventListener('abort', onAbort, { once: true });
    const content = [
      { type: 'text' as const, text: task.prompt },
      ...task.images.map((image) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mimeType as 'image/png', data: image.base64 } })),
    ];
    const prompt = (async function* () { yield { type: 'user' as const, message: { role: 'user' as const, content }, parent_tool_use_id: null }; })();
    let query: ReturnType<Sdk['query']> | undefined;
    try {
      if (task.signal.aborted) throw new Error('Cancelled.');
      query = sdk.query({
        prompt,
        options: {
          ...options,
          abortController: abort,
          mcpServers: { novi: server },
          allowedTools: NOVI_TOOLS,
          // Only reached for tools outside Novi's three; they are always refused.
          canUseTool: async (name) => { task.onDenied(name); return { behavior: 'deny', message: 'Read-only mode: only list_files, search_files and read_file are available.' }; },
          systemPrompt: task.instructions,
          model: task.model,
          ...(task.effort ? { effort: task.effort as 'max' } : {}),
          outputFormat: { type: 'json_schema', schema: task.schema },
          maxTurns: 80,
        },
      });
      for await (const message of query) {
        if (task.signal.aborted) throw new Error('Cancelled.');
        if (message.type === 'assistant') {
          for (const block of message.message.content) if (block.type === 'text' || block.type === 'thinking') task.onProgress('analyzing');
        } else if (message.type === 'result') {
          if (message.subtype === 'success' && !message.is_error) return message.structured_output ?? message.result;
          const reason = message.subtype === 'error_max_turns' ? 'Claude used every allowed step without finishing. Ask a narrower question.'
            : message.subtype === 'error_max_structured_output_retries' ? 'Claude could not produce a valid answer format.'
            : 'Claude could not finish this request.';
          throw new Error(reason);
        }
      }
      throw new Error(task.signal.aborted ? 'Cancelled.' : 'Claude finished without an answer.');
    } catch (error) {
      if (task.signal.aborted) throw new Error('Cancelled.');
      throw error;
    } finally {
      task.signal.removeEventListener('abort', onAbort);
      abort.abort();
      query?.close();
      await cleanup();
    }
  }
}

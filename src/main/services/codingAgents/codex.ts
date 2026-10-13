import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineModel } from '../../../shared/localCoding';
import { engineEnvironment, engineRuntime, type RuntimeLocation } from './runtime';
import { spawnEngine } from './process';
import { callTool, highestEffort, TOOL_DESCRIPTIONS, TOOL_SCHEMAS, type AgentCredential, type AgentTask, type CodingAgent } from './types';

// Codex app-server over JSON-RPC (stdio). Every run gets a fresh private CODEX_HOME with a locked configuration:
// no shell or exec tools, no web search, no hooks, plugins, apps, memories, multi-agent tools or skills,
// a read-only sandbox, no approvals, and no stored credentials. The model sees only Novi's three read tools.

const tomlString = (value: string) => JSON.stringify(value);

export function codexConfig(cwd: string, testProvider?: string): string {
  return [
    ...(testProvider ? [`model_provider = "novitest"`] : []),
    'approval_policy = "never"',
    'sandbox_mode = "read-only"',
    'web_search = "disabled"',
    'cli_auth_credentials_store = "ephemeral"',
    'allow_login_shell = false',
    ...(testProvider ? ['[model_providers.novitest]', 'name = "novitest"', `base_url = ${tomlString(testProvider)}`, 'wire_api = "responses"', 'supports_websockets = false', 'requires_openai_auth = true'] : []),
    '[features]',
    ...['shell_tool', 'unified_exec', 'hooks', 'multi_agent', 'apps', 'remote_plugin', 'goals', 'memories', 'shell_snapshot', 'skill_mcp_dependency_install'].map((name) => `${name} = false`),
    '[shell_environment_policy]',
    'inherit = "none"',
    `[projects.${tomlString(cwd)}]`,
    'trust_level = "untrusted"',
    '',
  ].join('\n');
}

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

class RpcClient {
  private buffer = '';
  private next = 0;
  private pending = new Map<number, Pending>();
  private closed: Error | null = null;
  constructor(private child: ChildProcessWithoutNullStreams, private onNotification: (method: string, params: any) => void, private onRequest: (method: string, params: any) => Promise<unknown>, private onClose: (error: Error) => void) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 64 * 1024 * 1024) { this.fail(new Error('The Codex engine sent an oversized message.')); child.kill('SIGKILL'); return; }
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (line) this.dispatch(line);
      }
    });
    child.on('exit', () => this.fail(new Error('The Codex engine stopped unexpectedly.')));
    child.on('error', () => this.fail(new Error('The Codex engine could not start.')));
  }
  private dispatch(line: string) {
    let message: any;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method && message.id !== undefined) {
      void this.onRequest(message.method, message.params)
        .then((result) => this.write({ id: message.id, result }))
        .catch((error: Error) => this.write({ id: message.id, error: { code: -32000, message: error.message || 'Not available.' } }));
    } else if (message.method) this.onNotification(message.method, message.params);
    else if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(String(message.error.message || 'Codex request failed.')));
      else pending.resolve(message.result);
    }
  }
  private write(message: unknown) { if (!this.closed && this.child.stdin.writable) this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  call<T = any>(method: string, params: unknown): Promise<T> {
    if (this.closed) return Promise.reject(this.closed);
    const id = ++this.next;
    return new Promise<T>((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.write({ method, id, params }); });
  }
  notify(method: string, params?: unknown) { this.write(params === undefined ? { method } : { method, params }); }
  fail(error: Error) {
    if (this.closed) return;
    this.closed = error;
    this.onClose(error);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export class CodexAgent implements CodingAgent {
  readonly id = 'codex' as const;
  constructor(private location: RuntimeLocation, private workRoot: string, private testProvider?: string) {}

  private async start(credential: AgentCredential, handlers: { onNotification: (method: string, params: any) => void; onRequest: (method: string, params: any) => Promise<unknown>; onClose?: (error: Error) => void }) {
    const runtime = await engineRuntime('codex', this.location);
    const run = join(this.workRoot, `codex-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const home = join(run, 'home'), cwd = join(run, 'workspace');
    for (const dir of [home, cwd, join(home, 'tmp')]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(home, 'config.toml'), codexConfig(cwd, this.testProvider), { mode: 0o600 });
    const engine = spawnEngine(runtime.executable, ['app-server'], {
      cwd, env: engineEnvironment(home, { CODEX_HOME: home }, runtime.pathDirs),
    });
    const { child } = engine;
    child.stderr.on('data', () => { /* diagnostics stay private; never logged with request content */ });
    const rpc = new RpcClient(child, handlers.onNotification, handlers.onRequest, handlers.onClose ?? (() => {}));
    const cleanup = async () => {
      rpc.fail(new Error('The Codex engine was closed.'));
      await engine.stop();
      await rm(run, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    };
    try {
      await rpc.call('initialize', { clientInfo: { name: 'novi', title: 'Novi', version: '1' }, capabilities: { experimentalApi: true, requestAttestation: false } });
      rpc.notify('initialized');
      // The key goes over the private pipe, never as an argument or environment variable, and is not stored.
      await rpc.call('account/login/start', { type: 'apiKey', apiKey: credential.apiKey });
      // Built-in skills are text the model could follow; turn every one off for this home.
      const skills = await rpc.call<{ data: Array<{ skills: Array<{ path: string; enabled: boolean }> }> }>('skills/list', { cwds: [cwd] });
      for (const entry of skills.data) for (const skill of entry.skills) if (skill.enabled) await rpc.call('skills/config/write', { path: skill.path, enabled: false });
    } catch (error) { await cleanup(); throw error; }
    return { rpc, cwd, cleanup };
  }

  async listModels(credential: AgentCredential, signal: AbortSignal): Promise<EngineModel[]> {
    const { rpc, cleanup } = await this.start(credential, { onNotification: () => {}, onRequest: async () => { throw new Error('Not available.'); } });
    const abort = () => rpc.fail(new Error('Cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) throw new Error('Cancelled.');
      const models: EngineModel[] = [];
      let cursor: string | null = null;
      do {
        const page: { data: Array<{ id: string; displayName: string; hidden: boolean; supportedReasoningEfforts: Array<{ reasoningEffort: string }>; inputModalities: string[] }>; nextCursor?: string | null } = await rpc.call('model/list', { cursor, limit: 100 });
        for (const model of page.data) {
          if (model.hidden) continue;
          const efforts = model.supportedReasoningEfforts.map((item) => item.reasoningEffort);
          models.push({ id: model.id, name: model.displayName || model.id, efforts, highestEffort: highestEffort(efforts), images: model.inputModalities.includes('image') });
        }
        cursor = page.nextCursor ?? null;
      } while (cursor && models.length < 500);
      return models;
    } finally { signal.removeEventListener('abort', abort); await cleanup(); }
  }

  async run(task: AgentTask, credential: AgentCredential): Promise<unknown> {
    let finalText: string | null = null, turnId: string | null = null, threadId: string | null = null;
    let settle!: { resolve: (status: string) => void; reject: (error: Error) => void };
    const turnDone = new Promise<string>((resolve, reject) => { settle = { resolve, reject }; });
    // Startup can fail before the turn is awaited.
    void turnDone.catch(() => {});
    const deny = (what: string) => { task.onDenied(what); };
    const { rpc, cwd, cleanup } = await this.start(credential, {
      onNotification: (method, params) => {
        if (params?.turnId && turnId && params.turnId !== turnId) return;
        if (method === 'item/completed' && params.item?.type === 'agentMessage') finalText = String(params.item.text ?? '');
        else if (method === 'item/agentMessage/delta' || method === 'item/reasoning/summaryTextDelta') task.onProgress('analyzing');
        else if (method === 'turn/completed' && (!threadId || params.threadId === threadId)) {
          const status = params.turn?.status;
          if (status === 'completed') settle.resolve('completed');
          else settle.reject(new Error(params.turn?.error?.message ? `Codex stopped: ${params.turn.error.message}` : status === 'interrupted' ? 'Cancelled.' : 'Codex could not finish this request.'));
        } else if (method === 'error' && params?.willRetry === false) settle.reject(new Error(params?.error?.message ? `Codex: ${params.error.message}` : 'Codex reported an error.'));
      },
      onClose: (error) => settle.reject(error),
      onRequest: async (method, params) => {
        switch (method) {
          case 'item/tool/call': {
            const { text, ok } = await callTool(task.tools, params.tool, params.arguments, task.onProgress);
            return { contentItems: [{ type: 'inputText', text }], success: ok };
          }
          // Anything that would change files, run commands or widen access is refused.
          case 'item/commandExecution/requestApproval': deny('run a command'); return { decision: 'decline' };
          case 'item/fileChange/requestApproval': deny('change files'); return { decision: 'decline' };
          case 'item/permissions/requestApproval': deny('broader permissions'); return { permissions: {}, scope: 'turn' };
          case 'execCommandApproval': deny('run a command'); return { decision: { denied: { rejection: 'Read-only mode.' } } };
          case 'applyPatchApproval': deny('change files'); return { decision: { denied: { rejection: 'Read-only mode.' } } };
          case 'mcpServer/elicitation/request': deny('an external tool prompt'); return { action: 'decline', content: null, _meta: null };
          case 'item/tool/requestUserInput': return { answers: {} };
          default: deny(method); throw new Error('Not available in read-only mode.');
        }
      },
    });
    const abort = () => {
      if (threadId && turnId) void rpc.call('turn/interrupt', { threadId, turnId }).catch(() => {});
      setTimeout(() => settle.reject(new Error('Cancelled.')), 1500);
    };
    task.signal.addEventListener('abort', abort, { once: true });
    try {
      if (task.signal.aborted) throw new Error('Cancelled.');
      const thread = await rpc.call<{ thread: { id: string } }>('thread/start', {
        model: task.model, cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
        // No execution environment at all: the only way to see project files is Novi's tools.
        environments: [],
        baseInstructions: task.instructions,
        dynamicTools: (['list_files', 'search_files', 'read_file'] as const).map((name) => ({ type: 'function', name, description: TOOL_DESCRIPTIONS[name], inputSchema: TOOL_SCHEMAS[name] })),
      });
      threadId = thread.thread.id;
      const input = [
        { type: 'text', text: task.prompt, text_elements: [] },
        ...task.images.map((image) => ({ type: 'image', url: `data:${image.mimeType};base64,${image.base64}` })),
      ];
      const turn = await rpc.call<{ turn: { id: string } }>('turn/start', { threadId, input, outputSchema: task.schema, ...(task.effort ? { effort: task.effort } : {}) });
      turnId = turn.turn.id;
      task.onProgress('analyzing');
      await turnDone;
      if (finalText === null) throw new Error('Codex finished without an answer.');
      return finalText;
    } finally {
      task.signal.removeEventListener('abort', abort);
      await cleanup();
    }
  }
}

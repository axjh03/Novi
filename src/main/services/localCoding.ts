import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { ENGINES, LOCAL_CODING_LIMITS, PROPOSAL_SCHEMA, isEngineId, type ChangeSummary, type EngineId, type EngineModel, type EngineReadiness, type FileEntry, type LocalCodingBinding, type LocalCodingMessage, type ProjectState, type ProjectVersion, type Proposal, type RefreshDecision, type RefreshResult, type SourceRoot, type TaskState } from '../../shared/localCoding';
import type { ChatEvent, ChatMessage, Conversation, ProviderConnection } from '../../shared/types';
import type { CredentialStore } from './credentials';
import type { ImageService } from './images';
import type { Storage } from './storage';
import { UserError, text } from './validation';
import { browseDirectory, captureFiles, previewSources, resolveRoots, takeSelection } from './localCodingFiles';
import { LocalCodingStore, VersionReader, ancestry, describeConflict, entryKey, newVersion, threeWay, type ProjectMeta } from './localCodingVersions';
import { ProposalInvalid, changedFiles, parseProposal, reviewFile, validateProposal } from './localCodingProposals';
import { ClaudeAgent } from './codingAgents/claude';
import { CodexAgent } from './codingAgents/codex';
import { AntigravityAgent } from './codingAgents/antigravity';
import type { RuntimeLocation } from './codingAgents/runtime';
import { engineRuntime } from './codingAgents/runtime';
import { EngineInstaller } from './codingAgents/install';
import { listModels as providerModels } from './models';
import type { AgentImage, CodingAgent } from './codingAgents/types';

const ENGINE_INSTRUCTIONS = `You are a read-only coding assistant inside Novi. You analyze one immutable virtual version of the user's project.
You cannot run commands, edit files, or see anything except through three tools that read only that version:
- list_files: list files (fileId, path, line count), optionally under a path prefix.
- search_files: find literal text; returns fileId, path:line and the line.
- read_file: read a file by fileId with numbered lines.
Investigate with the tools, then give your final answer as JSON matching the required schema. Never claim you ran, built or tested anything.

How to propose changes (they stay proposals; Novi never applies them to the user's files):
- edit: use a sourceFileId from the tools. Each edit has startLine (1-based line in THIS version), "before" (the exact original lines being replaced, copied from read_file without the line-number prefix) and "after" (the replacement lines). Every edit refers to the original text of this version, not to text changed by your other edits. Edits must not overlap or touch the same insertion point; combine them instead. Empty "before" inserts before startLine (use the line count + 1 to append). Empty "after" deletes the "before" lines. Read a file before editing it.
- create: destinationRootId is a source root id (such as r1), relativePath uses "/" between folders and must not exist yet; content is the complete file.
- delete: sourceFileId of an existing file.
- Never invent fileIds, paths or file contents you did not read. If you cannot tie advice to a file you read (for example from a screenshot alone), give it in summary/approach as an unverified suggestion with no changes.
- For explanations or when information is missing, return an empty changes list and use questions for what you need.
Fields: summary (one or two sentences), approach (how and why), evidence (files and lines you relied on), assumptions, questions, suggestedChecks (how the user can check it; you did not run them).`;

const TASK_TIMEOUT_MS = 30 * 60_000;
const IDLE_TIMEOUT_MS = 10 * 60_000;

interface Pending {
  id: string; projectId: string; snapshotId: string; carryVersionId: string;
  files: FileEntry[]; roots: SourceRoot[];
  conflicts: Array<{ key: string; local?: FileEntry; proposed?: FileEntry; base?: FileEntry }>;
}

export interface RunInput {
  conversation: Conversation;
  user: ChatMessage;
  assistant: ChatMessage;
  baseVersionId: string;
  reconcile?: { fromVersionId: string; fileIds: string[] };
  imageIds: string[];
  signal: AbortSignal;
  emit: (event: ChatEvent) => void;
  save: () => void;
}

export class LocalCodingService {
  readonly store: LocalCodingStore;
  private agents: Record<EngineId, CodingAgent>;
  private models = new Map<string, { at: number; models: EngineModel[] }>();
  private pending = new Map<string, Pending>();
  private activeTask: { projectId: string; versionId: string; taskId: string } | null = null;
  private installer: EngineInstaller;

  constructor(private deps: { storage: Storage; credentials: CredentialStore; images: ImageService; userData: string; location: RuntimeLocation; agents?: Partial<Record<EngineId, CodingAgent>> }) {
    deps.location = { ...deps.location, managedPath: join(deps.userData, 'coding-runtimes') };
    this.installer = new EngineInstaller(deps.location);
    this.store = new LocalCodingStore(join(deps.userData, 'local-coding'));
    const work = join(deps.userData, 'local-coding', '.engines');
    // Engine homes from a crash are private scratch space; start clean.
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true, mode: 0o700 });
    this.agents = {
      codex: deps.agents?.codex ?? new CodexAgent(deps.location, work),
      claude: deps.agents?.claude ?? new ClaudeAgent(deps.location, work),
      antigravity: deps.agents?.antigravity ?? new AntigravityAgent(deps.location, work),
    };
  }

  private owner() { return this.deps.storage.current().id; }

  // ── Connections and engines ────────────────────────────────────────────

  private eligible(engine: EngineId): ProviderConnection[] {
    const spec = ENGINES.find((item) => item.id === engine)!;
    const account = this.deps.storage.current();
    return account.settings.connections.filter((connection) => connection.enabled !== false && connection.provider === spec.provider
      && connection.baseUrl.replace(/\/+$/, '') === spec.officialBaseUrl && this.deps.credentials.has(account.id, connection));
  }

  private credential(engine: EngineId, connectionId: string) {
    const connection = this.eligible(engine).find((item) => item.id === connectionId);
    const spec = ENGINES.find((item) => item.id === engine)!;
    if (!connection) throw new UserError(`${spec.label} needs a saved ${spec.connectionLabel} connection using ${spec.officialBaseUrl}. Choose one in Local Coding setup, or add it in Settings › API Management.`);
    const apiKey = this.deps.credentials.get(this.owner(), connection);
    if (!apiKey) throw new UserError(`Add the API key for ${connection.name} in Settings.`);
    return { connection, apiKey };
  }

  async readiness(): Promise<EngineReadiness[]> {
    return Promise.all(ENGINES.map(async (spec) => {
      let problem: string | null = null;
      let installedVersion: string | null = null;
      try { installedVersion = (await engineRuntime(spec.id, this.deps.location)).version; } catch (error) { problem = error instanceof Error ? error.message : 'Not installed.'; }
      const connections = this.eligible(spec.id).map((item) => ({ id: item.id, name: item.name }));
      if (!problem && !connections.length) problem = `Needs a saved ${spec.connectionLabel} connection using ${spec.officialBaseUrl}. Add one in Settings › API Management.`;
      return { engine: spec.id, label: spec.label, available: !problem, installedVersion, problem, connections };
    }));
  }

  async checkEngineUpdate(engine: unknown) {
    if (!isEngineId(engine)) throw new UserError('Choose a coding agent.');
    return this.installer.check(engine);
  }

  async installEngine(engine: unknown) {
    if (!isEngineId(engine)) throw new UserError('Choose a coding agent.');
    await this.installer.install(engine);
    this.models.clear();
    return this.readiness();
  }

  async checkEngineLogin(engine: unknown, connectionId: unknown) {
    if (!isEngineId(engine)) throw new UserError('Choose a coding agent.');
    const { connection, apiKey } = this.credential(engine, text(connectionId, 'connection', 100));
    await engineRuntime(engine, this.deps.location);
    // Engine model catalogs can be local; validate the key against the provider, not that cache.
    const models = await providerModels(connection, apiKey);
    this.models.clear();
    return `API key accepted for ${connection.name} · ${models.length} models available. Novi uses this saved key automatically.`;
  }

  async listModels(engine: unknown, connectionId: unknown): Promise<EngineModel[]> {
    if (!isEngineId(engine)) throw new UserError('Choose Codex, Claude Code, or Antigravity.');
    const { connection, apiKey } = this.credential(engine, text(connectionId, 'connection', 100));
    const cacheKey = `${this.owner()}:${engine}:${connection.id}`;
    const cached = this.models.get(cacheKey);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.models;
    const models = await this.agents[engine].listModels({ apiKey }, AbortSignal.timeout(60_000));
    if (!models.length) throw new UserError(`${ENGINES.find((item) => item.id === engine)!.label} reported no models for this connection.`);
    this.models.set(cacheKey, { at: Date.now(), models });
    return models;
  }

  private async modelInfo(binding: LocalCodingBinding) {
    const models = await this.listModels(binding.engine, binding.connectionId);
    const model = models.find((item) => item.id === binding.model);
    if (!model) throw new UserError(`${binding.model} is not offered by ${ENGINES.find((item) => item.id === binding.engine)!.label} for this connection. Choose another model in the session bar.`);
    return model;
  }

  // ── Sources and sessions ──────────────────────────────────────────────

  browse(path: unknown) { return browseDirectory(path); }
  preview(input: { workingFolder: unknown; extra?: unknown }) { return previewSources(this.owner(), input); }

  /** Captures Local S0 for a confirmed selection and binds it to a new conversation. */
  async startSession(input: Record<string, unknown>, addConversation: (conversation: Conversation) => void): Promise<string> {
    if (!isEngineId(input.engine)) throw new UserError('Choose Codex, Claude Code, or Antigravity.');
    const owner = this.owner();
    const connectionId = text(input.connectionId, 'connection', 100), model = text(input.model, 'model', 200);
    this.credential(input.engine, connectionId);
    const roots = takeSelection(owner, input.selectionId);
    let meta = this.store.create(owner, { name: roots[0].displayName, roots, engine: input.engine, connectionId, model });
    try {
      const { files } = await captureFiles(roots, (bytes) => this.store.putContent(owner, meta.id, bytes));
      if (this.owner() !== owner) throw new UserError('Your account changed. Start Local Coding again.');
      const s0 = newVersion({ kind: 'local', label: 'Local S0', parentVersionId: null, roots, files });
      const conversationId = randomUUID();
      meta = this.store.publish({ ...meta, conversationId, selectedVersionId: s0.id, nextSnapshot: 1 }, s0);
      const now = Date.now();
      addConversation({ id: conversationId, title: `Local Coding · ${meta.name}`, createdAt: now, updatedAt: now, messages: [], localCoding: { projectId: meta.id, name: meta.name, engine: meta.engine, connectionId, model } });
      return conversationId;
    } catch (error) {
      this.store.remove(owner, meta.id);
      throw error;
    }
  }

  private load(projectId: unknown) { return this.store.load(this.owner(), projectId); }

  state(projectId: unknown): ProjectState {
    const meta = this.load(projectId);
    const connection = this.deps.storage.current().settings.connections.find((item) => item.id === meta.connectionId);
    const cached = this.models.get(`${meta.ownerId}:${meta.engine}:${meta.connectionId}`)?.models.find((model) => model.id === meta.model);
    return {
      projectId: meta.id, name: meta.name, roots: meta.roots, versions: meta.versions, selectedVersionId: meta.selectedVersionId,
      engine: meta.engine, connectionId: meta.connectionId, connectionName: connection?.name ?? 'Unavailable connection', model: meta.model,
      reasoningEffort: cached?.highestEffort ?? null,
      activeTaskId: this.activeTask?.projectId === meta.id ? this.activeTask.taskId : null,
      activeTaskVersionId: this.activeTask?.projectId === meta.id ? this.activeTask.versionId : null,
    };
  }

  /** Changing the selection only changes what the next request reads; it never starts one or edits history. */
  select(projectId: unknown, versionId: unknown): ProjectState {
    const meta = this.load(projectId);
    this.store.version(meta, versionId);
    this.store.save({ ...meta, selectedVersionId: versionId as string });
    return this.state(meta.id);
  }

  async updateEngine(projectId: unknown, input: Record<string, unknown>, conversations: Conversation[]): Promise<ProjectState> {
    if (!isEngineId(input.engine)) throw new UserError('Choose Codex, Claude Code, or Antigravity.');
    const meta = this.load(projectId);
    const connectionId = text(input.connectionId, 'connection', 100), model = text(input.model, 'model', 200);
    this.credential(input.engine, connectionId);
    const next = { ...meta, engine: input.engine, connectionId, model };
    await this.modelInfo({ projectId: meta.id, name: meta.name, engine: input.engine, connectionId, model });
    this.store.save(next);
    const conversation = conversations.find((item) => item.localCoding?.projectId === meta.id);
    if (conversation) conversation.localCoding = { projectId: meta.id, name: meta.name, engine: input.engine, connectionId, model };
    return this.state(meta.id);
  }

  changes(projectId: unknown, fromVersionId: unknown, toVersionId: unknown) {
    const meta = this.load(projectId);
    const from = this.store.version(meta, fromVersionId), to = this.store.version(meta, toVersionId);
    const roots = [...to.roots, ...from.roots];
    return changedFiles(from, to).map((item) => ({ fileId: item.fileId, operation: item.operation, relativePath: item.relativePath, rootName: roots.find((root) => root.id === item.rootId)?.displayName ?? item.rootId }));
  }

  review(projectId: unknown, fromVersionId: unknown, toVersionId: unknown, fileId: unknown) {
    const meta = this.load(projectId);
    const to = this.store.version(meta, toVersionId);
    const from = fromVersionId === null ? null : this.store.version(meta, fromVersionId);
    return reviewFile(this.store, meta, from, to, text(fileId, 'file', 40));
  }

  /** Everything the detached viewer needs to offer both comparisons for a file. */
  reviewTarget(projectId: unknown, fromVersionId: unknown, toVersionId: unknown, fileId: unknown) {
    const meta = this.load(projectId);
    const to = meta.versions.find((version) => version.id === toVersionId);
    if (!to) throw new UserError('This version is not part of the project.');
    return {
      projectId: meta.id, fromVersionId: fromVersionId === null ? null : String(fromVersionId), toVersionId: to.id, fileId: text(fileId, 'file', 40),
      parentVersionId: to.parentVersionId, localSnapshotId: to.kind === 'local' ? null : to.localSnapshotId,
      labels: Object.fromEntries(meta.versions.map((version) => [version.id, version.label])),
    };
  }

  // ── Refresh ───────────────────────────────────────────────────────────

  /** Captures the current disk files as a new Local snapshot; optionally carries a selected iteration forward. */
  async refresh(projectId: unknown, carryVersionId: unknown, addPaths: unknown = []): Promise<RefreshResult> {
    if (this.activeTask) throw new UserError('Wait for the current Local Coding task to finish, or stop it.');
    let meta = this.load(projectId);
    const owner = meta.ownerId;
    const carry = carryVersionId === null || carryVersionId === undefined ? null : this.store.version(meta, carryVersionId);
    if (!Array.isArray(addPaths)) throw new UserError('Choose files or folders to add.');
    // The same roots, revalidated, plus any added ones: a moved or deleted folder is reported, history stays readable.
    const roots = await resolveRoots({ workingFolder: meta.roots[0].canonicalLocalPath, extra: [...meta.roots.slice(1).map((root) => root.canonicalLocalPath), ...addPaths] });
    if (meta.roots.some((root, index) => root.canonicalLocalPath !== roots[index].canonicalLocalPath)) throw new UserError('A source folder moved. Start a new Local Coding session for its new location.');
    // Existing roots keep their ids and names; added roots continue the numbering.
    const merged = roots.map((root, index) => meta.roots[index] ?? root);
    const { files } = await captureFiles(merged, (bytes) => this.store.putContent(owner, meta.id, bytes));
    meta = this.load(projectId);
    const previous = meta.versions.filter((version) => version.kind === 'local').at(-1)!;
    const snapshot = newVersion({ kind: 'local', label: `Local S${meta.nextSnapshot}`, parentVersionId: previous.id, roots: merged, files });
    meta = this.store.publish({ ...meta, roots: merged, nextSnapshot: meta.nextSnapshot + 1, selectedVersionId: snapshot.id }, snapshot);
    if (!carry || carry.kind === 'local') return { snapshotVersionId: snapshot.id, resultVersionId: null, pendingId: null, conflicts: [] };
    const base = this.store.version(meta, carry.localSnapshotId);
    const combined = threeWay({ base: base.files, local: snapshot.files, proposed: carry.files });
    const pending: Pending = { id: randomUUID(), projectId: meta.id, snapshotId: snapshot.id, carryVersionId: carry.id, files: combined.files, roots: merged, conflicts: combined.conflicts };
    if (!combined.conflicts.length) return { ...this.publishRefresh(pending), pendingId: null, conflicts: [] };
    this.pending.set(pending.id, pending);
    return { snapshotVersionId: snapshot.id, resultVersionId: null, pendingId: pending.id, conflicts: combined.conflicts.map((conflict) => describeConflict(merged, conflict)) };
  }

  private publishRefresh(pending: Pending, decided: FileEntry[] = []): RefreshResult {
    let meta = this.load(pending.projectId);
    const version = newVersion({ kind: 'refresh', label: `Iteration ${meta.nextIteration}`, parentVersionId: pending.carryVersionId, localSnapshotId: pending.snapshotId, roots: pending.roots, files: [...pending.files, ...decided] });
    meta = this.store.publish({ ...meta, nextIteration: meta.nextIteration + 1, selectedVersionId: version.id }, version);
    this.pending.delete(pending.id);
    return { snapshotVersionId: pending.snapshotId, resultVersionId: version.id, pendingId: null, conflicts: [] };
  }

  /** Every conflict needs an explicit choice; choices only change virtual contents. */
  resolve(projectId: unknown, pendingId: unknown, decisions: unknown): RefreshResult {
    const pending = typeof pendingId === 'string' ? this.pending.get(pendingId) : undefined;
    const meta = this.load(projectId);
    if (!pending || pending.projectId !== meta.id) throw new UserError('This refresh is no longer pending. Refresh the local files again.');
    if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) throw new UserError('Choose how to resolve each conflict.');
    const choices = decisions as Record<string, unknown>;
    const decided: FileEntry[] = [];
    for (const conflict of pending.conflicts) {
      const fileId = (conflict.local ?? conflict.proposed ?? conflict.base)!.fileId;
      const choice = choices[fileId] as RefreshDecision | undefined;
      if (choice !== 'keep-local' && choice !== 'keep-proposed') throw new UserError('Choose Keep local or Keep proposed for every conflicting file.');
      const entry = choice === 'keep-local' ? conflict.local : conflict.proposed;
      if (entry) decided.push(entry);
    }
    // Two choices can produce two files whose names differ only by case; refuse rather than guess.
    const keys = new Set(pending.files.map((entry) => entryKey(entry).toLowerCase()));
    for (const entry of decided) { const key = entryKey(entry).toLowerCase(); if (keys.has(key)) throw new UserError(`${entry.relativePath} would exist twice. Choose the other option for one of them.`); keys.add(key); }
    return this.publishRefresh(pending, decided);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────

  get busy() { return this.activeTask !== null; }

  /** Builds this branch's conversation context: requests and answers that led to the selected version only. */
  private branchContext(meta: ProjectMeta, conversation: Conversation, baseVersionId: string, excludeId: string): string {
    const chain = new Set(ancestry(meta, baseVersionId).map((version) => version.id));
    const label = new Map(meta.versions.map((version) => [version.id, version.label]));
    const turns: string[] = [];
    const messages = conversation.messages;
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      if (message.role !== 'assistant' || !message.localCoding || message.id === excludeId) continue;
      const result = message.localCoding;
      if (result.state !== 'complete' && result.state !== 'needs-information') continue;
      // On this branch: it produced a version in the chain, or answered without changes while based on one.
      const onBranch = result.resultingVersionId ? chain.has(result.resultingVersionId) : chain.has(result.baseVersionId);
      if (!onBranch) continue;
      const question = messages.slice(0, index).reverse().find((item) => item.role === 'user')?.content ?? '';
      turns.push(`[${label.get(result.baseVersionId) ?? 'earlier version'}${result.resultingLabel ? ` → ${result.resultingLabel}` : ''}]\nUser: ${question.slice(0, 2000)}\nAnswer: ${message.content.slice(0, 3000)}`);
    }
    const kept = turns.slice(-LOCAL_CODING_LIMITS.maxContextMessages);
    const omitted = turns.length - kept.length;
    return kept.length ? `${omitted ? `(${omitted} earlier exchanges on this branch omitted.)\n` : ''}${kept.join('\n\n')}` : '';
  }

  /** Runs one task. Failures are recorded on the assistant message; only a request that cannot start throws. */
  async run(input: RunInput): Promise<void> {
    const { conversation, user, assistant, signal, emit, save } = input;
    const binding = conversation.localCoding;
    if (!binding) throw new UserError('This conversation is not a Local Coding session.');
    if (this.activeTask) throw new UserError('Another Local Coding task is running. Stop it first.');
    const meta = this.load(binding.projectId);
    const base = this.store.version(meta, input.baseVersionId);
    const taskId = randomUUID();
    const result: LocalCodingMessage = {
      taskId, projectId: meta.id, baseVersionId: base.id, baseLabel: base.label, state: 'preparing', engine: binding.engine, model: binding.model,
      reasoningEffort: null, proposalId: null, resultingVersionId: null, resultingLabel: null, changes: [], progress: 'Preparing',
    };
    user.localCodingRequest = { taskId, projectId: meta.id, baseVersionId: base.id, baseLabel: base.label };
    assistant.localCoding = result;
    assistant.providerName = ENGINES.find((item) => item.id === binding.engine)!.label;
    assistant.model = binding.model;
    let lastEmit = 0;
    const update = (state: TaskState, progress?: string, force = false) => {
      result.state = state;
      if (progress) result.progress = progress;
      const now = Date.now();
      if (!force && now - lastEmit < 250) return;
      lastEmit = now;
      emit({ type: 'progress', conversationId: conversation.id, messageId: assistant.id, localCoding: { ...result, changes: [...result.changes] } });
    };
    this.activeTask = { projectId: meta.id, versionId: base.id, taskId };
    const controller = new AbortController();
    const relay = () => controller.abort();
    signal.addEventListener('abort', relay, { once: true });
    const deadline = setTimeout(() => controller.abort(new Error('timeout')), TASK_TIMEOUT_MS);
    let idle = setTimeout(() => controller.abort(new Error('idle')), IDLE_TIMEOUT_MS);
    const touch = () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(new Error('idle')), IDLE_TIMEOUT_MS); };
    try {
      update('preparing', 'Preparing', true);
      const { apiKey } = this.credential(binding.engine, binding.connectionId);
      const model = await this.modelInfo(binding);
      result.reasoningEffort = model.highestEffort;
      const images: AgentImage[] = input.imageIds.map((id) => {
        const image = this.deps.images.resolve(id);
        if (!image.mimeType.startsWith('image/')) throw new UserError('Local Coding accepts images and text. Use speech to text for audio.');
        const dataUrl = this.deps.images.dataUrl(id);
        return { mimeType: image.mimeType, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
      });
      if (images.length && !model.images) throw new UserError(`${model.name} does not accept images. Remove the screenshot or choose a model that accepts images.`);
      const reader = new VersionReader(this.store, meta, base);
      const history = this.branchContext(meta, conversation, base.id, assistant.id);
      // Reconciliation is the one case where another version is shown, and it is labelled as comparison only.
      let comparison = '';
      if (input.reconcile) {
        const other = this.store.version(meta, input.reconcile.fromVersionId);
        const parts: string[] = [];
        let size = 0;
        for (const fileId of input.reconcile.fileIds) {
          const entry = other.files.find((item) => item.fileId === fileId);
          const current = base.files.find((item) => item.fileId === fileId);
          const body = entry ? this.store.text(meta.ownerId, meta.id, entry) : null;
          const part = `--- ${current?.relativePath ?? entry?.relativePath ?? fileId} (fileId ${fileId}) as proposed in ${other.label}${body === null ? ': deleted in that proposal' : `:\n${body}`}`;
          size += part.length;
          if (size > 200_000) throw new UserError('These files are too large to reconcile automatically. Choose Keep local or Keep proposed for some of them.');
          parts.push(part);
        }
        comparison = `Comparison context (NOT part of ${base.label}; for reconciling only). ${base.label} holds the latest local files; bring the intent of these ${other.label} changes into them:\n${parts.join('\n\n')}`;
      }
      const pinned = conversation.pinnedContext ? `Pinned constraints from the user (follow them):\n${conversation.pinnedContext}` : '';
      const session = conversation.context?.instructions ? `Session instructions:\n${conversation.context.instructions.slice(0, 6000)}` : '';
      const prompt = [
        `${reader.overview()}\nAll tool calls read ${base.label}.`,
        history && `Earlier on this branch:\n${history}`,
        comparison, pinned, session,
        images.length ? `${images.length} screenshot${images.length === 1 ? ' is' : 's are'} attached.` : '',
        `Request:\n${user.content}`,
      ].filter(Boolean).join('\n\n');
      const agent = this.agents[binding.engine];
      let denied = 0;
      const attempt = (promptText: string) => agent.run({
        model: binding.model, effort: model.highestEffort, instructions: ENGINE_INSTRUCTIONS, prompt: promptText, images,
        schema: PROPOSAL_SCHEMA as unknown as Record<string, unknown>,
        tools: { list: (args) => reader.list(args), search: (args) => reader.search(args), read: (args) => reader.read(args) },
        signal: controller.signal,
        onProgress: (state, detail) => { touch(); update(state, detail || (state === 'reading' ? 'Reading files' : 'Analyzing')); },
        onDenied: () => { touch(); denied++; result.deniedRequests = denied; },
      }, { apiKey });
      update('analyzing', 'Analyzing', true);
      let raw = await attempt(prompt);
      update('validating', 'Validating the proposal', true);
      let parsed, validated, repaired = false;
      try {
        parsed = parseProposal(raw);
        validated = validateProposal(this.store, meta, base, parsed);
      } catch (error) {
        if (!(error instanceof ProposalInvalid) || controller.signal.aborted) throw error;
        // One bounded repair, against the same base version.
        repaired = true;
        update('analyzing', 'Correcting the proposal', true);
        const previous = typeof raw === 'string' ? raw : JSON.stringify(raw);
        raw = await attempt(`${prompt}\n\nYour previous answer for this request failed Novi's validation against ${base.label}:\n${error.issues.slice(0, 40).map((issue) => `- ${issue}`).join('\n')}\nRead the files again if needed and return a corrected, complete answer.\nPrevious answer (for reference):\n${previous.slice(0, 60_000)}`);
        update('validating', 'Validating the corrected proposal', true);
        parsed = parseProposal(raw);
        validated = validateProposal(this.store, meta, base, parsed);
      }
      const proposalId = randomUUID();
      let current = this.load(meta.id);
      const changes: ChangeSummary[] = validated.changes;
      let resulting: ProjectVersion | null = null;
      if (changes.length) {
        resulting = newVersion({ kind: 'proposal', label: `Iteration ${current.nextIteration}`, parentVersionId: base.id, localSnapshotId: base.localSnapshotId, requestMessageId: user.id, proposalId, roots: base.roots, files: validated.files });
      }
      const proposal: Proposal = {
        id: proposalId, baseVersionId: base.id, resultingVersionId: resulting?.id ?? null, summary: parsed.summary, approach: parsed.approach,
        evidence: parsed.evidence, assumptions: parsed.assumptions, questions: parsed.questions, suggestedChecks: parsed.suggestedChecks,
        changes, engine: binding.engine, model: binding.model, reasoningEffort: model.highestEffort, createdAt: Date.now(), validation: 'verified', execution: 'not-run', repaired,
      };
      if (resulting) {
        // Artifacts first, then the history reference; select it only if the user is still on the base version.
        const stillOnBase = current.selectedVersionId === base.id;
        current = this.store.publish({ ...current, nextIteration: current.nextIteration + 1, ...(stillOnBase ? { selectedVersionId: resulting.id } : {}) }, resulting, proposal);
      } else this.store.saveProposal(meta.ownerId, meta.id, proposal);
      result.proposalId = proposalId;
      result.resultingVersionId = resulting?.id ?? null;
      result.resultingLabel = resulting?.label ?? null;
      result.changes = changes;
      result.progress = undefined;
      assistant.content = describe(proposal, base.label, resulting?.label ?? null, denied);
      update(parsed.questions.length && !changes.length ? 'needs-information' : 'complete', undefined, true);
      save();
    } catch (error) {
      const reason = controller.signal.reason;
      if (signal.aborted) { result.state = 'cancelled'; result.progress = undefined; assistant.content ||= 'Stopped. Earlier iterations are unchanged.'; assistant.status = 'stopped'; }
      else {
        result.state = 'failed'; result.progress = undefined;
        assistant.status = 'error';
        assistant.error = reason instanceof Error && reason.message === 'idle' ? 'The engine stopped responding. Earlier iterations are unchanged; try again.'
          : reason instanceof Error && reason.message === 'timeout' ? 'This task took longer than 30 minutes and was stopped. Try a narrower request.'
          : error instanceof ProposalInvalid ? `The engine's answer could not be verified, so no iteration was created.\n${error.issues.slice(0, 8).map((issue) => `• ${issue}`).join('\n')}`
          : error instanceof UserError ? error.message
          : error instanceof Error && /^(Codex|Claude|The Codex|The Claude|Antigravity|The Antigravity)/.test(error.message) ? error.message
          : 'The engine could not complete this request. Earlier iterations are unchanged; try again.';
      }
      emit({ type: 'progress', conversationId: conversation.id, messageId: assistant.id, localCoding: { ...result } });
    } finally {
      clearTimeout(deadline); clearTimeout(idle);
      signal.removeEventListener('abort', relay);
      this.activeTask = null;
    }
  }

  /** Removes a conversation's project data. Never touches the source folders. */
  removeForConversation(conversation: Conversation) {
    if (!conversation.localCoding) return;
    try { this.store.remove(this.owner(), conversation.localCoding.projectId); } catch { /* already gone */ }
  }

  cleanup() {
    const owner = this.owner();
    for (const projectId of this.store.list(owner)) {
      try { this.store.cleanup(this.store.load(owner, projectId)); } catch { /* left for the next cleanup */ }
    }
  }
}

function describe(proposal: Proposal, baseLabel: string, resultLabel: string | null, denied: number): string {
  const list = (title: string, items: string[]) => items.length ? `\n\n**${title}**\n${items.map((item) => `- ${item}`).join('\n')}` : '';
  const header = resultLabel ? `**${resultLabel}** · based on ${baseLabel}` : `Answer about ${baseLabel} · no code changes`;
  return `${header}\n\n${proposal.summary}${proposal.approach ? `\n\n**Approach**\n${proposal.approach}` : ''}`
    + list('Evidence', proposal.evidence) + list('Assumptions', proposal.assumptions) + list('Questions', proposal.questions) + list('Suggested checks', proposal.suggestedChecks)
    + `\n\n_Source references verified · Proposed behavior not executed${proposal.repaired ? ' · corrected once after validation' : ''}${denied ? ` · ${denied} engine request${denied === 1 ? '' : 's'} outside read-only access denied` : ''}._`;
}

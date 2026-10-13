import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { require as tsxRequire } from 'tsx/cjs/api';
import type { ChatEvent, Conversation } from '../src/shared/types';
import type { AgentTask, CodingAgent } from '../src/main/services/codingAgents/types';

const { Storage } = tsxRequire('../src/main/services/storage.ts', import.meta.url);
const { LocalAuthService } = tsxRequire('../src/main/services/auth.ts', import.meta.url);
const { ChatService } = tsxRequire('../src/main/services/chat.ts', import.meta.url);
const { LocalCodingService } = tsxRequire('../src/main/services/localCoding.ts', import.meta.url);

// A scripted engine: each run reads through the pinned tools, records what it saw, and returns the next answer.
class FakeAgent implements CodingAgent {
  readonly id = 'codex' as const;
  runs: Array<{ prompt: string; listing: string; effort: string | null; images: number }> = [];
  answers: Array<(task: AgentTask) => unknown | Promise<unknown>> = [];
  async run(task: AgentTask) {
    const listing = task.tools.list({});
    this.runs.push({ prompt: task.prompt, listing, effort: task.effort, images: task.images.length });
    task.onProgress('reading', 'Listing files');
    const next = this.answers.shift();
    if (!next) throw new Error('no scripted answer');
    return next(task);
  }
  async listModels() { return [{ id: 'gpt-test', name: 'GPT test', efforts: ['low', 'high', 'xhigh'], highestEffort: 'xhigh', images: true }]; }
}

const answer = (changes: unknown[], extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, summary: 'Summary.', approach: 'Approach.', evidence: [], assumptions: [], questions: [], changes, suggestedChecks: ['Try it.'], ...extra });
const fileId = (listing: string, path: string) => listing.split('\n').find((line) => line.includes(`/${path}\t`))!.split('\t')[0];

async function setup(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'novi-lc-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'shop'); mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src/cart.js'), 'export function total(items) {\n  return items.length;\n}\n');
  writeFileSync(join(project, 'README.md'), '# Shop\n');
  const storage = new Storage(join(root, 'app'));
  await new LocalAuthService(storage).signUp('Tester', 'lc@example.com', 'test-password');
  const user = storage.current();
  user.settings.connections = [
    { id: 'openai', name: 'OpenAI work', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt', stream: true },
    { id: 'proxy', name: 'Proxy', provider: 'openai', baseUrl: 'https://proxy.example.com/v1', model: 'gpt', stream: true },
  ];
  user.settings.activeConnectionId = 'openai'; user.settings.onboardingComplete = true;
  storage.save();
  const credentials = { has: () => true, get: () => 'sk-secret-test' };
  const images = { resolve: (id: string) => ({ id, name: 'shot.png', mimeType: id.startsWith('audio') ? 'audio/webm' : 'image/png' }), dataUrl: () => 'data:image/png;base64,AAAA', commit() {} };
  const agent = new FakeAgent();
  const service = new LocalCodingService({ storage, credentials, images, userData: storage.directory, location: { packaged: false, resourcesPath: '' }, agents: { codex: agent, claude: agent } });
  const chat = new ChatService(storage, credentials, images, undefined, service);
  const preview = await service.preview({ workingFolder: project });
  const conversationId = await service.startSession({ selectionId: preview.selectionId, engine: 'codex', connectionId: 'openai', model: 'gpt-test' }, (conversation: Conversation) => { storage.conversations.push(conversation); storage.save(); });
  const conversation = () => storage.conversations.find((item: Conversation) => item.id === conversationId)!;
  const projectId = conversation().localCoding!.projectId;
  const events: ChatEvent[] = [];
  const send = (content: string, baseVersionId: string, extra: Record<string, unknown> = {}) => chat.send({ appMode: 'local-coding', conversationId, content, imageIds: [], localCoding: { baseVersionId }, ...extra }, (event: ChatEvent) => events.push(event));
  return { root, project, storage, service, chat, agent, conversation, projectId, send, events };
}

test('a request becomes a pinned, validated iteration; explanation-only answers do not', async (t) => {
  const env = await setup(t);
  let state = env.service.state(env.projectId);
  assert.deepEqual(state.versions.map((version: { label: string }) => version.label), ['Local S0']);
  const s0 = state.selectedVersionId;
  env.agent.answers.push(({ tools }) => answer([{ operation: 'edit', sourceFileId: fileId(tools.list({}), 'src/cart.js'), reason: 'Sum prices', edits: [{ startLine: 2, before: ['  return items.length;'], after: ['  return items.reduce((sum, item) => sum + item.price, 0);'] }] }]));
  await env.send('Make total sum prices.', s0);
  const assistant = env.conversation().messages.at(-1)!;
  assert.equal(assistant.status, 'complete');
  assert.equal(assistant.localCoding?.state, 'complete');
  assert.equal(assistant.localCoding?.resultingLabel, 'Iteration 1');
  assert.equal(assistant.localCoding?.reasoningEffort, 'xhigh', 'the highest listed effort is used and recorded');
  assert.equal(env.agent.runs[0].effort, 'xhigh');
  assert.match(assistant.content, /Iteration 1\*\* · based on Local S0/);
  assert.match(assistant.content, /Proposed behavior not executed/);
  assert.equal(env.conversation().messages.at(-2)!.localCodingRequest?.baseLabel, 'Local S0');
  assert.deepEqual(env.events.map((event) => event.type).filter((type, index, all) => all.indexOf(type) === index), ['started', 'progress', 'finished']);
  assert(env.events.filter((event) => event.type === 'progress').every((event) => event.type === 'progress' && event.messageId === assistant.id));
  state = env.service.state(env.projectId);
  const it1 = state.versions[1].id;
  assert.equal(state.selectedVersionId, it1, 'the new iteration is selected when the user stayed on its base');
  assert.equal(readFileSync(join(env.project, 'src/cart.js'), 'utf8'), 'export function total(items) {\n  return items.length;\n}\n', 'the real project is untouched');
  // An explanation answers about the selected version and creates no iteration.
  env.agent.answers.push(() => answer([], { summary: 'It sums prices.' }));
  await env.send('Explain total.', it1);
  assert.equal(env.service.state(env.projectId).versions.length, 2);
  assert.equal(env.conversation().messages.at(-1)!.localCoding?.resultingVersionId, null);
  assert.match(env.agent.runs[1].listing, /Iteration 1/);
  // Questions without changes are a needs-information result.
  env.agent.answers.push(() => answer([], { questions: ['Which currency?'] }));
  await env.send('Add tax.', it1);
  assert.equal(env.conversation().messages.at(-1)!.localCoding?.state, 'needs-information');
});

test('branches: a request from Iteration 1 does not see Iteration 2, and labels never repeat', async (t) => {
  const env = await setup(t);
  const s0 = env.service.state(env.projectId).selectedVersionId;
  const create = (path: string, content: string) => () => answer([{ operation: 'create', destinationRootId: 'r1', relativePath: path, reason: 'r', content }]);
  env.agent.answers.push(create('src/a.js', 'A\n'));
  await env.send('Add A.', s0);
  const it1 = env.service.state(env.projectId).selectedVersionId;
  env.agent.answers.push(create('src/b.js', 'B\n'));
  await env.send('Add B on top.', it1);
  const it2 = env.service.state(env.projectId).selectedVersionId;
  assert.match(env.agent.runs[1].listing, /src\/a\.js/);
  env.agent.answers.push(create('src/c.js', 'C\n'));
  await env.send('Different approach: add C instead.', it1);
  const state = env.service.state(env.projectId);
  const it3 = state.versions.find((version: { label: string }) => version.label === 'Iteration 3');
  assert.equal(it3.parentVersionId, it1, 'Iteration 3 branches from Iteration 1');
  assert.doesNotMatch(env.agent.runs[2].listing, /src\/b\.js/, 'the branch does not inherit Iteration 2');
  // Branch context: the Iteration 2 exchange is not presented as part of Iteration 1's history.
  assert.match(env.agent.runs[2].prompt, /Add A\./);
  assert.doesNotMatch(env.agent.runs[2].prompt, /Add B on top/);
  assert.notEqual(it2, it3.id);
});

test('one bounded repair; a second invalid answer creates nothing and explains why', async (t) => {
  const env = await setup(t);
  const s0 = env.service.state(env.projectId).selectedVersionId;
  env.agent.answers.push(({ tools }) => answer([{ operation: 'edit', sourceFileId: fileId(tools.list({}), 'src/cart.js'), reason: 'r', edits: [{ startLine: 2, before: ['wrong text'], after: ['x'] }] }]));
  env.agent.answers.push(({ tools }) => answer([{ operation: 'edit', sourceFileId: fileId(tools.list({}), 'src/cart.js'), reason: 'r', edits: [{ startLine: 2, before: ['  return items.length;'], after: ['  return 0;'] }] }]));
  await env.send('Return zero.', s0);
  assert.match(env.agent.runs[1].prompt, /failed Novi's validation against Local S0/);
  assert.match(env.agent.runs[1].prompt, /line 2 is "  return items.length;", not "wrong text"/);
  assert.equal(env.conversation().messages.at(-1)!.localCoding?.resultingLabel, 'Iteration 1');
  assert.match(env.conversation().messages.at(-1)!.content, /corrected once after validation/);
  env.agent.answers.push(() => 'not json');
  env.agent.answers.push(() => '{"also": "bad"}');
  await env.send('Break it.', s0);
  const failed = env.conversation().messages.at(-1)!;
  assert.equal(failed.status, 'error');
  assert.equal(failed.localCoding?.state, 'failed');
  assert.match(failed.error!, /could not be verified, so no iteration was created/);
  assert.equal(env.service.state(env.projectId).versions.length, 2, 'no iteration from an invalid answer');
});

test('cancel, engine failure, audio attachments and wrong connections end cleanly', async (t) => {
  const env = await setup(t);
  const s0 = env.service.state(env.projectId).selectedVersionId;
  env.agent.answers.push((task) => new Promise((_resolve, reject) => task.signal.addEventListener('abort', () => reject(new Error('Cancelled.')))));
  const running = env.send('Long task.', s0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(env.service.state(env.projectId).activeTaskVersionId, s0);
  env.chat.stop();
  await running;
  const stopped = env.conversation().messages.at(-1)!;
  assert.deepEqual([stopped.status, stopped.localCoding?.state], ['stopped', 'cancelled']);
  assert.equal(env.service.state(env.projectId).activeTaskId, null, 'never stuck busy');
  env.agent.answers.push(() => { throw new Error('Codex: network down'); });
  await env.send('Try.', s0);
  assert.match(env.conversation().messages.at(-1)!.error!, /Codex: network down/);
  await env.chat.send({ appMode: 'local-coding', conversationId: env.conversation().id, content: 'Listen to this', imageIds: ['audio-1'], localCoding: { baseVersionId: s0 } }, () => {});
  assert.match(env.conversation().messages.at(-1)!.error!, /images and text/);
  await assert.rejects(env.service.updateEngine(env.projectId, { engine: 'codex', connectionId: 'proxy', model: 'gpt-test' }, env.storage.conversations), /official|api\.openai\.com/);
  await assert.rejects(env.chat.send({ appMode: 'normal', conversationId: env.conversation().id, content: 'hi', imageIds: [] }, () => {}), /Local Coding conversation/);
  assert.equal(env.service.state(env.projectId).versions.length, 1);
});

test('refresh: snapshot, carry forward, conflicts resolved virtually, AI reconcile context', async (t) => {
  const env = await setup(t);
  const s0 = env.service.state(env.projectId).selectedVersionId;
  env.agent.answers.push(({ tools }) => answer([
    { operation: 'edit', sourceFileId: fileId(tools.list({}), 'src/cart.js'), reason: 'r', edits: [{ startLine: 2, before: ['  return items.length;'], after: ['  return 42;'] }] },
    { operation: 'create', destinationRootId: 'r1', relativePath: 'src/new.js', reason: 'r', content: 'new\n' },
  ]));
  await env.send('Change.', s0);
  const it1 = env.service.state(env.projectId).selectedVersionId;
  // Unchanged local files: the iteration carries forward cleanly onto S1.
  let refreshed = await env.service.refresh(env.projectId, it1);
  assert.equal(refreshed.conflicts.length, 0);
  let state = env.service.state(env.projectId);
  assert.deepEqual(state.versions.map((version: { label: string }) => version.label), ['Local S0', 'Iteration 1', 'Local S1', 'Iteration 2']);
  const it2 = state.versions.find((version: { label: string }) => version.label === 'Iteration 2');
  assert.equal(it2.kind, 'refresh');
  assert.equal(it2.parentVersionId, it1);
  assert.equal(it2.localSnapshotId, state.versions[2].id);
  // Now the user edits the same file differently on disk: a conflict.
  writeFileSync(join(env.project, 'src/cart.js'), 'export function total(items) {\n  return -1;\n}\n');
  writeFileSync(join(env.project, 'README.md'), '# Shop v2\n');
  refreshed = await env.service.refresh(env.projectId, it2.id);
  assert.deepEqual(refreshed.conflicts.map((conflict: { relativePath: string }) => conflict.relativePath), ['src/cart.js']);
  assert(refreshed.pendingId);
  assert.throws(() => env.service.resolve(env.projectId, refreshed.pendingId, {}), /every conflicting file/);
  const conflictId = refreshed.conflicts[0].fileId;
  const resolved = env.service.resolve(env.projectId, refreshed.pendingId, { [conflictId]: 'keep-local' });
  state = env.service.state(env.projectId);
  const combined = state.versions.find((version: { id: string }) => version.id === resolved.resultVersionId);
  assert.equal(combined.label, 'Iteration 3');
  // The combined version keeps the local cart, the local README, and the proposed new file.
  const review = (path: string) => { const id = (env.service.changes(env.projectId, state.versions[0].id, combined.id) as Array<{ fileId: string; relativePath: string }>).find((item) => item.relativePath === path)!.fileId; return env.service.review(env.projectId, null, combined.id, id).proposedText; };
  assert.equal(review('src/cart.js'), 'export function total(items) {\n  return -1;\n}\n');
  assert.equal(review('README.md'), '# Shop v2\n');
  assert.equal(review('src/new.js'), 'new\n');
  // Asking the AI to reconcile shows the proposed version only as labelled comparison context.
  env.agent.answers.push(() => answer([]));
  await env.send('Reconcile.', combined.id, { localCoding: { baseVersionId: combined.id, reconcile: { fromVersionId: it2.id, fileIds: [conflictId] } } });
  assert.match(env.agent.runs.at(-1)!.prompt, /Comparison context \(NOT part of Iteration 3/);
  assert.match(env.agent.runs.at(-1)!.prompt, /return 42;/);
  assert.equal(readFileSync(join(env.project, 'src/cart.js'), 'utf8'), 'export function total(items) {\n  return -1;\n}\n', 'resolution never writes the project');
});

test('adding a source mid-session is a new snapshot; deleting the conversation removes its history', async (t) => {
  const env = await setup(t);
  const docs = join(env.root, 'docs'); mkdirSync(docs); writeFileSync(join(docs, 'spec.md'), 'Spec\n');
  const result = await env.service.refresh(env.projectId, null, [docs]);
  const state = env.service.state(env.projectId);
  assert.equal(state.roots.length, 2);
  assert.deepEqual(state.roots.map((root: { id: string }) => root.id), ['r1', 'r2']);
  assert.equal(state.selectedVersionId, result.snapshotVersionId);
  const dir = env.service.store.dir(env.storage.current().id, env.projectId);
  assert(existsSync(dir));
  env.service.removeForConversation(env.conversation());
  assert(!existsSync(dir));
  assert(existsSync(join(env.project, 'src/cart.js')), 'source folders are never removed');
});

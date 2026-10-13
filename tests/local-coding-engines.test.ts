import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureFiles, resolveRoots } from '../src/main/services/localCodingFiles';
import { LocalCodingStore, VersionReader, newVersion } from '../src/main/services/localCodingVersions';
import { parseProposal, validateProposal } from '../src/main/services/localCodingProposals';
import { CodexAgent, codexConfig } from '../src/main/services/codingAgents/codex';
import { ClaudeAgent } from '../src/main/services/codingAgents/claude';
import { engineRuntime } from '../src/main/services/codingAgents/runtime';
import type { AgentTask, CodingAgent } from '../src/main/services/codingAgents/types';
import { PROPOSAL_SCHEMA } from '../src/shared/localCoding';
import { fakeAnthropic, fakeOpenAI, type Script } from './support/fakeProviders';

// Drives the real bundled Codex and Claude runtimes against local fake providers. Proves: tool exposure is only
// Novi's read tools, write/shell attempts fail, the project is untouched, keys stay out of prompts.

const location = { packaged: false, resourcesPath: '' };
const KEY = 'sk-novi-test-key-1234567890';

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name), stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else out[full] = `${createHash('sha256').update(readFileSync(full)).digest('hex')}:${stat.mtimeMs}:${stat.mode}`;
    }
  };
  walk(dir);
  return out;
}

async function setup(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'novi-engines-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'interview-app');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src/Login.jsx'), 'export function Login() {\n  submitLogin(values);\n}\n');
  writeFileSync(join(project, 'README.md'), '# App\n');
  writeFileSync(join(root, 'outside-secret.txt'), 'OUTSIDE_SECRET');
  const store = new LocalCodingStore(join(root, 'data'));
  const roots = await resolveRoots({ workingFolder: project });
  let meta = store.create('acct', { name: 'interview-app', roots, engine: 'codex', connectionId: 'c', model: 'm' });
  const { files } = await captureFiles(roots, (bytes) => store.putContent('acct', meta.id, bytes));
  const s0 = newVersion({ kind: 'local', label: 'Local S0', parentVersionId: null, roots, files });
  meta = store.publish({ ...meta, selectedVersionId: s0.id }, s0);
  const login = s0.files.find((entry) => entry.relativePath === 'src/Login.jsx')!;
  const work = join(root, 'engine-work'); mkdirSync(work);
  return { root, project, store, meta, s0, login, work, before: snapshot(project) };
}

function task(reader: VersionReader, overrides: Partial<AgentTask> = {}) {
  const progress: string[] = [], denied: string[] = [];
  const value: AgentTask = {
    model: 'test-model', effort: 'high', instructions: 'NOVI_INSTRUCTIONS', prompt: 'Add validation before submitLogin.', images: [],
    schema: PROPOSAL_SCHEMA as unknown as Record<string, unknown>,
    tools: { list: (args) => reader.list(args), search: (args) => reader.search(args), read: (args) => reader.read(args) },
    signal: new AbortController().signal, onProgress: (state, detail) => progress.push(`${state}:${detail ?? ''}`), onDenied: (what) => denied.push(what),
    ...overrides,
  };
  return { value, progress, denied };
}

const proposal = (fileId: string) => ({
  schemaVersion: 1, summary: 'Validate first.', approach: 'Guard the submit.', evidence: ['src/Login.jsx:2'], assumptions: [], questions: [],
  changes: [{ operation: 'edit', sourceFileId: fileId, reason: 'Guard', edits: [{ startLine: 2, before: ['  submitLogin(values);'], after: ['  if (!values) return;', '  submitLogin(values);'] }] }],
  suggestedChecks: ['Submit an empty form.'],
});

/** Reads, then attempts escapes, then answers. Tool names differ per engine. */
function script(names: { list: string; search: string; read: string }, attacks: Array<{ tool: string; args: Record<string, unknown> }>, fileIdFrom: () => string): Script {
  const plan = [
    { tool: names.list, args: {} },
    { tool: names.search, args: { query: 'submitLogin' } },
    { tool: names.read, args: { fileId: '__LOGIN__' } },
    ...attacks,
  ];
  return ({ toolResults }) => {
    const index = toolResults.length;
    if (index < plan.length) {
      const step = plan[index];
      return { tool: step.tool, args: JSON.parse(JSON.stringify(step.args).replace('__LOGIN__', fileIdFrom())) };
    }
    return { final: proposal(fileIdFrom()) };
  };
}

// CI sets NOVI_REQUIRE_ENGINES so a missing runtime fails instead of skipping the isolation checks.
async function available(engine: 'codex' | 'claude') {
  try { await engineRuntime(engine, location); return true; }
  catch (error) { if (process.env.NOVI_REQUIRE_ENGINES) throw error; return false; }
}

test('Codex: locked configuration, only Novi read tools, writes and shell are impossible', { timeout: 120_000 }, async (t) => {
  if (!await available('codex')) { t.skip('Codex runtime not installed'); return; }
  const env = await setup(t);
  const reader = new VersionReader(env.store, env.meta, env.s0);
  const attacks = [
    { tool: 'shell', args: { command: ['bash', '-lc', `echo pwned > ${join(env.project, 'README.md')}`] } },
    { tool: 'exec_command', args: { cmd: `cat ${join(env.root, 'outside-secret.txt')}` } },
    { tool: 'apply_patch', args: { input: `*** Begin Patch\n*** Add File: ${join(env.project, 'evil.txt')}\n+evil\n*** End Patch` } },
    { tool: 'read_file', args: { fileId: '../../outside-secret.txt' } },
  ];
  const provider = await fakeOpenAI(script({ list: 'list_files', search: 'search_files', read: 'read_file' }, attacks, () => env.login.fileId));
  t.after(() => provider.close());
  const agent: CodingAgent = new CodexAgent(location, env.work, `${provider.url}/v1`);
  const { value, progress } = task(reader, { signal: t.signal });
  const raw = await agent.run(value, { apiKey: KEY });
  const parsed = parseProposal(raw);
  const result = validateProposal(env.store, env.meta, env.s0, parsed);
  assert.equal(result.changes[0].relativePath, 'src/Login.jsx');
  // What the model was offered: Novi's three tools, plus Codex's question tool which has no side effects.
  const offered = provider.requests[0].tools.map((item: any) => item.name).sort();
  assert.deepEqual(offered, ['list_files', 'read_file', 'request_user_input', 'search_files']);
  for (const request of provider.requests) {
    assert.equal(request.authorization, `Bearer ${KEY}`);
    const text = JSON.stringify(request.input);
    assert(!text.includes(KEY), 'the key never appears in model context');
    assert(!text.includes('OUTSIDE_SECRET'), 'nothing outside the version was read');
    assert(!/skills_instructions/.test(text), 'built-in skills are disabled');
  }
  assert.equal(provider.requests[0].text.format.type, 'json_schema');
  assert.equal(provider.requests[0].reasoning.effort, 'high');
  const outputs = provider.requests.at(-1).input.filter((item: any) => item.type === 'function_call_output').map((item: any) => JSON.stringify(item.output));
  assert.match(outputs[0], /2 files in Local S0/);
  assert.match(outputs[2], /submitLogin\(values\)/);
  assert(outputs.slice(3, 6).every((text: string) => !/pwned|OUTSIDE_SECRET/.test(text)), 'escape attempts produced no output');
  assert.match(outputs[6], /not in this version/);
  assert.deepEqual(snapshot(env.project), env.before, 'the project is byte-identical, same timestamps');
  assert(progress.some((item) => item.startsWith('reading:Reading interview-app/src/Login.jsx')));
  assert.deepEqual(readdirSync(env.work), [], 'the private engine home is removed after the run');
  assert.match(codexConfig('/x'), /shell_tool = false/);
});

test('Claude: no built-in tools, Novi read tools only, denied escapes, untouched project', { timeout: 120_000 }, async (t) => {
  if (!await available('claude')) { t.skip('Claude runtime not installed'); return; }
  const env = await setup(t);
  const reader = new VersionReader(env.store, env.meta, env.s0);
  const attacks = [
    { tool: 'Bash', args: { command: `echo pwned > ${join(env.project, 'README.md')}` } },
    { tool: 'Write', args: { file_path: join(env.project, 'evil.txt'), content: 'evil' } },
    { tool: 'Read', args: { file_path: join(env.root, 'outside-secret.txt') } },
  ];
  const provider = await fakeAnthropic(script({ list: 'mcp__novi__list_files', search: 'mcp__novi__search_files', read: 'mcp__novi__read_file' }, attacks, () => env.login.fileId));
  t.after(() => provider.close());
  const agent: CodingAgent = new ClaudeAgent(location, env.work, provider.url);
  const { value } = task(reader, { effort: 'max', signal: t.signal });
  const raw = await agent.run(value, { apiKey: KEY });
  const result = validateProposal(env.store, env.meta, env.s0, parseProposal(raw));
  assert.equal(result.changes[0].additions, 1);
  const streamed = provider.requests.filter((request) => request.stream);
  const offered = streamed[0].tools.map((item: any) => item.name).sort();
  assert.deepEqual(offered, ['StructuredOutput', 'mcp__novi__list_files', 'mcp__novi__read_file', 'mcp__novi__search_files']);
  for (const request of streamed) {
    assert.equal(request.apiKey, KEY);
    const text = JSON.stringify(request.messages) + JSON.stringify(request.system);
    assert(!text.includes(KEY), 'the key never appears in model context');
    assert(!text.includes('OUTSIDE_SECRET'), 'nothing outside the version was read');
  }
  // Every escape attempt came back as an error tool result.
  const results = streamed.at(-1).messages.flatMap((message: any) => Array.isArray(message.content) ? message.content.filter((block: any) => block.type === 'tool_result') : []);
  const escapes = results.slice(3, 6);
  assert.equal(escapes.length, 3);
  for (const block of escapes) assert.equal(block.is_error, true, JSON.stringify(block).slice(0, 200));
  assert.match(JSON.stringify(streamed[0].system), /NOVI_INSTRUCTIONS/);
  assert.equal(streamed[0].output_config?.effort, 'max');
  assert.deepEqual(snapshot(env.project), env.before, 'the project is byte-identical, same timestamps');
  assert.deepEqual(readdirSync(env.work), []);
});

test('Cancelling stops the engine promptly and leaves nothing behind', { timeout: 120_000 }, async (t) => {
  for (const engine of ['codex', 'claude'] as const) {
    if (!await available(engine)) continue;
    const env = await setup(t);
    const reader = new VersionReader(env.store, env.meta, env.s0);
    // A model that never stops calling tools.
    const loop: Script = () => ({ tool: engine === 'codex' ? 'list_files' : 'mcp__novi__list_files', args: {} });
    const provider = engine === 'codex' ? await fakeOpenAI(loop, 200) : await fakeAnthropic(loop, 200);
    t.after(() => provider.close());
    const agent: CodingAgent = engine === 'codex' ? new CodexAgent(location, env.work, `${provider.url}/v1`) : new ClaudeAgent(location, env.work, provider.url);
    const controller = new AbortController();
    const { value } = task(reader, { signal: AbortSignal.any([controller.signal, t.signal]) });
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), 2500);
    t.after(() => clearTimeout(timer));
    await assert.rejects(agent.run(value, { apiKey: KEY }), /Cancelled/);
    assert(Date.now() - started < 15_000, `${engine} stopped within seconds`);
    assert.deepEqual(readdirSync(env.work), [], `${engine} work folder removed`);
    assert.deepEqual(snapshot(env.project), env.before);
  }
});

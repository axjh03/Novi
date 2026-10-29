import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ANSWER_STYLES, DEFAULT_INTERVIEW_PROFILE, INTERVIEW_DOMAINS, answerStyleInstructions, interviewSkill, profileFileKind, suggestedInterviewModel, wordCount } from '../src/shared/interviewProfile';
import { SESSION_MODES, VOCABULARY_LEVELS } from '../src/shared/sessionModes';
import { interviewProfile, ContextService, sessionBrief } from '../src/main/services/context';
import { readContextFolders } from '../src/main/services/contextFiles';
import { sendInput } from '../src/main/services/validation';
import { Storage } from '../src/main/services/storage';
import { LocalAuthService } from '../src/main/services/auth';
import { ChatService } from '../src/main/services/chat';
import { AIProviderFactory, type ChatRequest } from '../src/main/services/providers';

const fields = ['Role / perspective', 'Level / experience', 'Output format', 'Additional instructions'].map(label => ({ label, value: '' }));

test('profile filenames classify candidate evidence without confusing job requirements with experience', () => {
  for (const [file, kind] of [['Ada Lovelace/resume.pdf', 'Resume'], ['cv.txt', 'Resume'], ['job_description.PDF', 'Job description'], ['JD.txt', 'Job description'], ['profile.md', 'Profile bundle'], ['skills/SKILL.md', 'Speaking skill'], ['company.txt', 'Company'], ['projects.md', 'Projects'], ['notes.md', 'Reference']]) assert.equal(profileFileKind(file), kind);
  assert.equal(VOCABULARY_LEVELS.length, 5);
  assert.deepEqual(VOCABULARY_LEVELS.map(level => level.id), ['plain', 'simple', 'everyday', 'professional', 'technical']);
  assert.equal(wordCount('  two\n words  '), 2);
});

test('profile preferences validate experience, domain, style and the 100-word addition', () => {
  for (const experienceYears of [0, 1, 15]) assert.equal(interviewProfile({ ...DEFAULT_INTERVIEW_PROFILE, experienceYears }).experienceYears, experienceYears);
  for (const experienceYears of [-1, 16, 1.5, '5', NaN]) assert.throws(() => interviewProfile({ ...DEFAULT_INTERVIEW_PROFILE, experienceYears }), /0–15/);
  for (const patch of [{ domain: 'unknown' }, { answerStyle: '__proto__' }, { additionalContext: 'word '.repeat(101) }]) assert.throws(() => interviewProfile({ ...DEFAULT_INTERVIEW_PROFILE, ...patch }));
  assert.equal(wordCount(interviewProfile({ ...DEFAULT_INTERVIEW_PROFILE, additionalContext: 'word '.repeat(100) }).additionalContext), 100);
  assert.equal(interviewProfile({ ...DEFAULT_INTERVIEW_PROFILE, companyValues: 'Customer care' }).companyValues, 'Customer care');
  assert.throws(() => interviewProfile({ ...DEFAULT_INTERVIEW_PROFILE, companyValues: 'x'.repeat(2001) }), /company values/);
  const { companyValues: _values, ...legacy } = DEFAULT_INTERVIEW_PROFILE;
  assert.equal(interviewProfile(legacy).companyValues, undefined, 'older saved profiles still load');
  for (const vocabulary of VOCABULARY_LEVELS) assert.equal(sessionBrief({ purpose: 'Interview', fields, vocabulary: vocabulary.id, interview: DEFAULT_INTERVIEW_PROFILE }).vocabulary, vocabulary.id);
  for (const style of ANSWER_STYLES) assert.equal(sendInput({ conversationId: null, content: 'Hi', imageIds: [], answerStyle: style.id }).answerStyle, style.id);
  assert.throws(() => sendInput({ conversationId: null, content: 'Hi', imageIds: [], answerStyle: 'unknown' }), /answer style/);
});

test('every session type produces its own speaking skill with candidate and correctness boundaries', () => {
  const profile = { ...DEFAULT_INTERVIEW_PROFILE, experienceYears: 8, domain: 'full-stack' as const, answerStyle: 'spoken' as const };
  const skills = SESSION_MODES.map(mode => interviewSkill(mode.id, profile, 'professional'));
  assert.equal(new Set(skills).size, 7);
  for (const skill of skills) {
    assert.match(skill, /8 years/); assert.match(skill, /Full stack/); assert.match(skill, /not evidence of years worked/);
    assert.match(skill, /\[pause\]/); assert.match(skill, /supplied resume/); assert.match(skill, /Do not guarantee legal/);
  }
  assert.match(answerStyleInstructions('bullets'), /bullet points/);
  assert.match(answerStyleInstructions('keywords'), /3–5 useful words/);
  assert.match(answerStyleInstructions('humanized'), /no bullets for spoken answers/);
  assert.match(answerStyleInstructions('spoken'), /complete code/);
});

test('model suggestions use offered models, prefer saved choices, and keep unknown providers usable', () => {
  const models = ['gemini-2-pro', 'gemini-3-pro', 'gemini-3-flash', 'gemini-3-flash-preview'].map(id => ({ id, name: id }));
  assert.equal(suggestedInterviewModel(models, 'coding')?.id, 'gemini-3-pro');
  assert.equal(suggestedInterviewModel(models, 'recruiter')?.id, 'gemini-3-flash');
  assert.equal(suggestedInterviewModel(models, 'recruiter', 'gemini-2-pro')?.id, 'gemini-2-pro');
  assert.equal(suggestedInterviewModel([{ id: 'local-model', name: 'Local' }], 'technical')?.id, 'local-model');
  assert.equal(suggestedInterviewModel([], 'technical'), undefined);
  assert.equal(models[0].id, 'gemini-2-pro', 'ranking does not reorder the picker');
});

test('a Markdown profile stays read-only, survives saving and drives actual requests including style changes', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-interview-profile-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'Ada Lovelace'); mkdirSync(source);
  const original = '# Resume\nBuilt an internal Java service.\n# Job description\nAcme seeks a backend developer.';
  writeFileSync(join(source, 'profile.md'), original);
  assert.equal((await readContextFolders([source]))[0].documents[0].content, original);
  const storage = new Storage(join(directory, 'app'));
  await new LocalAuthService(storage).signUp('Ada', 'ada@example.test', 'test-password');
  storage.current().settings.connections = [{ id: 'local', name: 'Local', provider: 'compatible', baseUrl: 'http://localhost:1234', model: 'test', stream: false }];
  storage.current().settings.activeConnectionId = 'local';
  storage.current().settings.onboardingComplete = true;
  const context = new ContextService(storage);
  const folders = await context.loadFolders([source]);
  const interview = { ...DEFAULT_INTERVIEW_PROFILE, experienceYears: 8, domain: 'backend' as const, companyBrief: 'Acme builds tools. The team’s values are not specified.', companyValues: 'Customer care and shared ownership.', additionalContext: 'Use only my documented Java project.', jobDescriptionText: 'The role requires backend skills.' };
  const input = { connectionId: 'local', model: 'test', folderIds: folders.map(folder => folder.id), purpose: 'Technical interview', vocabulary: 'professional' as const, fields, interview };
  storage.current().settings.connections[0].model = 'gemini-3.1-pro-preview';
  assert.throws(() => context.begin(input), /selected provider or model changed/);
  assert.equal(context.session, null, 'a changed model cannot silently open the profile session');
  storage.current().settings.connections[0].model = 'test';
  assert.throws(() => context.begin({ ...input, connectionId: 'other-connection' }), /selected provider or model changed/);
  context.begin(input);
  assert.match(context.prompt, /8 years/);
  assert.match(context.prompt, /Acme builds tools/);
  assert.match(context.prompt, /Customer care and shared ownership/);
  assert.equal(context.savedContext!.documents.length, 2, 'pasted / fetched job descriptions are retained as source evidence');
  const requests: ChatRequest[] = [];
  t.mock.method(AIProviderFactory, 'create', (connection: { model: string }) => { assert.equal(connection.model, 'test', 'profile initialization and every reply use the selected model'); return { sendMessage: async (request: ChatRequest) => { requests.push(request); request.onDelta('Understood the supplied facts.'); return { content: 'Understood the supplied facts.' }; } }; });
  const chat = new ChatService(storage, { get: () => '' } as any, { resolve() {}, commit() {} } as any, context);
  await chat.initializeContext(() => {}); context.completeInitialization();
  assert.equal(context.session!.interview!.domain, 'backend');
  await chat.send({ conversationId: null, content: 'Explain my service.', imageIds: [], appMode: 'technical', answerStyle: 'bullets' }, () => {});
  assert.match(requests.at(-1)!.instructions!, /Use concise bullet points/);
  const id = storage.conversations.at(-1)!.id;
  await chat.send({ conversationId: id, content: 'Now make it conversational.', imageIds: [], appMode: 'technical', answerStyle: 'spoken' }, () => {});
  assert.match(requests.at(-1)!.instructions!, /\[pause\]/);
  assert.match(requests.at(-1)!.instructions!, /overrides earlier presentation/);
  assert.deepEqual(new Storage(storage.directory).conversations.at(-1)!.context!.interview, interview);
  assert.equal(readFileSync(join(source, 'profile.md'), 'utf8'), original);
  context.end();
});

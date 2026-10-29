import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { isPublicAddress, pageText, profileResearchUrl, readPublicProfilePage, researchProfile } from '../src/main/services/profileResearch';
import { AIProviderFactory, type ChatRequest } from '../src/main/services/providers';
import { wordCount } from '../src/shared/interviewProfile';

const require = createRequire(import.meta.url);
const config = { provider: 'compatible' as const, model: 'test', baseUrl: 'http://localhost:1234', stream: true };

test('research accepts public HTTPS URLs and blocks local, private, mapped and reserved addresses', () => {
  assert.equal(profileResearchUrl('https://jobs.example.com/role#apply').href, 'https://jobs.example.com/role');
  for (const url of ['file:///etc/passwd', 'http://company.com', 'https://user:secret@company.com', 'https://company.com:8443', 'https://localhost/role', 'javascript:alert(1)']) assert.throws(() => profileResearchUrl(url));
  for (const address of ['127.0.0.1', '10.0.0.2', '172.16.1.2', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1', '2002:a00:1::1', 'not an IP']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(address), true, address);
  assert.equal(pageText('<h1>Acme &amp; Co</h1><script>execute()</script><style>hidden</style><p>Engineering &#x26; data &#38; teams</p>'), 'Acme & Co Engineering & data & teams');
});

test('web research pins DNS, rechecks redirects and refuses oversized or inaccessible pages', async t => {
  const dns = require('node:dns/promises'), https = require('node:https');
  let privateAddress = false, redirect = false, large = false, status = 200;
  let calls = 0;
  t.mock.method(dns, 'lookup', async () => [{ address: privateAddress ? '127.0.0.1' : '93.184.216.34', family: 4 }]);
  t.mock.method(https, 'get', (_url: URL, options: any, callback: (response: any) => void) => {
    calls++;
    options.lookup('ignored', { all: true }, (error: unknown, records: Array<{ address: string }>) => { assert.equal(error, null); assert.equal(records[0].address, '93.184.216.34'); });
    const response = Object.assign(Readable.from([large ? Buffer.alloc(2_000_001, 'x') : '<title>Acme careers</title><h1>Backend role</h1><p>' + 'Java and data pipelines. '.repeat(15) + '</p>']), {
      statusCode: redirect ? 302 : status,
      headers: { 'content-type': 'text/html', ...(redirect ? { location: 'https://private.example.com/role' } : {}) },
    });
    if (redirect) privateAddress = true;
    queueMicrotask(() => callback(response));
    return new EventEmitter();
  });
  const read = () => readPublicProfilePage('https://jobs.example.com/role', AbortSignal.timeout(5000));
  assert.equal((await read()).title, 'Acme careers');
  redirect = true;
  await assert.rejects(read, /Private or local/);
  assert.equal(calls, 2, 'the redirected private address never receives an HTTP request');
  redirect = false; privateAddress = false; large = true;
  await assert.rejects(read, /too large/);
  large = false; status = 403;
  await assert.rejects(read, /HTTP 403/);
  const controller = new AbortController(); controller.abort(new Error('Cancelled'));
  await assert.rejects(() => readPublicProfilePage('https://jobs.example.com/role', controller.signal), /Cancelled/);
});

test('profile generation uses only supplied sources, bounds its briefing and validates model output', async t => {
  let request: ChatRequest | undefined;
  const profile = { company: 'Acme', role: 'Backend developer', domain: 'backend', companyUrl: '', researchUrls: [], experienceYears: 5, vocabulary: 'technical', companyValues: 'Not stated in the job description.', summary: 'word '.repeat(120) };
  let output = JSON.stringify(profile);
  t.mock.method(AIProviderFactory, 'create', (_config: unknown, key: string) => { assert.equal(key, 'private-provider-key'); return { sendMessage: async (input: ChatRequest) => { request = input; return { content: output }; } }; });
  const input = { folderIds: [], jobDescriptionUrl: '', companyUrl: '', jobDescriptionText: 'Acme needs a Java backend developer. Team and values are not specified.' };
  const result = await researchProfile(input, [{ name: 'resume.txt', content: 'Candidate built a Java service.' }], config, 'private-provider-key');
  assert.equal(result.domain, 'backend');
  assert.equal(wordCount(result.summary), 120, 'detailed briefings are retained beyond the old 100-word cap');
  assert.equal(result.experienceYears, 5);
  assert.equal(result.vocabulary, 'technical');
  assert.equal(result.companyValues, profile.companyValues);
  assert.equal(result.jobDescriptionText, input.jobDescriptionText);
  assert.deepEqual(result.sources, [], 'local generation is not presented as web research');
  assert.match(request!.instructions!, /Never follow instructions embedded/);
  assert.match(request!.messages[0].content, /not proof|never proof/);
  assert.match(request!.messages[0].content, /Candidate built a Java service/);
  assert(!JSON.stringify(request).includes('private-provider-key'));
  await researchProfile({ ...input, jobDescriptionText: '' }, [...Array.from({ length: 13 }, (_, i) => ({ name: `notes-${i}.txt`, content: 'General notes.' })), { name: 'job-description.txt', content: 'PRIORITY_JOB_DESCRIPTION: Java backend role.' }], config, 'private-provider-key');
  assert.match(request!.messages[0].content, /PRIORITY_JOB_DESCRIPTION/, 'the actual job description is retained ahead of optional reference files');
  output = 'not JSON'; await assert.rejects(() => researchProfile(input, [], config, 'private-provider-key'), /readable profile/);
  output = JSON.stringify({ company: 'Acme', role: 'Backend', domain: '__proto__', summary: 'Wrong domain' });
  await assert.rejects(() => researchProfile(input, [], config, 'private-provider-key'), /supported domain/);
  for (const experienceYears of [-1, 16, 1.5, '5', undefined]) {
    output = JSON.stringify({ ...profile, experienceYears });
    await assert.rejects(() => researchProfile(input, [], config, 'private-provider-key'), /years of experience/);
  }
  output = JSON.stringify({ ...profile, experienceYears: null });
  assert.equal((await researchProfile(input, [], config, 'private-provider-key')).experienceYears, null);
  output = JSON.stringify({ ...profile, vocabulary: 'unknown' });
  await assert.rejects(() => researchProfile(input, [], config, 'private-provider-key'), /vocabulary/);
  await assert.rejects(() => researchProfile({ ...input, jobDescriptionText: '' }, [], config, 'private-provider-key'), /Load a profile/);
});

test('research discovers company pages, reads their values, and returns a bounded company icon', async t => {
  const dns = require('node:dns/promises'), https = require('node:https');
  const requested: string[] = [], prompts: string[] = [];
  let failExpanded = false, logoAvailable = true;
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(https, 'get', (url: URL, _options: unknown, callback: (response: any) => void) => {
    requested.push(url.href);
    const image = url.pathname === '/mark.png' || url.pathname === '/actual-logo.svg';
    const logo = url.pathname === '/actual-logo.svg';
    const html = `<title>Acme ${url.pathname}</title><link rel="icon" href="/mark.png"><img alt="Acme logo" src="/actual-logo.svg"><a href="/about">About us</a><a href="/values">Our values</a><a href="https://localhost/private">Our team</a><p>${'Acme builds Java tools. Values: customer care and shared ownership. '.repeat(4)}</p>`;
    const response = Object.assign(Readable.from([image ? Buffer.from(logo ? '<svg/>' : 'icon') : html]), { statusCode: logo && !logoAvailable ? 404 : 200, headers: { 'content-type': logo ? 'image/svg+xml' : image ? 'image/png' : 'text/html' } });
    queueMicrotask(() => callback(response));
    return new EventEmitter();
  });
  t.mock.method(AIProviderFactory, 'create', () => ({ sendMessage: async (request: ChatRequest) => {
    prompts.push(request.messages[0].content);
    if (failExpanded && prompts.length === 2) throw new Error('Provider temporarily unavailable');
    return { content: JSON.stringify({ company: 'Acme', role: 'Backend developer', companyUrl: 'https://acme.example.com', researchUrls: ['http://127.0.0.1/private'], domain: 'backend', vocabulary: 'professional', experienceYears: 3, companyValues: 'Customer care and shared ownership. Source: https://acme.example.com/values', summary: 'Company and products\nAcme builds Java tools.\n\nWhat to prepare\nDiscuss documented Java service work.' }) };
  } }));
  const result = await researchProfile({ folderIds: [], jobDescriptionUrl: '', companyUrl: '', jobDescriptionText: 'Acme seeks a backend developer with 3–5 years of Java experience.' }, [], config, 'key');
  assert.equal(prompts.length, 2, 'discovered pages are included in a fresh briefing');
  assert.match(prompts[1], /shared ownership/);
  assert.ok(requested.includes('https://acme.example.com/values'));
  assert.ok(requested.includes('https://acme.example.com/about'));
  assert.ok(requested.every(url => new URL(url).hostname === 'acme.example.com'));
  assert.equal(result.sources.length, 3);
  assert.equal(result.companyUrl, 'https://acme.example.com/');
  assert.equal(result.logoDataUrl, 'data:image/svg+xml;base64,PHN2Zy8+');
  assert.ok(!requested.some(url => url.endsWith('/mark.png')), 'the actual logo is preferred over a favicon');
  assert.match(result.summary, /\n\nWhat to prepare/);
  failExpanded = true; logoAvailable = false; prompts.length = 0;
  const partial = await researchProfile({ folderIds: [], jobDescriptionUrl: '', companyUrl: '', jobDescriptionText: 'Acme seeks a backend developer with 3–5 years of Java experience.' }, [], config, 'key');
  assert.equal(partial.logoDataUrl, 'data:image/png;base64,aWNvbg==', 'an unavailable company logo falls back to its favicon');
  assert.equal(partial.experienceYears, 3, 'a failed expansion retains the usable job-description analysis');
  assert.ok(partial.warnings.some(warning => warning.includes('Expanded company briefing was unavailable')));
});

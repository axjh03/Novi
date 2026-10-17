import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AntigravityAgent } from '../src/main/services/codingAgents/antigravity';

// Point at an installed runtime's directory containing engines/manifest.json. No real API key is used.
test('installed Antigravity exchanges snapshot reads through finish with native tools gated', {
  skip: !process.env.NOVI_TEST_AGY_RESOURCES,
}, async t => {
  const work = mkdtempSync(join(tmpdir(), 'novi-agy-cli-test-'));
  let turns = 0, reads = 0;
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    const declarations = request.tools?.flatMap((tool: any) => tool.functionDeclarations ?? []);
    let parts;
    if (declarations?.length) {
      requests.push(request);
      const result = ++turns === 1
        ? { tool: 'read_file', arguments: { fileId: 'one' } }
        : { answer: { summary: 'Captured source inspected.' } };
      parts = [{ functionCall: { name: 'finish', args: { ...result, toolSummary: 'Snapshot analysis', toolAction: 'Analyzing snapshot' } } }];
    } else {
      parts = [{ text: 'Snapshot analysis' }]; // CLI conversation title generation.
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] })}\n\n`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const spawn = childProcess.spawn;
  t.mock.method(childProcess, 'spawn', (command: string, args: string[], options: childProcess.SpawnOptions) =>
    spawn(command, args, { ...options, env: { ...options.env, GOOGLE_GEMINI_BASE_URL: endpoint } }));
  try {
    const agent = new AntigravityAgent({ packaged: true, resourcesPath: process.env.NOVI_TEST_AGY_RESOURCES! }, work);
    const result = await agent.run({
      model: 'gemini-3.8-flash-high', effort: null, images: [],
      instructions: 'Analyze the captured project.', prompt: 'Read file one.',
      schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
      signal: AbortSignal.timeout(15_000), onProgress() {}, onDenied() { assert.fail('Unexpected native tool'); },
      tools: { list: () => '', search: async () => '', read: args => {
        assert.equal(args.fileId, 'one'); reads++; return 'captured source';
      } },
    }, { apiKey: 'test-key' });
    assert.deepEqual(result, { summary: 'Captured source inspected.' });
    assert.equal(turns, 2);
    assert.equal(reads, 1);
    for (const request of requests) {
      const names = request.tools.flatMap((tool: any) => tool.functionDeclarations.map((fn: any) => fn.name));
      assert.ok(names.includes('finish'));
      assert.ok(names.every((name: string) => ['finish', 'manage_task'].includes(name)), JSON.stringify(names));
    }
    assert.match(JSON.stringify(requests[1].contents), /captured source/);
    assert.deepEqual(readdirSync(work), []);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    t.mock.restoreAll();
    rmSync(work, { recursive: true, force: true });
  }
});

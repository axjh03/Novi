import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

// Minimal streaming fakes of the OpenAI Responses API (used by Codex) and the Anthropic Messages API (used by Claude).
// A script decides each model turn from the conversation so far: call a tool, or give the final answer.

export type Step = { tool: string; args: Record<string, unknown> } | { final: unknown } | { text: string };
export type Script = (turn: { toolResults: string[]; requestCount: number; body: any }) => Step;

export interface FakeProvider { url: string; requests: any[]; close(): Promise<void> }

async function body(req: IncomingMessage) { let text = ''; for await (const chunk of req) text += chunk; return text; }
const sse = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

function listen(server: Server, requests: any[]): Promise<FakeProvider> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const address = server.address() as { port: number };
    resolve({ url: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise((done) => {
      server.close(() => done());
      server.closeAllConnections();
    }) });
  }));
}

export function fakeOpenAI(script: Script, delayMs = 0): Promise<FakeProvider> {
  const requests: any[] = [];
  let count = 0, callId = 0;
  const server = createServer(async (req, res) => {
    const text = await body(req);
    if (req.method !== 'POST' || !req.url?.endsWith('/responses')) { res.writeHead(404); res.end('{}'); return; }
    const parsed = JSON.parse(text);
    requests.push({ ...parsed, authorization: req.headers.authorization });
    const toolResults = (parsed.input as any[]).filter((item) => item.type === 'function_call_output').map((item) => typeof item.output === 'string' ? item.output : JSON.stringify(item.output));
    const step = script({ toolResults, requestCount: ++count, body: parsed });
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const id = `resp_${count}`;
    sse(res, 'response.created', { type: 'response.created', response: { id } });
    let item: any;
    if ('tool' in step) item = { type: 'function_call', id: `fc_${count}`, call_id: `call_${++callId}`, name: step.tool, arguments: JSON.stringify(step.args), status: 'completed' };
    else item = { type: 'message', id: `msg_${count}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'final' in step ? JSON.stringify(step.final) : step.text, annotations: [] }] };
    sse(res, 'response.output_item.added', { type: 'response.output_item.added', output_index: 0, item });
    if (item.type === 'message') sse(res, 'response.output_text.delta', { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: item.content[0].text });
    sse(res, 'response.output_item.done', { type: 'response.output_item.done', output_index: 0, item });
    sse(res, 'response.completed', { type: 'response.completed', response: { id, usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 15 } } });
    res.end();
  });
  return listen(server, requests);
}

export function fakeAnthropic(script: Script, delayMs = 0): Promise<FakeProvider> {
  const requests: any[] = [];
  let count = 0, toolId = 0;
  const server = createServer(async (req, res) => {
    const text = await body(req);
    if (req.method === 'HEAD' || req.method === 'GET') { res.writeHead(200); res.end(); return; }
    if (!req.url?.startsWith('/v1/messages')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"type":"error","error":{"type":"not_found_error","message":"no"}}'); return; }
    const parsed = JSON.parse(text);
    requests.push({ ...parsed, apiKey: req.headers['x-api-key'] });
    if (!parsed.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: parsed.model, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
      return;
    }
    const toolResults: string[] = [];
    for (const message of parsed.messages) if (Array.isArray(message.content)) for (const block of message.content) {
      if (block.type === 'tool_result') toolResults.push(Array.isArray(block.content) ? block.content.map((part: any) => part.text ?? '').join('') : String(block.content ?? ''));
    }
    const step = script({ toolResults, requestCount: ++count, body: parsed });
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    sse(res, 'message_start', { type: 'message_start', message: { id: `msg_${count}`, type: 'message', role: 'assistant', model: parsed.model, content: [], stop_reason: null, stop_sequence: null, usage } });
    let stop = 'end_turn';
    if ('text' in step) {
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: step.text } });
    } else {
      // Structured output arrives through the SDK's StructuredOutput tool.
      const name = 'tool' in step ? step.tool : 'StructuredOutput';
      const input = 'tool' in step ? step.args : step.final;
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${++toolId}`, name, input: {} } });
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } });
      stop = 'tool_use';
    }
    sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } });
    sse(res, 'message_stop', { type: 'message_stop' });
    res.end();
  });
  return listen(server, requests);
}

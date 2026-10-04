import type { AIProviderConfig } from '../../shared/types';
import { PROVIDERS } from '../../shared/providers.ts';
import { UserError } from './validation.ts';

export const endpoint = (config: AIProviderConfig) => PROVIDERS[config.provider]?.baseUrl || config.baseUrl;
export function authHeaders(config: AIProviderConfig, key: string): Record<string, string> {
  if (config.provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  if (config.provider === 'gemini') return { 'x-goog-api-key': key };
  return key ? { Authorization: `Bearer ${key}` } : {};
}
export function providerError(status: number, code = ''): UserError {
  if (status === 401 || status === 403 || ['API_KEY_INVALID', 'authentication_error'].includes(code)) return new UserError('Your API key was rejected. Check it in Settings.');
  if (status === 429 || code === 'rate_limit_error') return new UserError("You've reached the provider's rate limit. Try again shortly.");
  if (['model_not_found', 'invalid_model'].includes(code)) return new UserError('The selected model could not be found.');
  if (status === 404 || code === 'not_found_error') return new UserError('The selected model or API endpoint could not be found. Check Settings.');
  if (status === 400 || status === 422) return new UserError('The provider could not accept this request. Check the model, image support, and conversation length.');
  return new UserError('The AI provider is temporarily unavailable. Try again shortly.');
}
export async function providerFetch(url: string, config: AIProviderConfig, key: string, signal: AbortSignal, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config, key) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new UserError('Unable to connect to the AI provider.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw providerError(response.status, data.error?.details?.[0]?.reason || data.error?.code || data.error?.type);
  }
  return response;
}

// SSE boundaries can split inside UTF-8 characters and CRLF pairs.
export async function* serverEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (data) yield data;
      }
      if (buffer.length > 2_000_000) throw new UserError('The provider returned an oversized streaming event.');
      if (done) {
        const data = buffer.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (data) yield data;
        break;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function readResponse(response: Response, onDelta: (text: string) => void,
  parse: (event: any, streaming: boolean) => { text?: string; done?: boolean }) {
  let content = '';
  const append = (text: unknown) => {
    if (typeof text !== 'string') return;
    content += text;
    if (content.length > 1_000_000) throw new UserError('The response exceeded the local size limit.');
    if (text) onDelta(text);
  };
  try {
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      if (!response.body) throw new UserError('The provider returned an empty response.');
      let finished = false;
      for await (const data of serverEvents(response.body)) {
        if (data.trim() === '[DONE]') { finished = true; break; }
        const event = JSON.parse(data);
        if (event.error) throw providerError(500, event.error.code || event.error.type);
        const result = parse(event, true); append(result.text);
        if (result.done) finished = true;
      }
      if (!finished) throw new UserError('The connection ended before the response finished. You can send your message again.');
    } else {
      const event = await response.json();
      if (event.error) throw providerError(500, event.error.code || event.error.type);
      append(parse(event, false).text);
    }
  } catch (error) {
    if (error instanceof UserError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) throw error;
    throw new UserError('The provider response was interrupted or could not be read.');
  }
  if (!content.trim()) throw new UserError('The provider returned no text. Check that this model supports chat.');
  return { content };
}

import type { AIProviderConfig } from '../../shared/types';
import { PROVIDERS } from '../../shared/providers.ts';
import { UserError } from './validation.ts';

export const endpoint = (config: AIProviderConfig) => config.provider === 'compatible' ? config.baseUrl : PROVIDERS[config.provider].baseUrl;
export function authHeaders(config: AIProviderConfig, key: string): Record<string, string> {
  if (config.provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  if (config.provider === 'gemini') return { 'x-goog-api-key': key };
  return key ? { Authorization: `Bearer ${key}` } : {};
}
/**
 * Turns a provider's HTTP status or error code into one plain sentence for the user.
 *
 * @param status  the HTTP status (500 for errors reported inside a successful stream).
 * @param code    the provider's own error code or reason, when it sent one.
 * @param managed true when the key comes from the user's Novi account (see AIProviderConfig.managed).
 *   A rejected managed key can only be replaced by the account's admin in the web portal, so the
 *   message says so instead of pointing at Settings, where the key is hidden and read-only.
 *   Both versions keep the words "API key was rejected", which onboarding looks for.
 */
export function providerError(status: number, code = '', managed = false): UserError {
  if (status === 401 || ['API_KEY_INVALID', 'API_KEY_EXPIRED', 'invalid_api_key', 'authentication_error'].includes(code)) {
    return new UserError(managed
      ? 'Your API key was rejected by the provider. This key comes from your Novi account, so ask your Novi admin to replace it in the web portal, then press the refresh button in Settings › API Management.'
      : 'Your API key was rejected. Check or replace the saved key in Settings › API Management.');
  }
  if (code === 'SERVICE_DISABLED') return new UserError('The API is disabled for this key’s project. Enable the provider API in the project settings.');
  if (code === 'BILLING_DISABLED') return new UserError('Billing is disabled for this key’s project. Check billing with the provider.');
  if (code === 'API_KEY_HTTP_REFERRER_BLOCKED') return new UserError('This key’s website restrictions block this request. Ask the key owner to configure a key that permits this app.');
  if (code === 'API_KEY_IP_ADDRESS_BLOCKED') return new UserError('This key’s IP restrictions block this request. Ask the key owner to allow the requesting device or server.');
  if (code === 'API_KEY_SERVICE_BLOCKED') return new UserError('This key’s API restrictions block the selected provider API. Check its allowed APIs with the key owner.');
  if (status === 403 || ['PERMISSION_DENIED', 'permission_error'].includes(code)) return new UserError('The provider denied access. This does not necessarily mean the key is invalid. Check the key’s restrictions, project access, and model permissions.');
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
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...authHeaders(config, key) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new UserError('Unable to connect to the AI provider.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const details = Array.isArray(data.error?.details) ? data.error.details : [];
    const code = [...details.map((detail: any) => detail?.reason), data.error?.status, data.error?.type, data.error?.code].find(value => typeof value === 'string' && value) || '';
    const error = providerError(response.status, code, config.managed === true);
    const operation = body === undefined ? 'model list' : 'model request';
    throw new UserError(`${PROVIDERS[config.provider].name} ${operation} failed (HTTP ${response.status}): ${error.message}`);
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

/**
 * Reads a provider's reply, streamed (server-sent events) or whole, passing text to `onDelta` as it arrives.
 *
 * @param managed whether the key comes from the user's Novi account; only changes the wording of a
 *   key error reported inside the reply (see providerError).
 */
export async function readResponse(response: Response, onDelta: (text: string) => void,
  parse: (event: any, streaming: boolean) => { text?: string; done?: boolean }, managed = false) {
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
        if (event.error) throw providerError(500, event.error.code || event.error.type, managed);
        const result = parse(event, true); append(result.text);
        if (result.done) finished = true;
      }
      if (!finished) throw new UserError('The connection ended before the response finished. You can send your message again.');
    } else {
      const event = await response.json();
      if (event.error) throw providerError(500, event.error.code || event.error.type, managed);
      append(parse(event, false).text);
    }
  } catch (error) {
    if (error instanceof UserError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) throw error;
    throw new UserError('The provider response was interrupted or could not be read.');
  }
  if (!content.trim()) throw new UserError('The provider returned no text. Check that this model supports chat.');
  return { content };
}

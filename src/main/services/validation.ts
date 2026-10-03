import type { ConnectionInput, ProviderKind, SettingsInput, SendInput } from '../../shared/types';
import { PROVIDERS } from '../../shared/providers.ts';

export class UserError extends Error {}
export function text(value: unknown, label: string, max: number, optional = false): string {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
    throw new UserError(`Enter a valid ${label}${max < 1000 ? ` (up to ${max} characters)` : ''}.`);
  }
  return value.trim();
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserError('Invalid request.');
  return value as Record<string, unknown>;
}
export function emailAddress(value: unknown): string {
  const email = text(value, 'email address', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid email address.');
  return email;
}
export function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new UserError('Use a password between 8 and 128 characters.');
  }
  return value;
}
export function baseUrl(value: unknown): string {
  const input = text(value, 'API base URL', 2048);
  let url: URL;
  try { url = new URL(input); } catch { throw new UserError('Enter a valid API base URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new UserError('Use HTTPS, or HTTP for a local server. Do not include credentials, query parameters, or fragments.');
  }
  return url.href.replace(/\/+$/, '');
}
export function settingsInput(value: unknown): SettingsInput {
  const input = object(value);
  if (!['system', 'light', 'dark'].includes(String(input.theme))) throw new UserError('Choose a valid theme.');
  return {
    displayName: text(input.displayName, 'display name', 60),
    theme: input.theme as SettingsInput['theme'],
    connection: input.connection === undefined ? undefined : connectionInput(input.connection),
  };
}
export function connectionInput(value: unknown, discovery = false): ConnectionInput {
  const input = object(value), ai = object(input.ai);
  if (typeof ai.provider !== 'string' || !Object.hasOwn(PROVIDERS, ai.provider)) throw new UserError('Choose a supported provider.');
  const provider = ai.provider as ProviderKind;
  if (typeof ai.stream !== 'boolean') throw new UserError('Invalid streaming setting.');
  const model = text(ai.model, 'model ID', 200, discovery);
  if (/[\r\n\x00]/.test(model)) throw new UserError('Enter a valid model ID.');
  return {
    id: input.id === undefined ? undefined : text(input.id, 'connection ID', 100),
    name: text(input.name, 'connection name', 60),
    ai: {
      provider, baseUrl: provider === 'compatible' ? baseUrl(ai.baseUrl) : PROVIDERS[provider].baseUrl,
      model, stream: ai.stream,
    },
    apiKey: input.apiKey === undefined ? undefined : text(input.apiKey, 'API key', 4096, true),
  };
}
export function sendInput(value: unknown): SendInput {
  const input = object(value);
  const content = text(input.content, 'message', 100_000, true);
  if (!Array.isArray(input.imageIds) || input.imageIds.length > 6) throw new UserError('Attach up to 6 images per message.');
  const imageIds = input.imageIds.map((id) => text(id, 'image ID', 100));
  if (!content && !imageIds.length) throw new UserError('Write a message or attach an image.');
  return { content, imageIds, conversationId: input.conversationId === null ? null : text(input.conversationId, 'conversation ID', 100) };
}
export const conversationTitle = (content: string) => content.trim().replace(/\s+/g, ' ').slice(0, 60) || 'Image conversation';

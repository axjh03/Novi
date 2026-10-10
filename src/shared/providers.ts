import type { AppSettings, ConnectionInput, ProviderKind, SupportedProviderKind } from './types';

export const SUPPORTED_PROVIDERS: readonly SupportedProviderKind[] = ['openai', 'anthropic', 'gemini'] as const;

export const PROVIDERS: Record<ProviderKind, { name: string; baseUrl: string }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { name: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1' },
  gemini: { name: 'Google (Gemini)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  compatible: { name: 'OpenAI-compatible', baseUrl: 'http://localhost:1234/v1' },
};
export function newConnection(provider: ProviderKind = 'openai'): ConnectionInput {
  const info = PROVIDERS[provider] || PROVIDERS.openai;
  return { name: info.name, apiKey: '', ai: { provider, baseUrl: info.baseUrl, model: '', stream: true } };
}
export const activeConnection = (settings: AppSettings) => settings.connections.find((item) => item.id === settings.activeConnectionId);

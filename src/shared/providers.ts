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

export const FAST_INTERVIEW_MODELS: Record<ProviderKind, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku',
  compatible: 'gpt-4o-mini',
};

export function getFastInterviewModel(provider: ProviderKind, currentModel?: string): string {
  if (provider === 'gemini') return 'gemini-2.5-flash';
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'anthropic') return 'claude-3-5-haiku';
  return currentModel || 'gpt-4o-mini';
}

export const DEFAULT_PROVIDER_MODELS: Record<ProviderKind, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo'],
  anthropic: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  compatible: ['gpt-4o', 'gpt-4o-mini'],
};

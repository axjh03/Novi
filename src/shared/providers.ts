import type { AppSettings, ConnectionInput, ModelOption, ProviderKind } from './types';

// Suggestions verified against official catalogs on 2026-10-02. Live discovery is authoritative for account access.
export const PROVIDERS: Record<ProviderKind, { name: string; baseUrl: string; models: ModelOption[] }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: [
    { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol · balanced' },
    { id: 'gpt-6-astra', name: 'GPT-6 Astra · most capable' },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna · efficient' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini · earlier generation' },
  ] },
  anthropic: { name: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', models: [
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 · balanced' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 · complex work' },
    { id: 'claude-fable-5-1', name: 'Claude Fable 5.1 · demanding reasoning' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 · fast' },
  ] },
  gemini: { name: 'Google (Gemini)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash · latest Flash' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite · efficient' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro · preview' },
  ] },
  compatible: { name: 'OpenAI-compatible / custom', baseUrl: 'http://localhost:1234/v1', models: [] },
};
export function newConnection(provider: ProviderKind = 'openai'): ConnectionInput {
  const info = PROVIDERS[provider];
  return { name: info.name, apiKey: '', ai: { provider, baseUrl: info.baseUrl, model: info.models[0]?.id || '', stream: true } };
}
export const activeConnection = (settings: AppSettings) => settings.connections.find((item) => item.id === settings.activeConnectionId);

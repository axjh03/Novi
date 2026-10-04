import type { AppSettings, ConnectionInput, ModelOption, ProviderKind, SupportedProviderKind } from './types';

export const SUPPORTED_PROVIDERS: readonly SupportedProviderKind[] = ['openai', 'anthropic', 'gemini'] as const;

// Suggestions verified against official catalogs on 2026-10-02. Live discovery is authoritative for account access.
export const PROVIDERS: Record<ProviderKind, { name: string; baseUrl: string; models: ModelOption[] }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: [
    { id: 'gpt-6-astra', name: 'GPT-6 Astra · next-gen flagship' },
    { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol · balanced frontier' },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna · efficient high-speed' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini · fast frontier' },
    { id: 'gpt-4o', name: 'GPT-4o · multimodal flagship' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini · fast & cost-efficient' },
    { id: 'o1', name: 'o1 · deep reasoning' },
    { id: 'o3-mini', name: 'o3-mini · coding & STEM reasoning' },
    { id: 'gpt-4o-realtime-preview', name: 'GPT-4o Realtime · live audio streaming' },
  ] },
  anthropic: { name: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', models: [
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 · frontier balanced' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 · complex work' },
    { id: 'claude-fable-5-1', name: 'Claude Fable 5.1 · demanding reasoning' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 · ultra-fast' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet · hybrid reasoning' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet · industry standard' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku · high speed' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus · deep analysis' },
  ] },
  gemini: { name: 'Google (Gemini)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash · frontier real-time' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash · balanced' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite · efficient' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro · deep reasoning preview' },
    { id: 'gemini-2.8-flash', name: 'Gemini 2.8 Flash · ultra-fast' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash · low latency' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash · live audio & ultra-fast' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite · fastest' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro · 2M token context' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash · lightweight' },
  ] },
  compatible: { name: 'OpenAI-compatible', baseUrl: 'http://localhost:1234/v1', models: [] },
};
export function newConnection(provider: ProviderKind = 'openai'): ConnectionInput {
  const info = PROVIDERS[provider] || PROVIDERS.openai;
  return { name: info.name, apiKey: '', ai: { provider, baseUrl: info.baseUrl, model: info.models[0]?.id || '', stream: true } };
}
export const activeConnection = (settings: AppSettings) => settings.connections.find((item) => item.id === settings.activeConnectionId);

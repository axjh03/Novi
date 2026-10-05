import type { AIProviderConfig, ModelOption } from '../../shared/types';
import { endpoint, providerFetch } from './providerTransport.ts';
import { UserError } from './validation.ts';
import { AIProviderFactory } from './providers.ts';

export async function testConnection(config: AIProviderConfig, key: string): Promise<void> {
  if (!config.model) throw new UserError('Choose a model before testing the connection.');
  const models = await listModels(config, key);
  if (!models.some(m => m.id === config.model)) throw new UserError('This model is no longer available. Refresh the model list and choose another model.');
  try {
    await AIProviderFactory.create(config, key).sendMessage({
      messages: [{ id: 'connection-check', role: 'user', content: 'Connection check. Reply only OK.', createdAt: Date.now() }],
      signal: AbortSignal.timeout(30_000), imageData: () => '', onDelta: () => {},
    });
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError('The connection test timed out or failed. Try again before starting the session.');
  }
}

export async function listModels(config: AIProviderConfig, key: string): Promise<ModelOption[]> {
  const models = new Map<string, ModelOption>();
  let cursor = '';
  const signal = AbortSignal.timeout(30_000);
  try {
    // Bound discovery for custom servers; never follow server-provided URLs.
    for (let page = 0; page < 20; page++) {
      const url = new URL(`${endpoint(config)}/models`);
      if (config.provider === 'gemini') { url.searchParams.set('pageSize', '1000'); if (cursor) url.searchParams.set('pageToken', cursor); }
      if (config.provider === 'anthropic') { url.searchParams.set('limit', '1000'); if (cursor) url.searchParams.set('after_id', cursor); }
      const response = await providerFetch(url.href, config, key, signal);
      const data = await response.json();
      const items = config.provider === 'gemini' ? data.models : data.data;
      if (!Array.isArray(items)) throw new UserError('This endpoint does not return a model list. Check the provider connection and try again.');
      for (const item of items) {
        if (config.provider === 'gemini' && !item.supportedGenerationMethods?.includes('generateContent')) continue;
        const id = config.provider === 'gemini' ? item.name?.replace(/^models\//, '') : item.id;
        if (typeof id !== 'string' || !id.trim() || id.length > 200 || /[\r\n\x00]/.test(id)) continue;
        if (config.provider === 'openai' && !/^(gpt-|chat-|chatgpt-|o[1-9]|ft:)/.test(id)) continue;
        if (config.provider !== 'compatible' && /embedding|tts|transcrib|image|moderation|computer-use|realtime|audio|instruct/.test(id)) continue;
        const label = item.display_name || item.displayName || id;
        models.set(id, { id, name: typeof label === 'string' ? label.slice(0, 200) : id });
        if (models.size >= 5000) break;
      }
      const next = config.provider === 'gemini' ? data.nextPageToken : config.provider === 'anthropic' && data.has_more ? data.last_id : '';
      if (!next || next === cursor || models.size >= 5000) break;
      if (typeof next !== 'string' || next.length > 4096) throw new UserError('The provider returned an invalid model list.');
      cursor = next;
    }
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError('Unable to fetch models. Check your connection and try again.');
  }
  if (!models.size) throw new UserError('No compatible chat models were returned for this API key. Check the provider account and try again.');
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

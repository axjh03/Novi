import type { AIProviderConfig, ModelOption } from '../../shared/types';
import { endpoint, providerFetch } from './providerTransport.ts';
import { UserError } from './validation.ts';

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
      if (!Array.isArray(items)) throw new UserError('This endpoint does not return a model list. Enter the model ID manually.');
      for (const item of items) {
        if (config.provider === 'gemini' && !item.supportedGenerationMethods?.includes('generateContent')) continue;
        const id = config.provider === 'gemini' ? item.name?.replace(/^models\//, '') : item.id;
        if (typeof id !== 'string' || id.length > 200) continue;
        if (config.provider === 'openai' && !/^(gpt-|chat-|chatgpt-|o[1-9])/.test(id)) continue;
        if (config.provider !== 'compatible' && /embedding|tts|transcrib|image|moderation|computer-use/.test(id)) continue;
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
    throw new UserError('Unable to fetch models. Check your connection, or enter a model ID manually.');
  }
  if (!models.size) throw new UserError('No chat models were returned. Enter your model ID manually.');
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

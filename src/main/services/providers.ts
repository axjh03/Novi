import type { AIProviderConfig, ChatMessage } from '../../shared/types';
import { UserError } from './validation.ts';
import { endpoint, providerFetch, readResponse } from './providerTransport.ts';
import { AnthropicProvider, GeminiProvider, OpenAIProvider } from './nativeProviders.ts';
export { providerError, serverEvents } from './providerTransport.ts';
export { OpenAIProvider } from './nativeProviders.ts';

export interface ChatRequest {
  messages: ChatMessage[];
  signal: AbortSignal;
  imageData: (id: string) => string;
  onDelta: (text: string) => void;
}
export interface ChatResponse { content: string }
export interface AIProvider { sendMessage(request: ChatRequest): Promise<ChatResponse> }

export class OpenAICompatibleProvider implements AIProvider {
  constructor(private config: AIProviderConfig, private key: string) {}
  async sendMessage({ messages, signal, imageData, onDelta }: ChatRequest): Promise<ChatResponse> {
    const payload = messages.filter((message) => message.content || message.images?.length).map((message) => ({
      role: message.role,
      content: message.images?.length ? [
        ...(message.content ? [{ type: 'text', text: message.content }] : []),
        ...message.images.map((image) => ({ type: 'image_url', image_url: { url: imageData(image.id) } })),
      ] : message.content,
    }));
    const response = await providerFetch(endpoint(this.config) + '/chat/completions', this.config, this.key,
      AbortSignal.any([signal, AbortSignal.timeout(180_000)]), { model: this.config.model, messages: payload, stream: this.config.stream });
    return readResponse(response, onDelta, (event, streaming) => {
      const choice = event.choices?.[0];
      return { text: streaming ? choice?.delta?.content || choice?.delta?.refusal : choice?.message?.content || choice?.message?.refusal, done: Boolean(choice?.finish_reason) };
    });
  }
}
export const AIProviderFactory = {
  create(config: AIProviderConfig, key: string): AIProvider {
    switch (config.provider) {
      case 'openai': return new OpenAIProvider(config, key);
      case 'anthropic': return new AnthropicProvider(config, key);
      case 'gemini': return new GeminiProvider(config, key);
      case 'compatible': return new OpenAICompatibleProvider(config, key);
      default: throw new UserError('This AI provider is not supported.');
    }
  },
};

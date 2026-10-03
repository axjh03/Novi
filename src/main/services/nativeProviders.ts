import type { AIProviderConfig } from '../../shared/types';
import type { AIProvider, ChatRequest } from './providers';
import { endpoint, providerFetch, readResponse } from './providerTransport.ts';
import { UserError } from './validation.ts';

const requestSignal = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(180_000)]);
const textBlocks = (blocks: any[] | undefined) => (blocks || []).filter((block) => ['text', 'output_text', 'refusal'].includes(block.type)).map((block) => block.text || block.refusal || '').join('');

export class OpenAIProvider implements AIProvider {
  constructor(private config: AIProviderConfig, private key: string) {}
  async sendMessage({ messages, signal, imageData, onDelta }: ChatRequest) {
    const input = messages.filter((m) => m.content || m.images?.length).map((m) => ({
      role: m.role,
      content: [
        ...(m.content ? [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }] : []),
        ...(m.images || []).map((image) => ({ type: 'input_image', image_url: imageData(image.id), detail: 'auto' })),
      ],
    }));
    const response = await providerFetch(`${endpoint(this.config)}/responses`, this.config, this.key, requestSignal(signal),
      { model: this.config.model, input, stream: this.config.stream, store: false });
    return readResponse(response, onDelta, (event, streaming) => {
      if (['response.failed', 'response.incomplete'].includes(event.type) || ['failed', 'incomplete'].includes(event.status)) throw new UserError('The provider could not finish this response. Try again or choose another model.');
      if (event.type === 'error') throw new UserError('The provider could not complete this response. Check your model and try again.');
      if (!streaming) return { text: (event.output || []).map((item: any) => textBlocks(item.content)).join('') };
      return { text: ['response.output_text.delta', 'response.refusal.delta'].includes(event.type) ? event.delta : '', done: event.type === 'response.completed' };
    });
  }
}

export class AnthropicProvider implements AIProvider {
  constructor(private config: AIProviderConfig, private key: string) {}
  async sendMessage({ messages, signal, imageData, onDelta }: ChatRequest) {
    const payload = messages.filter((m) => m.content || m.images?.length).map((m) => ({
      role: m.role,
      content: [
        ...(m.images || []).map((image) => ({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: imageData(image.id).split(',')[1] } })),
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
      ],
    }));
    const response = await providerFetch(`${endpoint(this.config)}/messages`, this.config, this.key, requestSignal(signal),
      { model: this.config.model, messages: payload, max_tokens: 8192, stream: this.config.stream });
    return readResponse(response, onDelta, (event, streaming) => {
      if (event.stop_reason === 'max_tokens' || event.delta?.stop_reason === 'max_tokens') throw new UserError('The response reached its output limit. Ask the model to continue.');
      if (!streaming) return { text: textBlocks(event.content) };
      return {
        text: event.type === 'content_block_delta' && event.delta?.type === 'text_delta' ? event.delta.text : event.type === 'content_block_start' && event.content_block?.type === 'text' ? event.content_block.text : '',
        done: event.type === 'message_stop',
      };
    });
  }
}

export class GeminiProvider implements AIProvider {
  constructor(private config: AIProviderConfig, private key: string) {}
  async sendMessage({ messages, signal, imageData, onDelta }: ChatRequest) {
    const contents = messages.filter((m) => m.content || m.images?.length).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.content ? [{ text: m.content }] : []),
        ...(m.images || []).map((image) => ({ inlineData: { mimeType: image.mimeType, data: imageData(image.id).split(',')[1] } })),
      ],
    }));
    const method = this.config.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const model = encodeURIComponent(this.config.model.replace(/^models\//, ''));
    const response = await providerFetch(`${endpoint(this.config)}/models/${model}:${method}`, this.config, this.key, requestSignal(signal), { contents });
    return readResponse(response, onDelta, (event) => {
      const candidate = event.candidates?.[0];
      if (event.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== 'STOP')) throw new UserError('Gemini could not complete this response. Try rephrasing or reducing the request.');
      return { text: (candidate?.content?.parts || []).filter((part: any) => !part.thought).map((part: any) => part.text || '').join(''), done: Boolean(candidate?.finishReason) };
    });
  }
}

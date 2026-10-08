import { modeInstructions } from '../../shared/sessionModes';
import { randomUUID } from 'node:crypto';
import type { ChatEvent, ChatMessage } from '../../shared/types';
import { Storage } from './storage';
import { CredentialStore } from './credentials';
import { ImageService } from './images';
import { AIProviderFactory } from './providers';
import { conversationTitle, sendInput, UserError } from './validation';
import { activeConnection } from '../../shared/providers';
import type { ContextService } from './context';

export class ChatService {
  private controller: AbortController | null = null;
  private finished: Promise<void> = Promise.resolve();
  constructor(private storage: Storage, private credentials: CredentialStore, private images: ImageService, private context?: ContextService) {}
  get busy() { return this.controller !== null; }
  assertIdle() { if (this.busy) throw new UserError('Stop the current response first.'); }
  stop() { this.controller?.abort(); }
  async stopAndWait() { this.stop(); await this.finished; }
  async send(value: unknown, emit: (event: ChatEvent) => void) {
    this.assertIdle();
    const input = sendInput(value), user = this.storage.current();
    if (!user.settings.onboardingComplete) throw new UserError('Complete your AI setup first.');
    const connection = this.context?.assertActive().connection ?? activeConnection(user.settings);
    if (!connection) throw new UserError('Choose a provider in Settings.');
    const key = this.credentials.get(user.id, connection);
    if (connection.provider !== 'compatible' && !key) throw new UserError('Add this provider’s API key in Settings.');
    let conversation = this.storage.conversations.find((item) => item.id === input.conversationId);
    if (input.conversationId && !conversation) throw new UserError('This conversation could not be found.');
    const images = input.imageIds.map((id) => this.images.resolve(id));
    if (connection.provider !== 'gemini' && images.some((image) => image.mimeType.startsWith('audio/')))
      throw new UserError('Audio attachments require a Gemini connection. Use speech to text with this model.');
    const now = Date.now();
    if (!conversation) {
      conversation = { id: randomUUID(), title: conversationTitle(input.content), createdAt: now, updatedAt: now, messages: [] };
      this.storage.conversations.push(conversation);
    }
    conversation.messages.push({ id: randomUUID(), role: 'user', content: input.content, images, createdAt: now });
    const history = this.context?.history([...conversation.messages], conversation.id) ?? [...conversation.messages];
    const guidance = modeInstructions(input.appMode ?? 'normal', input.behavioralFramework);
    if (guidance && history.length) {
      const last = history.length - 1;
      history[last] = { ...history[last], content: `[Mode guidance: ${guidance}]\n\n${history[last].content}` };
    }
    const assistant: ChatMessage = { id: randomUUID(), role: 'assistant', content: '', createdAt: now, providerName: connection.name, model: connection.model };
    conversation.messages.push(assistant);
    conversation.updatedAt = now;
    this.storage.save();
    this.images.commit(input.imageIds);
    const controller = new AbortController();
    this.controller = controller;
    let complete!: () => void;
    this.finished = new Promise<void>((resolve) => { complete = resolve; });
    emit({ type: 'started', conversation });
    try {
      await AIProviderFactory.create(connection, key).sendMessage({
        messages: history, signal: controller.signal, imageData: (id) => this.images.dataUrl(id),
        onDelta: (text) => {
          assistant.content += text;
          emit({ type: 'delta', conversationId: conversation.id, messageId: assistant.id, text });
        },
      });
      assistant.status = 'complete';
    } catch (error) {
      assistant.status = controller.signal.aborted ? 'stopped' : 'error';
      if (assistant.status === 'error') assistant.error = error instanceof UserError ? error.message : 'Unable to connect to the AI provider.';
      if (process.env.NODE_ENV === 'development') console.warn('[Novi] Provider request ended:', assistant.status, error instanceof Error ? error.name : 'UnknownError');
    } finally {
      this.controller = null;
      conversation.updatedAt = Date.now();
      try { this.storage.save(); }
      catch { assistant.error = 'This response could not be saved. Check your available disk space.'; assistant.status = 'error'; }
      try { emit({ type: 'finished', conversation }); }
      finally { complete(); }
    }
  }
}

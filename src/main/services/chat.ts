import { modeInstructions } from '../../shared/sessionModes';
import { randomUUID } from 'node:crypto';
import type { ChatEvent, ChatMessage, ChatLatency, SendInput } from '../../shared/types';
import { Storage } from './storage';
import { CredentialStore } from './credentials';
import { ImageService } from './images';
import { AIProviderFactory } from './providers';
import { conversationTitle, sendInput, UserError } from './validation';
import { activeConnection } from '../../shared/providers';
import type { ContextService } from './context';
import { contextMessages, requestHistory } from './requestContext';
import type { LocalCodingService } from './localCoding';

export class ChatService {
  private controller: AbortController | null = null;
  private finished: Promise<void> = Promise.resolve();
  constructor(private storage: Storage, private credentials: CredentialStore, private images: ImageService, private context?: ContextService, private localCoding?: LocalCodingService) {}
  get busy() { return this.controller !== null; }
  assertIdle() { if (this.busy) throw new UserError('Stop the current response first.'); }
  stop() { this.controller?.abort(); }
  async stopAndWait() { this.stop(); await this.finished; }
  async send(value: unknown, emit: (event: ChatEvent) => void, timing: ChatLatency = {}) {
    this.assertIdle();
    const input = sendInput(value), user = this.storage.current();
    if (!user.settings.onboardingComplete) throw new UserError('Complete your AI setup first.');
    if (input.appMode === 'local-coding') return this.sendLocalCoding(input, emit);
    const connection = this.context?.assertActive().connection ?? activeConnection(user.settings);
    if (!connection) throw new UserError('Choose a provider in Settings.');
    const key = this.credentials.get(user.id, connection);
    if (connection.provider !== 'compatible' && !key) throw new UserError('Add this provider’s API key in Settings.');
    let conversation = this.storage.conversations.find((item) => item.id === input.conversationId);
    if (input.conversationId && !conversation) throw new UserError('This conversation could not be found.');
    if (conversation?.localCoding) throw new UserError('This is a Local Coding conversation. Switch to Local Coding, or start a new conversation.');
    const images = input.imageIds.map((id) => this.images.resolve(id));
    if (connection.provider !== 'gemini' && images.some((image) => image.mimeType.startsWith('audio/')))
      throw new UserError('Audio attachments require a Gemini connection. Use speech to text with this model.');
    const now = Date.now();
    if (!conversation) {
      conversation = { id: randomUUID(), title: conversationTitle(input.content), createdAt: now, updatedAt: now, messages: [] };
      this.storage.conversations.push(conversation);
    }
    if (!conversation.context && this.context?.session?.status === 'ready') conversation.context = this.context.savedContext;
    if (input.pinnedContext !== undefined) conversation.pinnedContext = input.pinnedContext;
    conversation.messages.push({ id: randomUUID(), role: 'user', content: input.content, images, createdAt: now });
    const context = conversation.context;
    const history = [
      ...(context ? contextMessages(context, input.content, input.compactContext === true) : []),
      ...requestHistory(conversation.messages, input.compactContext),
    ];
    const instructions = [modeInstructions(input.appMode ?? 'normal', input.behavioralFramework),
      conversation.pinnedContext ? `User-pinned constraints (retain verbatim):\n${conversation.pinnedContext}` : '',
      input.compactContext ? 'Some older turns and source passages may be omitted. Do not infer missing facts from an overview. Ask for full context if needed.' : '',
    ].filter(Boolean).join('\n\n');
    const latency: ChatLatency = { ...timing, requestCharacters: instructions.length + history.reduce((sum, message) => sum + message.content.length, 0), requestMessages: history.length };
    const assistant: ChatMessage = { id: randomUUID(), role: 'assistant', content: '', createdAt: now, providerName: connection.name, model: connection.model, latency };
    conversation.messages.push(assistant);
    conversation.updatedAt = now;
    this.storage.save();
    this.images.commit(input.imageIds);
    const controller = new AbortController();
    this.controller = controller;
    let complete!: () => void;
    this.finished = new Promise<void>((resolve) => { complete = resolve; });
    emit({ type: 'started', conversation });
    const providerStart = performance.now();
    let firstText: number | undefined, lastText: number | undefined;
    try {
      await AIProviderFactory.create(connection, key).sendMessage({
        messages: history, instructions, signal: controller.signal, imageData: (id) => this.images.dataUrl(id),
        onUsage: usage => {
          latency.usage ||= {};
          for (const field of ['input', 'cachedInput', 'cacheWrite', 'reasoning', 'output'] as const) {
            const count = usage[field];
            if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) latency.usage[field] = count;
          }
        },
        onDelta: (text) => {
          if (text) {
            lastText = performance.now();
            firstText ??= lastText;
            latency.providerFirstTextMs ??= firstText - providerStart;
            // A Unicode letter/number is a reproducible proxy, not a semantic usefulness claim.
            if (/[\p{L}\p{N}]/u.test(text)) latency.providerFirstUsefulTextMs ??= lastText - providerStart;
          }
          assistant.content += text;
          emit({ type: 'delta', conversationId: conversation.id, messageId: assistant.id, text });
        },
      });
      assistant.status = 'complete';
    } catch (error) {
      assistant.status = controller.signal.aborted ? 'stopped' : 'error';
      if (assistant.status === 'error') assistant.error = error instanceof UserError ? error.message
        : error instanceof Error && error.name === 'TimeoutError' ? 'The model took too long to respond. Try a smaller request or a faster model.'
        : 'Unable to connect to the AI provider.';
      if (process.env.NODE_ENV === 'development') console.warn('[Novi] Provider request ended:', assistant.status, error instanceof Error ? error.name : 'UnknownError');
    } finally {
      latency.providerTotalMs = performance.now() - providerStart;
      if (firstText !== undefined && lastText !== undefined) latency.firstToLastTextMs = lastText - firstText;
      console.info('[Novi latency]', { stage: 'chat', outcome: assistant.status, ...latency });
      this.controller = null;
      conversation.updatedAt = Date.now();
      try { this.storage.save(); }
      catch { assistant.error = 'This response could not be saved. Check your available disk space.'; assistant.status = 'error'; }
      try { emit({ type: 'finished', conversation }); }
      finally { complete(); }
    }
  }

  /** Local Coding shares this lifecycle (busy state, stop, saving, events) but runs a read-only coding engine. */
  private async sendLocalCoding(input: SendInput, emit: (event: ChatEvent) => void) {
    if (!this.localCoding) throw new UserError('Local Coding is unavailable.');
    const conversation = this.storage.conversations.find((item) => item.id === input.conversationId);
    if (!conversation?.localCoding) throw new UserError('Start a Local Coding session first: choose a working folder in Local Coding.');
    if (!input.localCoding) throw new UserError('Choose which version the request should use.');
    if (!input.content.trim()) throw new UserError('Write what you want the coding engine to do.');
    const images = input.imageIds.map((id) => this.images.resolve(id));
    const now = Date.now();
    if (input.pinnedContext !== undefined) conversation.pinnedContext = input.pinnedContext;
    const userMessage: ChatMessage = { id: randomUUID(), role: 'user', content: input.content, images, createdAt: now };
    const assistant: ChatMessage = { id: randomUUID(), role: 'assistant', content: '', createdAt: now };
    conversation.messages.push(userMessage, assistant);
    conversation.updatedAt = now;
    this.storage.save();
    this.images.commit(input.imageIds);
    const controller = new AbortController();
    this.controller = controller;
    let complete!: () => void;
    this.finished = new Promise<void>((resolve) => { complete = resolve; });
    emit({ type: 'started', conversation });
    try {
      await this.localCoding.run({
        conversation, user: userMessage, assistant, baseVersionId: input.localCoding.baseVersionId, reconcile: input.localCoding.reconcile, imageIds: input.imageIds,
        signal: controller.signal, emit, save: () => this.storage.save(),
      });
      assistant.status ||= 'complete';
    } catch (error) {
      assistant.status = controller.signal.aborted ? 'stopped' : 'error';
      if (assistant.status === 'error') assistant.error = error instanceof UserError ? error.message : 'Local Coding could not start this request.';
    } finally {
      this.controller = null;
      conversation.updatedAt = Date.now();
      try { this.storage.save(); }
      catch { assistant.error = 'This result could not be saved. Check your available disk space; earlier iterations are unchanged.'; assistant.status = 'error'; }
      try { emit({ type: 'finished', conversation }); }
      finally { complete(); }
    }
  }
}

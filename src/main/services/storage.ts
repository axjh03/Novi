import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, DEFAULT_TRANSPARENT_SHORTCUT, LEGACY_TRANSPARENT_SHORTCUT, type AIProviderConfig, type AppSettings, type Conversation, type SavedContext, type User } from '../../shared/types';
import { PROVIDERS } from '../../shared/providers.ts';
import { text, UserError } from './validation.ts';

export interface Account extends User { salt: string; passwordHash: string; settings: AppSettings; conversations: Conversation[] }
interface Database { version: 1 | 2 | 3; currentUserId: string | null; accounts: Account[]; contextDocuments?: Record<string, SavedContext['documents']> }
type StoredContext = SavedContext & { documentsId?: string };
export function readJSON<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; }
  catch { throw new UserError('Local data could not be read. Your files have been preserved. Restore a backup before continuing.'); }
}
export function atomicJSON(file: string, value: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
export class Storage {
  // shortcut: message history is whole-file JSON; move messages to SQLite if histories alone become large.
  readonly file: string;
  data: Database;
  // Captured reference arrays are immutable and shared by conversations.
  private documentIds = new WeakMap<SavedContext['documents'], string>();
  // Only the context-loading exchange is temporary; normal chats use account history.
  sessionConversations: Conversation[] | null = null;
  get conversations(): Conversation[] { return this.sessionConversations ?? this.current().conversations; }
  set conversations(value: Conversation[]) {
    if (this.sessionConversations !== null) this.sessionConversations = value;
    else this.current().conversations = value;
  }
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, 'data.json');
    this.data = readJSON<Database>(this.file, { version: 3, currentUserId: null, accounts: [] });
    if (![1, 2, 3].includes(this.data.version) || !Array.isArray(this.data.accounts)) throw new UserError('Unsupported local data format. Your files have been preserved.');
    for (const user of this.data.accounts) {
      user.settings.clickThroughShortcut ||= DEFAULT_CLICK_THROUGH_SHORTCUT;
      user.settings.audioPipelineMode ||= 'local_stt';
      user.settings.codingModeShortcut ||= 'Alt+C';
      user.settings.behavioralModeShortcut ||= 'Alt+B';
      user.settings.screenshotShortcut ||= 'Alt+3';
      user.settings.audioRecordShortcut ||= 'Alt+A';
      if (!user.settings.transparentShortcut || (process.platform !== 'darwin' && user.settings.transparentShortcut === LEGACY_TRANSPARENT_SHORTCUT)) user.settings.transparentShortcut = DEFAULT_TRANSPARENT_SHORTCUT;
      user.settings.transparentOpacity ||= 35;
      user.settings.transparentBg ||= '#0f172a';
      user.settings.checkUpdatesAtStartup = user.settings.checkUpdatesAtStartup ?? true;
      user.settings.autoStartEmptySession = user.settings.autoStartEmptySession ?? false;
      if (this.data.version === 1) {
        const old = user.settings as AppSettings & { ai?: AIProviderConfig };
        old.connections = old.ai && old.onboardingComplete ? [{ ...old.ai, id: 'legacy', name: PROVIDERS[old.ai.provider].name }] : [];
        old.activeConnectionId = old.connections[0]?.id || null;
        delete old.ai;
      }
      for (const conversation of user.conversations) {
        const context = conversation.context as StoredContext | undefined;
        if (context?.documentsId !== undefined) {
          const documents = this.data.contextDocuments?.[context.documentsId];
          if (!/^[a-f0-9]{64}$/.test(context.documentsId) || !Array.isArray(documents)) throw new UserError('Saved reference documents could not be read. Your files have been preserved.');
          context.documents = documents;
          this.documentIds.set(documents, context.documentsId);
          delete context.documentsId;
        }
        for (const message of conversation.messages) {
          if (message.role === 'assistant' && !message.status) message.status = 'stopped';
        }
      }
    }
    delete this.data.contextDocuments;
    if (this.data.version === 1) this.save();
  }
  renameConversation(id: unknown, title: unknown): Conversation {
    const conversationId = text(id, 'conversation ID', 100);
    const name = text(title, 'conversation name', 100);
    const conversation = this.conversations.find(item => item.id === conversationId);
    if (!conversation) throw new UserError('This conversation could not be found.');
    conversation.title = name;
    this.save();
    return conversation;
  }
  save() {
    const contextDocuments: Record<string, SavedContext['documents']> = {};
    const accounts = this.data.accounts.map(account => ({ ...account, conversations: account.conversations.map(conversation => {
      const context = conversation.context;
      if (!context?.documents.length) return conversation;
      let id = this.documentIds.get(context.documents);
      if (!id) {
        id = createHash('sha256').update(JSON.stringify(context.documents)).digest('hex');
        this.documentIds.set(context.documents, id);
      }
      contextDocuments[id] = context.documents;
      return { ...conversation, context: { ...context, documents: [], documentsId: id } };
    }) }));
    atomicJSON(this.file, { ...this.data, version: 3, accounts, contextDocuments });
    this.data.version = 3;
  }
  current(): Account {
    const account = this.data.accounts.find((user) => user.id === this.data.currentUserId);
    if (!account) throw new UserError('Sign in to continue.');
    return account;
  }
}

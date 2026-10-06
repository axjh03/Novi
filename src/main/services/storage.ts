import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, type AIProviderConfig, type AppSettings, type Conversation, type User } from '../../shared/types';
import { PROVIDERS } from '../../shared/providers.ts';
import { UserError } from './validation.ts';

export interface Account extends User { salt: string; passwordHash: string; settings: AppSettings; conversations: Conversation[] }
interface Database { version: 1 | 2; currentUserId: string | null; accounts: Account[] }
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
  // ponytail: whole-file JSON suits small histories; use SQLite when write size becomes noticeable.
  readonly file: string;
  data: Database;
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
    this.data = readJSON<Database>(this.file, { version: 2, currentUserId: null, accounts: [] });
    if (![1, 2].includes(this.data.version) || !Array.isArray(this.data.accounts)) throw new UserError('Unsupported local data format. Your files have been preserved.');
    for (const user of this.data.accounts) {
      user.settings.clickThroughShortcut ||= DEFAULT_CLICK_THROUGH_SHORTCUT;
      user.settings.audioPipelineMode ||= 'local_stt';
      user.settings.codingModeShortcut ||= 'Alt+C';
      user.settings.behavioralModeShortcut ||= 'Alt+B';
      user.settings.screenshotShortcut ||= 'Alt+3';
      user.settings.audioRecordShortcut ||= 'Alt+A';
      user.settings.transparentOpacity ||= 35;
      user.settings.transparentBg ||= '#0f172a';
      user.settings.checkUpdatesAtStartup = user.settings.checkUpdatesAtStartup ?? true;
      if (this.data.version === 1) {
        const old = user.settings as AppSettings & { ai?: AIProviderConfig };
        old.connections = old.ai && old.onboardingComplete ? [{ ...old.ai, id: 'legacy', name: PROVIDERS[old.ai.provider].name }] : [];
        old.activeConnectionId = old.connections[0]?.id || null;
        delete old.ai;
      }
      for (const conversation of user.conversations) {
        for (const message of conversation.messages) {
          if (message.role === 'assistant' && !message.status) message.status = 'stopped';
        }
      }
    }
    if (this.data.version === 1) { this.data.version = 2; this.save(); }
  }
  save() { atomicJSON(this.file, this.data); }
  current(): Account {
    const account = this.data.accounts.find((user) => user.id === this.data.currentUserId);
    if (!account) throw new UserError('Sign in to continue.');
    return account;
  }
}

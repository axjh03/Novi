import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, type User } from '../../shared/types';
import { Storage } from './storage.ts';
import { emailAddress, passwordValue, text, UserError } from './validation.ts';

export interface AuthService {
  signIn(email: string, password: string): Promise<User>;
  signUp(name: string, email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
}
export const publicUser = ({ id, name, email }: User): User => ({ id, name, email });
export class LocalAuthService implements AuthService {
  constructor(private storage: Storage) {}
  async signIn(email: string, password: string) {
    email = emailAddress(email); password = passwordValue(password);
    const account = this.storage.data.accounts.find((item) => item.email === email);
    const hash = scryptSync(password, account?.salt || 'novi-unknown-user', 64);
    if (!account || !timingSafeEqual(hash, Buffer.from(account.passwordHash, 'hex'))) throw new UserError('Email or password is incorrect.');
    this.storage.data.currentUserId = account.id;
    this.storage.save();
    return publicUser(account);
  }
  async signUp(name: string, email: string, password: string) {
    name = text(name, 'name', 60); email = emailAddress(email); password = passwordValue(password);
    if (this.storage.data.accounts.some((item) => item.email === email)) throw new UserError('An account with that email already exists on this device.');
    const salt = randomBytes(16).toString('hex');
    const account = {
      id: randomUUID(), name, email, salt, passwordHash: scryptSync(password, salt, 64).toString('hex'),
      settings: {
        displayName: name, theme: 'system' as const, clickThroughShortcut: DEFAULT_CLICK_THROUGH_SHORTCUT, onboardingComplete: false,
        connections: [], activeConnectionId: null,
      },
      conversations: [],
    };
    this.storage.data.accounts.push(account);
    this.storage.data.currentUserId = account.id;
    this.storage.save();
    return publicUser(account);
  }
  async signOut() { this.storage.data.currentUserId = null; this.storage.save(); }
  async getCurrentUser() {
    const account = this.storage.data.accounts.find((item) => item.id === this.storage.data.currentUserId);
    return account ? publicUser(account) : null;
  }
}

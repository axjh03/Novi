import { randomInt } from 'node:crypto';

export const roles = ['ADMIN', 'STANDALONE', 'CORP', 'SUBCORP', 'LICENSE'] as const;
export const providers = {
  OPENAI: { name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1' },
  ANTHROPIC: { name: 'Anthropic / Claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  GEMINI: { name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  KIMI: { name: 'Kimi (Moonshot AI)', kind: 'compatible', baseUrl: 'https://api.moonshot.cn/v1' },
} as const;
export class AccessError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function string(value: unknown, label: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AccessError(`Enter a valid ${label}.`);
  return value.trim();
}
export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value) > 72) throw new AccessError('Passwords need at least 12 characters and at most 72 bytes.');
  return value;
}
export function durationDate(from: Date, amount: unknown, unit: unknown) {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 3650 || !['DAYS', 'MONTHS', 'YEARS'].includes(String(unit))) throw new AccessError('Choose a duration between 1 and 3,650 days, months, or years.');
  const date = new Date(from);
  if (unit === 'DAYS') date.setUTCDate(date.getUTCDate() + amount);
  else {
    const day = date.getUTCDate(); date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount * (unit === 'YEARS' ? 12 : 1));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return date;
}
export function licenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('')).join('-');
}
export function validParent(role: string, parentRole?: string) {
  return (['STANDALONE', 'CORP'].includes(role) && !parentRole) || (role === 'SUBCORP' && parentRole === 'CORP') || (role === 'LICENSE' && ['STANDALONE', 'SUBCORP'].includes(parentRole || ''));
}

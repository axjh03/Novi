import { isAppMode } from '../../shared/sessionModes';
import { isShortcut, sameShortcut } from '../../shared/shortcuts';
import { DEFAULT_CLICK_THROUGH_SHORTCUT, DEFAULT_TRANSPARENT_SHORTCUT, type ConnectionInput, type ProviderKind, type SettingsInput, type SendInput } from '../../shared/types';
import { PROVIDERS } from '../../shared/providers.ts';

export class UserError extends Error {}
export function text(value: unknown, label: string, max: number, optional = false): string {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
    throw new UserError(`Enter a valid ${label}${max < 1000 ? ` (up to ${max} characters)` : ''}.`);
  }
  return value.trim();
}
/**
 * The only websites Novi opens in the user's browser: the OpenAI, Anthropic and Google AI Studio
 * API key pages (Settings › API Management) and the BlackHole audio driver page (Settings › Local AI).
 * Electron's security checklist advises against passing untrusted text to shell.openExternal, which
 * could otherwise launch any registered program or URL scheme. Add a host here when the app gains a link.
 */
const EXTERNAL_HOSTS = new Set(['platform.openai.com', 'console.anthropic.com', 'aistudio.google.com', 'existential.audio']);

/**
 * Checks an address the renderer asked to open in the browser.
 *
 * @param value the address from the renderer (untrusted).
 * @returns the normalized https address, safe to pass to shell.openExternal.
 * @throws UserError unless it is https, on one of EXTERNAL_HOSTS, with no user name, password or port.
 */
export function externalUrl(value: unknown): string {
  const refuse = () => new UserError('Novi only opens its own help and key pages in your browser.');
  if (typeof value !== 'string' || value.length > 2000) throw refuse();
  let url: URL;
  try { url = new URL(value); } catch { throw refuse(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !EXTERNAL_HOSTS.has(url.hostname)) throw refuse();
  return url.href;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserError('Invalid request.');
  return value as Record<string, unknown>;
}
export function emailAddress(value: unknown): string {
  const email = text(value, 'email address', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid email address.');
  return email;
}
export function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new UserError('Use a password between 8 and 128 characters.');
  }
  return value;
}
export function baseUrl(value: unknown): string {
  const input = text(value, 'API base URL', 2048);
  let url: URL;
  try { url = new URL(input); } catch { throw new UserError('Enter a valid API base URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new UserError('Use HTTPS, or HTTP for a local server. Do not include credentials, query parameters, or fragments.');
  }
  return url.href.replace(/\/+$/, '');
}
export function settingsInput(value: unknown): SettingsInput {
  const input = object(value);
  if (!['system', 'light', 'dark'].includes(String(input.theme))) throw new UserError('Choose a valid theme.');
  const shortcut = input.clickThroughShortcut === undefined ? DEFAULT_CLICK_THROUGH_SHORTCUT : text(input.clickThroughShortcut, 'click-through shortcut', 60);
  if (!isShortcut(shortcut)) throw new UserError('Use a supported key combination with at least one modifier.');
  const transparentShortcut = typeof input.transparentShortcut === 'string' && input.transparentShortcut.trim() ? input.transparentShortcut.trim() : DEFAULT_TRANSPARENT_SHORTCUT;
  if (sameShortcut(shortcut, transparentShortcut)) throw new UserError('The interaction and transparency shortcuts must be different.');
  return {
    displayName: text(input.displayName, 'display name', 60),
    theme: input.theme as SettingsInput['theme'],
    clickThroughShortcut: shortcut,
    connection: input.connection === undefined ? undefined : connectionInput(input.connection),
    audioPipelineMode: ['local_stt', 'live_stream'].includes(String(input.audioPipelineMode))
      ? (input.audioPipelineMode as SettingsInput['audioPipelineMode'])
      : 'local_stt',
    codingModeShortcut: typeof input.codingModeShortcut === 'string' && input.codingModeShortcut.trim() ? input.codingModeShortcut.trim() : 'Alt+C',
    behavioralModeShortcut: typeof input.behavioralModeShortcut === 'string' && input.behavioralModeShortcut.trim() ? input.behavioralModeShortcut.trim() : 'Alt+B',
    screenshotShortcut: typeof input.screenshotShortcut === 'string' && input.screenshotShortcut.trim() ? input.screenshotShortcut.trim() : 'Alt+3',
    audioRecordShortcut: typeof input.audioRecordShortcut === 'string' && input.audioRecordShortcut.trim() ? input.audioRecordShortcut.trim() : 'Alt+A',
    transparentShortcut,
    fastInterviewModel: typeof input.fastInterviewModel === 'boolean' ? input.fastInterviewModel : false,
    transparentOpacity: typeof input.transparentOpacity === 'number' ? Math.max(20, Math.min(100, input.transparentOpacity)) : 35,
    transparentBg: typeof input.transparentBg === 'string' && input.transparentBg.trim() ? input.transparentBg.trim() : '#0f172a',
    workingMonitorId: typeof input.workingMonitorId === 'number' ? input.workingMonitorId : null,
    behavioralFramework: ['smart', 'star', 'car', 'par', 'soar'].includes(String(input.behavioralFramework))
      ? (input.behavioralFramework as any)
      : 'smart',
    checkUpdatesAtStartup: typeof input.checkUpdatesAtStartup === 'boolean' ? input.checkUpdatesAtStartup : true,
    autoStartEmptySession: typeof input.autoStartEmptySession === 'boolean' ? input.autoStartEmptySession : false,
    localASRModelId: typeof input.localASRModelId === 'string' && /^[a-z0-9-]{1,80}$/.test(input.localASRModelId) ? input.localASRModelId : 'auto',
  };
}
export function connectionInput(value: unknown): ConnectionInput {
  const input = object(value), ai = object(input.ai);
  if (typeof ai.provider !== 'string' || !Object.hasOwn(PROVIDERS, ai.provider)) throw new UserError('Choose a supported provider.');
  const provider = ai.provider as ProviderKind;
  if (typeof ai.stream !== 'boolean') throw new UserError('Invalid streaming setting.');
  const model = text(ai.model ?? '', 'model selection', 200, true);
  if (/[\r\n\x00]/.test(model)) throw new UserError('Enter a valid model ID.');
  return {
    id: input.id === undefined ? undefined : text(input.id, 'connection ID', 100),
    name: text(input.name, 'connection name', 60),
    ai: {
      provider, baseUrl: provider === 'compatible' ? baseUrl(ai.baseUrl) : PROVIDERS[provider].baseUrl,
      model, stream: ai.stream,
    },
    apiKey: input.apiKey === undefined ? undefined : text(input.apiKey, 'API key', 4096, true),
  };
}
export function sendInput(value: unknown): SendInput {
  const input = object(value);
  const content = text(input.content, 'message', 100_000, true);
  if (!Array.isArray(input.imageIds) || input.imageIds.length > 6) throw new UserError('Attach up to 6 images per message.');
  const imageIds = input.imageIds.map((id) => text(id, 'image ID', 100));
  if (!content && !imageIds.length) throw new UserError('Write a message or attach an image.');
  if (input.appMode !== undefined && !isAppMode(input.appMode)) throw new UserError('Choose a valid mode.');
  if (input.behavioralFramework !== undefined && !['smart', 'star', 'car', 'par', 'soar'].includes(String(input.behavioralFramework))) throw new UserError('Choose a valid interview framework.');
  if (input.compactContext !== undefined && typeof input.compactContext !== 'boolean') throw new UserError('Choose a valid context option.');
  return {
    content, imageIds,
    compactContext: input.compactContext === true,
    ...(input.pinnedContext === undefined ? {} : { pinnedContext: text(input.pinnedContext, 'pinned constraints', 8000, true) }),
    ...(typeof input.sentAt === 'number' && Number.isFinite(input.sentAt) ? { sentAt: input.sentAt } : {}),
    conversationId: input.conversationId === null ? null : text(input.conversationId, 'conversation ID', 100),
    ...(input.appMode === undefined ? {} : { appMode: input.appMode as SendInput['appMode'] }),
    ...(input.behavioralFramework === undefined ? {} : { behavioralFramework: input.behavioralFramework as SendInput['behavioralFramework'] }),
    ...(input.localCoding === undefined ? {} : { localCoding: localCodingInput(input.localCoding) }),
  };
}
function localCodingInput(value: unknown): NonNullable<SendInput['localCoding']> {
  const input = object(value);
  const baseVersionId = text(input.baseVersionId, 'version', 40);
  if (input.reconcile === undefined) return { baseVersionId };
  const reconcile = object(input.reconcile);
  if (!Array.isArray(reconcile.fileIds) || !reconcile.fileIds.length || reconcile.fileIds.length > 50) throw new UserError('Choose 1–50 files to reconcile.');
  return { baseVersionId, reconcile: { fromVersionId: text(reconcile.fromVersionId, 'version', 40), fileIds: reconcile.fileIds.map((id) => text(id, 'file', 40)) } };
}
export function conversationTitle(content: string): string {
  const title = content.trim().replace(/^#{1,6}\s+/, '').replace(/\s+/g, ' ');
  if (!title) return 'Image conversation';
  if (title.length <= 60) return title;
  const end = title.lastIndexOf(' ', 57);
  return `${title.slice(0, end > 20 ? end : 57)}…`;
}

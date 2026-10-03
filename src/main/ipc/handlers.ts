import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import type { Snapshot } from '../../shared/types';
import { Storage } from '../services/storage';
import { LocalAuthService } from '../services/auth';
import { CredentialStore } from '../services/credentials';
import { ImageService } from '../services/images';
import { ChatService } from '../services/chat';
import { connectionInput, object, settingsInput, text, UserError } from '../services/validation';
import { ConnectionService } from '../services/connections';
import { listModels } from '../services/models';
import { OverlayService } from '../services/overlay';
import { ContextService } from '../services/context';

export function registerIPC(rendererUrl: string, preloadPath = '') {
  // Lazy initialization lets the UI explain disk/keychain failures instead of crashing at startup.
  let services: ReturnType<typeof initialize> | undefined;
  function initialize() {
    const storage = new Storage(app.getPath('userData'));
    const credentials = new CredentialStore(storage.directory);
    const images = new ImageService(storage);
    const overlay = new OverlayService();
    const context = new ContextService(storage);
    return { storage, credentials, images, context, connections: new ConnectionService(storage, credentials), auth: new LocalAuthService(storage), chat: new ChatService(storage, credentials, images, context), overlay };
  }
  const get = () => services ||= initialize();
  const requireNoContext = () => { if (get().context.session) throw new UserError('End this session before changing accounts or AI providers.'); };
  async function snapshot(): Promise<Snapshot> {
    const { storage, auth, credentials } = get();
    const user = await auth.getCurrentUser();
    if (!user) return { user: null, settings: null, credentialIds: [], conversations: [] };
    const account = storage.current();
    return { user, settings: account.settings, credentialIds: account.settings.connections.filter((c) => credentials.has(user.id, c)).map((c) => c.id), conversations: get().context.session ? get().storage.conversations : [], contextSession: get().context.session };
  }
  const handle = (channel: string, callback: (value: unknown, event: Electron.IpcMainInvokeEvent) => unknown) => {
    ipcMain.handle(channel, async (event, value: unknown) => {
      try {
        const frameUrl = event.senderFrame?.url || '';
        const baseTarget = rendererUrl.split('#')[0];
        const baseSender = frameUrl.split('#')[0];
        const isTrusted = baseSender === baseTarget;
        if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isTrusted) throw new UserError('Untrusted application request.');
        return { ok: true, value: await callback(value, event) };
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.warn(`[Novi] ${channel}:`, error instanceof Error ? error.name : 'UnknownError');
        return { ok: false, error: error instanceof UserError ? error.message : 'Novi could not complete that action. Check file access and available disk space, then try again.' };
      }
    });
  };
  handle('session', snapshot);
  handle('sign-in', async (value) => { requireNoContext(); get().chat.assertIdle(); const v = object(value); await get().auth.signIn(v.email as string, v.password as string); return snapshot(); });
  handle('sign-up', async (value) => { requireNoContext(); get().chat.assertIdle(); const v = object(value); await get().auth.signUp(v.name as string, v.email as string, v.password as string); return snapshot(); });
  async function endContext() {
    const { chat, context, images, overlay } = get();
    if (context.session) context.session.status = 'ending';
    await chat.stopAndWait();
    await context.initialization?.catch(() => {});
    context.end(); images.clearPending(); overlay.closeOverlay();
  }
  handle('sign-out', async () => { await endContext(); await get().auth.signOut(); });
  handle('pick-context-folders', async (_value, event) => {
    get().storage.current(); get().chat.assertIdle();
    if (get().context.session) throw new UserError('End your session before loading folders.');
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new UserError('Application window is unavailable.');
    const result = await dialog.showOpenDialog(window, { title: 'Load context folders', properties: ['openDirectory', 'multiSelections'] });
    return result.canceled ? [] : get().context.loadFolders(result.filePaths);
  });
  handle('start-context', async (value) => { get().chat.assertIdle(); get().context.begin(value); return snapshot(); });
  handle('initialize-context', async (_value, event) => {
    const { context, chat } = get();
    const session = context.assertActive();
    if (!context.initialization && session.status === 'pending') {
      session.status = 'loading';
      const stop = () => chat.stop();
      event.sender.once('destroyed', stop);
      context.initialization = chat.send({ conversationId: null, content: context.prompt, imageIds: [] }, (data) => {
        if (!event.sender.isDestroyed()) event.sender.send('chat-event', data);
      }).then(() => context.completeInitialization()).catch((error) => { session.status = 'error'; throw error; })
        .finally(() => event.sender.removeListener('destroyed', stop));
    }
    await context.initialization;
    return snapshot();
  });
  handle('end-context', async () => { get().storage.current(); await endContext(); return snapshot(); });
  handle('settings', async (value) => {
    const { storage, connections, chat } = get(); chat.assertIdle();
    const input = settingsInput(value), user = storage.current();
    if (input.connection) { requireNoContext(); connections.save(input.connection); }
    if (!user.settings.connections.length) throw new UserError('Add an AI provider first.');
    user.name = input.displayName;
    user.settings = { ...user.settings, displayName: input.displayName, theme: input.theme, onboardingComplete: true };
    storage.save(); return snapshot();
  });
  handle('save-connection', async (value) => { requireNoContext(); get().chat.assertIdle(); get().connections.save(value); return snapshot(); });
  handle('remove-connection', async (value) => { requireNoContext(); get().chat.assertIdle(); get().connections.remove(value); return snapshot(); });
  handle('select-connection', async (value) => { requireNoContext(); get().chat.assertIdle(); const input = object(value); get().connections.select(input.id, input.model); return snapshot(); });
  handle('list-models', (value) => { const input = connectionInput(value, true); return listModels(input.ai, get().connections.resolveKey(input)); });
  handle('delete-conversation', (value) => {
    const { storage, images, chat } = get(); chat.assertIdle();
    const id = text(value, 'conversation ID', 100); get().context.assertActive();
    storage.conversations = storage.conversations.filter((item) => item.id !== id); storage.save(); images.prune();
  });
  handle('clear-history', () => { const { storage, images, chat, context } = get(); chat.assertIdle(); context.assertActive(); storage.conversations = []; storage.save(); images.prune(); });
  handle('pick-images', async (_value, event) => {
    get().storage.current();
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new UserError('The application window is unavailable.');
    const result = await dialog.showOpenDialog(window, { title: 'Attach images', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    return result.canceled ? [] : get().images.import(result.filePaths);
  });
  handle('drop-images', (value) => get().images.import(value));
  handle('preview-image', (value) => get().images.preview(text(value, 'image ID', 100)));
  handle('copy-text', (value) => { get().storage.current(); text(value, 'clipboard text', 1_000_000, true); clipboard.writeText(value as string); });
  handle('send', (value, event) => {
    const { chat } = get();
    if (get().context.assertActive().status !== 'ready') throw new UserError('Wait for context confirmation, or end this session and retry loading.');
    const stop = () => chat.stop();
    event.sender.once('destroyed', stop);
    return chat.send(value, (data) => { if (!event.sender.isDestroyed()) event.sender.send('chat-event', data); }).finally(() => event.sender.removeListener('destroyed', stop));
  });
  handle('stop', () => { get().storage.current(); get().chat.stop(); });
  handle('get-monitors', () => get().overlay.getDisplays());
  handle('open-overlay', (value) => {
    const v = object(value);
    get().overlay.openOverlay(Number(v.displayId), rendererUrl, preloadPath);
  });
  handle('close-overlay', () => { get().overlay.closeOverlay(); });
  handle('set-overlay-ignore-mouse', (value) => {
    const v = object(value);
    get().overlay.setIgnoreMouse(Boolean(v.ignore));
  });
  handle('send-overlay-event', (value) => {
    get().overlay.forwardToAllWindows(value as any);
  });
  app.on('before-quit', () => {
    services?.chat.stop();
    services?.context.end();
    services?.images.clearPending();
    services?.overlay.closeOverlay();
  });
  app.on('browser-window-created', (_event, window) => {
    window.on('close', () => {
      if (!window.webContents.getURL().includes('#/overlay')) void endContext().catch(() => {});
    });
  });
}

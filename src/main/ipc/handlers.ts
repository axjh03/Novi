import { app, BrowserWindow, clipboard, dialog, ipcMain, screen } from 'electron';
import type { CodeViewerBlock, Snapshot } from '../../shared/types';
import { Storage } from '../services/storage';
import { ManagedAuthService } from '../services/managedAuth';
import { CredentialStore } from '../services/credentials';
import { ImageService } from '../services/images';
import { ChatService } from '../services/chat';
import { connectionInput, object, settingsInput, text, UserError } from '../services/validation';
import { ConnectionService } from '../services/connections';
import { listModels, testConnection } from '../services/models';
import { OverlayService } from '../services/overlay';
import { ContextService } from '../services/context';
import { StealthService } from '../services/stealth';
import { AudioService, decodeAudio } from '../services/audio';
import { captureScreenBuffer } from '../services/screenCapture';
import { AudioTranscriptionService } from '../services/audioTranscription';

export function registerIPC(
  rendererUrl: string,
  preloadPath = '',
  getMainWindow: () => BrowserWindow | null = () => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/overlay')) || null,
) {
  // Lazy initialization lets the UI explain disk/keychain failures instead of crashing at startup.
  let services: ReturnType<typeof initialize> | undefined;
  function initialize() {
    const storage = new Storage(app.getPath('userData'));
    const credentials = new CredentialStore(storage.directory);
    const images = new ImageService(storage);
    const overlay = new OverlayService();
    const stealth = new StealthService(getMainWindow, overlay);
    const context = new ContextService(storage);
    const audio = new AudioService(storage.directory);
    const transcription = new AudioTranscriptionService(storage, credentials);
    return { storage, credentials, images, context, audio, transcription, connections: new ConnectionService(storage, credentials), auth: new ManagedAuthService(storage, credentials), chat: new ChatService(storage, credentials, images, context), overlay, stealth };
  }
  const get = () => services ||= initialize();
  const requireNoContext = () => { if (get().context.session) throw new UserError('End this session before changing accounts or AI providers.'); };
  async function snapshot(): Promise<Snapshot> {
    const { storage, auth, credentials } = get();
    const user = await auth.getCurrentUser();
    if (!user) return { user: null, settings: null, credentialIds: [], conversations: [] };
    const account = storage.current();
    get().stealth.setClickThroughShortcut(account.settings.clickThroughShortcut);
    get().stealth.setShortcuts({
      coding: account.settings.codingModeShortcut,
      behavioral: account.settings.behavioralModeShortcut,
      screenshot: account.settings.screenshotShortcut,
      audio: account.settings.audioRecordShortcut
    });
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
        const publicChannels = ['session', 'sign-in', 'sign-out', 'minimize-window', 'maximize-window', 'close-window', 'is-window-maximized', 'get-stealth-state'];
        if (!publicChannels.includes(channel)) {
          try { await get().auth.refresh(['send', 'initialize-context', 'start-context', 'list-models', 'test-connection'].includes(channel)); }
          catch (error) {
            await endContext().catch(() => {});
            await get().auth.signOut();
            for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('session-ended', error instanceof UserError ? error.message : 'Your session has ended.');
            throw error;
          }
        }
        return { ok: true, value: await callback(value, event) };
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.warn(`[Novi] ${channel}:`, error instanceof Error ? error.name : 'UnknownError');
        return { ok: false, error: error instanceof UserError ? error.message : 'Novi could not complete that action. Check file access and available disk space, then try again.' };
      }
    });
  };
  handle('session', snapshot);
  handle('sign-in', async (value) => { requireNoContext(); get().chat.assertIdle(); const v = object(value); await get().auth.signIn(v.username as string, v.password as string); return snapshot(); });
  handle('refresh-managed', async () => { await get().auth.refresh(true); return snapshot(); });
  handle('enable-connection', async (value) => {
    requireNoContext(); get().chat.assertIdle();
    const input = object(value), account = get().storage.current();
    const connection = account.settings.connections.find(c => c.id === text(input.id, 'connection ID', 100));
    if (!connection || typeof input.enabled !== 'boolean') throw new UserError('Choose an available API connection.');
    connection.enabled = input.enabled;
    if (!input.enabled && account.settings.activeConnectionId === connection.id) account.settings.activeConnectionId = account.settings.connections.find(c => c.enabled !== false)?.id || null;
    if (input.enabled && !account.settings.activeConnectionId) account.settings.activeConnectionId = connection.id;
    get().storage.save(); return snapshot();
  });
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
  handle('start-context', async (value) => {
    const { chat, storage, connections, context } = get();
    chat.assertIdle();
    const account = storage.current();
    const connection = account.settings.connections.find(c => c.id === account.settings.activeConnectionId);
    if (!connection?.model) throw new UserError('Choose a provider and model before starting a session.');
    const input = { id: connection.id, name: connection.name, ai: { ...connection } };
    const models = await listModels(input.ai, connections.resolveKey(input));
    if (!models.some(m => m.id === input.ai.model)) throw new UserError('This model is no longer available. Refresh the model list and choose another model.');
    const selected = account.settings.connections.find(c => c.id === input.id);
    if (storage.current() !== account || account.settings.activeConnectionId !== input.id || selected?.model !== input.ai.model || selected.provider !== input.ai.provider || selected.baseUrl !== input.ai.baseUrl || selected.enabled === false) throw new UserError('Your selection changed. Start the session again.');
    chat.assertIdle(); context.begin(value); return snapshot();
  });
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
  handle('test-connection', async () => {
    requireNoContext(); get().chat.assertIdle();
    const { storage, connections } = get();
    const settings = storage.current().settings;
    const connection = settings.connections.find(c => c.id === settings.activeConnectionId);
    if (!connection) throw new UserError('Choose a provider and model first.');
    await testConnection({ ...connection }, connections.resolveKey({ id: connection.id, name: connection.name, ai: connection }));
  });
  handle('settings', async (value) => {
    const { storage, connections, chat } = get(); chat.assertIdle();
    const input = settingsInput(value), user = storage.current();
    if (input.connection) { requireNoContext(); connections.save(input.connection); }
    if (!user.managed && !user.settings.connections.length) throw new UserError('Add an AI provider first.');
    get().stealth.setClickThroughShortcut(input.clickThroughShortcut);
    get().stealth.setShortcuts({
      coding: input.codingModeShortcut,
      behavioral: input.behavioralModeShortcut,
      screenshot: input.screenshotShortcut,
      audio: input.audioRecordShortcut
    });
    user.name = input.displayName;
    user.settings = { ...user.settings, ...input, onboardingComplete: true };
    storage.save(); return snapshot();
  });
  handle('save-connection', async (value) => { requireNoContext(); get().chat.assertIdle(); get().connections.save(value); return snapshot(); });
  handle('remove-connection', async (value) => { requireNoContext(); get().chat.assertIdle(); get().connections.remove(value); return snapshot(); });
  handle('select-connection', async (value) => { requireNoContext(); get().chat.assertIdle(); const input = object(value); get().connections.select(input.id, input.model); return snapshot(); });
  handle('list-models', (value) => { const input = connectionInput(value); return listModels(input.ai, get().connections.resolveKey(input)); });
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
  handle('get-stealth-state', () => get().stealth.getState());
  handle('toggle-transparent', () => get().stealth.toggleTransparent());
  handle('set-transparent', (value) => {
    const v = object(value);
    return get().stealth.setTransparent(Boolean(v.enabled));
  });
  handle('minimize-window', (_value, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  handle('maximize-window', (_value, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    } else {
      win.maximize();
      return true;
    }
  });
  handle('close-window', (_value, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  handle('is-window-maximized', (_value, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
  let codeViewerWindow: BrowserWindow | null = null;
  let codeViewerBlocks: CodeViewerBlock[] = [];
  let codeViewerVisible = false;
  handle('set-code-viewer-visible', (value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can open the code viewer.');
    const visible = object(value).visible === true;
    codeViewerVisible = visible;
    if (!visible) { codeViewerBlocks = []; codeViewerWindow?.hide(); return; }
    if (codeViewerWindow && !codeViewerWindow.isDestroyed()) { codeViewerWindow.show(); codeViewerWindow.focus(); return; }
    const main = getMainWindow();
    if (!main) return;
    const area = screen.getDisplayMatching(main.getBounds()).workArea;
    const width = Math.min(430, area.width);
    const height = Math.min(700, area.height);
    const viewer = new BrowserWindow({
      parent: main,
      x: area.x, y: area.y + Math.round((area.height - height) / 2), width, height,
      minWidth: 300, minHeight: 240, show: false, frame: false, resizable: true, title: 'Novi Code Viewer',
      backgroundColor: '#11151b', autoHideMenuBar: true,
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
    });
    codeViewerWindow = viewer;
    viewer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    viewer.webContents.on('will-navigate', (navigation) => navigation.preventDefault());
    viewer.once('ready-to-show', () => { if (codeViewerVisible) viewer.show(); });
    viewer.on('closed', () => {
      codeViewerWindow = null;
      codeViewerVisible = false;
      codeViewerBlocks = [];
      const currentMain = getMainWindow();
      if (currentMain && !currentMain.isDestroyed()) currentMain.webContents.send('code-viewer-closed');
    });
    main.once('closed', () => { if (!viewer.isDestroyed()) viewer.close(); });
    const url = new URL(rendererUrl);
    url.hash = '/code-viewer';
    void viewer.loadURL(url.href);
  });
  handle('update-code-viewer', (value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can update the code viewer.');
    if (!Array.isArray(value) || value.length > 500 || value.some((block) => !block || typeof block.id !== 'string' || typeof block.label !== 'string' || typeof block.code !== 'string') || JSON.stringify(value).length > 8_000_000) throw new UserError('Code viewer output is too large.');
    codeViewerBlocks = value;
    if (codeViewerWindow && !codeViewerWindow.isDestroyed()) codeViewerWindow.webContents.send('code-viewer-blocks', codeViewerBlocks);
  });
  handle('get-code-viewer-blocks', () => codeViewerBlocks);
  let workingMonitorId: number | null = null;
  handle('capture-screen', async () => {
    if (workingMonitorId === null) {
      try {
        const user = get().storage.current();
        if (typeof user?.settings?.workingMonitorId === 'number') {
          workingMonitorId = user.settings.workingMonitorId;
        }
      } catch {}
    }
    const pngBuffer = await captureScreenBuffer(getMainWindow, workingMonitorId);
    const attachment = get().images.importBuffer(pngBuffer, `Screen-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    return attachment;
  });
  handle('set-working-monitor', (value) => {
    const input = object(value);
    const displayId = Number(input.displayId);
    workingMonitorId = displayId;

    try {
      const user = get().storage.current();
      if (user?.settings) {
        user.settings.workingMonitorId = displayId;
        get().storage.save();
      }
    } catch {}

    const win = getMainWindow();
    const allDisplays = screen.getAllDisplays();
    const targetDisplay = allDisplays.find((d) => d.id === displayId);
    if (win && !win.isDestroyed() && targetDisplay) {
      if (win.isMinimized()) win.restore();
      const wasMaximized = win.isMaximized();
      if (wasMaximized) win.unmaximize();
      const currentBounds = win.getBounds();
      const area = targetDisplay.workArea;
      const width = Math.min(currentBounds.width, area.width);
      const height = Math.min(currentBounds.height, area.height);
      const x = Math.round(area.x + (area.width - width) / 2);
      const y = Math.round(area.y + (area.height - height) / 2);
      win.setBounds({ x, y, width, height });
      if (wasMaximized) win.maximize();
      win.show();
      win.focus();
    }

    // If overlay is open, relocate overlay to the new working monitor as well
    if (get().overlay.activeDisplayId !== null) {
      get().overlay.openOverlay(displayId, rendererUrl, preloadPath);
    }

    return { workingMonitorId: displayId };
  });
  handle('get-working-monitor', () => {
    if (workingMonitorId === null) {
      try {
        const user = get().storage.current();
        if (typeof user?.settings?.workingMonitorId === 'number') {
          workingMonitorId = user.settings.workingMonitorId;
        }
      } catch {}
    }
    if (workingMonitorId === null) {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        const display = screen.getDisplayMatching(win.getBounds());
        if (display) workingMonitorId = display.id;
      }
      if (workingMonitorId === null) {
        workingMonitorId = screen.getPrimaryDisplay().id;
      }
    }
    return { workingMonitorId };
  });
  handle('save-audio-recording', (value) => {
    const input = object(value);
    return get().audio.saveRecording(input.base64 as string, (input.mimeType as string) || 'audio/webm', input.filename as string | undefined);
  });
  handle('attach-audio-recording', (value) => {
    const input = object(value);
    const buffer = decodeAudio(input.base64 as string);
    const mimeType = (input.mimeType as string) || 'audio/webm';
    const filename = (input.filename as string) || `Audio-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    return get().images.importAudioBuffer(buffer, filename, mimeType);
  });
  handle('transcribe-audio', async (value) => {
    const input = object(value);
    return await get().transcription.transcribe(input.base64 as string, input.mimeType as string | undefined);
  });
  let quitting = false;
  app.on('before-quit', (event) => {
    clearInterval(heartbeat);
    if (services?.auth.signedIn && !quitting) {
      event.preventDefault(); quitting = true;
      void services.auth.signOut().finally(() => app.quit());
    }
    services?.chat.stop();
    services?.context.end();
    services?.images.clearPending();
    services?.overlay.closeOverlay();
    services?.stealth.cleanup();
  });
  let checkingSession = false;
  const heartbeat = setInterval(async () => {
    if (!services?.auth.signedIn || checkingSession) return;
    checkingSession = true;
    try { await services.auth.refresh(true); }
    catch (error) {
      await endContext().catch(() => {});
      await services.auth.signOut();
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('session-ended', error instanceof UserError ? error.message : 'Your session has ended. Sign in again.');
    } finally { checkingSession = false; }
  }, 20_000);
  heartbeat.unref();
  app.on('browser-window-created', (_event, window) => {
    window.on('close', () => {
      if (!window.webContents.getURL().includes('#/overlay')) void endContext().catch(() => {});
    });
  });
}

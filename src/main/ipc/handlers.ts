import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, screen, shell } from 'electron';
import { paletteForBackground } from '../../shared/appearance';
import { execFile } from 'node:child_process';
import type { AccessStatus, BehavioralFramework, ChatLatency, CodeViewerBlock, ReviewTarget, SessionProfile, Snapshot } from '../../shared/types';
import { atomicJSON, Storage } from '../services/storage';
import { conversationExport } from '../services/conversationExport';
import { AccessUnavailableError, ManagedAuthService, SessionChangedError } from '../services/managedAuth';
import { CredentialStore } from '../services/credentials';
import { ImageService } from '../services/images';
import { ChatService } from '../services/chat';
import { connectionInput, externalUrl, object, settingsInput, text, UserError } from '../services/validation';
import { ConnectionService } from '../services/connections';
import { listModels, testConnection } from '../services/models';
import { OverlayService } from '../services/overlay';
import { ContextService, sessionBrief } from '../services/context';
import { StealthService } from '../services/stealth';
import { AudioService, decodeAudio } from '../services/audio';
import { captureScreenBuffer } from '../services/screenCapture';
import { AudioTranscriptionService } from '../services/audioTranscription';
import { AppUpdater } from '../services/updater';
import { PermissionService } from '../services/permissions';
import { detectHardware, ModelManager } from '../services/localModels.mjs';
import { InterviewService } from '../services/interviewService';
import { RemoteCompanionService } from '../services/remoteCompanion';
import { ConnectionWarmer, warmupUrl } from '../services/connectionWarmup';
import { WorkspaceService } from '../services/workspace';
import { LocalCodingService } from '../services/localCoding';
import { activeConnection } from '../../shared/providers';
import { isAppMode } from '../../shared/sessionModes';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AppMask } from '../services/appMask';
import { AppCommandService } from '../services/appCommand';

export function registerIPC(
  rendererUrl: string,
  preloadPath = '',
  getMainWindow: () => BrowserWindow | null = () => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/overlay')) || null,
  mask?: AppMask,
) {
  const permissionsService = new PermissionService();
  // Identifies this app run; renderers keep per-launch preferences (such as text size) under it.
  const launchId = randomUUID();
  ipcMain.on('launch-id', (event) => { event.returnValue = launchId; });
  const commandService = new AppCommandService({
    directory: process.platform === 'win32' ? join(app.getPath('appData'), 'Novi', 'bin') : join(app.getPath('home'), '.local', 'bin'),
    executable: process.env.APPIMAGE || process.execPath, home: app.getPath('home'), windows: process.platform === 'win32', packaged: app.isPackaged,
  });
  // Lazy initialization lets the UI explain disk/keychain failures instead of crashing at startup.
  let services: ReturnType<typeof initialize> | undefined;
  function initialize() {
    const storage = new Storage(app.getPath('userData'));
    const credentials = new CredentialStore(storage.directory);
    const images = new ImageService(storage);
    const overlay = new OverlayService();
    const stealth = new StealthService(getMainWindow, overlay, undefined, enabled => mask?.setTransparent(enabled));
    const context = new ContextService(storage);
    const audio = new AudioService(storage.directory);
    const transcription = new AudioTranscriptionService(storage, credentials);
    const localModels = new ModelManager(storage.directory, {
      bundledRoot: app.isPackaged ? join(process.resourcesPath, 'models') : undefined,
      onProgress: status => {
        const window = getMainWindow();
        if (window && !window.isDestroyed()) window.webContents.send('local-model-progress', status);
      },
      log: event => console.info(JSON.stringify({ scope: 'local-ai', ...event })),
    });
    const interview = new InterviewService(storage, localModels, join(dirname(preloadPath), '../main/interviewWorker.js'), (windowId, event) => {
      const window = BrowserWindow.fromId(windowId);
      if (window && !window.isDestroyed()) window.webContents.send('interview-event', event);
    });
    // Created here but NOT started: the companion only starts listening on the network when the
    // user opens it (see 'get-remote-companion-status' below), never at launch or before sign-in.
    const remoteCompanion = new RemoteCompanionService(stealth, getMainWindow);
    const localCoding = new LocalCodingService({ storage, credentials, images, userData: storage.directory, location: { packaged: app.isPackaged, resourcesPath: process.resourcesPath } });
    return { storage, credentials, images, context, audio, transcription, localModels, interview, localCoding, connections: new ConnectionService(storage, credentials), auth: new ManagedAuthService(storage, credentials), chat: new ChatService(storage, credentials, images, context, localCoding), overlay, stealth, remoteCompanion };
  }
  const get = () => services ||= initialize();
  // The floating tray follows transparent mode and click-through like the main window.
  const workspace = new WorkspaceService(getMainWindow, (tray) => get().stealth.applyWindowState(tray));
  const requireNoContext = () => { if (get().context.session) throw new UserError('End this session before changing accounts or AI providers.'); };
  const warmer = new ConnectionWarmer();
  const warmBeforeAccessCheck = new Set(['send', 'initialize-context', 'start-context', 'start-empty-session', 'test-connection', 'capture-screen']);
  // Opens a connection to the provider the next request will use. Sends no key or content.
  function warmProvider() {
    try {
      const { auth, chat, context, storage } = get();
      if (!auth.signedIn || chat.busy) return;
      void warmer.warm(warmupUrl(context.currentConnection() ?? activeConnection(storage.current().settings)));
    } catch { /* Warm-up is best effort. */ }
  }
  // Calls that can reach an AI provider need a fresh license check; outages fail only these.
  const freshAccessChannels = new Set(['send', 'repair-diagram', 'initialize-context', 'start-context', 'start-empty-session', 'list-models', 'test-connection']);
  const accessStatus = (): AccessStatus => ({ offline: Boolean(services?.auth.offline), connectionLost: Boolean(services?.auth.connectionLost) });
  let sentAccess = accessStatus();
  function syncAccessStatus() {
    const access = accessStatus();
    if (access.offline === sentAccess.offline && access.connectionLost === sentAccess.connectionLost) return;
    sentAccess = access;
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('access-status', access);
  }
  // Only for a session the server rejected; outages never end a session.
  async function endManagedSession(error: unknown, fallback: string) {
    await endContext().catch(() => { });
    // The phone's link controls this account's window, so it ends with the account.
    get().remoteCompanion.stop();
    await get().auth.signOut();
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('session-ended', error instanceof UserError ? error.message : fallback);
  }
  async function snapshot(): Promise<Snapshot> {
    const { storage, auth, credentials } = get();
    const user = await auth.getCurrentUser();
    const access = accessStatus();
    if (!user) return { user: null, settings: null, credentialIds: [], conversations: [], access };
    const account = storage.current();
    get().stealth.setClickThroughShortcut(account.settings.clickThroughShortcut);
    get().stealth.setShortcuts({
      coding: account.settings.codingModeShortcut,
      behavioral: account.settings.behavioralModeShortcut,
      screenshot: account.settings.screenshotShortcut,
      audio: account.settings.audioRecordShortcut,
      transparent: account.settings.transparentShortcut,
    });
    return { user, settings: account.settings, credentialIds: account.settings.connections.filter((c) => credentials.has(user.id, c)).map((c) => c.id), conversations: get().storage.conversations, contextSession: get().context.session, access };
  }
  const handle = (channel: string, callback: (value: unknown, event: Electron.IpcMainInvokeEvent, timing: ChatLatency) => unknown) => {
    ipcMain.handle(channel, async (event, value: unknown) => {
      const receivedAt = Date.now();
      const timing: ChatLatency = {};
      try {
        const frameUrl = event.senderFrame?.url || '';
        const baseTarget = rendererUrl.split('#')[0];
        const baseSender = frameUrl.split('#')[0];
        const isTrusted = baseSender === baseTarget;
        if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isTrusted) throw new UserError('Untrusted application request.');
        // Device controls and quitting must work even if account storage or the network is unavailable.
        if (['app-mask-get', 'app-mask-save', 'app-mask-import-icon', 'app-command-status', 'app-command-install', 'quit-app'].includes(channel)) {
          return { ok: true, value: await callback(value, event, timing) };
        }
        // Small, bounded PCM frames belong to a previously authorized interview.
        // Never make a license/network request for every 100 ms of local audio.
        if (channel === 'interview-frame') {
          const window = BrowserWindow.fromWebContents(event.sender);
          if (!window) throw new UserError('Interview window unavailable.');
          return { ok: true, value: await get().interview.frame(value, window.id) };
        }
        if (get().interview.active && ['save-audio-recording', 'attach-audio-recording', 'transcribe-audio'].includes(channel)) {
          throw new UserError('Stop local listening before using cloud audio transcription or recording.');
        }
        // Start the provider handshake before the access check so the two overlap.
        if (warmBeforeAccessCheck.has(channel)) warmProvider();
        const publicChannels = [
          'session', 'sign-in', 'sign-out', 'minimize-window', 'maximize-window',
          'close-window', 'is-window-maximized', 'get-stealth-state', 'check-for-updates',
          'install-update', 'check-permissions', 'request-permissions',
          // open-external is not here: every link Novi opens is on a screen behind sign-in.
          'get-saved-credentials', 'open-audio-midi-setup',
          // Window layout only; the tray reports its size whenever its content changes.
          'set-workspace-docked', 'set-tray-height', 'set-tray-width', 'reset-workspace-sizes', 'sample-background-palette',
          // Local only and self-expiring; must take effect before the next key press.
          'suspend-shortcuts',
          // Best effort and frequent: must never refresh, or sign out on, the managed session.
          'warm-connection'
        ];
        if (!publicChannels.includes(channel)) {
          const accessStart = performance.now();
          const auth = get().auth, wasSignedIn = auth.signedIn, fresh = freshAccessChannels.has(channel);
          try { await auth.refresh(fresh); }
          catch (error) {
            // An outage keeps the session: local work continues on the last verified state.
            if (error instanceof AccessUnavailableError) { if (fresh) throw error; }
            else {
              if (wasSignedIn && !(error instanceof SessionChangedError)) await endManagedSession(error, 'Your session has ended.');
              throw error;
            }
          }
          finally { timing.accessMs = performance.now() - accessStart; }
        }
        if (channel === 'send' && value && typeof value === 'object' && 'sentAt' in value && typeof value.sentAt === 'number' && Number.isFinite(value.sentAt)) {
          const elapsed = receivedAt - value.sentAt;
          if (elapsed >= 0 && elapsed < 180_000) timing.uiToMainMs = elapsed;
        }
        return { ok: true, value: await callback(value, event, timing) };
      } catch (error: any) {
        console.warn(`[Novi Error] ${channel}:`, error?.message || error);
        const userMsg = error instanceof UserError
          ? error.message
          : (error?.message || 'Novi could not complete that action. Check file access and available disk space, then try again.');
        return { ok: false, error: userMsg };
      } finally { syncAccessStatus(); }
    });
  };
  handle('interview-frame', () => {});
  handle('interview-start', (value, event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window !== getMainWindow()) throw new UserError('Start interviews in the main application window.');
    return get().interview.start(value, window.id);
  });
  handle('interview-stop', (_value, event) => { get().interview.assertOwner(BrowserWindow.fromWebContents(event.sender)?.id || 0); return get().interview.stop(); });
  handle('interview-list', () => get().interview.list());
  handle('interview-read', value => get().interview.read(text(value, 'interview ID', 64)));
  handle('interview-rename', value => { const input = object(value); return get().interview.rename(text(input.sessionId, 'interview ID', 64), text(input.speakerId, 'speaker ID', 64), text(input.name, 'speaker name', 60)); });
  handle('local-ai-setup', async () => {
    const { storage, localModels } = get();
    const gpu = await app.getGPUInfo('basic').catch(() => ({}));
    return localModels.snapshot(await detectHardware(storage.directory, gpu), storage.current().settings.localASRModelId || 'auto');
  });
  handle('local-asr-select', value => {
    const modelId = text(value, 'speech model ID', 80);
    if (modelId !== 'auto' && !get().localModels.registry.some((model: { id: string; type: string }) => model.id === modelId && model.type === 'asr')) throw new UserError('Choose a registered speech model.');
    const account = get().storage.current(); account.settings.localASRModelId = modelId; get().storage.save(); return snapshot();
  });
  handle('local-model-download', value => get().localModels.download(text(value, 'model ID', 80)));
  handle('local-model-cancel', value => get().localModels.cancel(text(value, 'model ID', 80)));
  handle('local-model-delete', value => get().localModels.remove(text(value, 'model ID', 80)));
  handle('check-permissions', () => permissionsService.checkPermissions());
  handle('request-permissions', (value) => permissionsService.requestPermissions(Array.isArray(value) ? value as any : undefined));
  handle('session', snapshot);
  handle('get-saved-credentials', () => get().auth.getSavedCredentials());
  handle('sign-in', async (value) => {
    requireNoContext();
    get().chat.assertIdle();
    const permStatus = await permissionsService.checkPermissions();
    if (!permStatus.storage) {
      const granted = await permissionsService.requestPermissions(['storage']);
      if (!granted.storage) {
        throw new UserError('Storage write access is required to sign in and save your app settings.');
      }
    }
    const v = object(value);
    // keepSignedIn: true or missing saves the encrypted session token so Novi opens signed in next
    // time; false keeps the session in memory only. The password itself is never saved either way.
    await get().auth.signIn(
      v.username as string,
      v.password as string,
      typeof v.keepSignedIn === 'boolean' ? v.keepSignedIn : undefined
    );
    return snapshot();
  });
  handle('refresh-managed', async () => { await get().auth.refresh(true); return snapshot(); });
  handle('enable-connection', async (value) => {
    get().chat.assertIdle();
    const input = object(value);
    get().connections.selectManaged(input.id, input.enabled);
    const user = get().storage.current();
    const active = user.settings.connections.find((c) => c.id === user.settings.activeConnectionId);
    const session = get().context.session;
    if (session && active) {
      session.connection = active;
    }
    return snapshot();
  });
  async function endContext() {
    const { chat, context, images, overlay } = get();
    await get().interview.stop(true);
    codeViewerVisible = false;
    codeViewerBlocks = [];
    reviewTarget = null;
    if (codeViewerWindow && !codeViewerWindow.isDestroyed()) codeViewerWindow.hide();
    if (context.session) context.session.status = 'ending';
    await chat.stopAndWait();
    await context.initialization?.catch(() => { });
    context.end(); images.clearPending(); overlay.closeOverlay();
  }
  // Signing out ends the session, disconnects the phone companion (its link controls this account's
  // window), then forgets the account.
  handle('sign-out', async () => { await endContext(); get().remoteCompanion.stop(); await get().auth.signOut(); });
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
  handle('start-empty-session', async () => {
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
    chat.assertIdle();
    context.beginEmpty();
    return snapshot();
  });
  // Profiles keep folder locations from folders the user picked; the page only ever sends loaded folder IDs.
  handle('save-session-profile', (value) => {
    const { storage, context } = get();
    const input = object(value), account = storage.current();
    const name = text(input.name, 'profile name', 60);
    const brief = sessionBrief(input);
    if (!isAppMode(input.mode)) throw new UserError('Choose a mode for this profile.');
    if (!['smart', 'star', 'car', 'par', 'soar'].includes(String(input.framework))) throw new UserError('Choose an answer framework.');
    const folders = context.folderSources(input.folderIds);
    const connection = activeConnection(account.settings);
    if (!connection?.model) throw new UserError('Choose a provider and model before saving a profile.');
    const profiles = account.settings.sessionProfiles || [];
    const existing = profiles.find((profile) => profile.name.toLowerCase() === name.toLowerCase());
    if (!existing && profiles.length >= 20) throw new UserError('You can save up to 20 profiles. Delete one first.');
    const profile: SessionProfile = {
      id: existing?.id ?? randomUUID(), name, updatedAt: Date.now(), connectionId: connection.id, model: connection.model,
      mode: input.mode, framework: input.framework as BehavioralFramework, ...brief, folders,
    };
    account.settings.sessionProfiles = existing ? profiles.map((item) => item === existing ? profile : item) : [...profiles, profile];
    storage.save(); return snapshot();
  });
  handle('delete-session-profile', (value) => {
    const { storage } = get();
    const id = text(value, 'profile ID', 100), account = storage.current();
    account.settings.sessionProfiles = (account.settings.sessionProfiles || []).filter((profile) => profile.id !== id);
    storage.save(); return snapshot();
  });
  handle('load-session-profile-folders', (value) => {
    const { storage, chat, context } = get();
    chat.assertIdle();
    if (context.session) throw new UserError('End your session before loading folders.');
    const id = text(value, 'profile ID', 100);
    const profile = storage.current().settings.sessionProfiles?.find((item) => item.id === id);
    if (!profile) throw new UserError('This profile no longer exists.');
    // A saved profile may have no document folders (documents are optional), so there is nothing to load.
    if (!profile.folders.length) return [];
    const missing = profile.folders.find((folder) => !existsSync(folder.path));
    if (missing) throw new UserError(`The folder “${missing.name}” was moved or deleted. Choose your folders again, then save the profile.`);
    return context.loadFolders(profile.folders.map((folder) => folder.path));
  });
  handle('initialize-context', async (_value, event, timing) => {
    const { context, chat } = get();
    const session = context.assertActive();
    if (!context.initialization && session.status === 'pending') {
      session.status = 'loading';
      const stop = () => chat.stop();
      event.sender.once('destroyed', stop);
      context.initialization = chat.send({ conversationId: null, content: context.prompt, imageIds: [] }, (data) => {
        if (!event.sender.isDestroyed()) event.sender.send('chat-event', data);
      }, timing).then(() => context.completeInitialization()).catch((error) => { session.status = 'error'; throw error; })
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
      audio: input.audioRecordShortcut,
      transparent: input.transparentShortcut,
    });
    user.name = input.displayName;
    user.settings = { ...user.settings, ...input, onboardingComplete: true };
    delete user.settings.autoSendOnAudioStop;
    storage.save(); return snapshot();
  });
  handle('save-connection', async (value) => {
    get().chat.assertIdle();
    get().connections.save(value);
    const user = get().storage.current();
    const active = user.settings.connections.find((c) => c.id === user.settings.activeConnectionId);
    const session = get().context.session;
    if (session && active) session.connection = active;
    return snapshot();
  });
  handle('remove-connection', async (value) => {
    get().chat.assertIdle();
    get().connections.remove(value);
    const user = get().storage.current();
    const active = user.settings.connections.find((c) => c.id === user.settings.activeConnectionId);
    const session = get().context.session;
    if (session && active) session.connection = active;
    return snapshot();
  });
  handle('select-connection', async (value) => {
    get().chat.assertIdle();
    const input = object(value);
    get().connections.select(input.id, input.model);
    const user = get().storage.current();
    const active = user.settings.connections.find((c) => c.id === user.settings.activeConnectionId);
    const session = get().context.session;
    if (session && active) {
      session.connection = active;
    }
    return snapshot();
  });
  handle('list-models', (value) => {
    const input = connectionInput(value);
    const key = get().connections.resolveKey(input);
    // The renderer's connection never says whether its key is managed; the signed-in account does
    // (resolveKey only lets a managed account use managed connections), so key errors name the right fix.
    return listModels({ ...input.ai, managed: get().storage.current().managed === true }, key);
  });
  handle('set-model-role', async value => {
    const { storage, chat, connections } = get(); chat.assertIdle();
    const input = object(value), account = storage.current();
    const id = text(input.id, 'connection ID', 100), model = text(input.model, 'model selection', 200);
    if (input.role !== 'fast' && input.role !== 'deep') throw new UserError('Choose Fast or Deep.');
    const connection = account.settings.connections.find(item => item.id === id && item.enabled !== false);
    if (!connection) throw new UserError('Choose an enabled connection.');
    const config = { ...connection };
    const models = await listModels(config, connections.resolveKey({ id, name: config.name, ai: config }));
    if (!models.some(item => item.id === model)) throw new UserError('Choose a model available from this provider.');
    chat.assertIdle();
    const current = account.settings.connections.find(item => item.id === id);
    if (storage.current() !== account || !current || current.enabled === false || current.provider !== config.provider || current.baseUrl !== config.baseUrl) throw new UserError('Your connection changed. Choose the role again.');
    account.settings.modelRoles ||= {};
    account.settings.modelRoles[id] = { ...account.settings.modelRoles[id], [input.role]: model };
    storage.save(); return snapshot();
  });
  handle('save-conversation', async (value, event) => {
    const { storage, images, chat } = get(); chat.assertIdle();
    const id = text(value, 'conversation ID', 100), account = storage.current();
    const conversation = storage.conversations.find(item => item.id === id);
    if (!conversation) throw new UserError('This conversation could not be found.');
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new UserError('The application window is unavailable.');
    const result = await dialog.showSaveDialog(window, {
      title: 'Save conversation', defaultPath: 'Novi-conversation.json',
      filters: [{ name: 'Conversation with attachments', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return;
    chat.assertIdle();
    if (storage.current() !== account || !storage.conversations.includes(conversation)) throw new UserError('The conversation changed. Please save it again.');
    atomicJSON(result.filePath, conversationExport(conversation, id => images.dataUrl(id)));
  });
  handle('rename-conversation', value => {
    const { storage, chat } = get(); chat.assertIdle();
    const input = object(value);
    return storage.renameConversation(input.id, input.title);
  });
  handle('delete-conversation', (value) => {
    const { storage, images, chat } = get(); chat.assertIdle();
    const id = text(value, 'conversation ID', 100);
    const account = storage.current();
    // Local Coding history lives beside data.json; remove it with its conversation.
    for (const conversation of [...account.conversations, ...(storage.sessionConversations ?? [])]) if (conversation.id === id) get().localCoding.removeForConversation(conversation);
    account.conversations = account.conversations.filter((item) => item.id !== id);
    if (storage.sessionConversations !== null) {
      storage.sessionConversations = storage.sessionConversations.filter((item) => item.id !== id);
    }
    storage.save(); images.prune();
  });
  handle('clear-history', () => {
    const { storage, images, chat, localCoding } = get(); chat.assertIdle();
    for (const conversation of storage.current().conversations) localCoding.removeForConversation(conversation);
    storage.current().conversations = [];
    if (storage.sessionConversations !== null) storage.sessionConversations = [];
    storage.save(); images.prune();
  });
  handle('pick-images', async (_value, event) => {
    get().storage.current();
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new UserError('The application window is unavailable.');
    const result = await dialog.showOpenDialog(window, { title: 'Attach images', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    return result.canceled ? [] : get().images.import(result.filePaths);
  });
  handle('drop-images', (value) => get().images.import(value));
  handle('preview-image', (value) => get().images.preview(text(value, 'image ID', 100)));
  // Awaited: Electron 44 makes clipboard writes asynchronous (on Electron 41 this awaits nothing).
  handle('copy-text', async (value) => { get().storage.current(); text(value, 'clipboard text', 1_000_000, true); await clipboard.writeText(value as string); });
  // Only Novi's own help and key pages; anything else is refused (see externalUrl).
  handle('open-external', async (value) => { await shell.openExternal(externalUrl(value)); });
  handle('open-audio-midi-setup', () => {
    if (process.platform === 'darwin') execFile('open', ['-a', 'Audio MIDI Setup'], () => {});
  });
  handle('send', (value, event, timing) => {
    const { chat } = get();
    if (get().context.assertActive().status !== 'ready') throw new UserError('Wait for context confirmation, or end this session and retry loading.');
    const stop = () => chat.stop();
    event.sender.once('destroyed', stop);
    return chat.send(value, (data) => { if (!event.sender.isDestroyed()) event.sender.send('chat-event', data); }, timing).finally(() => event.sender.removeListener('destroyed', stop));
  });
  handle('stop', () => { get().storage.current(); get().chat.stop(); });
  handle('warm-connection', () => { warmProvider(); });
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
  // Buttons can turn transparent mode on; while its hotkey works, only the hotkey turns it off.
  const lockedTransparent = () => { const state = get().stealth.getState(); return state.transparent && state.transparentShortcut ? state : null; };
  handle('toggle-transparent', () => lockedTransparent() ?? get().stealth.toggleTransparent());
  handle('suspend-shortcuts', (value) => { get().stealth.suspendShortcuts(object(value).suspended === true); });
  handle('set-transparent', (value) => {
    const v = object(value);
    if (!v.enabled) { const locked = lockedTransparent(); if (locked) return locked; }
    return get().stealth.setTransparent(Boolean(v.enabled));
  });
  handle('minimize-window', (_value, event) => {
    if (mask?.preventsMinimize || services?.stealth.getState().transparent) return;
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
  handle('app-mask-get', () => {
    if (!mask) throw new UserError('App masking is unavailable.');
    return mask.settings;
  });
  handle('app-mask-save', (value) => {
    if (!mask) throw new UserError('App masking is unavailable.');
    return mask.save(value);
  });
  handle('app-mask-import-icon', () => {
    if (!mask) throw new UserError('App masking is unavailable.');
    return mask.importIcon();
  });
  handle('app-command-status', () => commandService.status());
  handle('app-command-install', () => commandService.install());
  handle('quit-app', () => { setImmediate(() => app.quit()); });
  handle('close-window', (_value, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  handle('is-window-maximized', (_value, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
  handle('set-workspace-docked', (value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can change the layout.');
    if (object(value).docked === true) workspace.dock(workingDisplay().workArea);
    else workspace.undock();
  });
  handle('set-tray-height', (value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can size the tray.');
    const height = Number(object(value).height);
    if (!Number.isFinite(height) || height <= 0 || height > 10_000) throw new UserError('Invalid tray height.');
    workspace.resizeTray(height);
  });
  handle('set-tray-width', (value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can size the tray.');
    const { width, edge } = object(value);
    if (typeof width !== 'number' || !Number.isFinite(width) || Math.abs(width) > 100_000 || (edge !== 'left' && edge !== 'right')) throw new UserError('Invalid tray width.');
    workspace.resizeTrayWidth(width, edge);
  });
  handle('reset-workspace-sizes', (_value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can resize the workspace.');
    workspace.resetSizes();
  });
  let backgroundSample: Promise<[number, number, number][]> | null = null;
  handle('sample-background-palette', (value, event) => {
    const window = getMainWindow();
    if (!window || BrowserWindow.fromWebContents(event.sender) !== window) throw new UserError('Only the main window can sample the background.');
    if (!get().stealth.getState().transparent || !window.isVisible() || window.isMinimized()) throw new UserError('Enable transparency to sample the background.');
    const opacity = object(value).opacity;
    if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 20 || opacity > 100) throw new UserError('Invalid opacity.');
    if (!backgroundSample) backgroundSample = captureScreenBuffer(getMainWindow, screen.getDisplayMatching(window.getBounds()).id, window.getBounds())
      .then((png) => {
        const bitmap = nativeImage.createFromBuffer(png).toBitmap();
        const pixels: [number, number, number][] = [];
        for (let i = 0; i < bitmap.length; i += 4) if (bitmap[i + 3]) pixels.push([bitmap[i + 2], bitmap[i + 1], bitmap[i]]);
        return pixels;
      }).finally(() => { backgroundSample = null; });
    return backgroundSample.then((pixels) => paletteForBackground(pixels, opacity));
  });
  // ── Local Coding (read-only; there is deliberately no write, patch, run or delete endpoint) ──
  const fromMain = (event: Electron.IpcMainInvokeEvent) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Use Local Coding from the main Novi window.');
  };
  handle('local-coding-browse', (value, event) => { fromMain(event); return get().localCoding.browse(value); });
  handle('local-coding-preview', (value, event) => { fromMain(event); const input = object(value); return get().localCoding.preview({ workingFolder: input.workingFolder, extra: input.extra }); });
  handle('local-coding-readiness', (_value, event) => { fromMain(event); return get().localCoding.readiness(); });
  handle('local-coding-models', (value, event) => { fromMain(event); const input = object(value); return get().localCoding.listModels(input.engine, input.connectionId); });
  handle('local-coding-check-update', (value, event) => { fromMain(event); return get().localCoding.checkEngineUpdate(object(value).engine); });
  handle('local-coding-install', (value, event) => { fromMain(event); return get().localCoding.installEngine(object(value).engine); });
  handle('local-coding-uninstall', (value, event) => { fromMain(event); return get().localCoding.uninstallEngine(object(value).engine); });
  handle('local-coding-check-login', (value, event) => { fromMain(event); const input = object(value); return get().localCoding.checkEngineLogin(input.engine, input.connectionId); });
  handle('local-coding-start', async (value, event) => {
    fromMain(event);
    const { context, chat, storage, localCoding } = get();
    chat.assertIdle();
    if (context.assertActive().status !== 'ready') throw new UserError('Wait for the session to finish loading, then start Local Coding.');
    const input = object(value);
    const conversationId = await localCoding.startSession(input, (conversation) => { storage.conversations.push(conversation); storage.save(); });
    return { snapshot: await snapshot(), conversationId };
  });
  handle('local-coding-state', (value, event) => { fromMain(event); return get().localCoding.state(value); });
  handle('local-coding-select', (value, event) => { fromMain(event); const input = object(value); return get().localCoding.select(input.projectId, input.versionId); });
  handle('local-coding-engine', async (value, event) => {
    fromMain(event);
    const { chat, storage, localCoding } = get();
    chat.assertIdle();
    const input = object(value);
    const project = await localCoding.updateEngine(input.projectId, input, storage.conversations);
    storage.save();
    return { snapshot: await snapshot(), project };
  });
  handle('local-coding-changes', (value, event) => { fromMain(event); const input = object(value); return get().localCoding.changes(input.projectId, input.fromVersionId, input.toVersionId); });
  // The detached viewer may read the review it was asked to show, and nothing else.
  let reviewTarget: ReviewTarget | null = null;
  handle('local-coding-review', (value, event) => {
    const input = object(value);
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender !== getMainWindow()) {
      if (!codeViewerWindow || sender !== codeViewerWindow || !reviewTarget || input.projectId !== reviewTarget.projectId) throw new UserError('This review is not open.');
    }
    return get().localCoding.review(input.projectId, input.fromVersionId, input.toVersionId, input.fileId);
  });
  handle('local-coding-review-changes', (value, event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (!codeViewerWindow || sender !== codeViewerWindow || !reviewTarget) throw new UserError('This review is not open.');
    return get().localCoding.changes(reviewTarget.projectId, object(value).fromVersionId, reviewTarget.toVersionId);
  });
  handle('local-coding-open-review', async (value, event) => {
    fromMain(event);
    const input = object(value);
    // Validates ownership and that the file exists in one of the versions before showing anything.
    get().localCoding.review(input.projectId, input.fromVersionId, input.toVersionId, input.fileId);
    reviewTarget = get().localCoding.reviewTarget(input.projectId, input.fromVersionId, input.toVersionId, input.fileId);
    codeViewerVisible = true;
    openCodeViewer();
    if (codeViewerWindow && !codeViewerWindow.isDestroyed()) codeViewerWindow.webContents.send('review-target', reviewTarget);
  });
  handle('local-coding-review-target', (_value, event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender !== getMainWindow() && sender !== codeViewerWindow) throw new UserError('Not available.');
    return reviewTarget;
  });
  handle('local-coding-review-action', (value, event) => {
    if (!codeViewerWindow || BrowserWindow.fromWebContents(event.sender) !== codeViewerWindow) throw new UserError('Not available.');
    const input = object(value);
    if (input.kind !== 'ask' && input.kind !== 'revise') throw new UserError('Unknown review action.');
    const message = text(input.text, 'request', 4000);
    const main = getMainWindow();
    if (main && !main.isDestroyed()) { main.webContents.send('global-action', { type: 'review-action', payload: { kind: input.kind, text: message } }); main.show(); }
  });
  handle('local-coding-refresh', async (value, event) => {
    fromMain(event);
    const { chat, localCoding } = get();
    chat.assertIdle();
    const input = object(value);
    const result = await localCoding.refresh(input.projectId, input.carryVersionId, input.addPaths ?? []);
    return { result, project: localCoding.state(input.projectId) };
  });
  handle('local-coding-resolve', (value, event) => {
    fromMain(event);
    const input = object(value);
    const result = get().localCoding.resolve(input.projectId, input.pendingId, input.decisions);
    return { result, project: get().localCoding.state(input.projectId) };
  });
  let codeViewerWindow: BrowserWindow | null = null;
  let codeViewerBlocks: CodeViewerBlock[] = [];
  let codeViewerVisible = false;
  function openCodeViewer() {
    if (codeViewerWindow && !codeViewerWindow.isDestroyed()) { codeViewerWindow.show(); codeViewerWindow.focus(); return; }
    const main = getMainWindow();
    if (!main) return;
    const area = screen.getDisplayMatching(main.getBounds()).workArea;
    const width = Math.min(430, area.width);
    const height = Math.min(700, area.height);
    const viewer = new BrowserWindow({
      x: area.x, y: area.y + Math.round((area.height - height) / 2), width, height,
      minWidth: 300, minHeight: 240, show: false, frame: false, resizable: true, title: 'Novi Viewer',
      transparent: true, backgroundColor: '#00000000', autoHideMenuBar: true,
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
    });
    const isStealthTransparent = services?.stealth.getState().transparent;
    if (isStealthTransparent) {
      viewer.setAlwaysOnTop(true, 'screen-saver');
      viewer.setContentProtection(true);
    }
    codeViewerWindow = viewer;
    viewer.setIgnoreMouseEvents(false);
    viewer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    viewer.webContents.on('will-navigate', (navigation) => navigation.preventDefault());
    viewer.once('ready-to-show', () => { if (codeViewerVisible) viewer.show(); });
    viewer.on('closed', () => {
      codeViewerWindow = null;
      codeViewerVisible = false;
      codeViewerBlocks = [];
      reviewTarget = null;
      const currentMain = getMainWindow();
      if (currentMain && !currentMain.isDestroyed()) currentMain.webContents.send('code-viewer-closed');
    });
    main.once('closed', () => { if (!viewer.isDestroyed()) viewer.close(); });
    const url = new URL(rendererUrl);
    url.hash = '/code-viewer';
    void viewer.loadURL(url.href);
  }
  handle('set-code-viewer-visible', (value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can open the code viewer.');
    const visible = object(value).visible === true;
    codeViewerVisible = visible;
    // Mode changes take the viewer back to code blocks and diagrams.
    if (reviewTarget) { reviewTarget = null; if (codeViewerWindow && !codeViewerWindow.isDestroyed()) codeViewerWindow.webContents.send('review-target', null); }
    if (!visible) { codeViewerBlocks = []; codeViewerWindow?.hide(); return; }
    openCodeViewer();
  });
  handle('update-code-viewer', (value, event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== getMainWindow()) throw new UserError('Only the main window can update the code viewer.');
    if (!Array.isArray(value) || value.length > 500 || value.some((block) => !block || typeof block.id !== 'string' || typeof block.label !== 'string' || typeof block.code !== 'string') || JSON.stringify(value).length > 8_000_000) throw new UserError('Code viewer output is too large.');
    codeViewerBlocks = value;
    if (codeViewerWindow && !codeViewerWindow.isDestroyed()) codeViewerWindow.webContents.send('code-viewer-blocks', codeViewerBlocks);
  });
  handle('get-code-viewer-blocks', () => codeViewerBlocks);
  handle('repair-diagram', (value) => get().chat.repairDiagram(value));
  let workingMonitorId: number | null = null;
  function currentWorkingMonitorId(): number {
    if (workingMonitorId === null) {
      try {
        const user = get().storage.current();
        if (typeof user?.settings?.workingMonitorId === 'number') {
          workingMonitorId = user.settings.workingMonitorId;
        }
      } catch { }
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
    return workingMonitorId;
  }
  // A saved monitor may have been unplugged; fall back to the screen the window is on.
  function workingDisplay() {
    const id = currentWorkingMonitorId();
    const win = getMainWindow();
    return screen.getAllDisplays().find((display) => display.id === id)
      ?? (win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay());
  }
  handle('capture-screen', async () => {
    if (workingMonitorId === null) {
      try {
        const user = get().storage.current();
        if (typeof user?.settings?.workingMonitorId === 'number') {
          workingMonitorId = user.settings.workingMonitorId;
        }
      } catch { }
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
    } catch { }

    const win = getMainWindow();
    const allDisplays = screen.getAllDisplays();
    const targetDisplay = allDisplays.find((d) => d.id === displayId);
    if (win && !win.isDestroyed() && targetDisplay && workspace.docked) {
      // During a session the output panel and the tray move to the chosen screen together.
      workspace.dock(targetDisplay.workArea);
      win.show();
    } else if (win && !win.isDestroyed() && targetDisplay) {
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
  handle('get-working-monitor', () => ({ workingMonitorId: currentWorkingMonitorId() }));
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
  const updater = new AppUpdater();
  handle('check-for-updates', async () => {
    return await updater.checkForUpdates();
  });
  handle('install-update', async () => {
    return await updater.installUpdate((progress) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-progress', progress);
      }
    }, { yieldWindows: () => services ? services.stealth.yieldTop() : () => {} });
  });
  // Opening the phone companion starts its server (only the first time; later calls just return
  // the status). Both companion channels are deliberately NOT in `publicChannels`, so they need a
  // signed-in account; signed out, the window shows "Sign in with your licensed desktop account."
  handle('get-remote-companion-status', async () => {
    return await get().remoteCompanion.start();
  });
  handle('toggle-remote-tunnel', async (value) => {
    const input = object(value);
    const enable = typeof input.enable === 'boolean' ? input.enable : undefined;
    return await get().remoteCompanion.toggleTunnel(enable);
  });
  let quitting = false, quitReady = false;
  app.on('before-quit', (event) => {
    clearInterval(heartbeat);
    if (quitReady || !services) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    services.remoteCompanion.stop();
    // Wait for aborted engines and recordings before exiting; repeated quit requests share this cleanup.
    void Promise.allSettled([services.localModels.shutdown(), services.interview.stop(true), services.chat.stopAndWait()])
      .then(() => services!.auth.signOut())
      .finally(() => { quitReady = true; app.quit(); })
      .catch(error => console.error('Shutdown cleanup failed:', error));
    services.context.end();
    services.images.clearPending();
    services.overlay.closeOverlay();
    services.stealth.cleanup();
  });
  let checkingSession = false;
  // Ticks every 5 s: checks in every 20 s while connected and retries each tick during an outage.
  const heartbeat = setInterval(async () => {
    syncAccessStatus();
    const auth = services?.auth;
    if (!auth?.signedIn || checkingSession || !auth.heartbeatDue()) return;
    checkingSession = true;
    try { await auth.refresh(true); }
    catch (error) {
      // Outages keep the session open until the user closes the window; only the server's rejection ends it.
      if (!(error instanceof AccessUnavailableError) && !(error instanceof SessionChangedError)) await endManagedSession(error, 'Your session has ended. Sign in again.');
    } finally { checkingSession = false; syncAccessStatus(); }
  }, 5_000);
  heartbeat.unref();
  app.on('browser-window-created', (_event, window) => {
    if (services?.stealth.getState().transparent) window.setContentProtection(true);
    window.on('blur', () => services?.stealth.keepAbove());
    // Only closing the main window ends the session; the tray, code viewer and overlay can close on their own.
    window.on('close', () => {
      if (window === getMainWindow()) void endContext().catch(() => { });
    });
  });
  return { attachMainWindow: (window: BrowserWindow) => workspace.attachMain(window) };
}

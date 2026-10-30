import { isAppMode, SESSION_MODES } from '../../shared/sessionModes';
import type { AppMode, CompanionState } from '../../shared/types';
import http from 'node:http';
import os from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import type { StealthService } from './stealth';
import { generateQRCodeSVG } from './qrCode';
import { CloudflareTunnelService } from './cloudflareTunnel';
import type { RemoteCompanionStatus } from '../../shared/types';
import { createRequire } from 'node:module';
import { MAIN_WINDOW_MIN } from './workspace';
import { windowLayoutBounds } from '../../shared/windowLayout';
import type { SmartPlacementService } from './smartPlacement';

const req = typeof require === 'function' ? require : createRequire(import.meta.url);
function getScreen(): { getDisplayMatching: (bounds: any) => { workArea: { x: number; y: number; width: number; height: number } } } | null {
  try {
    const electron = req('electron');
    return typeof electron === 'object' && electron ? electron.screen : null;
  } catch {
    return null;
  }
}

/**
 * The phone companion: a small web server that lets a phone control Novi's main window.
 *
 * How it works:
 * - The user opens "Phone companion" in Novi, which calls `start()` (see the
 *   `get-remote-companion-status` IPC handler). Nothing listens before that.
 * - Novi shows a QR code for `getBestUrl()`. The link carries a random token after `#token=`.
 *   The phone page reads it and sends it as `Authorization: Bearer <token>` on every API call.
 * - Two connection types:
 *   - "Same Wi-Fi": the server listens on all network interfaces (0.0.0.0) so the phone can reach
 *     this computer directly. The link is plain HTTP on the local network.
 *   - "Anywhere": a Cloudflare quick tunnel (HTTPS) forwards to this computer. The server then
 *     listens on 127.0.0.1 only, because only cloudflared (running on this computer) needs to reach it.
 * - Signing out (or the server ending the session) calls `stop()`, which disconnects the phone.
 *
 * Security properties:
 * - Every /api/ call needs the token, compared in constant time (`authorized()`).
 * - A new token is made every time the server starts listening, so an old link stops working after
 *   a restart, a switch between Same Wi-Fi and Anywhere, or a sign-out.
 * - No CORS headers are sent, so other websites open on this computer can't read the replies.
 */
export class RemoteCompanionService {
  /** The running HTTP server, or `null` when the companion isn't listening. */
  private server: http.Server | null = null;
  /** The port in use. Starts at 4890 and moves up by one if that port is busy. */
  private port = 4890;
  /**
   * Which network interface the server listens on.
   * '0.0.0.0' (all interfaces) for Same Wi-Fi, so the phone can reach this computer.
   * '127.0.0.1' (this computer only) for Anywhere, where only the local cloudflared connects.
   */
  private host: '0.0.0.0' | '127.0.0.1' = '0.0.0.0';
  /**
   * The secret the phone must send as `Authorization: Bearer <token>`.
   * Empty until the server first listens, and replaced with a new random value on every listen,
   * so a link stops working once the server restarts or changes network.
   */
  private token = '';
  private activeClients = new Map<string, number>();
  private stealth: StealthService;
  private getWindow: () => BrowserWindow | null;
  private currentMode: AppMode = 'normal';
  private currentAudioSource: 'system' | 'mic' = 'system';
  private tunnel = new CloudflareTunnelService();
  private tunnelLoading = false;

  private conversationScroll = { position: 1, scrollable: false };
  private desktopState: CompanionState | null = null;
  constructor(stealth: StealthService, getWindow: () => BrowserWindow | null, private smartPlacement?: SmartPlacementService, private getUsername: () => string = () => '') {
    this.stealth = stealth;
    this.getWindow = getWindow;
  }
  setConversationScroll(position: unknown, scrollable: unknown) {
    if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > 1 || typeof scrollable !== 'boolean') throw new Error('Invalid conversation scroll position.');
    this.conversationScroll = { position, scrollable };
  }
  setDesktopState(value: unknown) {
    if (value === null) { this.desktopState = null; return; }
    const state = value as CompanionState | undefined;
    if (!state || !isAppMode(state.mode) || !Array.isArray(state.availableModes) || state.availableModes.length > SESSION_MODES.length || !state.availableModes.every(isAppMode) ||
      typeof state.busy !== 'boolean' || typeof state.listening !== 'boolean' || !['system', 'microphone', 'both'].includes(state.source)) throw new Error('Invalid companion state.');
    this.desktopState = { mode: state.mode, availableModes: [...state.availableModes], busy: state.busy, listening: state.listening, source: state.source };
    this.currentMode = state.mode;
  }
  private windowLayout() {
    const win = this.getWindow(), sc = getScreen();
    if (!win || win.isDestroyed() || !sc || typeof win.getBounds !== 'function') return null;
    const bounds = win.getBounds(), area = sc.getDisplayMatching(bounds).workArea;
    const widthRatio = Math.min(1, bounds.width / area.width), heightRatio = Math.min(1, bounds.height / area.height);
    return { xRatio: Math.max(0, Math.min(1 - widthRatio, (bounds.x - area.x) / area.width)), yRatio: Math.max(0, Math.min(1 - heightRatio, (bounds.y - area.y) / area.height)), widthRatio, heightRatio, minWidthRatio: Math.min(MAIN_WINDOW_MIN.width / area.width, 1), minHeightRatio: Math.min(MAIN_WINDOW_MIN.height / area.height, 1), aspectRatio: area.width / area.height };
  }

  getLocalIPs(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips.length ? ips : ['127.0.0.1'];
  }

  getBestUrl(): string {
    if (this.tunnel.isActive() && this.tunnel.getUrl()) {
      return `${this.tunnel.getUrl()}/#token=${this.token}`;
    }
    const ips = this.getLocalIPs();
    // Prioritize standard local subnets (192.168.x.x, 10.x.x.x, 172.x.x.x)
    const preferred = ips.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) || ips[0];
    return `http://${preferred}:${this.port}/#token=${this.token}`;
  }

  getConnectedClientsCount(): number {
    const now = Date.now();
    for (const [clientId, lastSeen] of this.activeClients.entries()) {
      if (now - lastSeen > 6000) {
        this.activeClients.delete(clientId);
      }
    }
    return this.activeClients.size;
  }

  getStatus(): RemoteCompanionStatus {
    const running = Boolean(this.server && this.server.listening);
    const bestUrl = this.getBestUrl();
    const qrSvg = generateQRCodeSVG(bestUrl, { size: 200, margin: 4, darkColor: '#000000', lightColor: '#ffffff' });
    return {
      running,
      port: this.port,
      localIps: this.getLocalIPs(),
      bestUrl,
      qrSvg,
      connectedClients: this.getConnectedClientsCount(),
      tunnelActive: this.tunnel.isActive(),
      tunnelUrl: this.tunnel.getUrl(),
      tunnelLoading: this.tunnelLoading,
    };
  }


  /**
   * Switches between "Anywhere" (Cloudflare tunnel) and "Same Wi-Fi".
   *
   * Anywhere: first moves the server to 127.0.0.1 (this makes a new token), then starts the tunnel
   * to that port. If the tunnel fails to start, the server goes back to Same Wi-Fi so the link
   * Novi shows still works, and the original error is passed on so the user sees why.
   *
   * Same Wi-Fi: stops the tunnel and moves the server back to 0.0.0.0 (also a new token).
   *
   * Either way the link changes, so the phone has to scan the new QR code.
   *
   * @param enable true for Anywhere, false for Same Wi-Fi, omitted to flip the current state.
   * @returns the new status, including the new link and QR code.
   */
  async toggleTunnel(enable?: boolean): Promise<RemoteCompanionStatus> {
    const shouldEnable = enable !== undefined ? enable : !this.tunnel.isActive();
    if (shouldEnable) {
      this.tunnelLoading = true;
      try {
        await this.listen('127.0.0.1');
        await this.tunnel.start(this.port);
      } catch (error) {
        // Keep the Same Wi-Fi link working when the tunnel can't start.
        await this.listen('0.0.0.0').catch(() => {});
        throw error;
      } finally {
        this.tunnelLoading = false;
      }
    } else {
      this.tunnel.stop();
      this.tunnelLoading = false;
      await this.listen('0.0.0.0');
    }
    return this.getStatus();
  }

  /**
   * Makes sure the companion server is running and returns its status. Called every time the user
   * opens the phone companion, so it must be safe to call repeatedly.
   *
   * - Not running yet: starts listening on `preferredPort` (or the next free port) with a new token.
   * - Already running in the right mode: changes nothing, so the phone's existing link keeps working.
   * - Running on 127.0.0.1 but the tunnel has since exited on its own: switches back to Same Wi-Fi
   *   (0.0.0.0, new token), because the old tunnel link is dead anyway.
   *
   * @param preferredPort the port to try first. Tests pass 0 to get any free port.
   */
  async start(preferredPort = 4890): Promise<RemoteCompanionStatus> {
    if (!this.server?.listening) this.port = preferredPort;
    // A tunnel that exited on its own falls back to Same Wi-Fi, so the link shown works.
    await this.listen(this.tunnel.isActive() || this.tunnelLoading ? '127.0.0.1' : '0.0.0.0');
    return this.getStatus();
  }

  /**
   * Starts (or restarts) the HTTP server on the given interface.
   *
   * Does nothing if the server is already listening on that interface. Otherwise it closes any
   * running server (dropping connected phones), creates a new random token, and listens on
   * `this.port`. If the port is taken (EADDRINUSE), it tries the next port up until one is free.
   *
   * @param host '0.0.0.0' for Same Wi-Fi, '127.0.0.1' for Anywhere.
   * @throws the server's error for anything other than a busy port (for example no permission).
   */
  private async listen(host: '0.0.0.0' | '127.0.0.1'): Promise<void> {
    if (this.server?.listening && this.host === host) return;
    this.closeServer();
    this.host = host;
    this.token = randomBytes(24).toString('hex');
    await new Promise<void>((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      srv.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && !srv.listening) {
          this.port++;
          srv.listen(this.port, host);
        } else {
          reject(err);
        }
      });

      srv.listen(this.port, host, () => {
        this.server = srv;
        const address = srv.address();
        if (address && typeof address !== 'string') this.port = address.port;
        resolve();
      });
    });
  }

  /**
   * Stops the HTTP server immediately. `closeAllConnections()` drops connected phones right away;
   * `close()` alone would wait for their open keep-alive connections to finish.
   */
  private closeServer(): void {
    if (!this.server) return;
    this.server.closeAllConnections();
    this.server.close();
    this.server = null;
  }

  /**
   * Shuts the companion down completely: stops the tunnel, closes the server and forgets connected
   * phones. Called on sign-out, when the server ends the session, and when Novi quits.
   * The next `start()` will listen again with a new token.
   */
  stop(): void {
    this.tunnel.stop();
    this.closeServer();
    this.activeClients.clear();
  }

  /**
   * Checks the `Authorization` header against `Bearer <token>`.
   *
   * Uses `timingSafeEqual`, which takes the same time whether the first or the last character is
   * wrong. A plain `===` stops at the first wrong character, which in theory lets an attacker on
   * the network guess the token one character at a time by measuring reply times.
   * `timingSafeEqual` needs equal lengths, so the lengths are compared first (that only reveals the
   * length, which is fixed and public anyway). An empty token (server never started) never matches.
   */
  private authorized(req: http.IncomingMessage): boolean {
    const given = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${this.token}`);
    return Boolean(this.token) && given.length === expected.length && timingSafeEqual(given, expected);
  }

  private recordClient(req: http.IncomingMessage) {
    const ip = req.socket.remoteAddress || 'client';
    const clientHeader = (req.headers['x-client-id'] as string) || '';
    const id = clientHeader ? `${ip}-${clientHeader}` : ip;
    this.activeClients.set(id, Date.now());
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // No CORS headers: the phone page calls its own origin, and other sites must not read these replies.
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');

    // The scanned link authorizes the phone without a PIN prompt.
    if (pathname.startsWith('/api/') && !this.authorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Open the link from Novi to connect.' }));
      return;
    }

    // 1. Mobile App Controller HTML
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderMobileAppHTML());
      return;
    }

    // 2. Status verification
    if (pathname === '/api/status') {
      this.recordClient(req);
      const stealthState = this.stealth.getState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        username: this.getUsername(),
        transparent: stealthState.transparent,
        clickThrough: stealthState.clickThrough,
        currentMode: this.currentMode,
        desktopState: this.desktopState,
        currentAudioSource: this.currentAudioSource,
        hostname: os.hostname(),
        platform: process.platform,
        windowLayout: this.windowLayout(), conversationScroll: this.conversationScroll, smartPlacement: this.smartPlacement?.snapshot(),
      }));
      return;
    }

    // 4. Remote Action Execution
    if (pathname === '/api/action' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 65536) req.destroy();
      });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          this.recordClient(req);
          await this.executeAction(data.action, data.payload);
          const stealthState = this.stealth.getState();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            username: this.getUsername(),
            action: data.action,
            transparent: stealthState.transparent,
            clickThrough: stealthState.clickThrough,
            currentMode: this.currentMode,
            desktopState: this.desktopState,
            currentAudioSource: this.currentAudioSource,
            windowLayout: this.windowLayout(), conversationScroll: this.conversationScroll, smartPlacement: this.smartPlacement?.snapshot(),
          }));
        } catch (e: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message || 'Invalid JSON' }));
        }
      });
      return;
    }


    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private async executeAction(action: string, payload?: any) {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    switch (action) {
      case 'set-window-bounds': {
        const sc = getScreen();
        const area = sc ? sc.getDisplayMatching(win.getBounds()).workArea : { x: 0, y: 0, width: 1920, height: 1080 };
        const bounds = windowLayoutBounds(area, payload);
        this.smartPlacement?.pause();
        if (sc) { if (win.isMaximized()) win.unmaximize(); win.setBounds(bounds); }
        break;
      }
      case 'auto-detect':
        if (!this.smartPlacement) throw new Error('AutoDetect is unavailable.');
        await this.smartPlacement.detect();
        break;
      case 'auto-smart':
        if (!this.smartPlacement || typeof payload !== 'boolean') throw new Error('Choose whether Auto Smart is enabled.');
        this.smartPlacement.setEnabled(payload);
        break;
      case 'scroll-conversation-to':
        if (!Number.isFinite(payload) || payload < 0 || payload > 1) throw new Error('Choose a scroll position within the conversation.');
        win.webContents.send('global-action', { type: 'scroll-conversation-to', payload });
        break;
      case 'send-prompt':
        win.webContents.send('global-action', { type: 'submit-prompt' });
        break;

      case 'set-prompt':
        if (typeof payload !== 'string' || payload.length > 12_000) throw new Error('Keep the phone prompt within 12,000 characters.');
        if (!this.desktopState) throw new Error('Start a desktop chat before typing a prompt.');
        win.webContents.send('global-action', { type: 'set-prompt', payload });
        break;

      case 'capture-screen':
        win.webContents.send('global-action', { type: 'capture-screen' });
        break;

      case 'capture-and-send':
        win.webContents.send('global-action', { type: 'capture-and-send' });
        break;

      case 'delete-last-snapshot':
        win.webContents.send('global-action', { type: 'delete-last-snapshot' });
        break;

      case 'set-audio-source':
        if (payload === 'system' || payload === 'mic') {
          this.currentAudioSource = payload;
          win.webContents.send('global-action', { type: 'set-audio-source', payload });
        }
        break;

      case 'toggle-listening':
        win.webContents.send('global-action', { type: 'toggle-listening', payload: payload === 'both' || payload === 'microphone' ? payload : 'system' });
        break;

      case 'set-listening-mode':
        if (payload === 'system' || payload === 'both' || payload === 'microphone') win.webContents.send('global-action', { type: 'set-listening-mode', payload });
        break;

      case 'toggle-audio':
        win.webContents.send('global-action', { type: 'toggle-audio-record' });
        break;

      case 'set-app-mode':
        if (isAppMode(payload)) {
          if (this.desktopState && !this.desktopState.availableModes.includes(payload)) throw new Error('This mode is not available on your plan.');
          this.currentMode = payload;
          win.webContents.send('global-action', { type: 'set-app-mode', payload });
        }
        break;

      case 'toggle-coding-mode':
        this.currentMode = this.currentMode === 'coding' ? 'normal' : 'coding';
        win.webContents.send('global-action', { type: 'toggle-coding-mode' });
        break;

      case 'toggle-behavioral-mode':
        this.currentMode = this.currentMode === 'behavioral' ? 'normal' : 'behavioral';
        win.webContents.send('global-action', { type: 'toggle-behavioral-mode' });
        break;

      case 'toggle-transparent':
        this.stealth.toggleTransparent();
        break;

      case 'toggle-clickthrough':
        this.stealth.toggleClickThrough();
        break;

      case 'stop-generation':
        win.webContents.send('global-action', { type: 'stop-generation' });
        break;

      case 'quick-prompt':
        if (typeof payload === 'string' && payload.trim()) {
          win.webContents.send('global-action', { type: 'quick-prompt', payload: payload.trim() });
        }
        break;

      case 'rewindow': {
        const sc = getScreen();
        if (sc && typeof (win as any).getBounds === 'function') {
          const display = sc.getDisplayMatching(win.getBounds());
          const area = display.workArea;
          const bounds = win.getBounds();
          if (payload === 'left') {
            win.setBounds({ x: area.x, y: area.y, width: Math.min(bounds.width, Math.round(area.width * 0.5)), height: area.height });
          } else if (payload === 'right') {
            const w = Math.min(bounds.width, Math.round(area.width * 0.5));
            win.setBounds({ x: area.x + area.width - w, y: area.y, width: w, height: area.height });
          } else if (payload === 'center') {
            const w = Math.min(bounds.width, area.width);
            const h = Math.min(bounds.height, area.height);
            win.setBounds({ x: Math.round(area.x + (area.width - w) / 2), y: Math.round(area.y + (area.height - h) / 2), width: w, height: h });
          }
        }
        win.webContents.send('global-action', { type: 'rewindow', payload });
        break;
      }

      case 'reposition-window': {
        const sc = getScreen();
        if (sc && typeof payload === 'object' && payload !== null && typeof (win as any).getBounds === 'function') {
          const display = sc.getDisplayMatching(win.getBounds());
          const area = display.workArea;
          const bounds = win.getBounds();
          const targetX = Math.round(area.x + (payload.xRatio ?? 0.5) * Math.max(0, area.width - bounds.width));
          const targetY = Math.round(area.y + (payload.yRatio ?? 0.5) * Math.max(0, area.height - bounds.height));
          win.setPosition(targetX, targetY);
        }
        win.webContents.send('global-action', { type: 'reposition-window', payload });
        break;
      }

      case 'resize-window': {
        if (!payload || !Number.isFinite(payload.widthRatio) || !Number.isFinite(payload.heightRatio) ||
          payload.widthRatio < 0 || payload.widthRatio > 1 || payload.heightRatio < 0 || payload.heightRatio > 1) throw new Error('Choose a size within the screen.');
        const sc = getScreen();
        if (sc) {
          const area = sc.getDisplayMatching(win.getBounds()).workArea;
          const bounds = win.getBounds();
          const width = Math.max(Math.min(MAIN_WINDOW_MIN.width, area.width), Math.round(area.width * payload.widthRatio));
          const height = Math.max(Math.min(MAIN_WINDOW_MIN.height, area.height), Math.round(area.height * payload.heightRatio));
          win.setBounds({ x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height });
        }
        break;
      }

      case 'scroll-conversation':
        if (!Number.isFinite(payload) || Math.abs(payload) > 600) throw new Error('Choose a smaller scroll distance.');
        win.webContents.send('global-action', { type: 'scroll-conversation', payload });
        break;

      case 'change-reading-size':
        if (payload !== -1 && payload !== 1) throw new Error('Choose smaller or larger text.');
        win.webContents.send('global-action', { type: 'change-reading-size', payload });
        break;

    }
  }

  private renderMobileAppHTML(): string {
    const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
    const send = icon('M12 19V5m-6 6 6-6 6 6');
    const camera = icon('M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0');
    const mic = icon('M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Zm-3 5v2a6 6 0 0 0 12 0v-2m-6 8v4m-3 0h6');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#111111" />
  <title>Novi</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    :root { color-scheme: dark; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #111214; color: #f0f0f3; -webkit-text-size-adjust: 100%; }
    body { margin: 0; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); overscroll-behavior-y: contain; }
    button, select, input, textarea { font: inherit; }
    button { cursor: pointer; touch-action: manipulation; transition: background 160ms, transform 160ms, opacity 160ms; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible, [tabindex]:focus-visible { outline: 2px solid #99caff; outline-offset: 3px; }
    button:active { transform: scale(.97); }
    button:disabled { opacity: .4; cursor: default; }
    svg { width: 19px; height: 19px; flex: none; }
    [hidden] { display: none !important; }
    .app-container { max-width: 480px; margin: 0 auto; }
    .connection-error { margin: 0 0 10px; padding: 9px 11px; border: 1px solid #70433e; border-radius: 6px; background: #32201e; color: #ffb4ab; font-size: 11px; line-height: 1.5; }
    .controls-grid { display: grid; grid-template-areas: 'mode' 'hero' 'prompt' 'snapshot' 'audio' 'layout' 'utilities'; gap: 16px; }
    .hero-row { grid-area: hero; display: grid; grid-template-columns: minmax(0, 1fr) 48px 48px; gap: 8px; }
    .hero-btn, .stop-btn, .ctrl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; min-height: 46px; padding: 10px 12px; border: 0; border-radius: 12px; background: #222429; color: #e5e5ec; font-size: 12px; line-height: 1.3; }
    .hero-btn { min-height: 52px; background: #dcd8fa; border-color: #dcd8fa; color: #252035; font-size: 14px; font-weight: 600; }
    .stop-btn { color: #f1afad; }
    .mode-segment { grid-area: mode; display: flex; align-items: center; gap: 8px; color: #a0a1ac; }
    select { min-width: 0; min-height: 46px; padding: 8px 30px 8px 12px; border: 0; border-radius: 10px; background: #222429; color: #e5e5ec; font-size: 16px; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9ba6' stroke-width='1.8'%3E%3Cpath d='m8 10 4 4 4-4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; }
    #sessionMode { flex: 1; width: 0; background-color: transparent; font-size: 14px; }
    .ctrl-btn.active-state { background: #302c43; color: #e6e0ff; }
    .prompt-composer { grid-area: prompt; display: grid; gap: 8px; padding: 12px; border: 1px solid #393a44; border-radius: 14px; background: #1a1c20; }
    .prompt-composer header, .prompt-composer footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .prompt-composer label { color: #c6c6cf; font-size: 12px; }
    .prompt-composer textarea { width: 100%; min-height: 112px; max-height: 40dvh; padding: 4px; resize: vertical; border: 0; border-radius: 4px; background: transparent; color: #f0f0f3; font-size: 16px; line-height: 1.6; }
    .prompt-composer small { color: #9a9ba6; font-size: 11px; }
    .prompt-composer .ctrl-btn { width: 44px; min-height: 44px; }
    .prompt-composer footer .ctrl-btn { background: #dcd8fa; color: #252035; }
    .button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .layout-controls { grid-area: layout; display: grid; grid-template-columns: minmax(0, 1fr) 32px; gap: 8px; align-items: stretch; padding-top: 20px; border-top: 1px solid #2b2c32; }
    .window-section { min-width: 0; display: grid; align-content: start; gap: 14px; }
    .window-pad { --screen-aspect: 1.7778; position: relative; width: min(100%, calc(180px * var(--screen-aspect))); aspect-ratio: var(--screen-aspect); margin: auto; background: radial-gradient(ellipse at top, #252a34, #181a1f); border: 1px solid #353841; border-radius: 8px; touch-action: none; }
    .window-preview { position: absolute; left: 65%; top: 0; width: 35%; height: 100%; display: grid; place-items: center; min-width: 0; border: 1px solid #91bfff; border-radius: 3px; background: #99caff20; color: #b8d7ff; cursor: grab; touch-action: none; user-select: none; }
    .window-preview > svg { width: 18px; height: 18px; pointer-events: none; opacity: .7; }
    .window-preview.is-dragging { cursor: grabbing; background: #99caff30; }
    .window-handle { position: absolute; width: 20px; height: 20px; padding: 0; border: 0; background: transparent; touch-action: none; }
    .window-handle::after { content: ''; position: absolute; inset: 7px; border-radius: 2px; background: #bedbff; }
    .window-handle[data-edge='n'], .window-handle[data-edge='s'] { left: calc(50% - 10px); cursor: ns-resize; }
    .window-handle[data-edge='w'], .window-handle[data-edge='e'] { top: calc(50% - 10px); cursor: ew-resize; }
    .window-handle[data-edge*='n'] { top: -10px; } .window-handle[data-edge*='s'] { bottom: -10px; }
    .window-handle[data-edge*='w'] { left: -10px; } .window-handle[data-edge*='e'] { right: -10px; }
    .window-handle[data-edge='nw'], .window-handle[data-edge='se'] { cursor: nwse-resize; }
    .window-handle[data-edge='ne'], .window-handle[data-edge='sw'] { cursor: nesw-resize; }
    .placement-tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .placement-tools .ctrl-btn { width: 44px; min-height: 44px; padding: 10px; background: transparent; }
    .auto-smart { display: flex; align-items: center; gap: 9px; min-height: 44px; padding: 8px; color: #bbb; }
    .auto-smart input { accent-color: #b8b0e9; width: 18px; height: 18px; }
    .placement-note { margin: 0; color: #a0a1ac; font-size: 10px; line-height: 1.5; }
    .placement-note.error { color: #ffb4ab; }
    .scroll-section { display: flex; align-items: stretch; }
    .scroll-slider { --scroll-position: 1; position: relative; width: 32px; min-height: 120px; border-radius: 16px; touch-action: none; user-select: none; -webkit-user-select: none; cursor: ns-resize; }
    .scroll-track { position: absolute; inset: 18px 14px; overflow: hidden; border-radius: 4px; background: linear-gradient(#353841, #9aadd0); pointer-events: none; }
    .scroll-fill { display: block; width: 100%; height: calc(var(--scroll-position) * 100%); background: linear-gradient(#7b8fb9, #b7c9ec); }
    .scroll-thumb { position: absolute; top: calc((100% - 36px) * var(--scroll-position)); left: 9px; width: 14px; height: 36px; border-radius: 8px; background: #c1d9f5; pointer-events: none; transition: top 120ms ease, background 160ms; }
    .scroll-slider.is-dragging .scroll-thumb { background: #fff; }
    .scroll-slider[aria-disabled=true] { opacity: .3; cursor: default; }
    .utility-controls { grid-area: utilities; display: flex; align-items: center; justify-content: space-around; gap: 8px; padding-top: 12px; border-top: 1px solid #2b2c32; }
    .utility-controls .ctrl-btn { width: 48px; min-height: 48px; background: transparent; }
    .utility-controls .ctrl-btn.active-state { background: #302c43; }
    .snapshot-controls { grid-area: snapshot; } .audio-controls { grid-area: audio; }
    .snapshot-controls { grid-template-columns: 1fr 1fr 46px; }
    .audio-controls { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); padding: 0 0 4px; }
    .audio-controls select { width: 100%; font-size: 16px; }
    @media (orientation: landscape) and (min-width: 600px) {
      .app-container { max-width: 920px; }
      .controls-grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); grid-template-areas: 'mode hero' 'layout prompt' 'layout snapshot' 'layout audio' 'utilities utilities'; align-items: start; gap: 12px 20px; }
      .window-pad { width: min(100%, calc(130px * var(--screen-aspect))); }
      .layout-controls { height: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
  </style>
</head>
<body>
  <div class="app-container">
    <p id="connectionError" class="connection-error" role="alert" hidden></p>

    <div class="controls-grid">
      <div class="mode-segment">
        ${icon('M4 4h16v12H8l-4 4Z')}
        <select id="sessionMode" aria-label="Session mode" onchange="triggerAction('set-app-mode', this.value)" disabled>
          ${SESSION_MODES.map(mode => `<option value="${mode.id}">${mode.name}</option>`).join('')}
        </select>
      </div>

      <div class="hero-row">
        <button type="button" id="sendPrompt" class="hero-btn" onclick="sendCurrentPrompt()" disabled>
          ${send}<span>Send prompt</span>
        </button>
        <button type="button" id="togglePrompt" class="ctrl-btn" aria-label="Write a prompt" title="Write a prompt" aria-expanded="false" aria-controls="promptComposer" onclick="togglePromptEditor()" disabled>${icon('M12 20h9M16 3l5 5L8 21H3v-5Z')}</button>
        <button type="button" id="stopGeneration" class="stop-btn" aria-label="Stop generation" title="Stop generation" onclick="triggerAction('stop-generation')" disabled>
          ${icon('M6 6h12v12H6Z')}
        </button>
      </div>

      <form id="promptComposer" class="prompt-composer" onsubmit="sendPhonePrompt(event)" hidden>
        <header><label for="promptText">Your prompt</label><button type="button" class="ctrl-btn" aria-label="Collapse prompt editor" title="Collapse prompt editor" onclick="togglePromptEditor(false)">${icon('m6 9 6 6 6-6')}</button></header>
        <textarea id="promptText" maxlength="12000" placeholder="Ask anything…" aria-describedby="promptHint" oninput="queuePrompt()" disabled></textarea>
        <footer><small id="promptHint" role="status">Also appears in your desktop draft.</small><button type="submit" id="sendTypedPrompt" class="ctrl-btn" aria-label="Send typed prompt" title="Send typed prompt" disabled>${send}</button></footer>
      </form>

      <div class="button-row snapshot-controls">
        <button type="button" id="takeSnapshot" class="ctrl-btn" onclick="triggerAction('capture-screen')" disabled>
          ${camera}<span>Snapshot</span>
        </button>
        <button type="button" id="captureSend" class="ctrl-btn" onclick="triggerAction('capture-and-send')" disabled>${send}<span>Snap + send</span></button>
        <button type="button" id="deleteSnapshot" class="ctrl-btn" aria-label="Remove last snapshot" title="Remove last snapshot" onclick="triggerAction('delete-last-snapshot')" disabled>
          ${icon('M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7')}
        </button>
      </div>

      <div class="button-row audio-controls">
        <button type="button" id="listenButton" class="ctrl-btn" aria-pressed="false" onclick="triggerAction('toggle-listening', document.getElementById('listeningMode').value)" disabled>
          ${mic}<span id="listenText">Start listening</span>
        </button>
        <select id="listeningMode" aria-label="Audio input" onchange="triggerAction('set-listening-mode', this.value)" disabled>
          <option value="system">System audio</option>
          <option value="both">Mic + system audio</option>
          <option value="microphone">Mic only</option>
        </select>
      </div>

      <div class="layout-controls">
        <section class="window-section" aria-label="Desktop window layout">
          <div class="window-pad" id="windowPad">
            <div class="window-preview" id="windowPreview" tabindex="0" role="group" aria-label="Desktop window position and size">
              ${icon('M3 4h18v13H3Zm5 17h8m-4-4v4')}
              <button class="window-handle" type="button" data-edge="n" aria-label="Resize top edge"></button><button class="window-handle" type="button" data-edge="s" aria-label="Resize bottom edge"></button>
              <button class="window-handle" type="button" data-edge="w" aria-label="Resize left edge"></button><button class="window-handle" type="button" data-edge="e" aria-label="Resize right edge"></button>
              <button class="window-handle" type="button" data-edge="nw" aria-label="Resize top left corner"></button><button class="window-handle" type="button" data-edge="ne" aria-label="Resize top right corner"></button>
              <button class="window-handle" type="button" data-edge="sw" aria-label="Resize bottom left corner"></button><button class="window-handle" type="button" data-edge="se" aria-label="Resize bottom right corner"></button>
            </div>
          </div>
          <div class="placement-tools"><button type="button" class="ctrl-btn" id="autoDetect" aria-label="Find desktop space" title="Find desktop space · shares a screenshot with your AI model" onclick="triggerAction('auto-detect')">${icon('m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z')}</button><label class="auto-smart" title="Automatic placement · shares screenshots with your AI model"><input id="autoSmart" type="checkbox" aria-label="Automatic window placement" onchange="triggerAction('auto-smart', this.checked)" />${icon('m13 2-9 12h7l-1 8L22 9h-8Z')}</label></div>
          <p class="placement-note" id="placementStatus" role="status" hidden></p>
        </section>
        <section class="scroll-section" aria-label="Conversation scroll">
          <div class="scroll-slider" id="conversationScroll" role="slider" tabindex="-1" aria-label="Conversation scroll position" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="1000" aria-valuetext="Latest message" aria-disabled="true"><span class="scroll-track" aria-hidden="true"><span class="scroll-fill"></span></span><span class="scroll-thumb" aria-hidden="true"></span></div>
        </section>
      </div>
      <div class="utility-controls" role="group" aria-label="Desktop appearance and input">
        <button type="button" id="btnGhost" class="ctrl-btn" aria-label="Turn on transparency" title="Turn on transparency" aria-pressed="false" onclick="toggleTransparentSafe()">
          ${icon('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0')}
        </button>
        <button type="button" id="btnInteract" class="ctrl-btn" aria-label="Pass clicks through desktop window" title="Pass clicks through desktop window" aria-pressed="false" onclick="triggerAction('toggle-clickthrough')" disabled>
          ${icon('m4 3 16 9-8 1-4 7Z')}
        </button>
        <button type="button" class="ctrl-btn" aria-label="Decrease desktop interface size" title="Smaller text" onclick="triggerAction('change-reading-size', -1)">${icon('m3 19 5-14 5 14M5 14h6m5-2h6')}</button>
        <button type="button" class="ctrl-btn" aria-label="Increase desktop interface size" title="Larger text" onclick="triggerAction('change-reading-size', 1)">${icon('m3 19 5-14 5 14M5 14h6m5-2h6m-3-3v6')}</button>
      </div>
    </div>
  </div>

  <script>
    let clientId = localStorage.getItem('novi_companion_cid');
    if (!clientId) {
      clientId = 'phone_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('novi_companion_cid', clientId);
    }

    // 2. SCREEN WAKE LOCK
    async function initWakeLock() {
      if ('wakeLock' in navigator) {
        try { await navigator.wakeLock.request('screen'); }
        catch (e) { /* ignore */ }
      }
    }
    initWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') initWakeLock();
    });

    // 3. TACTILE HAPTIC VIBRATION
    function haptic() {
      if (navigator.vibrate) navigator.vibrate(25);
    }

    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token') || localStorage.getItem('novi_companion_token') || '';
    if (token) localStorage.setItem('novi_companion_token', token);
    history.replaceState(null, '', window.location.pathname);

    let isTransparent = false;
    let desktopAvailable = false, desktopBusy = true, promptSubmitting = false, promptTimer = 0;
    let promptSync = Promise.resolve(true);

    function updatePromptControls() {
      document.getElementById('togglePrompt').disabled = !desktopAvailable;
      document.getElementById('promptText').disabled = !desktopAvailable || promptSubmitting;
      document.getElementById('sendTypedPrompt').disabled = !desktopAvailable || desktopBusy || promptSubmitting || !document.getElementById('promptText').value.trim();
    }
    function togglePromptEditor(open = document.getElementById('promptComposer').hidden) {
      document.getElementById('promptComposer').hidden = !open;
      document.getElementById('togglePrompt').setAttribute('aria-expanded', String(open));
      if (open) document.getElementById('promptText').focus();
      else document.getElementById('togglePrompt').focus();
    }
    function queuePrompt() {
      clearTimeout(promptTimer);
      document.getElementById('promptHint').textContent = 'Syncing to desktop…';
      promptTimer = setTimeout(syncPrompt, 200);
      updatePromptControls();
    }
    function syncPrompt() {
      clearTimeout(promptTimer);
      const text = document.getElementById('promptText').value;
      promptSync = promptSync.then(async () => {
        const synced = await triggerAction('set-prompt', text, true);
        if (document.getElementById('promptText').value === text) document.getElementById('promptHint').textContent = synced ? 'Synced to your desktop draft.' : 'Draft kept here. Reconnect to sync.';
        return synced;
      });
      return promptSync;
    }
    function sendCurrentPrompt() {
      if (document.getElementById('promptText').value.trim()) return sendPhonePrompt({ preventDefault() {} });
      return triggerAction('send-prompt');
    }
    async function sendPhonePrompt(event) {
      event.preventDefault();
      if (promptSubmitting || !desktopAvailable || desktopBusy || !document.getElementById('promptText').value.trim()) return;
      promptSubmitting = true; updatePromptControls();
      try {
        if (!await syncPrompt() || !desktopAvailable || desktopBusy || !await triggerAction('send-prompt')) return;
        document.getElementById('promptText').value = '';
        document.getElementById('promptHint').textContent = 'Also appears in your desktop draft.';
        togglePromptEditor(false);
      } finally { promptSubmitting = false; updatePromptControls(); }
    }

    // 4. ACTION DISPATCH WITH LOW LATENCY
    async function triggerAction(action, payload, quiet = false) {
      if (!quiet) haptic();
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': clientId, 'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ action, payload }),
          keepalive: true
        });
        const data = await res.json();
        if (data.ok) {
          reportConnectionError('');
          updateUI(data);
          return true;
        } else {
          reportConnectionError(data.error || 'Action unavailable', false);
        }
      } catch (err) {
        reportConnectionError('Desktop unavailable. Reconnect using the link in Novi.');
      }
      return false;
    }

    function toggleTransparentSafe() {
      if (isTransparent) {
        if (!confirm('Make desktop window visible (turn off transparent mode)?')) {
          return;
        }
      }
      triggerAction('toggle-transparent');
    }

    const pad = document.getElementById('windowPad');
    const preview = document.getElementById('windowPreview');
    let windowRect = { xRatio: .65, yRatio: 0, widthRatio: .35, heightRatio: 1 };
    let minimum = { width: .12, height: .15 }, windowDrag = null, pendingWindow = null, windowSending = false, windowTimer = 0;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    function drawWindow() {
      preview.style.left = windowRect.xRatio * 100 + '%'; preview.style.top = windowRect.yRatio * 100 + '%';
      preview.style.width = windowRect.widthRatio * 100 + '%'; preview.style.height = windowRect.heightRatio * 100 + '%';
    }
    async function sendWindow() {
      windowTimer = 0;
      if (windowSending || !pendingWindow) return;
      const next = pendingWindow; pendingWindow = null; windowSending = true;
      try { await triggerAction('set-window-bounds', next, true); }
      finally { windowSending = false; if (pendingWindow) windowTimer = setTimeout(sendWindow, 80); }
    }
    function queueWindow() { pendingWindow = { ...windowRect }; if (!windowSending && !windowTimer) windowTimer = setTimeout(sendWindow, 80); }
    preview.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const edge = e.target.closest('[data-edge]');
      windowDrag = { x: e.clientX, y: e.clientY, rect: { ...windowRect }, pad: pad.getBoundingClientRect(), edge: edge ? edge.dataset.edge : 'move' };
      preview.setPointerCapture(e.pointerId); preview.classList.add('is-dragging'); e.preventDefault();
    });
    preview.addEventListener('pointermove', e => {
      if (!windowDrag) return;
      const d = windowDrag, dx = (e.clientX - d.x) / d.pad.width, dy = (e.clientY - d.y) / d.pad.height;
      let left = d.rect.xRatio, top = d.rect.yRatio, right = left + d.rect.widthRatio, bottom = top + d.rect.heightRatio;
      if (d.edge === 'move') {
        left = clamp(left + dx, 0, 1 - d.rect.widthRatio); top = clamp(top + dy, 0, 1 - d.rect.heightRatio);
        right = left + d.rect.widthRatio; bottom = top + d.rect.heightRatio;
      } else {
        if (d.edge.includes('w')) left = clamp(left + dx, 0, right - minimum.width);
        if (d.edge.includes('e')) right = clamp(right + dx, left + minimum.width, 1);
        if (d.edge.includes('n')) top = clamp(top + dy, 0, bottom - minimum.height);
        if (d.edge.includes('s')) bottom = clamp(bottom + dy, top + minimum.height, 1);
      }
      windowRect = { xRatio: left, yRatio: top, widthRatio: right - left, heightRatio: bottom - top }; drawWindow(); queueWindow();
    });
    function finishWindow(e) { if (!windowDrag) return; windowDrag = null; preview.classList.remove('is-dragging'); if (preview.hasPointerCapture(e.pointerId)) preview.releasePointerCapture(e.pointerId); queueWindow(); }
    preview.addEventListener('pointerup', finishWindow); preview.addEventListener('pointercancel', finishWindow); preview.addEventListener('lostpointercapture', finishWindow);
    preview.addEventListener('keydown', e => {
      const delta = e.shiftKey ? .05 : .01, edge = e.target.dataset.edge;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      if (edge) {
        let left = windowRect.xRatio, top = windowRect.yRatio, right = left + windowRect.widthRatio, bottom = top + windowRect.heightRatio;
        const dx = e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0, dy = e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0;
        if (edge.includes('w')) left = clamp(left + dx, 0, right - minimum.width); if (edge.includes('e')) right = clamp(right + dx, left + minimum.width, 1);
        if (edge.includes('n')) top = clamp(top + dy, 0, bottom - minimum.height); if (edge.includes('s')) bottom = clamp(bottom + dy, top + minimum.height, 1);
        windowRect = { xRatio: left, yRatio: top, widthRatio: right - left, heightRatio: bottom - top };
      } else {
        windowRect.xRatio = clamp(windowRect.xRatio + (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0), 0, 1 - windowRect.widthRatio);
        windowRect.yRatio = clamp(windowRect.yRatio + (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0), 0, 1 - windowRect.heightRatio);
      }
      drawWindow(); queueWindow();
    });
    const scrollSlider = document.getElementById('conversationScroll');
    let scrollDragging = null, scrollTimer = 0, pendingScroll = null, scrollSending = false, scrollPosition = 1, scrollDisabled = true, scrollSyncAfter = 0;
    function drawScroll(position) {
      scrollPosition = clamp(position, 0, 1);
      scrollSlider.style.setProperty('--scroll-position', scrollPosition);
      scrollSlider.setAttribute('aria-valuenow', String(Math.round(scrollPosition * 1000)));
      scrollSlider.setAttribute('aria-valuetext', scrollPosition === 0 ? 'Top of conversation' : scrollPosition === 1 ? 'Latest message' : Math.round(scrollPosition * 100) + '% through conversation');
    }
    async function sendScroll() {
      scrollTimer = 0; if (scrollSending || pendingScroll === null) return;
      const position = pendingScroll; pendingScroll = null; scrollSending = true;
      try { await triggerAction('scroll-conversation-to', position, true); }
      finally { scrollSending = false; if (pendingScroll !== null) scrollTimer = setTimeout(sendScroll, 80); }
    }
    function queueScroll(position) {
      drawScroll(position); pendingScroll = scrollPosition; scrollSyncAfter = Date.now() + 400;
      if (!scrollSending && !scrollTimer) scrollTimer = setTimeout(sendScroll, 60);
    }
    function scrollAt(clientY) {
      const rect = scrollSlider.getBoundingClientRect();
      queueScroll((clientY - rect.top - 18) / Math.max(1, rect.height - 36));
    }
    scrollSlider.addEventListener('pointerdown', event => {
      if (scrollDisabled || event.button !== 0 || !event.isPrimary) return;
      event.preventDefault(); scrollDragging = event.pointerId;
      scrollSlider.setPointerCapture(event.pointerId); scrollSlider.classList.add('is-dragging'); scrollAt(event.clientY);
    });
    scrollSlider.addEventListener('pointermove', event => {
      if (scrollDragging !== event.pointerId) return;
      event.preventDefault(); scrollAt(event.clientY);
    });
    function endScroll(event) {
      if (scrollDragging !== event.pointerId) return;
      scrollDragging = null; scrollSlider.classList.remove('is-dragging'); scrollSyncAfter = Date.now() + 400;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; } void sendScroll();
    }
    scrollSlider.addEventListener('pointerup', endScroll);
    scrollSlider.addEventListener('pointercancel', endScroll);
    scrollSlider.addEventListener('lostpointercapture', endScroll);
    scrollSlider.addEventListener('keydown', event => {
      if (scrollDisabled) return;
      const positions = { ArrowUp: scrollPosition - .05, ArrowDown: scrollPosition + .05, PageUp: scrollPosition - .2, PageDown: scrollPosition + .2, Home: 0, End: 1 };
      if (!(event.key in positions)) return;
      event.preventDefault(); queueScroll(positions[event.key]);
    });
    function reportConnectionError(message, disconnected = true) {
      const note = document.getElementById('connectionError');
      note.textContent = message; note.hidden = !message;
      if (message && disconnected) {
        desktopAvailable = false; updatePromptControls();
        for (const id of ['sendPrompt', 'stopGeneration', 'captureSend', 'takeSnapshot', 'deleteSnapshot', 'listenButton', 'listeningMode', 'sessionMode']) document.getElementById(id).disabled = true;
      }
    }

    // 7. REALTIME STATUS SYNC
    function updateUI(status) {
      if (status.windowLayout && !windowDrag && !pendingWindow && !windowSending) {
        const layout = status.windowLayout;
        windowRect = { xRatio: layout.xRatio, yRatio: layout.yRatio, widthRatio: layout.widthRatio, heightRatio: layout.heightRatio };
        minimum = { width: layout.minWidthRatio, height: layout.minHeightRatio };
        pad.style.setProperty('--screen-aspect', layout.aspectRatio); drawWindow();
      }
      if (status.conversationScroll) {
        scrollDisabled = !status.conversationScroll.scrollable;
        scrollSlider.setAttribute('aria-disabled', String(scrollDisabled)); scrollSlider.tabIndex = scrollDisabled ? -1 : 0;
        if (scrollDragging === null && pendingScroll === null && !scrollSending && Date.now() >= scrollSyncAfter) drawScroll(status.conversationScroll.position);
      }
      if (status.smartPlacement) {
        const smart = status.smartPlacement, button = document.getElementById('autoDetect'), note = document.getElementById('placementStatus');
        document.getElementById('autoSmart').checked = smart.enabled;
        button.disabled = smart.busy; button.setAttribute('aria-label', smart.busy ? 'Finding desktop space' : 'Find desktop space');
        button.setAttribute('aria-busy', String(smart.busy));
        note.className = 'placement-note' + (smart.error ? ' error' : '');
        note.textContent = smart.error || ''; note.hidden = !smart.error;
        button.title = 'Find desktop space · shares a screenshot with your AI model' + (smart.shortcutRegistered ? ' · ' + smart.shortcut : '');
      }
      isTransparent = Boolean(status.transparent);
      const btnGhost = document.getElementById('btnGhost');
      btnGhost.classList.toggle('active-state', isTransparent);
      btnGhost.setAttribute('aria-pressed', String(isTransparent));
      btnGhost.title = isTransparent ? 'Turn off transparency' : 'Turn on transparency';
      btnGhost.setAttribute('aria-label', btnGhost.title);

      const btnInteract = document.getElementById('btnInteract');
      btnInteract.disabled = !isTransparent;
      btnInteract.classList.toggle('active-state', !status.clickThrough && isTransparent);
      btnInteract.setAttribute('aria-pressed', String(!status.clickThrough));
      btnInteract.title = status.clickThrough ? 'Enable desktop input' : 'Pass clicks through desktop window';
      btnInteract.setAttribute('aria-label', btnInteract.title);

      const desktop = status.desktopState;
      desktopAvailable = Boolean(desktop); desktopBusy = !desktop || desktop.busy; updatePromptControls();
      const mode = document.getElementById('sessionMode');
      mode.value = desktop ? desktop.mode : status.currentMode || 'normal';
      mode.disabled = !desktop;
      for (const option of mode.options) option.disabled = !desktop || !desktop.availableModes.includes(option.value);
      document.getElementById('sendPrompt').disabled = !desktop || desktop.busy;
      document.getElementById('captureSend').disabled = !desktop || desktop.busy;
      document.getElementById('stopGeneration').disabled = !desktop || !desktop.busy;
      for (const id of ['takeSnapshot', 'deleteSnapshot', 'listenButton']) document.getElementById(id).disabled = !desktop;
      const listening = Boolean(desktop && desktop.listening);
      const listenButton = document.getElementById('listenButton');
      listenButton.classList.toggle('active-state', listening);
      listenButton.setAttribute('aria-pressed', String(listening));
      document.getElementById('listenText').textContent = listening ? 'Stop listening' : 'Start listening';
      const audio = document.getElementById('listeningMode');
      audio.disabled = !desktop || listening;
      if (desktop) audio.value = desktop.source;
    }

    async function pollStatus() {
      try {
        const res = await fetch('/api/status', {
          headers: { 'X-Client-Id': clientId, 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const data = await res.json();
          reportConnectionError('');
          updateUI(data);
        } else {
          reportConnectionError('Open the phone link in Novi to reconnect.');
        }
      } catch (e) {
        reportConnectionError('Desktop unavailable. Reconnect using the link in Novi.');
      }
    }

    setInterval(pollStatus, 1800);
    pollStatus();
  </script>
</body>
</html>`;
  }
}

import { isAppMode } from '../../shared/sessionModes';
import type { AppMode } from '../../shared/types';
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
  constructor(stealth: StealthService, getWindow: () => BrowserWindow | null, private smartPlacement?: SmartPlacementService) {
    this.stealth = stealth;
    this.getWindow = getWindow;
  }
  setConversationScroll(position: unknown, scrollable: unknown) {
    if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > 1 || typeof scrollable !== 'boolean') throw new Error('Invalid conversation scroll position.');
    this.conversationScroll = { position, scrollable };
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
        transparent: stealthState.transparent,
        clickThrough: stealthState.clickThrough,
        currentMode: this.currentMode,
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
            action: data.action,
            transparent: stealthState.transparent,
            clickThrough: stealthState.clickThrough,
            currentMode: this.currentMode,
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#111111" />
  <title>Novi Phone Companion</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    :root { color-scheme: dark; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #171717; color: #eee; }
    body { margin: 0; padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); overscroll-behavior-y: contain; }
    button, select, input { font: inherit; }
    button { cursor: pointer; touch-action: manipulation; transition: background 160ms, transform 160ms, opacity 160ms; }
    button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 2px solid #99caff; outline-offset: 3px; }
    button:active { transform: scale(.97); }
    button:disabled { opacity: .45; }
    .app-container { max-width: 460px; margin: 0 auto; }
    .header-compact { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 4px 12px; }
    .brand-compact { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #83d6a1; }
    .badge { font-size: 10px; color: #999; }
    .badge.error { color: #ffb4ab; }
    .controls-grid { display: grid; grid-template-areas: 'hero' 'mode' 'layout' 'reading' 'snapshot' 'audio' 'visibility'; gap: 10px; }
    .hero-row { grid-area: hero; display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 6px; }
    .hero-btn, .stop-btn, .ctrl-btn, .mode-tab-btn { min-width: 0; min-height: 40px; padding: 8px 10px; border: 1px solid #404040; border-radius: 6px; background: #272727; color: #eee; font-size: 12px; }
    .hero-btn { background: #dceaff; border-color: #dceaff; color: #182434; font-weight: 600; }
    .stop-btn { color: #ffb4ab; }
    .mode-segment { grid-area: mode; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px; background: #202020; border-radius: 6px; }
    .mode-tab-btn { border-color: transparent; background: transparent; min-height: 34px; padding: 6px 10px; color: #aaa; }
    .mode-tab-btn.active, .ctrl-btn.active-state { background: #353535; color: #fff; }
    .button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .layout-controls { grid-area: layout; display: grid; grid-template-columns: minmax(0, 1fr) 56px; gap: 10px; align-items: stretch; }
    .section-box { min-width: 0; padding: 12px; background: #202020; border-radius: 8px; display: grid; align-content: start; gap: 10px; }
    .section-label { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; color: #bbb; font-weight: 500; }
    .section-label > span:last-child:not(:first-child) { font-size: 10px; color: #888; }
    .window-pad { --screen-aspect: 1.7778; position: relative; width: min(100%, calc(180px * var(--screen-aspect))); aspect-ratio: var(--screen-aspect); margin: auto; background: #121212; border: 1px solid #383838; border-radius: 4px; touch-action: none; }
    .window-preview { position: absolute; left: 65%; top: 0; width: 35%; height: 100%; display: grid; place-items: center; min-width: 0; border: 1px solid #91bfff; border-radius: 3px; background: #99caff20; color: #b8d7ff; cursor: grab; touch-action: none; user-select: none; }
    .window-preview > span { font-size: 10px; pointer-events: none; }
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
    .placement-tools .ctrl-btn { min-height: 34px; padding: 6px 10px; font-size: 11px; }
    .auto-smart { display: flex; align-items: center; gap: 5px; color: #bbb; font-size: 11px; white-space: nowrap; }
    .placement-note { margin: 0; color: #999; font-size: 10px; line-height: 1.45; }
    .placement-note.error { color: #ffb4ab; }
    .scroll-section { padding: 10px 4px; justify-items: center; }
    .scroll-section .section-label { font-size: 10px; }
    .scroll-slider { writing-mode: vertical-lr; direction: ltr; appearance: none; width: 30px; height: 148px; min-height: 110px; margin: 0; background: transparent; touch-action: none; cursor: ns-resize; }
    .scroll-slider::-webkit-slider-runnable-track { width: 4px; border-radius: 10px; background: #414141; }
    .scroll-slider::-webkit-slider-thumb { appearance: none; width: 22px; height: 34px; margin-left: -9px; border: 1px solid #9bc6ff; border-radius: 12px; background: #b8d7ff; box-shadow: 0 1px 5px #0004; transition: box-shadow 160ms, background 160ms; }
    .scroll-slider:active::-webkit-slider-thumb { background: #fff; box-shadow: 0 0 0 5px #99caff20; }
    .scroll-slider::-moz-range-track { width: 4px; border-radius: 10px; background: #414141; }
    .scroll-slider::-moz-range-thumb { width: 22px; height: 34px; border: 1px solid #9bc6ff; border-radius: 12px; background: #b8d7ff; }
    .scroll-slider:disabled { opacity: .35; }
    .scroll-label { color: #888; font-size: 9px; }
    .reading-controls { grid-area: reading; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid #333; }
    .reading-controls .ctrl-btn { min-height: 34px; padding: 5px 13px; }
    .snapshot-controls { grid-area: snapshot; } .audio-controls { grid-area: audio; } .visibility-controls { grid-area: visibility; }
    @media (orientation: landscape) and (min-width: 600px) {
      .app-container { max-width: 920px; }
      .header-compact { padding-bottom: 8px; }
      .controls-grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); grid-template-areas: 'hero mode' 'layout reading' 'layout snapshot' 'layout audio' 'layout visibility'; align-items: start; gap: 8px 14px; }
      .window-pad { width: min(100%, calc(130px * var(--screen-aspect))); }
      .layout-controls { height: 100%; }
      .reading-controls { padding-top: 0; }
      .scroll-slider { height: 120px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
  </style>
</head>
<body>
  <div class="app-container">
    <div class="header-compact">
      <div class="brand-compact" title="Novi Companion">
        <span class="status-dot"></span>
        <span>Companion</span>
      </div>
      <div id="connBadge" class="badge">Ready</div>
    </div>

    <div class="controls-grid">
      <!-- 1. HERO: SEND PROMPT & STOP GENERATION IN SAME LINE -->
      <div class="hero-row">
        <button type="button" class="hero-btn" onclick="triggerAction('send-prompt')">
          <span>Send prompt</span>
        </button>
        <button type="button" class="stop-btn" onclick="triggerAction('stop-generation')">
          <span>Stop generate</span>
        </button>
        <button type="button" class="ctrl-btn" onclick="triggerAction('capture-and-send')">SS &amp; Send</button>
      </div>

      <!-- 2. MODE SELECTION (CHAT / CODE / INTERVIEW) -->
      <div class="mode-segment">
        <button type="button" id="tabChat" class="mode-tab-btn active" onclick="triggerAction('set-app-mode', 'normal')">
          <span>Chat</span>
        </button>
        <button type="button" id="tabCode" class="mode-tab-btn" onclick="triggerAction('set-app-mode', 'coding')">
          <span>Code</span>
        </button>
        <button type="button" id="tabInterview" class="mode-tab-btn" onclick="triggerAction('set-app-mode', 'behavioral')">
          <span>Interview</span>
        </button>
      </div>

      <div class="layout-controls">
        <section class="section-box window-section" aria-label="Desktop window layout">
          <div class="section-label"><span>Window layout</span><span>Move center · resize edges</span></div>
          <div class="window-pad" id="windowPad">
            <div class="window-preview" id="windowPreview" tabindex="0" role="group" aria-label="Desktop window position and size">
              <span>Novi</span>
              <button class="window-handle" type="button" data-edge="n" aria-label="Resize top edge"></button><button class="window-handle" type="button" data-edge="s" aria-label="Resize bottom edge"></button>
              <button class="window-handle" type="button" data-edge="w" aria-label="Resize left edge"></button><button class="window-handle" type="button" data-edge="e" aria-label="Resize right edge"></button>
              <button class="window-handle" type="button" data-edge="nw" aria-label="Resize top left corner"></button><button class="window-handle" type="button" data-edge="ne" aria-label="Resize top right corner"></button>
              <button class="window-handle" type="button" data-edge="sw" aria-label="Resize bottom left corner"></button><button class="window-handle" type="button" data-edge="se" aria-label="Resize bottom right corner"></button>
            </div>
          </div>
          <div class="placement-tools"><button type="button" class="ctrl-btn" id="autoDetect" onclick="triggerAction('auto-detect')">✦ AutoDetect</button><label class="auto-smart"><input id="autoSmart" type="checkbox" onchange="triggerAction('auto-smart', this.checked)" />Auto Smart</label></div>
          <p class="placement-note" id="placementStatus">Screenshots go to your selected AI model. Auto Smart is off.</p>
        </section>
        <section class="section-box scroll-section" aria-label="Conversation scroll">
          <span class="section-label">Scroll</span><span class="scroll-label">Top</span>
          <input class="scroll-slider" id="conversationScroll" type="range" min="0" max="1000" value="1000" step="1" aria-label="Conversation scroll position" aria-orientation="vertical" disabled />
          <span class="scroll-label">Latest</span>
        </section>
      </div>
      <div class="reading-controls"><span class="section-label">Size</span><div class="button-row">
        <button type="button" class="ctrl-btn" aria-label="Decrease desktop interface size" onclick="triggerAction('change-reading-size', -1)">A− Smaller</button>
        <button type="button" class="ctrl-btn" aria-label="Increase desktop interface size" onclick="triggerAction('change-reading-size', 1)">A+ Larger</button>
      </div></div>

      <!-- 5. SNAPSHOT CONTROLS -->
      <div class="button-row snapshot-controls">
        <button type="button" class="ctrl-btn" onclick="triggerAction('capture-screen')">
          <span>Take Snapshot</span>
        </button>
        <button type="button" class="ctrl-btn" onclick="triggerAction('delete-last-snapshot')">
          <span>Delete Last</span>
        </button>
      </div>

      <!-- 6. LIVE LISTENING -->
      <div class="button-row audio-controls">
        <button type="button" class="ctrl-btn" onclick="triggerAction('toggle-listening', document.getElementById('listeningMode').value)">
          <span>Start / stop listening</span>
        </button>
        <select id="listeningMode" class="ctrl-btn" aria-label="Audio input" onchange="triggerAction('set-listening-mode', this.value)">
          <option value="system">System audio</option>
          <option value="both">Mic + system audio</option>
          <option value="microphone">Mic only</option>
        </select>
      </div>

      <!-- 7. TRANSPARENT & INTERACTIVE TOGGLES (WITH CONFIRM ON NON-TRANSPARENT) -->
      <div class="button-row visibility-controls">
        <button type="button" id="btnGhost" class="ctrl-btn" onclick="toggleTransparentSafe()">
          <span id="txtGhost">Transparent</span>
        </button>
        <button type="button" id="btnInteract" class="ctrl-btn" onclick="triggerAction('toggle-clickthrough')">
          <span id="txtInteract">Interactive</span>
        </button>
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
          updateUI(data);
        } else {
          document.getElementById('connBadge').innerText = data.error || 'Action unavailable';
        }
      } catch (err) {
        document.getElementById('connBadge').innerText = 'Desktop unavailable';
      }
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
    let scrollDragging = false, scrollTimer = 0, pendingScroll = null, scrollSending = false;
    async function sendScroll() {
      scrollTimer = 0; if (scrollSending || pendingScroll === null) return;
      const position = pendingScroll; pendingScroll = null; scrollSending = true;
      try { await triggerAction('scroll-conversation-to', position, true); }
      finally { scrollSending = false; if (pendingScroll !== null) scrollTimer = setTimeout(sendScroll, 80); }
    }
    scrollSlider.addEventListener('pointerdown', () => { scrollDragging = true; });
    window.addEventListener('pointerup', () => { scrollDragging = false; });
    window.addEventListener('pointercancel', () => { scrollDragging = false; });
    scrollSlider.addEventListener('input', () => { pendingScroll = Number(scrollSlider.value) / 1000; if (!scrollSending && !scrollTimer) scrollTimer = setTimeout(sendScroll, 80); });

    // 7. REALTIME STATUS SYNC
    function updateUI(status) {
      if (status.windowLayout && !windowDrag && !pendingWindow && !windowSending) {
        const layout = status.windowLayout;
        windowRect = { xRatio: layout.xRatio, yRatio: layout.yRatio, widthRatio: layout.widthRatio, heightRatio: layout.heightRatio };
        minimum = { width: layout.minWidthRatio, height: layout.minHeightRatio };
        pad.style.setProperty('--screen-aspect', layout.aspectRatio); drawWindow();
      }
      if (status.conversationScroll && !scrollDragging && pendingScroll === null && !scrollSending) {
        scrollSlider.value = Math.round(status.conversationScroll.position * 1000);
        scrollSlider.disabled = !status.conversationScroll.scrollable;
      }
      if (status.smartPlacement) {
        const smart = status.smartPlacement, button = document.getElementById('autoDetect'), note = document.getElementById('placementStatus');
        document.getElementById('autoSmart').checked = smart.enabled;
        button.disabled = smart.busy; button.textContent = smart.busy ? 'Finding space…' : '✦ AutoDetect';
        note.className = 'placement-note' + (smart.error ? ' error' : '');
        note.textContent = smart.error || smart.reason || (smart.enabled ? 'Auto Smart on. Stable screen changes are analyzed by your AI model.' : 'Screenshots go to your selected AI model. Auto Smart is off.');
        button.title = smart.shortcutRegistered ? 'Shortcut: ' + smart.shortcut : 'AutoDetect shortcut is unavailable; use this button.';
      }
      isTransparent = Boolean(status.transparent);
      const btnGhost = document.getElementById('btnGhost');
      const txtGhost = document.getElementById('txtGhost');
      if (status.transparent) {
        btnGhost.classList.add('active-state');
        txtGhost.innerText = 'Transparent: ON';
      } else {
        btnGhost.classList.remove('active-state');
        txtGhost.innerText = 'Transparent: OFF';
      }

      const btnInteract = document.getElementById('btnInteract');
      const txtInteract = document.getElementById('txtInteract');
      if (status.clickThrough) {
        btnInteract.classList.add('active-state');
        txtInteract.innerText = 'Pass-Through';
      } else {
        btnInteract.classList.remove('active-state');
        txtInteract.innerText = 'Interactive';
      }

      if (status.currentMode) {
        document.getElementById('tabChat').classList.toggle('active', status.currentMode === 'normal');
        document.getElementById('tabCode').classList.toggle('active', status.currentMode === 'coding');
        document.getElementById('tabInterview').classList.toggle('active', status.currentMode === 'behavioral');
      }
    }

    async function pollStatus() {
      const badge = document.getElementById('connBadge');
      try {
        const res = await fetch('/api/status', {
          headers: { 'X-Client-Id': clientId, 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const data = await res.json();
          badge.className = 'badge connected';
          badge.innerText = '● Connected';
          badge.title = 'Connected to Novi.';
          updateUI(data);
        } else {
          badge.className = 'badge error';
          badge.innerText = 'Scan QR';
        }
      } catch (e) {
        badge.className = 'badge error';
        badge.innerText = 'Unavailable';
      }
    }

    setInterval(pollStatus, 1800);
    pollStatus();
  </script>
</body>
</html>`;
  }
}

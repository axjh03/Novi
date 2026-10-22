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

  constructor(stealth: StealthService, getWindow: () => BrowserWindow | null) {
    this.stealth = stealth;
    this.getWindow = getWindow;
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
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          this.recordClient(req);
          this.executeAction(data.action, data.payload);
          const stealthState = this.stealth.getState();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            action: data.action,
            transparent: stealthState.transparent,
            clickThrough: stealthState.clickThrough,
            currentMode: this.currentMode,
            currentAudioSource: this.currentAudioSource,
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

  private executeAction(action: string, payload?: any) {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    switch (action) {
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
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111; color: #eee; }
    body { margin: 0; padding: max(12px, env(safe-area-inset-top)) 10px max(14px, env(safe-area-inset-bottom)); overscroll-behavior-y: contain; }
    button { font: inherit; cursor: pointer; touch-action: manipulation; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    button:active { opacity: .7; }
    .app-container { max-width: 420px; margin: 0 auto; border: 1px solid #363636; border-radius: 16px; background: #191919; overflow: hidden; }
    .header-compact { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #282828; }
    .brand-compact { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #888; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; display: inline-block; }
    .badge { font-size: 10px; color: #aaa; border: 1px solid #444; padding: 3px 7px; border-radius: 20px; }
    .badge.connected { color: #eee; }
    .badge.error { border-style: dashed; }
    .controls-grid { display: grid; gap: 9px; padding: 12px; }
    .hero-row { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 8px; }
    .hero-btn, .stop-btn, .ctrl-btn, .mode-tab-btn { border: 1px solid #3b3b3b; border-radius: 8px; background: #222; color: #ddd; min-height: 42px; font-size: 12px; padding: 9px 8px; }
    .hero-btn { background: #eee; color: #111; border-color: #eee; font-size: 13px; font-weight: 650; }
    .stop-btn { background: #281919; color: #fca5a5; border-color: #552727; font-weight: 600; }
    .mode-segment { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; background: #111; border: 1px solid #333; border-radius: 10px; }
    .mode-tab-btn { border-color: transparent; background: transparent; min-height: 38px; font-weight: 550; }
    .mode-tab-btn.active, .ctrl-btn.active-state { background: #eee; border-color: #eee; color: #111; }
    .button-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .section-box { border: 1px solid #2d2d2d; border-radius: 10px; padding: 9px 10px; background: #141414; display: grid; gap: 8px; }
    .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #777; font-weight: 600; display: flex; justify-content: space-between; }
    .rewindow-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .rewindow-row button { min-height: 34px; font-size: 11px; padding: 6px 4px; border-radius: 6px; }
    .mockup-container { position: relative; height: 74px; border: 1px dashed #3a3a3a; border-radius: 8px; background: #0c0c0c; display: flex; align-items: center; justify-content: center; cursor: crosshair; touch-action: none; }
    .mockup-screen { position: absolute; inset: 6px; border: 1px solid #2e2e2e; border-radius: 5px; pointer-events: none; }
    .mockup-puck { position: absolute; width: 34px; height: 26px; border: 2px solid #a3c1ff; border-radius: 5px; background: rgba(163, 193, 255, 0.25); transform: translate(-50%, -50%); transition: left 80ms, top 80ms; pointer-events: none; }
    .resize-pad, .scroll-pad { height: 86px; border: 1px dashed #555; border-radius: 8px; background: #0c0c0c; touch-action: none; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 11px; user-select: none; }
    .resize-pad { position: relative; }
    .resize-preview { width: 50%; height: 55%; border: 2px solid #a3c1ff; border-radius: 4px; background: #25324b; pointer-events: none; }
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

      <!-- 3. REWINDOW & POSITION CONTROL WITH SCREEN MOCKUP -->
      <div class="section-box">
        <div class="section-label"><span>Window Position</span><span>Reposition</span></div>
        <div class="rewindow-row">
          <button type="button" class="ctrl-btn" onclick="triggerAction('rewindow', 'left')">◧ Left</button>
          <button type="button" class="ctrl-btn" onclick="triggerAction('rewindow', 'center')">▣ Center</button>
          <button type="button" class="ctrl-btn" onclick="triggerAction('rewindow', 'right')">◨ Right</button>
        </div>
        <div class="mockup-container" id="mockupPad" title="Tap or drag to reposition window">
          <div class="mockup-screen"></div>
          <div class="mockup-puck" id="mockupPuck" style="left: 50%; top: 50%;"></div>
        </div>
        <div class="section-label"><span>Window size</span><span>Drag to resize</span></div>
        <div class="resize-pad" id="resizePad" aria-label="Drag to resize the desktop window"><div class="resize-preview" id="resizePreview"></div></div>
      </div>

      <div class="section-box">
        <div class="section-label"><span>Conversation scroll</span><span>Swipe or tap</span></div>
        <div class="button-row"><button type="button" class="ctrl-btn" onclick="triggerAction('scroll-conversation', -400)">↑ Up</button><button type="button" class="ctrl-btn" onclick="triggerAction('scroll-conversation', 400)">↓ Down</button></div>
        <div class="scroll-pad" id="scrollPad">Swipe here to scroll desktop answers</div>
      </div>

      <div class="section-box">
        <div class="section-label"><span>Message &amp; code size</span></div>
        <div class="button-row">
          <button type="button" class="ctrl-btn" aria-label="Decrease desktop message and code font size" onclick="triggerAction('change-reading-size', -1)">A− Smaller</button>
          <button type="button" class="ctrl-btn" aria-label="Increase desktop message and code font size" onclick="triggerAction('change-reading-size', 1)">A+ Larger</button>
        </div>
      </div>

      <!-- 5. SNAPSHOT CONTROLS -->
      <div class="button-row">
        <button type="button" class="ctrl-btn" onclick="triggerAction('capture-screen')">
          <span>Take Snapshot</span>
        </button>
        <button type="button" class="ctrl-btn" onclick="triggerAction('delete-last-snapshot')">
          <span>Delete Last</span>
        </button>
      </div>

      <!-- 6. LIVE LISTENING -->
      <div class="button-row">
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
      <div class="button-row">
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
    async function triggerAction(action, payload) {
      haptic();
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

    // 5. INTERACTIVE SCREEN MOCKUP DRAG / TAP
    const pad = document.getElementById('mockupPad');
    const puck = document.getElementById('mockupPuck');
    function updatePuck(e) {
      const rect = pad.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const yRatio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      puck.style.left = (xRatio * 100) + '%';
      puck.style.top = (yRatio * 100) + '%';
      triggerAction('reposition-window', { xRatio, yRatio });
    }
    let padDragging = false;
    pad.addEventListener('pointerdown', (e) => { padDragging = true; updatePuck(e); });
    window.addEventListener('pointermove', (e) => { if (padDragging) updatePuck(e); });
    window.addEventListener('pointerup', () => { padDragging = false; });

    const resizePad = document.getElementById('resizePad');
    const resizePreview = document.getElementById('resizePreview');
    let resizing = false;
    function resizeAt(e) {
      const rect = resizePad.getBoundingClientRect();
      const widthRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const heightRatio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      resizePreview.style.width = (widthRatio * 100) + '%';
      resizePreview.style.height = (heightRatio * 100) + '%';
      return { widthRatio, heightRatio };
    }
    resizePad.addEventListener('pointerdown', e => { resizing = true; resizePad.setPointerCapture(e.pointerId); resizeAt(e); });
    resizePad.addEventListener('pointermove', e => { if (resizing) resizeAt(e); });
    resizePad.addEventListener('pointerup', e => { if (resizing) triggerAction('resize-window', resizeAt(e)); resizing = false; });

    const scrollPad = document.getElementById('scrollPad');
    let scrollStart = null;
    scrollPad.addEventListener('pointerdown', e => { scrollStart = e.clientY; scrollPad.setPointerCapture(e.pointerId); });
    scrollPad.addEventListener('pointerup', e => {
      if (scrollStart !== null) triggerAction('scroll-conversation', Math.max(-600, Math.min(600, Math.round((scrollStart - e.clientY) * 3))));
      scrollStart = null;
    });

    // 7. REALTIME STATUS SYNC
    function updateUI(status) {
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

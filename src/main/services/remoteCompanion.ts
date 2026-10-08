import http from 'node:http';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import type { StealthService } from './stealth';
import { generateQRCodeSVG } from './qrCode';
import { CloudflareTunnelService } from './cloudflareTunnel';
import type { RemoteCompanionStatus } from '../../shared/types';

export class RemoteCompanionService {
  private server: http.Server | null = null;
  private port = 4890;
  private readonly token = randomBytes(24).toString('hex');
  private activeClients = new Map<string, number>();
  private stealth: StealthService;
  private getWindow: () => BrowserWindow | null;
  private currentMode: 'normal' | 'behavioral' | 'coding' = 'normal';
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


  async toggleTunnel(enable?: boolean): Promise<RemoteCompanionStatus> {
    const shouldEnable = enable !== undefined ? enable : !this.tunnel.isActive();
    if (shouldEnable) {
      this.tunnelLoading = true;
      try {
        await this.tunnel.start(this.port);
      } finally {
        this.tunnelLoading = false;
      }
    } else {
      this.tunnel.stop();
      this.tunnelLoading = false;
    }
    return this.getStatus();
  }

  async start(preferredPort = 4890): Promise<RemoteCompanionStatus> {
    if (this.server && this.server.listening) return this.getStatus();
    this.port = preferredPort;

    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      srv.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          this.port++;
          srv.listen(this.port);
        } else {
          reject(err);
        }
      });

      srv.listen(this.port, () => {
        this.server = srv;
        const address = srv.address();
        if (address && typeof address !== 'string') this.port = address.port;
        resolve(this.getStatus());
      });
    });
  }

  stop(): void {
    this.tunnel.stop();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.activeClients.clear();
  }

  private recordClient(req: http.IncomingMessage) {
    const ip = req.socket.remoteAddress || 'client';
    const clientHeader = (req.headers['x-client-id'] as string) || '';
    const id = clientHeader ? `${ip}-${clientHeader}` : ip;
    this.activeClients.set(id, Date.now());
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // CORS headers for local LAN communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Id, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');

    // The scanned link authorizes the phone without a PIN prompt.
    if (pathname.startsWith('/api/') && req.headers.authorization !== `Bearer ${this.token}`) {
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

      case 'delete-last-snapshot':
        win.webContents.send('global-action', { type: 'delete-last-snapshot' });
        break;

      case 'set-audio-source':
        if (payload === 'system' || payload === 'mic') {
          this.currentAudioSource = payload;
          win.webContents.send('global-action', { type: 'set-audio-source', payload });
        }
        break;

      case 'toggle-audio':
        win.webContents.send('global-action', { type: 'toggle-audio-record' });
        break;

      case 'set-app-mode':
        if (payload === 'normal' || payload === 'behavioral' || payload === 'coding') {
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
    body { margin: 0; padding: max(16px, env(safe-area-inset-top)) 12px max(16px, env(safe-area-inset-bottom)); overscroll-behavior-y: contain; }
    button { font: inherit; cursor: pointer; touch-action: manipulation; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    button:active { opacity: .7; }
    .app-container { max-width: 420px; margin: 0 auto; border: 1px solid #363636; border-radius: 18px; background: #191919; overflow: hidden; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 18px 16px; border-bottom: 1px solid #333; }
    .brand { font-size: 15px; font-weight: 650; letter-spacing: -.03em; }
    .badge { font-size: 10px; color: #aaa; border: 1px solid #444; padding: 4px 7px; border-radius: 20px; }
    .badge.connected { color: #eee; }
    .badge.error { border-style: dashed; }
    .controls-grid { display: grid; gap: 10px; padding: 14px; }
    .hero-btn, .stop-btn, .ctrl-btn, .chip-btn, .mode-tab-btn { border: 1px solid #3b3b3b; border-radius: 8px; background: #222; color: #ddd; min-height: 44px; font-size: 12px; padding: 10px 8px; }
    .hero-btn { background: #eee; color: #111; border-color: #eee; font-size: 14px; font-weight: 650; min-height: 50px; }
    .mode-segment { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; background: #111; border: 1px solid #333; border-radius: 10px; }
    .mode-tab-btn { border-color: transparent; background: transparent; min-height: 40px; }
    .mode-tab-btn.active, .ctrl-btn.active-state { background: #eee; border-color: #eee; color: #111; }
    .button-row, .quick-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .stop-btn { background: transparent; }
    .quick-section { border-top: 1px solid #333; padding-top: 12px; margin-top: 2px; }
    .quick-title { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #999; margin-bottom: 8px; }
    .chip-btn { background: #1c1c1c; font-size: 11px; }
  </style>
</head>
<body>
  <div class="app-container">
    <div class="header">
      <div class="brand">
        Novi Companion
      </div>
      <div id="connBadge" class="badge">Ready</div>
    </div>

    <div class="controls-grid">
      <!-- 1. HERO Send prompt CHAT -->
      <button type="button" class="hero-btn" onclick="triggerAction('send-prompt')">
        <span>Send prompt</span>
      </button>

      <!-- 2. MODE SELECTION (CHAT / INTERVIEW / CODE) -->
      <div class="mode-segment">
        <button type="button" id="tabChat" class="mode-tab-btn active" onclick="triggerAction('set-app-mode', 'normal')">
          <span>Chat</span>
        </button>
        <button type="button" id="tabInterview" class="mode-tab-btn" onclick="triggerAction('set-app-mode', 'behavioral')">
          <span>Interview</span>
        </button>
        <button type="button" id="tabCode" class="mode-tab-btn" onclick="triggerAction('set-app-mode', 'coding')">
          <span>Code</span>
        </button>
      </div>

      <!-- 3. SNAPSHOT CONTROLS -->
      <div class="button-row">
        <button type="button" class="ctrl-btn" onclick="triggerAction('capture-screen')">
          <span>Take Snapshot</span>
        </button>
        <button type="button" class="ctrl-btn" onclick="triggerAction('delete-last-snapshot')">
          <span>Delete Last</span>
        </button>
      </div>

      <!-- 4. AUDIO CONTROLS (RECORD & SOURCE SWITCH) -->
      <div class="button-row">
        <button type="button" class="ctrl-btn" onclick="triggerAction('toggle-audio')">
          <span>Toggle Audio</span>
        </button>
        <button type="button" id="btnAudioSource" class="ctrl-btn" onclick="toggleAudioSource()">
          <span id="txtAudioSource">System Audio</span>
        </button>
      </div>

      <!-- 5. TRANSPARENT & INTERACTIVE TOGGLES -->
      <div class="button-row">
        <button type="button" id="btnGhost" class="ctrl-btn" onclick="triggerAction('toggle-transparent')">
          <span id="txtGhost">Transparent</span>
        </button>
        <button type="button" id="btnInteract" class="ctrl-btn" onclick="triggerAction('toggle-clickthrough')">
          <span id="txtInteract">Interactive</span>
        </button>
      </div>

      <!-- 6. STOP AI GENERATION -->
      <button type="button" class="stop-btn" onclick="triggerAction('stop-generation')">
        <span>Stop AI Generation</span>
      </button>

      <!-- 7. QUICK PROMPT CHIPS -->
      <div class="quick-section">
        <div class="quick-title">Quick Prompts</div>
        <div class="quick-chips">
          <button type="button" class="chip-btn" onclick="triggerPrompt('Summarize this clearly and highlight key points.')">Summarize</button>
          <button type="button" class="chip-btn" onclick="triggerPrompt('Explain simply in plain language.')">Explain simply</button>
          <button type="button" class="chip-btn" onclick="triggerPrompt('What is the optimal next step?')">Next step</button>
          <button type="button" class="chip-btn" onclick="triggerPrompt('Structure this using STAR interview framework.')">STAR Method</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let clientId = localStorage.getItem('novi_companion_cid');
    if (!clientId) {
      clientId = 'phone_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('novi_companion_cid', clientId);
    }

    // 2. SCREEN WAKE LOCK - Keeps phone awake during active session
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
    let currentAudioSource = 'system';

    // 5. AUDIO SOURCE TOGGLE (System vs Mic)
    function toggleAudioSource() {
      const nextSource = currentAudioSource === 'system' ? 'mic' : 'system';
      triggerAction('set-audio-source', nextSource);
    }

    // 6. ACTION DISPATCH WITH LOW LATENCY
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

    function triggerPrompt(text) {
      triggerAction('quick-prompt', text);
    }

    // 7. REALTIME STATUS SYNC
    function updateUI(status) {
      // Transparency
      const btnGhost = document.getElementById('btnGhost');
      const txtGhost = document.getElementById('txtGhost');
      if (status.transparent) {
        btnGhost.classList.add('active-state');
        txtGhost.innerText = 'Transparent: ON';
      } else {
        btnGhost.classList.remove('active-state');
        txtGhost.innerText = 'Transparent: OFF';
      }

      // Interactive Pass-Through
      const btnInteract = document.getElementById('btnInteract');
      const txtInteract = document.getElementById('txtInteract');
      if (status.clickThrough) {
        btnInteract.classList.add('active-state');
        txtInteract.innerText = 'Pass-Through';
      } else {
        btnInteract.classList.remove('active-state');
        txtInteract.innerText = 'Interactive';
      }

      // Audio Source
      if (status.currentAudioSource) {
        currentAudioSource = status.currentAudioSource;
        const txtSrc = document.getElementById('txtAudioSource');
        if (currentAudioSource === 'mic') {
          txtSrc.innerText = 'Mic Audio';
        } else {
          txtSrc.innerText = 'System Audio';
        }
      }

      // App Mode Tabs
      if (status.currentMode) {
        document.getElementById('tabChat').classList.toggle('active', status.currentMode === 'normal');
        document.getElementById('tabInterview').classList.toggle('active', status.currentMode === 'behavioral');
        document.getElementById('tabCode').classList.toggle('active', status.currentMode === 'coding');
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
          badge.innerText = 'Scan the QR in Novi';
        }
      } catch (e) {
        badge.className = 'badge error';
        badge.innerText = 'Desktop unavailable';
      }
    }

    setInterval(pollStatus, 1800);
    pollStatus();
  </script>
</body>
</html>`;
  }
}

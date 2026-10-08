import http from 'node:http';
import os from 'node:os';
import type { BrowserWindow } from 'electron';
import type { StealthService } from './stealth';
import { generateQRCodeSVG } from './qrCode';

export interface RemoteCompanionStatus {
  running: boolean;
  port: number;
  pin: string;
  localIps: string[];
  bestUrl: string;
  qrSvg: string;
  connectedClients: number;
}

export class RemoteCompanionService {
  private server: http.Server | null = null;
  private port = 4890;
  private pin = '';
  private clients = new Set<http.ServerResponse>();
  private stealth: StealthService;
  private getWindow: () => BrowserWindow | null;
  private currentMode: 'normal' | 'behavioral' | 'coding' = 'normal';
  private currentAudioSource: 'system' | 'mic' = 'system';

  constructor(stealth: StealthService, getWindow: () => BrowserWindow | null) {
    this.stealth = stealth;
    this.getWindow = getWindow;
    this.regeneratePIN();
  }

  regeneratePIN(): string {
    // Generate a secure, user-friendly 4-digit pairing code (1000 - 9999)
    this.pin = String(Math.floor(1000 + Math.random() * 9000));
    return this.pin;
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
    const ips = this.getLocalIPs();
    // Prioritize standard local subnets (192.168.x.x, 10.x.x.x, 172.x.x.x)
    const preferred = ips.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) || ips[0];
    return `http://${preferred}:${this.port}?pin=${this.pin}`;
  }

  getStatus(): RemoteCompanionStatus {
    const running = Boolean(this.server && this.server.listening);
    const bestUrl = this.getBestUrl();
    const qrSvg = generateQRCodeSVG(bestUrl, { size: 240, margin: 2, darkColor: '#00e5a3', lightColor: '#121316' });
    return {
      running,
      port: this.port,
      pin: this.pin,
      localIps: this.getLocalIPs(),
      bestUrl,
      qrSvg,
      connectedClients: this.clients.size,
    };
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
        resolve(this.getStatus());
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.clients.clear();
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // CORS headers for local LAN communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Mobile App Controller HTML
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderMobileAppHTML());
      return;
    }

    // 2. Status verification
    if (pathname === '/api/status') {
      const pin = parsedUrl.searchParams.get('pin');
      if (pin !== this.pin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or expired 4-digit PIN' }));
        return;
      }
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

    // 3. Dynamic QR code SVG endpoint
    if (pathname === '/api/qr') {
      const bestUrl = this.getBestUrl();
      const svg = generateQRCodeSVG(bestUrl, { size: 240, margin: 2, darkColor: '#00e5a3', lightColor: '#121316' });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(svg);
      return;
    }

    // 4. Remote Action Execution
    if (pathname === '/api/action' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (data.pin !== this.pin) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid 4-digit PIN' }));
            return;
          }
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#0a0a0c" />
  <title>Astra Remote Controller</title>
  <style>
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      outline: none;
    }
    /* COMPLETE SCREEN LOCK - Disables pull-to-refresh and swipe navigation */
    html, body {
      position: fixed;
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 0;
      overflow: hidden;
      overscroll-behavior: none;
      overscroll-behavior-y: none;
      overscroll-behavior-x: none;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      background: #0a0a0c;
      color: #f1f3f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: env(safe-area-inset-top, 10px) 14px env(safe-area-inset-bottom, 12px) 14px;
      gap: 10px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 2px;
      flex-shrink: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.02em;
    }
    .brand-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00e5a3;
      box-shadow: 0 0 10px #00e5a3;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 20px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: #8e94a0;
    }
    .badge.connected {
      color: #00e5a3;
      border-color: rgba(0,229,163,0.3);
      background: rgba(0,229,163,0.08);
    }
    .badge.error {
      color: #ff4d4f;
      border-color: rgba(255,77,79,0.3);
      background: rgba(255,77,79,0.08);
    }

    /* CONTROLS SCROLLER/CONTAINER */
    .controls-grid {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 9px;
      justify-content: space-between;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    /* 1. HERO ONE-CLICK SEND */
    .hero-btn {
      width: 100%;
      min-height: 68px;
      border-radius: 16px;
      border: 1px solid #00e5a3;
      background: linear-gradient(135deg, #00e5a3 0%, #00b37e 100%);
      color: #050b08;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 6px 20px rgba(0,229,163,0.28);
      cursor: pointer;
      transition: transform 60ms ease, filter 60ms ease;
      flex-shrink: 0;
    }
    .hero-btn:active {
      transform: scale(0.97);
      filter: brightness(0.9);
    }

    /* 2. MODE SELECTOR SEGMENT */
    .mode-segment {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
      background: #121316;
      padding: 4px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
    }
    .mode-tab-btn {
      background: transparent;
      border: none;
      color: #8b929e;
      font-size: 12px;
      font-weight: 600;
      padding: 10px 4px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      transition: all 80ms ease;
    }
    .mode-tab-btn.active {
      background: rgba(0,229,163,0.15);
      color: #00e5a3;
      font-weight: 700;
      box-shadow: 0 0 10px rgba(0,229,163,0.15);
    }
    .mode-tab-btn:active {
      transform: scale(0.96);
    }

    /* BUTTON ROWS */
    .button-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      flex-shrink: 0;
    }
    .ctrl-btn {
      background: #14161b;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 13px;
      color: #e5e7eb;
      padding: 12px 8px;
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 60ms ease;
    }
    .ctrl-btn:active {
      transform: scale(0.96);
      background: #1e2128;
    }
    .ctrl-btn.active-state {
      background: rgba(0,229,163,0.14);
      border-color: #00e5a3;
      color: #00e5a3;
      box-shadow: 0 0 14px rgba(0,229,163,0.22);
    }
    .ctrl-btn.danger-active {
      background: rgba(255,77,79,0.14);
      border-color: #ff4d4f;
      color: #ff7875;
    }
    .ctrl-btn .icon {
      font-size: 17px;
    }

    /* STOP AI BUTTON */
    .stop-btn {
      width: 100%;
      min-height: 42px;
      border-radius: 12px;
      border: 1px solid rgba(255,77,79,0.4);
      background: rgba(255,77,79,0.1);
      color: #ff7875;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: all 60ms ease;
      flex-shrink: 0;
    }
    .stop-btn:active {
      transform: scale(0.97);
      background: rgba(255,77,79,0.25);
    }

    /* QUICK PROMPTS */
    .quick-section {
      background: #111215;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 13px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    .quick-title {
      font-size: 10px;
      font-weight: 700;
      color: #717784;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .quick-chips {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .chip-btn {
      background: #1a1c22;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 9px;
      color: #d1d5db;
      font-size: 11px;
      font-weight: 500;
      padding: 8px 6px;
      text-align: center;
      cursor: pointer;
      transition: transform 60ms ease;
    }
    .chip-btn:active {
      transform: scale(0.96);
      background: #262932;
    }

    /* PIN OVERLAY - 4 DIGIT PIN */
    .pin-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(10,10,12,0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      gap: 18px;
      z-index: 100;
    }
    .pin-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0;
    }
    .pin-desc {
      color: #8e94a0;
      font-size: 14px;
      text-align: center;
      max-width: 280px;
      margin: 0;
      line-height: 1.4;
    }
    .pin-input {
      font-size: 38px;
      font-weight: 800;
      letter-spacing: 14px;
      text-align: center;
      background: #16181f;
      border: 2px solid #00e5a3;
      border-radius: 14px;
      color: #fff;
      padding: 12px 10px;
      width: 200px;
      outline: none;
      box-shadow: 0 0 20px rgba(0,229,163,0.25);
    }
  </style>
</head>
<body>
  <div class="app-container">
    <div class="header">
      <div class="brand">
        <span class="brand-dot"></span> Astra Companion
      </div>
      <div id="connBadge" class="badge">Connecting…</div>
    </div>

    <div class="controls-grid">
      <!-- 1. HERO ONE-CLICK SEND CHAT -->
      <button type="button" class="hero-btn" onclick="triggerAction('send-prompt')">
        <span>🚀 ONE-CLICK SEND</span>
      </button>

      <!-- 2. MODE SELECTION (CHAT / INTERVIEW / CODE) -->
      <div class="mode-segment">
        <button type="button" id="tabChat" class="mode-tab-btn active" onclick="triggerAction('set-app-mode', 'normal')">
          <span>💬</span>
          <span>Chat</span>
        </button>
        <button type="button" id="tabInterview" class="mode-tab-btn" onclick="triggerAction('set-app-mode', 'behavioral')">
          <span>👔</span>
          <span>Interview</span>
        </button>
        <button type="button" id="tabCode" class="mode-tab-btn" onclick="triggerAction('set-app-mode', 'coding')">
          <span>💻</span>
          <span>Code</span>
        </button>
      </div>

      <!-- 3. SNAPSHOT CONTROLS -->
      <div class="button-row">
        <button type="button" class="ctrl-btn" onclick="triggerAction('capture-screen')">
          <span class="icon">📸</span>
          <span>Take Snapshot</span>
        </button>
        <button type="button" class="ctrl-btn" onclick="triggerAction('delete-last-snapshot')">
          <span class="icon">🗑️</span>
          <span>Delete Last</span>
        </button>
      </div>

      <!-- 4. AUDIO CONTROLS (RECORD & SOURCE SWITCH) -->
      <div class="button-row">
        <button type="button" class="ctrl-btn" onclick="triggerAction('toggle-audio')">
          <span class="icon">🎙️</span>
          <span>Toggle Audio</span>
        </button>
        <button type="button" id="btnAudioSource" class="ctrl-btn" onclick="toggleAudioSource()">
          <span class="icon" id="iconAudioSource">🔊</span>
          <span id="txtAudioSource">System Audio</span>
        </button>
      </div>

      <!-- 5. TRANSPARENT & INTERACTIVE TOGGLES -->
      <div class="button-row">
        <button type="button" id="btnGhost" class="ctrl-btn" onclick="triggerAction('toggle-transparent')">
          <span class="icon">👻</span>
          <span id="txtGhost">Transparent</span>
        </button>
        <button type="button" id="btnInteract" class="ctrl-btn" onclick="triggerAction('toggle-clickthrough')">
          <span class="icon">🖱️</span>
          <span id="txtInteract">Interactive</span>
        </button>
      </div>

      <!-- 6. STOP AI GENERATION -->
      <button type="button" class="stop-btn" onclick="triggerAction('stop-generation')">
        <span>⏹️ Stop AI Generation</span>
      </button>

      <!-- 7. QUICK PROMPT CHIPS -->
      <div class="quick-section">
        <div class="quick-title">Quick Prompts</div>
        <div class="quick-chips">
          <button type="button" class="chip-btn" onclick="triggerPrompt('Summarize this clearly and highlight key points.')">⚡ Summarize</button>
          <button type="button" class="chip-btn" onclick="triggerPrompt('Explain simply in plain language.')">💡 Explain simply</button>
          <button type="button" class="chip-btn" onclick="triggerPrompt('What is the optimal next step?')">🎯 Next step</button>
          <button type="button" class="chip-btn" onclick="triggerPrompt('Structure this using STAR interview framework.')">⭐ STAR Method</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 4-DIGIT PIN ENTRY MODAL -->
  <div id="pinModal" class="pin-overlay" style="display: none;">
    <h2 class="pin-title">Pair with Desktop</h2>
    <p class="pin-desc">Enter the 4-digit code shown on your desktop screen:</p>
    <input type="number" id="pinInput" class="pin-input" pattern="[0-9]*" inputmode="numeric" maxlength="4" placeholder="••••" oninput="handlePinInput(this)" />
    <button type="button" class="hero-btn" style="min-height: 50px; font-size: 16px;" onclick="savePin()">Pair & Connect</button>
  </div>

  <script>
    // 1. MOBILE GESTURE LOCK - Blocks pull-to-refresh & swipe back/forward
    document.addEventListener('touchmove', function(e) {
      // Allow internal scrolling in controls grid if content overflows
      const target = e.target;
      if (target && target.closest && target.closest('.controls-grid')) {
        return;
      }
      e.preventDefault();
    }, { passive: false });

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

    // 4. 4-DIGIT SESSION PIN HANDLING
    const params = new URLSearchParams(window.location.search);
    let sessionPin = params.get('pin') || localStorage.getItem('astra_remote_pin') || '';
    let currentAudioSource = 'system';

    function checkPin() {
      if (!sessionPin || sessionPin.length < 4) {
        document.getElementById('pinModal').style.display = 'flex';
        setTimeout(() => document.getElementById('pinInput').focus(), 150);
      } else {
        document.getElementById('pinModal').style.display = 'none';
        pollStatus();
      }
    }

    function handlePinInput(input) {
      if (input.value.length > 4) input.value = input.value.slice(0, 4);
      if (input.value.length === 4) {
        savePin();
      }
    }

    function savePin() {
      const val = document.getElementById('pinInput').value.trim();
      if (val.length === 4) {
        sessionPin = val;
        localStorage.setItem('astra_remote_pin', val);
        document.getElementById('pinModal').style.display = 'none';
        pollStatus();
      }
    }

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: sessionPin, action, payload }),
          keepalive: true
        });
        const data = await res.json();
        if (data.ok) {
          updateUI(data);
        } else if (data.error && data.error.includes('PIN')) {
          localStorage.removeItem('astra_remote_pin');
          sessionPin = '';
          checkPin();
        }
      } catch (err) {
        console.warn('Action dispatch stutter:', err);
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
        const iconSrc = document.getElementById('iconAudioSource');
        const txtSrc = document.getElementById('txtAudioSource');
        if (currentAudioSource === 'mic') {
          iconSrc.innerText = '🎙️';
          txtSrc.innerText = 'Mic Audio';
        } else {
          iconSrc.innerText = '🔊';
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
      if (!sessionPin) return;
      const badge = document.getElementById('connBadge');
      try {
        const res = await fetch('/api/status?pin=' + encodeURIComponent(sessionPin));
        if (res.ok) {
          const data = await res.json();
          badge.className = 'badge connected';
          badge.innerText = '● Connected';
          updateUI(data);
        } else {
          badge.className = 'badge error';
          badge.innerText = '● Invalid PIN';
        }
      } catch (e) {
        badge.className = 'badge error';
        badge.innerText = '● Reconnecting';
      }
    }

    setInterval(pollStatus, 1800);
    checkPin();
  </script>
</body>
</html>`;
  }
}

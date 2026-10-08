import { useEffect, useState } from 'react';
import { Check, Copy, Globe, RefreshCw, Smartphone, Wifi, X } from 'lucide-react';
import type { RemoteCompanionStatus } from '../../../shared/types';
import { unwrap } from '../services/api';

interface RemoteCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RemoteCompanionModal({ isOpen, onClose }: RemoteCompanionModalProps) {
  const [status, setStatus] = useState<RemoteCompanionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [tunnelToggling, setTunnelToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await unwrap(window.novi.getRemoteCompanionStatus());
        if (active) setStatus(res);
      } catch (err) {
        console.error('Failed to get remote companion status:', err);
      }
    };

    void fetchStatus();
    const interval = setInterval(fetchStatus, 2500);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const [pinCopied, setPinCopied] = useState(false);

  const handleCopyUrl = async () => {
    if (!status?.bestUrl) return;
    try {
      if (window.novi?.copyText) {
        await unwrap(window.novi.copyText(status.bestUrl));
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(status.bestUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard?.writeText(status.bestUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    }
  };

  const handleCopyPin = async () => {
    if (!status?.pin) return;
    try {
      if (window.novi?.copyText) {
        await unwrap(window.novi.copyText(status.pin));
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(status.pin);
      }
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard?.writeText(status.pin);
        setPinCopied(true);
        setTimeout(() => setPinCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy PIN:', err);
      }
    }
  };


  const handleRegeneratePin = async () => {
    setLoading(true);
    try {
      const res = await unwrap(window.novi.regenerateRemotePin());
      setStatus(res);
    } catch (err) {
      console.error('Failed to regenerate pin:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTunnel = async (enable: boolean) => {
    if (status?.tunnelActive === enable || tunnelToggling) return;
    setTunnelToggling(true);
    try {
      const res = await unwrap(window.novi.toggleRemoteTunnel(enable));
      setStatus(res);
    } catch (err) {
      console.error('Failed to toggle tunnel:', err);
    } finally {
      setTunnelToggling(false);
    }
  };

  return (
    <div className="companion-modal-overlay" onClick={onClose}>
      <div className="companion-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="companion-modal-header">
          <div className="companion-modal-title-group">
            <div className="companion-modal-icon-badge">
              <Smartphone size={18} />
            </div>
            <div>
              <h3>Phone Remote Controller</h3>
              <p>Scan with your phone to control chat, modes & snapshots remotely</p>
            </div>
          </div>
          <button type="button" className="companion-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="companion-modal-body">
          {/* Left: QR Code */}
          <div className="companion-qr-wrapper">
            {tunnelToggling || status?.tunnelLoading ? (
              <div className="companion-qr-loading">
                <RefreshCw size={24} className="spinning" />
                <span>Creating Cloudflare Tunnel…</span>
              </div>
            ) : status?.qrSvg ? (
              <div
                className="companion-qr-svg"
                dangerouslySetInnerHTML={{ __html: status.qrSvg }}
              />
            ) : (
              <div className="companion-qr-loading">Loading QR code…</div>
            )}
            <div className="companion-scan-hint">
              <span>Scan using phone Camera</span>
            </div>
          </div>

          {/* Right: Network Mode, PIN & URL */}
          <div className="companion-details">
            {/* Network Selector Tabs: Local Wi-Fi vs Cloudflare Tunnel */}
            <div className="companion-mode-switch">
              <button
                type="button"
                className={`companion-mode-btn ${!status?.tunnelActive ? 'active' : ''}`}
                onClick={() => void handleToggleTunnel(false)}
                disabled={tunnelToggling || status?.tunnelLoading}
              >
                <Wifi size={13} />
                <span>Local Wi-Fi (1ms)</span>
              </button>
              <button
                type="button"
                className={`companion-mode-btn ${status?.tunnelActive ? 'active' : ''}`}
                onClick={() => void handleToggleTunnel(true)}
                disabled={tunnelToggling || status?.tunnelLoading}
              >
                <Globe size={13} />
                <span>Cloudflare (5G/Anywhere)</span>
              </button>
            </div>

            {/* 4-Digit PIN Highlight */}
            <div className="companion-pin-box">
              <div className="companion-pin-label">
                <span>4-DIGIT PAIRING PIN</span>
                <button
                  type="button"
                  className="companion-regen-btn"
                  onClick={() => void handleRegeneratePin()}
                  disabled={loading}
                  title="Generate new PIN"
                >
                  <RefreshCw size={12} className={loading ? 'spinning' : ''} />
                  <span>New PIN</span>
                </button>
              </div>
              <div
                className="companion-pin-display"
                onClick={() => void handleCopyPin()}
                title="Click to copy PIN"
                style={{ cursor: 'pointer' }}
              >
                {status?.pin ? (
                  status.pin.split('').map((digit, idx) => (
                    <span key={idx} className="companion-pin-digit">{digit}</span>
                  ))
                ) : (
                  <span>••••</span>
                )}
                {pinCopied && (
                  <span style={{ fontSize: 11, color: '#93c5fd', marginLeft: 8 }}>Copied!</span>
                )}
              </div>
            </div>

            {/* Direct URL input with Copy button */}
            <div className="companion-url-section">
              <label>
                {status?.tunnelActive ? 'Cloudflare Encrypted Tunnel URL:' : 'Or open browser on your phone:'}
              </label>
              <div className="companion-url-input-row">
                <input
                  type="text"
                  readOnly
                  value={status?.bestUrl || 'Loading…'}
                  className="companion-url-input"
                  onClick={(e) => {
                    (e.target as HTMLInputElement).select();
                    void handleCopyUrl();
                  }}
                />
                <button
                  type="button"
                  className={`companion-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={() => void handleCopyUrl()}
                  title="Copy URL"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Connection Status Indicator */}
            <div className="companion-status-indicator">
              <div className="companion-status-pill">
                <span className={`status-dot ${status && status.connectedClients > 0 ? 'online' : 'waiting'}`} />
                <span>
                  {status && status.connectedClients > 0
                    ? `${status.connectedClients} phone connected`
                    : 'Waiting for phone connection…'}
                </span>
              </div>
              <div className="companion-net-hint">
                {status?.tunnelActive ? (
                  <>
                    <Globe size={13} />
                    <span>Cloudflare Anycast Tunnel active (Encrypted HTTPS)</span>
                  </>
                ) : (
                  <>
                    <Wifi size={13} />
                    <span>Direct Local Link (Zero-lag ~1ms response)</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="companion-modal-footer">
          <small>Screen gestures & pull-to-refresh are automatically locked on your phone for flawless control.</small>
          <button type="button" className="companion-dismiss-btn" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

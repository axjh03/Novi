import { useState } from 'react';
import { RefreshCw, Download, CheckCircle2, AlertCircle, Sparkles, Loader2, Info } from 'lucide-react';
import type { SettingsInput } from '../../../shared/types';
import { useAppUpdater } from '../services/updaterService';

interface Props {
  value: SettingsInput;
  onChange: (next: SettingsInput) => void;
  disabled?: boolean;
}

export function SettingsAppUpdater({ value, onChange, disabled }: Props) {
  const { status, result, progress, error, lastCheckedAt, checkNow, installNow } = useAppUpdater();
  const [localChecking, setLocalChecking] = useState(false);

  const checkOnStartup = value.checkUpdatesAtStartup !== false;

  const handleManualCheck = async () => {
    setLocalChecking(true);
    try {
      await checkNow();
    } finally {
      setLocalChecking(false);
    }
  };

  const isChecking = status === 'checking' || localChecking;
  const isDownloading = status === 'downloading';
  const hasUpdate = status === 'available' && result?.hasUpdate;
  const isUpToDate = status === 'up-to-date' && !result?.hasUpdate;

  const currentVersion = result?.currentVersion || '0.1.1';
  const latestVersion = result?.latestVersion || currentVersion;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Startup Check Toggle */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <input
          type="checkbox"
          checked={checkOnStartup}
          disabled={disabled || isDownloading}
          onChange={(e) => onChange({ ...value, checkUpdatesAtStartup: e.target.checked })}
          style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--accent)' }}
        />
        <div>
          <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>Check for updates on startup</strong>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
            Automatically query for new releases in the background when Novi launches.
          </div>
        </div>
      </label>

      {/* 2. Version & Status Card */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              v{currentVersion}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                Novi Desktop
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                Current version: <strong>v{currentVersion}</strong>
                {lastCheckedAt && (
                  <span> • Checked at {new Date(lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {isChecking ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  padding: '3px 9px',
                  borderRadius: 12,
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  fontWeight: 500,
                }}
              >
                <Loader2 size={12} className="spin" /> Checking…
              </span>
            ) : hasUpdate ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  padding: '3px 9px',
                  borderRadius: 12,
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#22c55e',
                  fontWeight: 600,
                }}
              >
                <Sparkles size={12} /> v{latestVersion} Available
              </span>
            ) : isUpToDate ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  padding: '3px 9px',
                  borderRadius: 12,
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: '#22c55e',
                  fontWeight: 500,
                }}
              >
                <CheckCircle2 size={12} /> Up to date
              </span>
            ) : error ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  padding: '3px 9px',
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  fontWeight: 500,
                }}
              >
                <AlertCircle size={12} /> Check error
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  padding: '3px 9px',
                  borderRadius: 12,
                  background: 'rgba(148, 163, 184, 0.12)',
                  color: 'var(--muted)',
                }}
              >
                <Info size={12} /> Ready
              </span>
            )}
          </div>
        </div>

        {/* 3. Update Available Card */}
        {hasUpdate && !isDownloading && (
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.05)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>
                  Novi v{result.latestVersion} is ready to install
                </strong>
                {result.releaseDate && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Released on {new Date(result.releaseDate).toLocaleDateString()}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={installNow}
                disabled={disabled || isDownloading}
                className="primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Download size={13} /> Update & Restart
              </button>
            </div>
            {result.releaseNotes && (
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--muted)',
                  background: 'rgba(0,0,0,0.15)',
                  padding: '8px 10px',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 90,
                  overflowY: 'auto',
                }}
              >
                {result.releaseNotes}
              </div>
            )}
          </div>
        )}

        {/* 4. Active Downloading / Installation Progress Bar */}
        {isDownloading && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.06)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 8,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                {progress?.status || 'Downloading update payload…'}
              </span>
              <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontWeight: 600 }}>
                {progress?.percent || 0}%
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress?.percent || 0}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #38bdf8, #2563eb)',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Novi will install the update and restart automatically.
            </div>
          </div>
        )}

        {/* 5. Error message */}
        {error && (
          <div
            style={{
              fontSize: 12,
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 6,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              className="text-button"
              onClick={handleManualCheck}
              style={{ padding: '2px 6px', fontSize: 11 }}
            >
              Retry
            </button>
          </div>
        )}

        {/* 6. Manual Check Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 }}>
          <button
            type="button"
            className="text-button"
            onClick={handleManualCheck}
            disabled={disabled || isChecking || isDownloading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12,
              padding: '6px 12px',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            <RefreshCw size={13} className={isChecking ? 'spin' : ''} />
            {isChecking ? 'Checking for updates…' : 'Check for updates'}
          </button>
        </div>
      </div>
    </div>
  );
}

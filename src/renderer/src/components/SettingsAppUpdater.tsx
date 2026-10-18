import { useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import type { SettingsInput } from '../../../shared/types';
import { useAppUpdater } from '../services/updaterService';

interface Props {
  value: SettingsInput;
  onChange: (next: SettingsInput) => void;
  disabled?: boolean;
}

function size(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
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
  const percent = progress?.percent ?? null;
  const hasUpdate = status === 'available' && Boolean(result?.hasUpdate);
  const isUpToDate = status === 'up-to-date' && !result?.hasUpdate;

  // Unknown until the first check; never show a made-up version.
  const currentVersion = result?.currentVersion;
  const latestVersion = result?.latestVersion || currentVersion;

  return (
    <div className="updater-box">
      {/* 1. Startup check checkbox */}
      <label className="checkbox-label" style={{ margin: 0, cursor: disabled || isDownloading ? 'not-allowed' : 'pointer' }}>
        <input
          type="checkbox"
          checked={checkOnStartup}
          disabled={disabled || isDownloading}
          onChange={(e) => onChange({ ...value, checkUpdatesAtStartup: e.target.checked })}
        />
        <span>Check for updates on startup</span>
      </label>
      <small style={{ marginTop: -8 }}>
        Automatically verify if a new release is available when Novi launches.
      </small>

      {/* 2. Main Version Card */}
      <div className="updater-card">
        <div className="updater-info">
          <div className="updater-title">
            <span>Novi Desktop</span>
            {currentVersion && <span className={`updater-badge ${hasUpdate ? 'available' : isUpToDate ? 'up-to-date' : ''}`}>
              v{currentVersion}
            </span>}
          </div>
          <div className="updater-subtext">
            {isChecking ? (
              'Checking for new releases…'
            ) : isDownloading ? (
              `Updating to v${latestVersion}…`
            ) : hasUpdate ? (
              `Update v${latestVersion} is available to install.`
            ) : isUpToDate ? (
              'You are running the latest version.'
            ) : lastCheckedAt ? (
              `Last checked today at ${new Date(lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            ) : (
              'Ready to check for updates.'
            )}
          </div>
          {/* The portal explains when a newer release can't run here (for example on macOS 12). */}
          {result?.notice && !isChecking && <div className="updater-subtext">{result.notice}</div>}
        </div>

        <div className="updater-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {hasUpdate && !isDownloading && (
            <button
              type="button"
              className="primary updater-action-btn"
              onClick={installNow}
              disabled={disabled || isDownloading}
            >
              <Download size={14} /> Update & Restart
            </button>
          )}
          <button
            type="button"
            className="secondary updater-action-btn"
            onClick={handleManualCheck}
            disabled={disabled || isChecking || isDownloading}
          >
            <RefreshCw size={13} className={isChecking ? 'spin' : ''} />
            {isChecking ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
      </div>

      {/* 3. Release Notes / Info when update is available */}
      {hasUpdate && result && !isDownloading && (
        <div className="updater-release-details">
          <div className="updater-release-header">
            <span>Release v{result.latestVersion}</span>
            {result.releaseDate && <span className="muted">{new Date(result.releaseDate).toLocaleDateString()}</span>}
          </div>
          {result.releaseNotes && (
            <div className="updater-release-notes">
              {result.releaseNotes}
            </div>
          )}
        </div>
      )}

      {/* 4. Downloading / Installing Progress */}
      {isDownloading && (
        <div className="updater-progress-container">
          <div className="updater-progress-label">
            <span>{progress?.status || 'Downloading update payload…'}</span>
            <span className="updater-progress-pct">{percent === null ? '…' : `${percent}%`}</span>
          </div>
          <div className="updater-progress-track" role="progressbar" aria-label={progress?.status || 'Updating Novi'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
            <div className={`updater-progress-fill${percent === null ? ' indeterminate' : ''}`} style={{ width: percent === null ? undefined : `${percent}%` }} />
          </div>
          {progress?.downloadedBytes !== undefined && (
            <div className="updater-download-stats">
              <span>{size(progress.downloadedBytes)} / {progress.totalBytes === undefined ? 'Size unknown' : size(progress.totalBytes)}</span>
              <span>Download speed: {size(progress.bytesPerSecond ?? 0)}/s</span>
            </div>
          )}
          <small className="muted">Novi will apply the update and restart automatically.</small>
        </div>
      )}

      {/* 5. Error banner */}
      {error && (
        <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button type="button" className="text-button" onClick={handleManualCheck} style={{ padding: '2px 8px', fontSize: 12 }}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { UpdateCheckResult, UpdateProgress } from '../../../shared/types';
import { unwrap } from '../services/api';

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for updates shortly after launch
    const timer = setTimeout(async () => {
      try {
        const result = await unwrap(window.novi.checkForUpdates());
        if (result && result.hasUpdate) {
          setUpdate(result);
        }
      } catch {
        // Silently ignore background update check errors
      }
    }, 3000);

    const unsubscribe = window.novi.onUpdateProgress((prog) => {
      setProgress(prog);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  if (!update || dismissed) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      await unwrap(window.novi.installUpdate());
    } catch (err: any) {
      setIsUpdating(false);
      setProgress(null);
      setError(err?.message || 'Failed to apply update. Try manual download.');
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
      color: '#f8fafc',
      padding: '8px 14px',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      zIndex: 9999,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: isUpdating ? '#38bdf8' : '#22c55e',
          boxShadow: isUpdating ? '0 0 6px #38bdf8' : '0 0 6px #22c55e',
        }} />
        {isUpdating ? (
          <span>{progress?.status || 'Downloading update payload...'} ({progress?.percent || 0}%)</span>
        ) : error ? (
          <span style={{ color: '#f87171' }}>{error}</span>
        ) : (
          <span>
            <strong>Novi v{update.latestVersion}</strong> is ready to install (current: v{update.currentVersion})
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!isUpdating && (
          <>
            <button
              onClick={handleUpdate}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '4px 10px',
                borderRadius: 5,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Update & Restart
            </button>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: 'none',
                padding: '4px 6px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </>
        )}
        {isUpdating && (
          <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
            Novi will restart automatically
          </span>
        )}
      </div>
    </div>
  );
}

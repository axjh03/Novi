import { useEffect, useState } from 'react';
import type { UpdateCheckResult, UpdateProgress } from '../../../shared/types';
import { unwrap } from './api';

export interface UpdaterState {
  status: 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'error';
  result: UpdateCheckResult | null;
  progress: UpdateProgress | null;
  error: string | null;
  lastCheckedAt: number | null;
}

let state: UpdaterState = {
  status: 'idle',
  result: null,
  progress: null,
  error: null,
  lastCheckedAt: null,
};

let startupChecked = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function updateState(partial: Partial<UpdaterState>) {
  state = { ...state, ...partial };
  notify();
}

export const updaterService = {
  getState(): UpdaterState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async initStartupCheck(enabled: boolean): Promise<void> {
    if (!enabled || startupChecked) return;
    startupChecked = true;

    // Small delay so initial launch render finishes smoothly
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      updateState({ status: 'checking', error: null });
      const result = await unwrap(window.novi.checkForUpdates());
      updateState({
        status: result.hasUpdate ? 'available' : 'up-to-date',
        result,
        lastCheckedAt: Date.now(),
        error: null,
      });
    } catch (err: any) {
      // Silently ignore background startup errors
      updateState({
        status: 'idle',
        error: null,
      });
    }
  },

  async checkForUpdates(): Promise<UpdateCheckResult | null> {
    if (state.status === 'downloading') return state.result;
    try {
      updateState({ status: 'checking', error: null });
      const result = await unwrap(window.novi.checkForUpdates());
      updateState({
        status: result.hasUpdate ? 'available' : 'up-to-date',
        result,
        lastCheckedAt: Date.now(),
        error: null,
      });
      return result;
    } catch (err: any) {
      const msg = err?.message || 'Failed to check for updates. Please try again.';
      updateState({
        status: 'error',
        error: msg,
      });
      return null;
    }
  },

  async installUpdate(): Promise<void> {
    if (state.status === 'downloading') return;

    updateState({
      status: 'downloading',
      progress: { percent: null, status: 'Initializing download...' },
      error: null,
    });

    const unsubscribe = window.novi.onUpdateProgress((prog) => {
      updateState({ progress: prog });
    });

    try {
      await unwrap(window.novi.installUpdate());
    } catch (err: any) {
      updateState({
        status: 'error',
        error: err?.message || 'Failed to install update. Please try a manual download.',
      });
    } finally {
      unsubscribe();
    }
  },
};

export function useAppUpdater() {
  const [updater, setUpdater] = useState<UpdaterState>(() => updaterService.getState());

  useEffect(() => {
    return updaterService.subscribe(() => {
      setUpdater(updaterService.getState());
    });
  }, []);

  return {
    ...updater,
    checkNow: () => updaterService.checkForUpdates(),
    installNow: () => updaterService.installUpdate(),
  };
}

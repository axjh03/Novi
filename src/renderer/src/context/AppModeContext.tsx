import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { AppMode, ImageAttachment, Snapshot, MonitorDisplay, BehavioralFramework } from '../../../shared/types';
import { unwrap } from '../services/api';
import { eyeTracking } from '../eye-tracking/EyeTrackingService';

import { isAppMode } from '../../../shared/sessionModes';

interface AppModeContextType {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  behavioralFramework: BehavioralFramework;
  /** Resolves once the choice is saved, so callers can order it before other snapshot updates. */
  setBehavioralFramework: (framework: BehavioralFramework) => Promise<void>;
  latestScreenshot: ImageAttachment | null;
  captureScreenshot: () => Promise<ImageAttachment | null>;
  // Working Monitor
  workingMonitorId: number | null;
  setWorkingMonitor: (displayId: number) => Promise<void>;
  monitors: MonitorDisplay[];
  refreshMonitors: () => Promise<MonitorDisplay[]>;
  // Transparency customization
  transparentOpacity: number;
  setTransparentOpacity: (val: number) => void;
  transparentBg: string;
  setTransparentBg: (color: string) => void;
  // Pending attached screenshot for composer
  pendingAttachment: ImageAttachment | null;
  consumePendingAttachment: () => ImageAttachment | null;
}

const AppModeContext = createContext<AppModeContextType | null>(null);

interface ProviderProps {
  children: ReactNode;
  snapshot: Snapshot | null;
  onSnapshotUpdated?: (next: Snapshot) => void;
}

export function AppModeProvider({ children, snapshot, onSnapshotUpdated }: ProviderProps) {
  // 1. App Mode
  const [appMode, setAppModeState] = useState<AppMode>(() => {
    const saved = localStorage.getItem('novi_app_mode');
    return isAppMode(saved) ? saved : 'normal';
  });

  const setAppMode = useCallback((mode: AppMode) => {
    setAppModeState(mode);
    localStorage.setItem('novi_app_mode', mode);
  }, []);

  // 1b. Behavioral Framework Selection ('smart' | 'star' | 'car' | 'par' | 'soar')
  const [behavioralFramework, setBehavioralFrameworkState] = useState<BehavioralFramework>(() => {
    return (
      snapshot?.settings?.behavioralFramework ||
      (localStorage.getItem('novi_behavioral_framework') as BehavioralFramework) ||
      'smart'
    );
  });

  const setBehavioralFramework = useCallback(
    async (framework: BehavioralFramework) => {
      setBehavioralFrameworkState(framework);
      localStorage.setItem('novi_behavioral_framework', framework);
      if (snapshot?.settings) {
        try {
          const updated = await unwrap(
            window.novi.saveSettings({
              ...snapshot.settings,
              behavioralFramework: framework,
            })
          );
          if (onSnapshotUpdated) onSnapshotUpdated(updated);
        } catch (err) {
          console.warn('[AppMode] Failed to save behavioral framework setting:', err);
        }
      }
    },
    [snapshot?.settings, onSnapshotUpdated]
  );

  // 2b. Working Monitor selection
  const [workingMonitorId, setWorkingMonitorIdState] = useState<number | null>(() => {
    return snapshot?.settings?.workingMonitorId ?? null;
  });
  const [monitors, setMonitors] = useState<MonitorDisplay[]>([]);

  const refreshMonitors = useCallback(async (): Promise<MonitorDisplay[]> => {
    try {
      const res = await unwrap(window.novi.getMonitors());
      setMonitors(res);
      return res;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!snapshot?.user) return;
    void refreshMonitors();
    void unwrap(window.novi.getWorkingMonitor())
      .then((res) => {
        if (typeof res?.workingMonitorId === 'number') {
          setWorkingMonitorIdState(res.workingMonitorId);
        }
      })
      .catch(() => {});
  }, [refreshMonitors, snapshot?.user?.id]);

  useEffect(() => {
    if (typeof snapshot?.settings?.workingMonitorId === 'number') {
      setWorkingMonitorIdState(snapshot.settings.workingMonitorId);
    }
  }, [snapshot?.settings?.workingMonitorId]);

  const setWorkingMonitor = useCallback(
    async (displayId: number) => {
      setWorkingMonitorIdState(displayId);
      try {
        await unwrap(window.novi.setWorkingMonitor(displayId));
        eyeTracking.setMonitor(displayId);
        if (snapshot?.settings) {
          const updated = await unwrap(
            window.novi.saveSettings({
              ...snapshot.settings,
              workingMonitorId: displayId,
            })
          );
          if (onSnapshotUpdated) onSnapshotUpdated(updated);
        }
      } catch (err) {
        console.warn('[AppMode] Failed to set working monitor:', err);
      }
    },
    [snapshot?.settings, onSnapshotUpdated]
  );

  // 3. Transparency customization
  const [transparentOpacity, setTransparentOpacityState] = useState<number>(() => {
    const saved = localStorage.getItem('novi_transparent_opacity');
    return saved ? Math.max(20, Math.min(100, Number(saved))) : (snapshot?.settings?.transparentOpacity || 35);
  });

  const [transparentBg, setTransparentBgState] = useState<string>(() => {
    return localStorage.getItem('novi_transparent_bg') || (snapshot?.settings?.transparentBg || '#0f172a');
  });

  const setTransparentOpacity = useCallback((val: number) => {
    const clamped = Math.max(20, Math.min(100, val));
    setTransparentOpacityState(clamped);
    document.documentElement.style.setProperty('--transparent-opacity', `${clamped}%`);
    localStorage.setItem('novi_transparent_opacity', String(clamped));
  }, []);

  const setTransparentBg = useCallback((color: string) => {
    setTransparentBgState(color);
    document.documentElement.style.setProperty('--transparent-bg', color);
    localStorage.setItem('novi_transparent_bg', color);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--transparent-opacity', `${transparentOpacity}%`);
    document.documentElement.style.setProperty('--transparent-bg', transparentBg);
  }, [transparentOpacity, transparentBg]);

  // 4. Screenshots & Attachments
  const [latestScreenshot, setLatestScreenshot] = useState<ImageAttachment | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<ImageAttachment | null>(null);

  const captureScreenshot = useCallback(async (): Promise<ImageAttachment | null> => {
    try {
      const result = await unwrap(window.novi.captureScreen());
      setLatestScreenshot(result);
      setPendingAttachment(result);
      return result;
    } catch (err) {
      console.error('[AppMode] Screen capture failed:', err);
      return null;
    }
  }, []);

  const consumePendingAttachment = useCallback(() => {
    const current = pendingAttachment;
    setPendingAttachment(null);
    return current;
  }, [pendingAttachment]);

  const sessionActive = Boolean(snapshot?.user && snapshot.contextSession);
  useEffect(() => {
    if (!snapshot?.user) return;
    void unwrap(window.novi.setCodeViewerVisible(sessionActive && (appMode === 'coding' || appMode === 'system-design'))).catch(console.error);
  }, [snapshot?.user?.id, sessionActive, appMode]);
  useEffect(() => window.novi.onCodeViewerClosed(() => {
    setAppModeState((mode) => {
      if (mode !== 'coding') return mode;
      localStorage.setItem('novi_app_mode', 'normal');
      return 'normal';
    });
  }), []);

  // Global actions from Main Process (global hotkeys)
  useEffect(() => {
    const cleanup = window.novi.onGlobalAction((action) => {
      if (!sessionActive) return;
      if (action.type === 'toggle-coding-mode') {
        setAppMode(appMode === 'coding' ? 'normal' : 'coding');
      } else if (action.type === 'toggle-behavioral-mode') {
        setAppMode(appMode === 'behavioral' ? 'normal' : 'behavioral');
      } else if (action.type === 'capture-screen') {
        void captureScreenshot();

      } else if (action.type === 'set-app-mode' && typeof action.payload === 'string') {
        if (isAppMode(action.payload)) setAppMode(action.payload);

      }
    });
    return cleanup;
  }, [sessionActive, appMode, setAppMode, captureScreenshot]);

  // Window-level keydown handler for in-app shortcut execution
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sessionActive) return;
      // Don't intercept inside input/textarea unless it's a mode or capture shortcut.
      const isAltOrOption = e.altKey;
      if (!isAltOrOption) return;

      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        setAppMode(appMode === 'coding' ? 'normal' : 'coding');
      } else if (key === 'b') {
        e.preventDefault();
        setAppMode(appMode === 'behavioral' ? 'normal' : 'behavioral');
      } else if (key === '3') {
        e.preventDefault();
        void captureScreenshot();

      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionActive, appMode, setAppMode, captureScreenshot]);

  return (
    <AppModeContext.Provider
      value={{
        appMode,
        setAppMode,
        behavioralFramework,
        setBehavioralFramework,
        latestScreenshot,
        captureScreenshot,
        workingMonitorId,
        setWorkingMonitor,
        monitors,
        refreshMonitors,
        transparentOpacity,
        setTransparentOpacity,
        transparentBg,
        setTransparentBg,
        pendingAttachment,
        consumePendingAttachment,
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within an AppModeProvider');
  }
  return context;
}

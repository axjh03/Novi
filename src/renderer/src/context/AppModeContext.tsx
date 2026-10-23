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
import { readAppearance, subscribeAppearance, updateAppearance } from '../services/appearance';
import { useStealthState } from '../hooks/useStealth';

import { isAppMode } from '../../../shared/sessionModes';
import { fallbackMode, type Feature } from '../../../shared/plans';

interface AppModeContextType {
  /** The current mode; always one the license's plan includes. */
  appMode: AppMode;
  /** Switches mode. Modes the plan doesn't include are ignored (their buttons explain the lock instead). */
  setAppMode: (mode: AppMode) => void;
  /** Whether the license's plan includes a feature. True when there is no plan information (signed out). */
  allows: (feature: Feature) => boolean;
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
  paletteId: string;
  setPalette: (id: string) => void;
  smartPaletteEnabled: boolean;
  setSmartPaletteEnabled: (enabled: boolean) => void;
  smartPaletteStatus: string;
  readingSize: number;
  changeReadingSize: (direction: number) => void;
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
  // 0. License plan: what the signed-in license unlocks (src/shared/plans.ts).
  const features = snapshot?.user?.features;
  const allows = useCallback((feature: Feature) => !features || features.includes(feature), [features]);

  // 1. App Mode
  const [savedMode, setAppModeState] = useState<AppMode>(() => {
    const saved = localStorage.getItem('novi_app_mode');
    return isAppMode(saved) ? saved : 'normal';
  });
  // A saved mode the plan doesn't include (after a downgrade, or Chat on Core) is replaced here,
  // during render, so nothing ever runs in a locked mode. The saved choice is kept and comes back
  // if the plan includes it again.
  const appMode = allows(savedMode) ? savedMode : fallbackMode(features);

  const setAppMode = useCallback((mode: AppMode) => {
    if (!allows(mode)) return;
    setAppModeState(mode);
    localStorage.setItem('novi_app_mode', mode);
  }, [allows]);

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

  // Shared appearance updates also reach the detached code and answer windows.
  const [appearance, setAppearance] = useState(readAppearance);
  const [{ transparent }] = useStealthState();
  const [smartPaletteStatus, setSmartPaletteStatus] = useState('');
  useEffect(() => subscribeAppearance(() => setAppearance(readAppearance())), []);
  const setTransparentOpacity = useCallback((opacity: number) => updateAppearance({ opacity }), []);
  const setPalette = useCallback((paletteId: string) => {
    if (!readAppearance().smart) updateAppearance({ paletteId });
  }, []);
  const setSmartPaletteEnabled = useCallback((smart: boolean) => updateAppearance({ smart, smartPalette: null }), []);
  const changeReadingSize = useCallback((direction: number) => {
    if (direction === -1 || direction === 1) updateAppearance({ readingSize: readAppearance().readingSize + direction * 10 });
  }, []);

  useEffect(() => {
    if (!appearance.smart || !transparent) { setSmartPaletteStatus(''); return; }
    let cancelled = false, timer = 0;
    const sample = async () => {
      if (document.visibilityState === 'hidden') { timer = window.setTimeout(sample, 10000); return; }
      setSmartPaletteStatus('Detecting background…');
      try {
        const smartPalette = await unwrap(window.novi.sampleBackgroundPalette(appearance.opacity));
        if (cancelled) return;
        updateAppearance({ smartPalette });
        setSmartPaletteStatus(`Smart colors · ${smartPalette.opacity}% opacity`);
        timer = window.setTimeout(sample, 10000);
      } catch {
        if (!cancelled) {
          updateAppearance({ smartPalette: null });
          setSmartPaletteStatus('Screen sampling unavailable. Using high-contrast colors. Check screen recording permission, then turn Smart off and on to retry.');
        }
      }
    };
    void sample();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [appearance.smart, appearance.opacity, transparent]);

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
      if (action.type === 'change-reading-size') { changeReadingSize(action.payload); return; }
      if (!sessionActive) return;
      if (action.type === 'toggle-coding-mode') {
        setAppMode(appMode === 'coding' ? fallbackMode(features) : 'coding');
      } else if (action.type === 'toggle-behavioral-mode') {
        setAppMode(appMode === 'behavioral' ? fallbackMode(features) : 'behavioral');
      } else if (action.type === 'capture-screen') {
        void captureScreenshot();

      } else if (action.type === 'set-app-mode' && typeof action.payload === 'string') {
        if (isAppMode(action.payload)) setAppMode(action.payload);

      }
    });
    return cleanup;
  }, [sessionActive, appMode, setAppMode, features, captureScreenshot, changeReadingSize]);

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
        setAppMode(appMode === 'coding' ? fallbackMode(features) : 'coding');
      } else if (key === 'b') {
        e.preventDefault();
        setAppMode(appMode === 'behavioral' ? fallbackMode(features) : 'behavioral');
      } else if (key === '3') {
        e.preventDefault();
        void captureScreenshot();

      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionActive, appMode, setAppMode, features, captureScreenshot]);

  return (
    <AppModeContext.Provider
      value={{
        appMode,
        setAppMode,
        allows,
        behavioralFramework,
        setBehavioralFramework,
        latestScreenshot,
        captureScreenshot,
        workingMonitorId,
        setWorkingMonitor,
        monitors,
        refreshMonitors,
        transparentOpacity: appearance.opacity,
        setTransparentOpacity,
        paletteId: appearance.paletteId,
        setPalette,
        smartPaletteEnabled: appearance.smart,
        setSmartPaletteEnabled,
        smartPaletteStatus,
        readingSize: appearance.readingSize,
        changeReadingSize,
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

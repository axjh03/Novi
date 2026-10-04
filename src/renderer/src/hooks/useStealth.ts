import { useEffect, useState, useCallback } from 'react';
import type { StealthState } from '../../../shared/types';
import { unwrap } from '../services/api';

export function useStealth() {
  const [state, setState] = useState<StealthState>({
    transparent: false,
    numLock: false,
    clickThrough: false,
    clickThroughShortcut: 'Alt+Shift+I',
  });

  useEffect(() => {
    // Initial fetch of stealth and NumLock state
    void unwrap(window.novi.getStealthState())
      .then((s) => { if (s) setState(s); })
      .catch(() => {});

    // Listen to real-time updates from main process (NumLock changes or transparent toggle)
    const unsubscribe = window.novi.onStealthState((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Synchronize CSS classes on document element and body
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (state.transparent) {
      root.classList.add('transparent-mode');
      body.classList.add('transparent-mode');
    } else {
      root.classList.remove('transparent-mode');
      body.classList.remove('transparent-mode');
    }

    if (state.clickThrough) {
      root.classList.add('clickthrough-on');
      root.classList.remove('clickthrough-off');
      body.classList.add('clickthrough-on');
      body.classList.remove('clickthrough-off');
    } else {
      root.classList.add('clickthrough-off');
      root.classList.remove('clickthrough-on');
      body.classList.add('clickthrough-off');
      body.classList.remove('clickthrough-on');
    }
  }, [state.transparent, state.clickThrough]);

  const toggleTransparent = useCallback(async () => {
    try {
      const updated = await unwrap(window.novi.toggleTransparent());
      if (updated) setState(updated);
    } catch (err) {
      console.error('[useStealth] Failed to toggle transparent mode:', err);
    }
  }, []);

  const setTransparent = useCallback(async (enabled: boolean) => {
    try {
      const updated = await unwrap(window.novi.setTransparent(enabled));
      if (updated) setState(updated);
    } catch (err) {
      console.error('[useStealth] Failed to set transparent mode:', err);
    }
  }, []);

  return {
    transparent: state.transparent,
    numLock: state.numLock,
    clickThrough: state.clickThrough,
    clickThroughShortcut: state.clickThroughShortcut,
    toggleTransparent,
    setTransparent,
  };
}

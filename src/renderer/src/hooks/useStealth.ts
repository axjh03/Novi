import { useEffect, useState, useCallback } from 'react';
import type { StealthState } from '../../../shared/types';
import { unwrap } from '../services/api';

// Transparent interactive mode hides the system cursor (see app.css); draw a private one inside this window.
export function attachPrivateCursor(target: Window): () => void {
  const doc = target.document;
  const cursor = doc.createElement('span');
  cursor.className = 'stealth-private-cursor';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  doc.body.append(cursor);

  const move = (event: PointerEvent) => {
    cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    cursor.hidden = false;
  };
  const hide = () => { cursor.hidden = true; };

  target.addEventListener('pointermove', move, { passive: true });
  target.addEventListener('blur', hide);
  doc.documentElement.addEventListener('mouseleave', hide);
  return () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('blur', hide);
    doc.documentElement.removeEventListener('mouseleave', hide);
    cursor.remove();
  };
}

/** Reads transparent and click-through state without changing the page; for windows other than the title bar's owner. */
export function useStealthState() {
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

  return [state, setState] as const;
}

/** Owns the page's transparent-mode classes and private cursor. Use once per window (the title bar). */
export function useStealth() {
  const [state, setState] = useStealthState();

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

  useEffect(() => {
    if (!state.transparent || state.clickThrough) return;
    return attachPrivateCursor(window);
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

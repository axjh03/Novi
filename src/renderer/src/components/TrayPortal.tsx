import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { attachPrivateCursor, useStealthState } from '../hooks/useStealth';

type TrayWindow = Window & typeof globalThis;

/**
 * Renders its children in the floating session tray: a second native window opened from this one.
 * The tray shares this page's process, so its controls keep using this window's state and IPC.
 */
export function TrayPortal({ children, onClosed }: { children: ReactNode; onClosed: () => void }) {
  const [tray, setTray] = useState<{ window: TrayWindow; root: HTMLElement } | null>(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  // The title bar owns this window's stealth classes and cursor; the tray only follows the state.
  const [{ transparent, clickThrough }] = useStealthState();

  useEffect(() => {
    // Main allows only this exact name pattern (see src/main/services/workspace.ts).
    const opened = window.open('about:blank', `novi-tray-${crypto.randomUUID()}`) as TrayWindow | null;
    if (!opened) { closedRef.current(); return; }
    const trayWindow = opened;
    const doc = trayWindow.document;
    let closing = false, reported = false, timer = 0, sentHeight = 0;
    doc.title = 'Novi';
    const root = doc.createElement('div');
    root.id = 'tray-root';
    doc.body.append(root);

    // The tray inherits this page's origin, base URL and CSP, so copied styles load as they do here.
    const syncStyles = () => {
      doc.head.querySelectorAll('[data-novi-tray-style]').forEach((node) => node.remove());
      for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.setAttribute('data-novi-tray-style', '');
        doc.head.append(copy);
      }
    };
    // Theme, transparent mode classes and the opacity/background variables live on <html> and <body>.
    const syncRoot = () => {
      const source = document.documentElement, target = doc.documentElement;
      target.className = `${source.className} novi-tray`.trim();
      target.lang = source.lang;
      if (source.dataset.theme) target.dataset.theme = source.dataset.theme;
      else delete target.dataset.theme;
      target.style.cssText = source.style.cssText;
      doc.body.className = document.body.className;
    };
    syncStyles();
    syncRoot();
    const styleObserver = new MutationObserver(syncStyles);
    styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    const rootObserver = new MutationObserver(syncRoot);
    rootObserver.observe(document.documentElement, { attributes: true });
    rootObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Size the window to its content, including open dropdowns that overflow the shell.
    // setTimeout, not requestAnimationFrame: animation frames do not run while the tray is hidden.
    const measure = () => {
      timer = 0;
      if (closing || trayWindow.closed) return;
      if (trayWindow.scrollY || trayWindow.scrollX) trayWindow.scrollTo(0, 0);
      let bottom = 0;
      for (const element of root.querySelectorAll('*')) {
        // Closed <details> content keeps a layout box (content-visibility: hidden); skip anything not shown.
        if (!element.checkVisibility()) continue;
        bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
      }
      const height = Math.ceil(bottom);
      if (height > 0 && height !== sentHeight) {
        sentHeight = height;
        void window.novi.setTrayHeight(height).catch(() => {});
      }
    };
    const schedule = () => { if (!timer) timer = window.setTimeout(measure, 0); };
    const contentObserver = new MutationObserver(schedule);
    contentObserver.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    const resizeObserver = new trayWindow.ResizeObserver(schedule);
    resizeObserver.observe(root);
    for (const type of ['resize', 'transitionend', 'animationend', 'toggle']) trayWindow.addEventListener(type, schedule, true);

    // In-window shortcuts (Alt+A, Alt+C, Alt+B, Alt+3) listen on this window; forward them from the tray.
    const forwardKey = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      const copy = new KeyboardEvent('keydown', {
        key: event.key, code: event.code, altKey: true, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey,
        metaKey: event.metaKey, repeat: event.repeat, cancelable: true,
      });
      window.dispatchEvent(copy);
      if (copy.defaultPrevented) event.preventDefault();
    };
    trayWindow.addEventListener('keydown', forwardKey);

    // Closed from outside (for example Alt+F4): let the page offer to reopen it.
    const reportClosed = () => {
      if (closing || reported) return;
      reported = true;
      closedRef.current();
    };
    trayWindow.addEventListener('pagehide', reportClosed);
    const poll = window.setInterval(() => { if (trayWindow.closed) reportClosed(); }, 500);
    const closeTray = () => { closing = true; if (!trayWindow.closed) trayWindow.close(); };
    window.addEventListener('pagehide', closeTray);

    setTray({ window: trayWindow, root });
    schedule();
    return () => {
      closing = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      styleObserver.disconnect();
      rootObserver.disconnect();
      contentObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('pagehide', closeTray);
      closeTray();
    };
  }, []);

  useEffect(() => {
    if (!tray || !transparent || clickThrough) return;
    return attachPrivateCursor(tray.window);
  }, [tray, transparent, clickThrough]);

  return tray ? createPortal(<section className="tray-shell" aria-label="Novi tray">{children}</section>, tray.root) : null;
}

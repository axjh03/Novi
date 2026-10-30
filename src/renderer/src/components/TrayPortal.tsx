import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { attachPrivateCursor, useStealthState } from '../hooks/useStealth';
import { useAppMode } from '../context/AppModeContext';

type TrayWindow = Window & typeof globalThis;

/**
 * Moves one portal between the chat and a native window without remounting its controls.
 * Keeping the portal target preserves drafts, attachments, and active audio capture.
 */
export function TrayPortal({ children, detached = false, modern = false, panel, onPanelClose, onClosed }: { children: ReactNode; detached?: boolean; modern?: boolean; panel?: ReactNode; onPanelClose?: () => void; onClosed: () => void }) {
  const { setOverlayHost } = useAppMode();
  const attached = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [root] = useState(() => {
    const element = document.createElement('div');
    element.id = 'tray-root';
    return element;
  });
  const [tray, setTray] = useState<TrayWindow | null>(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  // The title bar owns this window's stealth classes and cursor; the tray only follows the state.
  const [{ transparent, clickThrough }] = useStealthState();

  useLayoutEffect(() => {
    const moveControls = (target: HTMLElement | null) => {
      if (!target) return;
      const input = root.querySelector('textarea');
      const start = input?.selectionStart ?? 0, end = input?.selectionEnd ?? 0;
      target.append(root);
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(start, end);
    };
    // Menus register dismissal on their current document; close them before moving.
    root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(menu => { menu.open = false; });
    if (!detached) {
      moveControls(attached.current);
      setTray(null);
      return;
    }
    // Main allows only this exact name pattern (see src/main/services/workspace.ts).
    const opened = window.open('about:blank', `novi-tray-${crypto.randomUUID()}`) as TrayWindow | null;
    if (!opened) { closedRef.current(); return; }
    const trayWindow = opened;
    const doc = trayWindow.document;
    let closing = false, reported = false, lastHeight = 0, lastControlsHeight = 0, timer = 0;
    doc.title = 'Novi';
    moveControls(doc.body);

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
      target.style.setProperty('--workspace-height', `${trayWindow.screen.availHeight}px`);
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
      const shell = root.querySelector('.tray-shell');
      if (!shell || shell.classList.contains('is-hiding')) return;
      const controlsHeight = Math.ceil(root.querySelector('.tray-controls')!.getBoundingClientRect().bottom + trayWindow.scrollY);
      const controlsChanged = controlsHeight !== lastControlsHeight;
      if (controlsChanged) {
        lastControlsHeight = controlsHeight;
        root.style.setProperty('--controls-height', `${controlsHeight}px`);
      }
      let bottom = root.getBoundingClientRect().bottom + trayWindow.scrollY;
      for (const element of shell.querySelectorAll('*')) {
        // Closed <details> content keeps a layout box (content-visibility: hidden); skip anything not shown.
        if (!element.checkVisibility()) continue;
        const clipped = element.closest('.modern-panel, .modern-overlay-host, .modern-tray .tray-menu-content, .live-content, .live-panel-expander');
        if (clipped && clipped !== element && !element.matches('dialog[open], .tray-menu-content')) continue;
        bottom = Math.max(bottom, element.getBoundingClientRect().bottom + trayWindow.scrollY + 4);
      }
      const height = Math.ceil(bottom);
      if ((height !== lastHeight || controlsChanged) && height > 0) {
        lastHeight = height;
        void window.novi.setTrayHeight(height, shell.classList.contains('modern-tray') ? controlsHeight : undefined).catch(() => {});
      }
    };
    const schedule = () => {
      if (root.querySelector('.modern-overlay-host')?.childElementCount) root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(menu => { menu.open = false; });
      if (!timer) timer = window.setTimeout(measure, 0);
    };
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

    // Closing the floating window returns the live controls to the chat.
    const reportClosed = () => {
      if (closing || reported) return;
      reported = true;
      moveControls(attached.current);
      setTray(null);
      closedRef.current();
    };
    trayWindow.addEventListener('pagehide', reportClosed);
    const poll = window.setInterval(() => { if (trayWindow.closed) reportClosed(); }, 500);
    const closeTray = () => { closing = true; if (!trayWindow.closed) trayWindow.close(); };
    window.addEventListener('pagehide', closeTray);

    setTray(trayWindow);
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
      moveControls(attached.current);
      closeTray();
    };
  }, [detached, root]);

  useEffect(() => window.novi.onGlobalAction(action => {
    if (action.type === 'workspace-visibility') root.querySelector('.modern-tray')?.classList.toggle('is-hiding', action.payload === false);
  }), [root]);

  useEffect(() => {
    if (!tray || !transparent || clickThrough) return;
    return attachPrivateCursor(tray);
  }, [tray, transparent, clickThrough]);

  useEffect(() => {
    if (!modern || !panel || !onPanelClose || !tray) return;
    const outside = (event: PointerEvent) => {
      if (event.composedPath().includes(panelRef.current!)) return;
      if (event.composedPath().includes(root.querySelector('.tray-controls')!)) return;
      onPanelClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) onPanelClose(); };
    document.addEventListener('pointerdown', outside);
    tray.document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    tray.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      tray.document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
      tray.removeEventListener('keydown', escape);
    };
  }, [modern, panel, onPanelClose, tray, root]);

  return <>
    <div ref={attached} className="composer-area tray-attached" hidden={detached} />
    {createPortal(<>
      <section className={`tray-shell ${modern ? 'modern-tray' : ''}`} aria-label="Novi controls">
        <div className="tray-controls">{children}</div>
        {modern && panel && <div className="modern-panel" ref={panelRef}>{panel}</div>}
        <div className="modern-overlay-host" ref={modern ? setOverlayHost : undefined} />
      </section>
      {tray && <><TrayResizeGrip side="left" view={tray} /><TrayResizeGrip side="right" view={tray} /></>}
    </>, root)}
  </>;
}

function TrayResizeGrip({ side, view }: { side: 'left' | 'right'; view: TrayWindow }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const timer = useRef(0), pending = useRef(0);
  const [width, setWidth] = useState(view.innerWidth);
  useEffect(() => {
    const changed = () => setWidth(view.innerWidth);
    view.addEventListener('resize', changed);
    return () => { view.removeEventListener('resize', changed); window.clearTimeout(timer.current); };
  }, [view]);
  const resize = (width: number) => {
    pending.current = width;
    if (!timer.current) timer.current = window.setTimeout(() => {
      timer.current = 0;
      void window.novi.setTrayWidth(pending.current, side).catch(() => {});
    }, 16);
  };
  return <div className={`tray-resize-grip tray-resize-${side}`} role="separator" aria-orientation="vertical"
    aria-label={`Resize tray from ${side}`} aria-valuenow={width} aria-valuetext={`${width} pixels wide`}
    aria-valuemin={Math.min(320, view.screen.availWidth)} aria-valuemax={Math.max(width, view.screen.availWidth)}
    tabIndex={0} title="Drag to resize · Arrow keys adjust width"
    onPointerDown={event => {
      if (event.button !== 0) return;
      const view = event.currentTarget.ownerDocument.defaultView!;
      drag.current = { x: event.screenX, width: view.innerWidth };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
    onPointerMove={event => {
      if (drag.current) resize(drag.current.width + (event.screenX - drag.current.x) * (side === 'left' ? -1 : 1));
    }}
    onPointerUp={event => {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const delta = (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? -1 : 1) * (event.shiftKey ? 64 : 16);
      resize(event.currentTarget.ownerDocument.defaultView!.innerWidth + delta);
    }} />;
}

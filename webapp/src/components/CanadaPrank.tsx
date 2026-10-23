'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './CanadaPrank.module.css';

// CANADA PRANK: isolated from page content; the country header is supplied by Vercel.
export default function CanadaPrank() {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/canada-prank', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!controller.signal.aborted && result?.showPrank === true) setActive(true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!active) return;
    const modal = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
    return () => { modal.close(); document.body.style.overflow = overflow; };
  }, [active]);

  if (!active) return null;
  return <dialog ref={dialog} className={styles.takeover} aria-label="Surprise image" onClose={() => {
    if (document.fullscreenElement === content.current) void document.exitFullscreen().catch(() => {});
    setActive(false);
  }}>
    <div ref={content} className={styles.content}>
    <button className={styles.image} aria-label="View image in fullscreen" onClick={() => {
      // Browsers require a user gesture; the viewport takeover is already visible.
      if (!document.fullscreenElement) void content.current?.requestFullscreen?.().catch(() => {});
    }}><img src="/canada-prank.png" alt="Kendrick Lamar smiling at the camera" /></button>
    <button className={styles.close} aria-label="Close image and return to website" onClick={() => dialog.current?.close()}>×</button>
    </div>
  </dialog>;
}

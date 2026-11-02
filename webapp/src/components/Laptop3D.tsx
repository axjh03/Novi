'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import LaptopDrawn from './LaptopDrawn';
import styles from './Laptop3D.module.css';

/* The laptop the site shows the app on. With WebGL it is the real MacBook model (MacBookScene), a
   client-only bundle loaded when the laptop is near the viewport; the children are its screen.
   Without WebGL the same children go on the laptop drawn in CSS. Reduced motion keeps the model
   and drops the opening, the float and the tilt. */
const Scene = dynamic(() => import('./MacBookScene'), { ssr: false, loading: () => null });

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}

export function useSceneReady(root: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<{ webgl: boolean | null; near: boolean; active: boolean; motion: boolean }>({ webgl: null, near: false, active: false, motion: false });
  useEffect(() => {
    const webgl = supportsWebGL();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setState(current => ({ ...current, motion: !reduced.matches }));
    reduced.addEventListener('change', apply);
    setState({ webgl, near: false, active: false, motion: !reduced.matches });
    if (!webgl || !('IntersectionObserver' in window) || !root.current) { setState(current => ({ ...current, webgl, near: true, active: true })); return () => reduced.removeEventListener('change', apply); }
    const io = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setState(current => ({ ...current, near: true })); io.disconnect(); } }, { rootMargin: '400px 0px' });
    io.observe(root.current);
    // Render only while on screen (and not in a hidden tab).
    const watcher = new IntersectionObserver(entries => setState(current => ({ ...current, active: entries.some(entry => entry.isIntersecting) })), { threshold: 0.05 });
    watcher.observe(root.current);
    const visibility = () => setState(current => ({ ...current, active: document.hidden ? false : current.active }));
    document.addEventListener('visibilitychange', visibility);
    return () => { io.disconnect(); watcher.disconnect(); reduced.removeEventListener('change', apply); document.removeEventListener('visibilitychange', visibility); };
  }, [root]);
  return state;
}

export default function Laptop3D({ children, className = '', rest, label }: { children: ReactNode; className?: string; tilt?: boolean; sway?: boolean; rest?: [number, number]; label?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const { webgl, near, active, motion } = useSceneReady(root);
  if (webgl === false) return <LaptopDrawn className={className} label={label} rest={rest ? [rest[0] * -57, rest[1] * -57] : undefined}>{children}</LaptopDrawn>;
  return (
    <div ref={root} className={`${styles.scene} ${className}`} role={label ? 'img' : undefined} aria-label={label} data-ready={(webgl && near) || undefined}>
      {webgl && near && <Scene motion={motion && active} rest={rest} pointerRoot={root}>{children}</Scene>}
    </div>
  );
}

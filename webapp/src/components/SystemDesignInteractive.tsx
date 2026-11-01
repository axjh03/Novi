'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ArchitectureDiagram, type Diagram } from './Fragments';
import styles from './Fragments.module.css';

/* The 3D model is a client-only bundle (three, R3F, GSAP) fetched when the section is near the
   viewport. Until then, and wherever WebGL or motion is off, the flat diagram the app draws stands in. */
const Scene = dynamic(() => import('./SystemDesignScene'), { ssr: false, loading: () => null });

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}

export function SystemDesignInteractive({ diagram, title }: { diagram: Diagram; title: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState(false);
  const [active, setActive] = useState(false);
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    if (!supportsWebGL() || !('IntersectionObserver' in window)) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotion(!reduced.matches);
    apply(); reduced.addEventListener('change', apply);
    setReady(true);
    const el = root.current!;
    // Load a screen ahead; animate only while on screen.
    const loader = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNear(true); loader.disconnect(); } }, { rootMargin: '600px 0px' });
    const watcher = new IntersectionObserver(entries => setActive(entries.some(entry => entry.isIntersecting)), { threshold: 0.15 });
    loader.observe(el); watcher.observe(el);
    const visibility = () => setActive(current => document.hidden ? false : current);
    document.addEventListener('visibilitychange', visibility);
    return () => { loader.disconnect(); watcher.disconnect(); reduced.removeEventListener('change', apply); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return (
    <div ref={root} className={styles.scene} role="img" aria-label={`Interactive architecture model: ${title}. The same diagram follows as text.`}>
      {ready && near ? <Scene diagram={diagram} title={title} motion={motion} active={active} scrollRoot={root} /> : <div className={styles.uiDiagramWrap}><ArchitectureDiagram diagram={diagram} title={title} /></div>}
    </div>
  );
}

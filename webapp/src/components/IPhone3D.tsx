'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';
import { useSceneReady } from './Laptop3D';
import styles from './IPhone3D.module.css';

/* The phone companion on a real iPhone. With WebGL it is the iPhone 15 Pro model (IPhoneScene), a
   client-only bundle loaded near the viewport; without it, the screenshot stands in a flat phone frame. */
const Scene = dynamic(() => import('./IPhoneScene'), { ssr: false, loading: () => null });

/* `src` is the plain screenshot for the flat fallback; `screen` is the version with the status bar and island composed in, for the model. */
export default function IPhone3D({ src, screen = src, alt, className = '' }: { src: string; screen?: string; alt: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const { webgl, near, active, motion } = useSceneReady(root);
  if (webgl === false) {
    return (
      <div className={`${styles.flat} ${className}`} data-ui>
        <div className={styles.flatScreen}><img src={src} alt={alt} width={390} height={844} loading="lazy" decoding="async" /></div>
      </div>
    );
  }
  return (
    <div ref={root} className={`${styles.scene} ${className}`} role="img" aria-label={alt} data-ready={(webgl && near) || undefined}>
      {webgl && near && <Scene src={screen} motion={motion && active} pointerRoot={root} />}
    </div>
  );
}

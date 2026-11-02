'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import styles from './LaptopDrawn.module.css';

/* A laptop drawn in real CSS 3D: a lid that leans back on its hinge, a base that lies flat toward the
   viewer, both with thickness. The rig tilts toward the pointer on hover-capable screens and sways
   slowly on its own; with reduced motion it stands still at its resting angle. Whatever is passed as
   children is the screen. Sizes are in cqi so the whole thing scales with its column. */
export default function LaptopDrawn({ children, className = '', tilt = true, sway = true, rest = [-12, -14], label }: { children: ReactNode; className?: string; tilt?: boolean; sway?: boolean; rest?: [number, number]; label?: string }) {
  const rig = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rig.current, stage = scene.current;
    if (!el || !stage || !tilt) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let target = { x: rest[0], y: rest[1] }, current = { ...target }, frame = 0;
    const step = () => {
      current = { x: current.x + (target.x - current.x) * 0.08, y: current.y + (target.y - current.y) * 0.08 };
      el.style.transform = `rotateX(${current.x.toFixed(2)}deg) rotateY(${current.y.toFixed(2)}deg)`;
      frame = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    const kick = () => { if (!frame) frame = requestAnimationFrame(step); };
    const move = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      const dx = (event.clientX - box.left) / box.width - 0.5, dy = (event.clientY - box.top) / box.height - 0.5;
      target = { x: rest[0] - dy * 10, y: rest[1] + dx * 18 };
      kick();
    };
    const leave = () => { target = { x: rest[0], y: rest[1] }; kick(); };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerleave', leave);
    return () => { stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame); };
  }, [tilt, rest]);

  return (
    <div ref={scene} className={`${styles.scene} ${className}`} style={{ '--rx': `${rest[0]}deg`, '--ry': `${rest[1]}deg` } as CSSProperties} role={label ? 'img' : undefined} aria-label={label}>
      <div ref={rig} className={styles.rig}>
        <div className={sway ? styles.sway : styles.still}>
          <div className={styles.lid}>
            <div className={styles.lidBack} />
            <div className={styles.bezel}>
              <i className={styles.camera} aria-hidden="true" />
              <div className={styles.screen}>{children}</div>
            </div>
          </div>
          <div className={styles.base}>
            <div className={styles.deck}>
              <div className={styles.keys} aria-hidden="true">{Array.from({ length: 4 }, (_, row) => <span key={row} className={styles.keyRow}>{Array.from({ length: 14 }, (_, key) => <i key={key} />)}</span>)}<span className={styles.keyRow}><i className={styles.keyWide} /><i className={styles.keySpace} /><i className={styles.keyWide} /></span></div>
              <i className={styles.trackpad} aria-hidden="true" />
            </div>
            <div className={styles.front} />
          </div>
        </div>
      </div>
    </div>
  );
}

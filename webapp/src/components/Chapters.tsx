'use client';

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import styles from './Chapters.module.css';

/* The shell of every public page after the landing page: a black ground that reveals each block once
   as it enters. Everything is visible without script; only a ready page hides anything. */
export function ChapterPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const page = root.current;
    if (!page || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const blocks = [...page.querySelectorAll<HTMLElement>('[data-reveal]')];
    page.classList.add(styles.ready);
    const show = (el: HTMLElement) => el.classList.add(styles.in);
    const io = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { show(entry.target as HTMLElement); io.unobserve(entry.target); } }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    for (const el of blocks) { if (el.getBoundingClientRect().top < innerHeight * 0.92) show(el); else io.observe(el); }
    return () => io.disconnect();
  }, []);
  return <div className={`${styles.page} ${className}`} ref={root}>{children}</div>;
}

/* A headline whose lines rise one after another on load. */
export function Title({ id, lines, className = '' }: { id: string; lines: string[]; className?: string }) {
  return (
    <h1 id={id} className={`${styles.title} ${className}`}>
      {lines.map((line, index) => <span className={styles.line} key={line}><span style={{ '--i': index } as CSSProperties}>{line}</span></span>)}
    </h1>
  );
}

/* Questions as filled tiles; one opens at a time. */
export function Faq({ id, title, items, name, tone = 'black' }: { id: string; title: string; items: readonly { q: string; a: ReactNode }[]; name: string; tone?: 'black' | 'paper' }) {
  return (
    <section className={`${styles.faq} ${styles[`tone-${tone}`]}`} aria-labelledby={`${id}-title`} id={id}>
      <h2 id={`${id}-title`} data-reveal>{title}</h2>
      <div className={styles.faqList}>
        {items.map((item, index) => (
          <details key={item.q} name={name} data-reveal style={{ '--i': index } as CSSProperties}>
            <summary>{item.q}<span aria-hidden="true" /></summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* The close: one row of tiles cropped from a longer board. */
export function CloseRow({ id, title, text, action, href }: { id: string; title: ReactNode; text: string; action: string; href: string }) {
  return (
    <section className={styles.close} aria-labelledby={`${id}-title`}>
      <div className={`${styles.closeTile} ${styles.closeLeft}`} data-reveal aria-hidden="true" />
      <div className={`${styles.closeTile} ${styles.closeMain}`} data-reveal style={{ '--i': 1 } as CSSProperties}>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{text}</p>
        <Link className={styles.closeAction} href={href}>{action}</Link>
      </div>
      <div className={`${styles.closeTile} ${styles.closeRight}`} data-reveal style={{ '--i': 2 } as CSSProperties} aria-hidden="true" />
    </section>
  );
}

'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import Laptop3D from './Laptop3D';
import { Desk } from './ScreenCompare';
import styles from './HeroShowcase.module.css';

/* The product on a laptop, three screens deep: the chat window, transparent mode, and the listening
   bar over a call. The screens take turns every few seconds; the tabs under the laptop switch them,
   the laptop itself swipes, and the arrow keys walk the tabs. Real screenshots of the app, nothing drawn. */
const HOLD = 5600;
const slides: { id: string; label: string; caption: string; picture: ReactNode }[] = [
  { id: 'chat', label: 'Chat', caption: 'The chat window: readable code, the complexity, and the explanation for the follow-up.', picture: <img src="/app/chat.png" alt="The Novi chat window answering a code question with an explanation" width={1180} height={940} decoding="async" /> },
  { id: 'transparent', label: 'Transparent', caption: 'Capture protection on. The screen share gets the editor; you get the answer beside it.', picture: <img src="/app/transparent.png" alt="Novi in transparent mode over a code review question" width={1180} height={940} loading="lazy" decoding="async" /> },
  { id: 'listening', label: 'Listening', caption: 'The floating bar transcribes the call and lines up the follow-ups before they ask.', picture: <Desk withNovi /> },
];

export default function HeroShowcase() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [auto, setAuto] = useState(true);
  const pause = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);

  // Auto-advance while nobody is touching it; a touch or a click pauses the loop for a while.
  useEffect(() => {
    if (!auto || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setTimeout(() => { setActive(index => (index + 1) % slides.length); setCycle(c => c + 1); }, HOLD);
    return () => clearTimeout(timer);
  }, [auto, active, cycle]);
  useEffect(() => () => { if (pause.current) clearTimeout(pause.current); }, []);

  const go = (index: number) => {
    setActive((index + slides.length) % slides.length);
    setCycle(c => c + 1);
    setAuto(false);
    if (pause.current) clearTimeout(pause.current);
    pause.current = setTimeout(() => setAuto(!matchMedia('(prefers-reduced-motion: reduce)').matches), 14000);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); focusTab(active + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); focusTab(active - 1); }
  };
  const focusTab = (index: number) => { const tab = document.getElementById(`hero-tab-${slides[(index + slides.length) % slides.length].id}`); tab?.focus(); };
  const down = (event: PointerEvent<HTMLDivElement>) => { press.current = { x: event.clientX, y: event.clientY }; };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const start = press.current; press.current = null;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? active + 1 : active - 1);
  };

  return (
    <div className={styles.showcase}>
      <div className={styles.stage} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { press.current = null; }}>
        <Laptop3D>
          {slides.map((slide, index) => (
            <div className={styles.slide} key={slide.id} id={`hero-screen-${slide.id}`} role="tabpanel" aria-labelledby={`hero-tab-${slide.id}`} data-active={index === active || undefined} aria-hidden={index !== active}>{slide.picture}</div>
          ))}
        </Laptop3D>
      </div>
      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label="Screens of the app" onKeyDown={onKey}>
          {slides.map((slide, index) => (
            <button type="button" role="tab" key={slide.id} id={`hero-tab-${slide.id}`} aria-selected={index === active} aria-controls={`hero-screen-${slide.id}`} tabIndex={index === active ? 0 : -1} onClick={() => go(index)}>
              <span>{slide.label}</span>
              {index === active && <i key={cycle} className={styles.progress} data-paused={!auto || undefined} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <p className={styles.caption} aria-live="polite">{slides[active].caption}</p>
      </div>
    </div>
  );
}

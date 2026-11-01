'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { marks, PROVIDER_BRAND, PROVIDER_NAMES, type ProviderId } from './ProviderMarks';
import styles from './BrainBot.module.css';

/* The hero of the setup guide: one Novi bot, four brains. Its head is a cube in real 3D with a lid
   hinged at the back. Every few seconds the lid opens, the current brain (a chip carrying the
   provider's mark) lifts out, the next one drops in, the lid closes, and the visor takes that
   provider's colour. With reduced motion, or without script, the bot sits with the first brain in. */
const ORDER: ProviderId[] = ['anthropic', 'openai', 'gemini', 'kimi'];
const LINES: Record<ProviderId, string> = {
  anthropic: 'Reverse the list in place: three pointers, one pass, O(n).',
  openai: 'The screenshot: line 12 never checks for null before the call.',
  gemini: 'The forty-page design doc, down to the three decisions that matter.',
  kimi: 'Your project notes, in the answer, in either language.',
};
type Phase = 'idle' | 'open' | 'out' | 'in' | 'close';

export default function BrainBot() {
  const [current, setCurrent] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>(resolve => { timers.push(window.setTimeout(resolve, ms)); });
    (async () => {
      let index = 0;
      await wait(2800);
      while (alive) {
        const upcoming = (index + 1) % ORDER.length;
        setNext(upcoming); setPhase('open'); await wait(560);
        setPhase('out'); await wait(600);
        setPhase('in'); await wait(680);
        setPhase('close'); await wait(560);
        index = upcoming; setCurrent(index); setNext(null); setPhase('idle');
        await wait(3600);
      }
    })();
    return () => { alive = false; for (const t of timers) clearTimeout(t); };
  }, []);

  const id = ORDER[current];
  const nextId = next === null ? null : ORDER[next];
  const shown = (phase === 'in' || phase === 'close') && nextId ? nextId : id;
  const swapping = phase !== 'idle';
  return (
    <div className={styles.bot} data-phase={phase} style={{ '--brand': PROVIDER_BRAND[shown] } as CSSProperties} role="img" aria-label="A Novi bot swapping its brain between the Anthropic, OpenAI, Google Gemini and Kimi marks.">
      <div className={styles.scene}>
        <div className={styles.rig}>
          <div className={styles.sway}>
            <div className={styles.head}>
              <div className={`${styles.face} ${styles.front}`}><div className={styles.visor}><i className={styles.eye} /><i className={styles.eye} /></div><i className={styles.mouth} /></div>
              <div className={`${styles.face} ${styles.back}`} />
              <div className={`${styles.face} ${styles.left}`}><i className={styles.ear} /></div>
              <div className={`${styles.face} ${styles.right}`}><i className={styles.ear} /></div>
              <div className={`${styles.face} ${styles.bottom}`} />
              <div className={`${styles.face} ${styles.lid}`} />
              <div className={styles.cavity}>
                <div className={`${styles.chip} ${styles.chipCurrent}`} key={`c-${id}`} style={{ '--chip': PROVIDER_BRAND[id] } as CSSProperties}>{marks[id]}</div>
                {nextId && <div className={`${styles.chip} ${styles.chipNext}`} key={`n-${nextId}`} style={{ '--chip': PROVIDER_BRAND[nextId] } as CSSProperties}>{marks[nextId]}</div>}
              </div>
            </div>
            <div className={styles.neck} />
            <div className={styles.body}><div className={styles.bodyTop} /><div className={styles.bodyFront}><i /></div></div>
          </div>
        </div>
      </div>
      <div className={styles.bubble} data-ui>
        <b>{swapping ? 'Swapping brains…' : `Thinking with ${PROVIDER_NAMES[id]}`}</b>
        <span>{swapping ? 'Any one key will do. Same bot, same desk.' : LINES[id]}</span>
      </div>
      <ul className={styles.ring} aria-hidden="true">{ORDER.map(provider => <li key={provider} data-on={provider === shown || undefined} style={{ '--chip': PROVIDER_BRAND[provider] } as CSSProperties}>{marks[provider]}</li>)}</ul>
    </div>
  );
}

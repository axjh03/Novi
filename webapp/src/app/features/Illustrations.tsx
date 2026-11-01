'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './features.module.css';

/* Plays once when the fragment scrolls into view; static under reduced motion or without script. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setInView(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

/* Local Coding: the agent reads the project in the background and comes back with a proposal that
   reads like a pull request: the files it would touch, what changes in each, one diff to review.
   Nothing is written and nothing runs; the visitor sees exactly that. */
const steps = [
  'Searched 142 files for "charge" · 9 matches',
  'Read src/payments/charge.ts, src/checkout/retry.ts and tests/charge.test.ts',
  'Traced retry() → charge(): a declined card throws, and the retry charges again',
  'Proposed a change across 3 files · not applied',
];
const files = [
  { path: 'src/payments/', name: 'charge.ts', kind: 'M', add: 6, del: 7 },
  { path: 'src/payments/', name: 'idempotency.ts', kind: 'A', add: 11, del: 0 },
  { path: 'src/checkout/', name: 'retry.ts', kind: 'M', add: 1, del: 0 },
  { path: 'tests/', name: 'charge.test.ts', kind: 'M', add: 9, del: 2 },
] as const;
const kinds = { M: 'Modified', A: 'Added', D: 'Deleted' } as const;

export function LocalCodingFragment() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`${styles.ui} ${inView ? styles.play : ''}`} data-ui>
      <div className={styles.uiBar}><span className={styles.uiMode}>Local coding</span><span>my-shop · 142 files indexed</span><span>Read-only</span></div>
      <p className={styles.uiQuestion}><span>You</span>Why does checkout double-charge a card that was declined once?</p>
      <ol className={styles.agent} aria-label="What the agent did">
        {steps.map((step, index) => <li key={step} style={{ '--i': index } as CSSProperties}><i /><span>{step}</span></li>)}
      </ol>
      <div className={styles.pr} style={{ '--i': steps.length } as CSSProperties}>
        <div className={styles.prHead}><span className={styles.uiMark}>n</span><strong>Proposed changes</strong><span className={styles.prCount}><b className={styles.add}>+27</b><b className={styles.del}>−9</b></span></div>
        <ul className={styles.tree} aria-label="Files the proposal touches">
          {files.map((file, index) => (
            <li key={file.name} style={{ '--i': steps.length + 1 + index } as CSSProperties}>
              <span className={styles.treePath}>{file.path}</span><span className={styles.treeName}>{file.name}</span>
              <span className={`${styles.kind} ${styles[`kind${file.kind}`]}`} title={kinds[file.kind]}>{file.kind}</span>
              <span className={styles.bars} aria-label={`${file.add} added, ${file.del} removed`}>{file.add > 0 && <b className={styles.add}>+{file.add}</b>}{file.del > 0 && <b className={styles.del}>−{file.del}</b>}</span>
            </li>
          ))}
        </ul>
        <pre className={styles.diff} style={{ '--i': steps.length + 6 } as CSSProperties}><code>
          <span className={styles.diffFile}>src/payments/charge.ts</span>
          <span className={styles.diffDel}>−  const result = await charge(card, amount);</span>
          <span className={styles.diffAdd}>+  const result = await charge(card, amount, {'{'} key: order.id {'}'});</span>
          <span className={styles.diffAdd}>+  if (result.declined) return result; // no retry on a decline</span>
        </code></pre>
        <p className={styles.prFoot}>Review the diff here, apply it yourself. Novi never writes to your files and never runs your code.</p>
      </div>
    </div>
  );
}

/* Eye tracking: the gaze point moves about the screen and the answer HUD follows it. A loop of four
   positions with holds, the HUD a beat behind. The calibration tile is the only still thing. */
export function GazeScene() {
  return (
    <div className={styles.gaze} data-ui aria-label="The answer window following the eyes across a screen">
      <div className={styles.gazeBar}><span className={styles.uiMode}>Behavioral interview</span><span>Session · 08:41</span><span className={styles.uiLive}><i />Listening</span></div>
      <div className={styles.gazeDesk}>
        <div className={styles.cam}><span><i /></span><b>Webcam</b><small>Calibrated · 9 points</small></div>
        <p className={styles.gazeQuestion}>“Tell me about a time you disagreed with your manager.”</p>
        <div className={styles.gazePoint} aria-hidden="true" />
        <div className={styles.hud}>
          <p><span className={styles.uiMark}>n</span>Disagreeing, in STAR</p>
          <ul><li>The rollout date they set skipped the load test.</li><li>I brought the numbers from the last incident, not an opinion.</li><li>We shipped one week later with the test. No incident.</li></ul>
          <small>Follows your gaze · Pro, Ultimate and Lifetime</small>
        </div>
      </div>
    </div>
  );
}

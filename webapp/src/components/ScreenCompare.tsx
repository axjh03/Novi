'use client';

import { useId, useState, type CSSProperties } from 'react';
import styles from './ScreenCompare.module.css';

/* One laptop screen, twice: the interviewer's share on the left and the same desk with Novi on the
   right. The divider is a real range input stretched over the picture, so it drags, taps and takes
   the arrow keys. The desk is built in HTML at true size; the overlay is the app's own window. */
function Desk({ withNovi }: { withNovi: boolean }) {
  return (
    <div className={styles.desk} data-ui aria-hidden="true">
      <div className={styles.call}>
        <div className={styles.callBar}><span>Technical screen · Acme · 24:12</span><span className={styles.callLive}><i />Recording</span></div>
        <div className={styles.callTiles}>
          <div className={styles.tile}><b>PK</b><span>Priya K · Interviewer</span></div>
          <div className={styles.tile}><b>You</b><span>Sharing screen</span></div>
        </div>
      </div>
      <div className={styles.editor}>
        <div className={styles.editorBar}><span className={styles.editorTab}>two_sum.py</span><span>Python 3</span><span>Shared with Priya</span></div>
        <pre className={styles.editorBody}><code>
          <span><i>1</i># Given nums and a target, return the indices of the</span>
          <span><i>2</i># two numbers that add up to target. One pass if you can.</span>
          <span><i>3</i></span>
          <span><i>4</i>def two_sum(nums, target):</span>
          <span><i>5</i>    seen = {'{}'}</span>
          <span><i>6</i>    for i, value in enumerate(nums):</span>
          <span><i>7</i>        <em>|</em></span>
          <span><i>8</i></span>
          <span><i>9</i></span>
        </code></pre>
      </div>
      {withNovi && <img className={styles.novi} src="/app/modern-dark.png" alt="" width={490} height={457} loading="lazy" decoding="async" />}
    </div>
  );
}

export default function ScreenCompare() {
  const [split, setSplit] = useState(50);
  const id = useId();
  return (
    <div className={styles.laptop} data-reveal style={{ '--split': `${split}%` } as CSSProperties}>
      <div className={styles.screen}>
        <div className={styles.layer}><Desk withNovi={false} /></div>
        <div className={`${styles.layer} ${styles.top}`}><Desk withNovi /></div>
        <span className={styles.labelLeft} aria-hidden="true">Their screen share</span>
        <span className={styles.labelRight} aria-hidden="true">Your screen</span>
        <span className={styles.divider} aria-hidden="true"><i /></span>
        <label className={styles.srOnly} htmlFor={id}>Compare the interviewer&apos;s view with yours. Left is the screen share, right is your own screen.</label>
        <input id={id} className={styles.range} type="range" min={4} max={96} value={split} onChange={event => setSplit(Number(event.target.value))} aria-valuetext={`${split}% of the screen shows your view`} />
      </div>
      <div className={styles.deck} aria-hidden="true" />
    </div>
  );
}

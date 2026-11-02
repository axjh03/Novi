'use client';

import { useId, useState, type CSSProperties } from 'react';
import { Mic, MonitorUp, PhoneOff, Video } from 'lucide-react';
import styles from './ScreenCompare.module.css';

/* One Mac screen, twice: the interviewer's share on the left and the same desk with Novi on the
   right. The divider is a real range input stretched over the picture, so it drags, taps and takes
   the arrow keys. The desk is drawn in HTML at true size (menu bar, call window, Dock); the overlay
   is the app's own window. Capture protection is why the left half has no Novi in it. */
export function Desk({ withNovi }: { withNovi: boolean }) {
  return (
    <div className={styles.desk} data-ui aria-hidden="true">
      <div className={styles.menubar}>
        <span className={styles.apple}><svg viewBox="0 0 17 20" width="13" height="15" aria-hidden="true"><path fill="currentColor" d="M14.2 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8C4.7 5.4 3.2 6.3 2.4 7.7c-1.7 2.9-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.8-1.1-2.8-4.1zM11.9 3.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z" /></svg></span>
        <strong>Meeting</strong><span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span>
        <span className={styles.sharing}><i />Sharing your screen</span>
        <span className={styles.clock}>Tue 10:42</span>
      </div>
      <div className={styles.window}>
        <div className={styles.titlebar}><span className={styles.lights}><i /><i /><i /></span><span>Technical screen · Acme Robotics · 24:12</span><span className={styles.rec}><i />REC</span></div>
        <div className={styles.stage}>
          <div className={styles.tileBig}>
            <span className={styles.person}><i /></span>
            <span className={styles.name}>Priya Kapoor<small>Interviewer · Host</small></span>
          </div>
          <div className={styles.tileSelf}><span className={styles.personSmall}><i /></span><span className={styles.name}>You<small>Sharing screen</small></span></div>
          <div className={styles.chat}>
            <p><b>Priya</b> Can you walk me through how you would scale the message store?</p>
            <p><b>Priya</b> Take your time.</p>
          </div>
        </div>
        <div className={styles.controls}>
          <span><Mic size={15} /><small>Mute</small></span>
          <span><Video size={15} /><small>Stop video</small></span>
          <span className={styles.on}><MonitorUp size={15} /><small>Sharing</small></span>
          <span className={styles.leave}><PhoneOff size={15} /><small>Leave</small></span>
        </div>
      </div>
      <div className={styles.dock}>
        {['finder', 'mail', 'cal', 'notes', 'code', 'meet', 'music', 'settings'].map(app => <i key={app} className={styles[`dock-${app}` as keyof typeof styles]} />)}
        <b /><i className={styles['dock-trash']} />
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

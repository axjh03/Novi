'use client';

import { useState } from 'react';
import styles from './referral.module.css';

const url = 'https://i.redd.it/01f6xv08k19h1.gif';
export default function ReferralGif() {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  return <figure className={styles.gif}>
    {playing && !failed ? <img src={url} alt="A little encouragement: help a brother out." onError={() => setFailed(true)} /> : <div className={styles.gifPlaceholder}><span>🤝</span><strong>For the group chat.</strong><p>{failed ? 'The GIF couldn’t load here. Open it below.' : 'A little extra encouragement, in GIF form.'}</p></div>}
    <figcaption>{!failed && <button type="button" aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? 'Hide animation' : 'Play the GIF'}</button>}<a href={url} target="_blank" rel="noreferrer">Open original GIF ↗</a></figcaption>
  </figure>;
}

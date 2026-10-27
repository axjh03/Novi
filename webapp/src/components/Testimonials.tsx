'use client';

import { useState } from 'react';
import { Pause, Play, Quote } from 'lucide-react';
import styles from './Testimonials.module.css';

// These are illustrative identities and quotes, pending approved customer feedback.
const samples = [
  { name: 'Aarav', quote: "I was so nervous before my interview. Having my resume and project notes there helped me find the words when my mind went blank." },
  { name: 'Ananya', quote: "I kept getting stuck when they asked why my code worked. Seeing it explained step by step made that part feel a lot less scary." },
  { name: 'Diego', quote: "The worst feeling is going blank on something you actually know. Having my own notes right there helped me slow down and think." },
  { name: 'Anonymous', quote: "Follow-up questions really throw me off. Being able to go back to the original question helped me stop rushing my answers." },
  { name: 'Prisha', quote: "I'm not great with setup stuff, so using the same login on my laptop was a relief. I just wanted to get started without making another account." },
  { name: 'Rohan', quote: "The code wasn't what stressed me out. It was explaining it while someone watched. The little explanations helped me find the words." },
  { name: 'Valeria', quote: "I usually read a question three times and still overthink it. Sending a screenshot and working through it felt so much easier." },
  { name: 'Anonymous', quote: "After a whole day of applications, I really didn't want another complicated setup. This felt easy enough to actually stick with." },
];

export default function Testimonials() {
  const [paused, setPaused] = useState(false);
  return <section className={styles.section} aria-labelledby="testimonials-title" aria-describedby="testimonials-disclosure">
    <div className={styles.heading}><div><span className={styles.eyebrow}>OUR TESTIMONIALS</span><h2 id="testimonials-title">Real feedback from job seekers.</h2><p id="testimonials-disclosure"><strong>Sample content.</strong> Illustrative quotes and names for this layout preview. Approved customer feedback will replace these cards.</p></div><button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{paused ? 'Play' : 'Pause'}</button></div>
    <div className={styles.rows} data-paused={paused}>
      {[samples.slice(0, 4), samples.slice(4)].map((row, index) => <div className={styles.row} key={index} tabIndex={0} role="region" aria-label={`Testimonial row ${index + 1}, scrolls ${index === 0 ? 'left' : 'right'}`}>
        <div className={`${styles.track} ${index === 1 ? styles.reverse : ''}`}>
          {[false, true].map(duplicate => <div className={styles.group} key={String(duplicate)} aria-hidden={duplicate || undefined}>
            {row.map((item, card) => <figure className={styles.card} key={card}><Quote size={20} className={styles.quote} aria-hidden="true" /><blockquote>{item.quote}</blockquote><figcaption><span className={styles.avatar} aria-hidden="true">{item.name === 'Anonymous' ? '?' : item.name[0]}</span><div><strong>{item.name}{item.name !== 'Anonymous' && <><span className={styles.surname} aria-hidden="true"> ██████</span><span className={styles.srOnly}> · surname hidden</span></>}</strong></div></figcaption></figure>)}
          </div>)}
        </div>
      </div>)}
    </div>
  </section>;
}

'use client';

import { useState } from 'react';
import { Pause, Play, Quote } from 'lucide-react';
import styles from './Testimonials.module.css';

// These are illustrative identities and quotes, pending approved customer feedback.
const samples = [
  { name: 'Aarav', quote: "After weeks of silence, I finally landed a developer interview. I nearly froze on the project questions. Having my resume in Context helped me explain my own work instead of going blank." },
  { name: 'Ananya', quote: "I got through to the next technical round! Code was the best feature for me. The explanation helped so much when they asked why my solution worked. That follow-up used to terrify me." },
  { name: 'Diego', quote: "Finally got a second interview. Listening was honestly the standout. I could focus on what they were asking instead of trying to type every question while I was already nervous." },
  { name: 'Anonymous', quote: "They invited me to the final round and I was so relieved. Behavioral mode helped me turn my rambling project stories into answers that actually made sense." },
  { name: 'Prisha', quote: "I landed an interview after so many applications and really didn't want to mess it up. Screenshots were my favorite feature. Seeing the question and explanation together helped me get unstuck." },
  { name: 'Rohan', quote: "Made it through my system design round. I usually panic when the question gets vague, but the diagrams gave me a way to explain the architecture. That feature was amazing." },
  { name: 'Valeria', quote: "I got called back for another interview! The follow-up chat helped the most. When they changed the question, I could keep working from the same project context instead of starting over." },
  { name: 'Anonymous', quote: "I finally cleared a technical screen I'd been dreading. Going back over the saved chat afterwards helped me see what I needed to work on before the next round. Felt a little more ready this time." },
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

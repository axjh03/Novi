'use client';

import { useState } from 'react';
import { MessageCircle, Mail, Pause, Play, Quote } from 'lucide-react';
import styles from './Testimonials.module.css';

// These are illustrative identities and quotes, pending approved customer feedback.
const samples = [
  { name: 'Aarav', country: 'Nepal', source: 'Instagram', quote: 'Having my résumé and project notes beside the question made it easier to explain what I had actually built.' },
  { name: 'Ananya', country: 'India', source: 'Email', quote: 'The coding explanation was the useful part for me. I could follow the approach and understand the edge cases.' },
  { name: 'Diego', country: 'Mexico', source: 'Instagram', quote: 'I used the technical mode for a project walkthrough. The answers stayed connected to the context I had added.' },
  { name: 'Anonymous', country: '', source: 'Email', quote: 'Listening helped me keep track of the question while I was thinking through my answer.' },
  { name: 'Prisha', country: 'Nepal', source: 'Email', quote: 'One account for the website and desktop made setup much easier. I added my AI key and signed straight in.' },
  { name: 'Rohan', country: 'India', source: 'Instagram', quote: 'Switching from the coding problem to a follow-up explanation felt straightforward. I could keep both in the same session.' },
  { name: 'Valeria', country: 'Mexico', source: 'Email', quote: 'The screenshot flow was simple: capture the question, add context, and work through the answer.' },
  { name: 'Anonymous', country: '', source: 'Instagram', quote: 'I liked being able to choose my own AI provider and revisit the conversation afterwards.' },
];

export default function Testimonials() {
  const [paused, setPaused] = useState(false);
  return <section className={styles.section} aria-labelledby="testimonials-title" aria-describedby="testimonials-disclosure">
    <div className={styles.heading}><div><span className={styles.eyebrow}>OUR TESTIMONIALS</span><h2 id="testimonials-title">Real feedback from job seekers.</h2><p id="testimonials-disclosure"><strong>Sample content.</strong> Illustrative quotes, names, and sources for this layout preview. Approved customer feedback will replace these cards.</p></div><button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{paused ? 'Resume scrolling' : 'Pause scrolling'}</button></div>
    <div className={styles.rows} data-paused={paused}>
      {[samples.slice(0, 4), samples.slice(4)].map((row, index) => <div className={styles.row} key={index} tabIndex={0} role="region" aria-label={`Testimonial row ${index + 1}, scrolls ${index === 0 ? 'left' : 'right'}`}>
        <div className={`${styles.track} ${index === 1 ? styles.reverse : ''}`}>
          {[false, true].map(duplicate => <div className={styles.group} key={String(duplicate)} aria-hidden={duplicate || undefined}>
            {row.map((item, card) => <figure className={styles.card} key={card}><Quote size={20} className={styles.quote} aria-hidden="true" /><blockquote>{item.quote}</blockquote><figcaption><span className={styles.avatar} aria-hidden="true">{item.name === 'Anonymous' ? '?' : item.name[0]}</span><div><strong>{item.name}{item.name !== 'Anonymous' && <><span className={styles.surname} aria-hidden="true"> ██████</span><span className={styles.srOnly}> · surname hidden</span></>}</strong><small>{item.country || 'Name withheld'}</small></div><span className={styles.source}>{item.source === 'Instagram' ? <MessageCircle size={13} aria-hidden="true" /> : <Mail size={13} aria-hidden="true" />}{item.source}</span></figcaption></figure>)}
          </div>)}
        </div>
      </div>)}
    </div>
  </section>;
}

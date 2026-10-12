'use client';

import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { CONTACT_EMAIL, INSTAGRAM_URL, mailto, PLANS, type PlanId } from '@/lib/site';
import styles from './get-access.module.css';

const TERMS = ['1 month', '3 months', '6 months', '12 months'];

// Builds the access request email so visitors only have to choose a plan and press send.
export default function AccessRequest({ initialPlan }: { initialPlan: PlanId }) {
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [seats, setSeats] = useState(5);
  const [term, setTerm] = useState(TERMS[1]);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [copied, setCopied] = useState(false);
  const team = plan === 'consultancy';
  const seatCount = Math.min(Math.max(Math.round(seats) || 1, 1), 500);
  const subject = `Novi access request: ${PLANS[plan].name}${team ? ` (${seatCount} seats)` : ''}`;
  const body = [
    'Hi Novi team,',
    '',
    "I'd like to get access to Novi.",
    '',
    `Plan: ${PLANS[plan].name} (${PLANS[plan].price} ${PLANS[plan].unit})`,
    ...(team ? [`Desktop logins needed: ${seatCount}`] : []),
    `Length: ${term}`,
    `Name: ${name.trim() || '(your name)'}`,
    ...(team ? [`Company: ${company.trim() || '(company name)'}`] : []),
    '',
    'Thanks!',
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(`To: ${CONTACT_EMAIL}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }

  return (
    <section className={styles.builder} aria-label="Request access">
      <div className={styles.card}>
        <h2>1. Choose your plan</h2>
        <p className={styles.hint}>You can change plans or add seats later.</p>
        <fieldset className={styles.plans}>
          <legend>Plan</legend>
          {(Object.keys(PLANS) as PlanId[]).map(id => (
            <label key={id} className={`${styles.plan} ${plan === id ? styles.selected : ''}`}>
              <input type="radio" name="plan" value={id} checked={plan === id} onChange={() => setPlan(id)} />
              <span><strong>{PLANS[id].name}</strong><small>{PLANS[id].summary}</small></span>
              <span className={styles.price}>{PLANS[id].price} <span>{PLANS[id].unit}</span></span>
            </label>
          ))}
        </fieldset>
        <div className={styles.fields}>
          {team && <label className={styles.field}>Desktop logins<input type="number" min={1} max={500} value={seats} onChange={event => setSeats(Number(event.target.value))} /><small>One per person. Bulk purchases can get up to 40% off.</small></label>}
          <label className={styles.field}>Length<select value={term} onChange={event => setTerm(event.target.value)}>{TERMS.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className={`${styles.field} ${team ? '' : styles.wide}`}>Your name<input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Optional" /></label>
          {team && <label className={styles.field}>Company<input value={company} maxLength={80} onChange={event => setCompany(event.target.value)} placeholder="Optional" /></label>}
        </div>
      </div>

      <div className={`${styles.card} ${styles.preview}`}>
        <h2>2. Send your request</h2>
        <p className={styles.hint}>This email is ready to send. We reply within 24 hours.</p>
        <p className={styles.subject}><b>To:</b> {CONTACT_EMAIL}<br /><b>Subject:</b> {subject}</p>
        <pre className={styles.body} aria-label="Email preview">{body}</pre>
        <div className={styles.actions}>
          <a className={styles.primary} href={mailto(subject, body)}><Mail size={16} aria-hidden="true" /> Open in your email app</a>
          <button type="button" className={styles.secondary} onClick={() => void copy()}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? 'Copied' : 'Copy email'}</button>
        </div>
        <p className={styles.alternatives}>Prefer another way? Message <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">@getnoviapp on Instagram</a>, or write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </div>
    </section>
  );
}

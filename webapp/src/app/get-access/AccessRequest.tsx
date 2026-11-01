'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { CONTACT_EMAIL, PURCHASE_HELP, referralCode, mailto, PLANS, type PlanId } from '@/lib/site';
import chapters from '@/components/Chapters.module.css';
import styles from './get-access.module.css';

const planIds = Object.keys(PLANS) as PlanId[];
const tones: Record<PlanId, string> = { core: 'tone-paper', pro: 'tone-rose', ultimate: 'tone-wine', lifetime: 'tone-deep' };
const stepNames = { details: 'Your details', payment: 'Review', help: 'Send' } as const;

export default function AccessRequest({ initialPlan, initialReferral = '' }: { initialPlan: PlanId; initialReferral?: string }) {
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [step, setStep] = useState<keyof typeof stepNames>('details');
  const [referral, setReferral] = useState(initialReferral);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const selected = PLANS[plan];
  const subject = `Novi access request: ${selected.name}`;
  const body = [
    'Hi Novi team,', '',
    "I'd like to get access to Novi. Please send me the payment details for this plan.", '',
    `Plan: ${selected.name}`,
    `Price: ${selected.price} ${selected.unit}`,
    `Billing: ${plan === 'lifetime' ? 'One-time payment for lifetime access' : 'Monthly'}`,
    ...(referral.trim() ? [`Referral code: ${referral.trim()}`] : []),
    `Name: ${name.trim() || '(your name)'}`,
    `Email: ${email.trim() || '(your email)'}`, '',
    'I understand that AI provider usage is billed separately.', '', 'Thanks!',
  ].join('\n');

  function choosePlan(id: PlanId) {
    setPlan(id);
    setStep('details');
    setCopyStatus('');
    document.getElementById('checkout-title')?.focus();
    document.getElementById('checkout')?.scrollIntoView({ block: 'start' });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`To: ${CONTACT_EMAIL}\nSubject: ${subject}\n\n${body}`);
      setCopyStatus('Email copied. Paste it into your email app and send it to our team.');
    } catch {
      setCopyStatus('Copy was unavailable. Select the email preview below and copy it manually.');
    }
  }

  return (
    <>
      {/* 2 · Four fields side by side, one per plan. The plan is the chapter colour. */}
      <section className={styles.plans} id="plans" aria-label="Novi plans">
        {planIds.map((id, index) => (
          <article key={id} id={`plan-${id}`} className={`${styles.plan} ${chapters[tones[id]]}`} aria-labelledby={`plan-${id}-name`}>
            <h2 id={`plan-${id}-name`} data-reveal>{PLANS[id].name}</h2>
            <p className={styles.price} data-reveal style={{ '--i': 1 } as CSSProperties}><strong>{PLANS[id].price}</strong><span>{PLANS[id].unit}</span></p>
            <p className={styles.summary} data-reveal style={{ '--i': 2 } as CSSProperties}>{PLANS[id].summary}</p>
            <ul className={styles.features} data-reveal style={{ '--i': 3 } as CSSProperties}>{PLANS[id].features.map(feature => <li key={feature}>{feature}</li>)}</ul>
            <button type="button" className={styles.choose} aria-pressed={plan === id} onClick={() => choosePlan(id)} data-reveal style={{ '--i': 4 + index * 0 } as CSSProperties}>{plan === id ? `${PLANS[id].name} selected` : `Choose ${PLANS[id].name}`}</button>
          </article>
        ))}
        <p className={styles.plansNote}>All prices in USD. Every plan uses your own AI provider key; the provider bills the usage, Lifetime included.</p>
      </section>

      {/* 3 · The request: your details, a review, the email. */}
      <section className={`${styles.checkout} ${chapters['tone-black']}`} id="checkout" aria-labelledby="checkout-title">
        <div className={styles.checkoutHead}>
          <h2 id="checkout-title" tabIndex={-1} data-reveal>Request {selected.name}.</h2>
          <ol className={styles.progress} aria-label="Request progress" data-reveal style={{ '--i': 1 } as CSSProperties}>
            <li><a href="#plans">Plan</a></li>
            {(Object.keys(stepNames) as (keyof typeof stepNames)[]).map(key => <li key={key} aria-current={step === key ? 'step' : undefined}>{stepNames[key]}</li>)}
          </ol>
        </div>
        <div className={styles.checkoutMain} data-reveal style={{ '--i': 2 } as CSSProperties}>
          {step === 'details' ? (
            <form onSubmit={event => { event.preventDefault(); setStep('payment'); setCopyStatus(''); requestAnimationFrame(() => document.getElementById('payment-title')?.focus()); }}>
              <h3>Who to set up</h3>
              <p className={styles.hint}>These details go into your email request. Nothing is charged here and nothing leaves this page until you send the email.</p>
              <label className={styles.field}>Full name<input name="name" autoComplete="name" value={name} required maxLength={80} pattern=".*\S.*" onChange={event => setName(event.target.value)} placeholder="Your full name" /></label>
              <label className={styles.field}>Email address<input name="email" autoComplete="email" type="email" value={email} required maxLength={254} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
              <label className={styles.field}>Referral code<input name="referral" autoComplete="off" maxLength={80} value={referral} onChange={event => setReferral(referralCode(event.target.value))} placeholder="Optional. Got one from a friend?" /></label>
              <p className={styles.hint}>Bring your own friends and earn half of their plan purchase. <Link className={chapters.inline} href="/referral">The referral program</Link>.</p>
              <button className={chapters.primary} type="submit">Continue to review</button>
            </form>
          ) : step === 'payment' ? (
            <div>
              <button type="button" className={styles.back} onClick={() => { setStep('details'); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[name="name"]')?.focus()); }}>← Edit your details</button>
              <h3 id="payment-title" tabIndex={-1}>Review</h3>
              <p className={styles.hint}>Online payment is not ready, so this page prepares the request and our team confirms payment details by email. No card details are collected and no charge is made.</p>
              <dl className={styles.review}>
                <div><dt>Plan</dt><dd>{selected.name}</dd></div>
                <div><dt>Price</dt><dd>{selected.price} {selected.unit}</dd></div>
                <div><dt>Billing</dt><dd>{plan === 'lifetime' ? 'One-time' : 'Monthly'}</dd></div>
                <div><dt>Name</dt><dd>{name.trim() || '—'}</dd></div>
                <div><dt>Email</dt><dd>{email.trim() || '—'}</dd></div>
                {referral.trim() && <div><dt>Referral</dt><dd>{referral.trim()}</dd></div>}
                <div><dt>AI usage</dt><dd>Billed by your provider</dd></div>
              </dl>
              <button type="button" className={chapters.primary} onClick={() => { setStep('help'); requestAnimationFrame(() => document.getElementById('purchase-help-title')?.focus()); }}>Continue to checkout</button>
              <p><a className={chapters.textLink} href={mailto(subject, body)}>Skip ahead: send the request by email</a></p>
            </div>
          ) : (
            <div>
              <button type="button" className={styles.back} onClick={() => { setStep('payment'); requestAnimationFrame(() => document.getElementById('payment-title')?.focus()); }}>← Back to review</button>
              <h3 id="purchase-help-title" tabIndex={-1}>Online checkout is coming soon</h3>
              <p role="status" className={styles.hint}>{PURCHASE_HELP}</p>
              <p className={styles.hint}>No payment was taken and no license was issued. Your {selected.name} request is written and ready to send.</p>
              <a className={chapters.primary} href={mailto(subject, body)}>Send the request by email</a>
              <details className={styles.emailPreview}>
                <summary>View or copy the email</summary>
                <p>To: <a className={chapters.inline} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />Subject: {subject}</p>
                <pre>{body}</pre>
                <button type="button" className={chapters.paperButton} onClick={() => void copy()}>Copy email</button>
                <p role="status">{copyStatus}</p>
              </details>
            </div>
          )}
        </div>
        <aside className={styles.order} aria-label="Your request" data-reveal style={{ '--i': 3 } as CSSProperties}>
          <div className={styles.orderCard} data-ui>
            <div className={styles.orderHead}><span className={styles.orderMark}>n</span><span>Access request</span><span>{step === 'help' ? 'Ready to send' : 'Draft'}</span></div>
            <dl>
              <div><dt>Plan</dt><dd>{selected.name}</dd></div>
              <div><dt>Billing</dt><dd>{plan === 'lifetime' ? 'One-time' : 'Monthly'}</dd></div>
              <div className={styles.orderTotal}><dt>Novi access</dt><dd>{selected.price} <small>{selected.unit}</small></dd></div>
              <div><dt>AI usage</dt><dd>By your provider</dd></div>
              <div><dt>License</dt><dd>After payment confirms</dd></div>
            </dl>
          </div>
          <p className={styles.orderNote}>{selected.summary}</p>
          <a className={chapters.textLink} href="#plans">Change the plan</a>
        </aside>
      </section>
    </>
  );
}

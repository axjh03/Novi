'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, CreditCard, Mail, Monitor } from 'lucide-react';
import { CONTACT_EMAIL, mailto, PLANS, type PlanId } from '@/lib/site';
import styles from './get-access.module.css';

export default function AccessRequest({ initialPlan }: { initialPlan: PlanId }) {
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [step, setStep] = useState<'details' | 'payment'>('details');
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
    `Devices: ${selected.devices}`,
    `Billing: ${plan === 'lifetime' ? 'One-time payment for lifetime access' : 'Monthly'}`,
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
      <section className={styles.pricing} id="plans" aria-label="Novi plans">
        <div className={styles.plans}>
          {(Object.keys(PLANS) as PlanId[]).map(id => (
            <article key={id} className={`${styles.plan} ${id === 'ultimate' ? styles.featured : ''}`}>
              <div className={styles.planHeading}><h2>{PLANS[id].name}</h2>{id === 'ultimate' && <span>Complete toolkit</span>}</div>
              <p className={styles.planSummary}>{PLANS[id].summary}</p>
              <p className={styles.price}>{PLANS[id].price}<span>{PLANS[id].unit}</span></p>
              <p className={styles.devices}><Monitor size={15} aria-hidden="true" />{PLANS[id].devices}</p>
              <button type="button" className={id === 'pro' ? styles.primary : styles.secondary} onClick={() => choosePlan(id)}>Choose {PLANS[id].name}<ArrowRight size={15} aria-hidden="true" /></button>
              <ul className={styles.featureList}>{PLANS[id].features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
              {id === 'core' && <p className={styles.planNote}>Pro adds coding and system design. Ultimate adds local coding and the phone companion.</p>}
            </article>
          ))}
        </div>
        <p className={styles.pricingNote}>All prices in USD. Every plan uses your own AI provider key. Provider usage is billed separately, including with Lifetime.</p>
      </section>

      <section className={styles.checkout} id="checkout" aria-labelledby="checkout-title">
        <div className={styles.checkoutHeading}><div><span className={styles.eyebrow}>YOUR NOVI WORKSPACE</span><h2 id="checkout-title" tabIndex={-1}>Make it yours.</h2></div><p>Choose a plan. Review the details.<br />Let our team take care of access.</p></div>
        <ol className={styles.progress} aria-label="Access request progress">
          <li><a href="#plans"><span><Check size={13} aria-hidden="true" /></span>Choose a plan</a></li>
          <li aria-current={step === 'details' ? 'step' : undefined}><span>2</span>Your details</li>
          <li aria-current={step === 'payment' ? 'step' : undefined}><span>3</span>Payment review</li>
        </ol>
        <div className={styles.checkoutGrid}>
          <div className={styles.checkoutMain}>
            {step === 'details' ? (
              <form onSubmit={event => { event.preventDefault(); setStep('payment'); setCopyStatus(''); requestAnimationFrame(() => document.getElementById('payment-title')?.focus()); }}>
                <h3>Your details</h3><p className={styles.hint}>Tell us who to set up. These details will be included in your email request.</p>
                <label className={styles.field}>Full name<input name="name" autoComplete="name" value={name} required maxLength={80} pattern=".*\S.*" onChange={event => setName(event.target.value)} placeholder="Your full name" /></label>
                <label className={styles.field}>Email address<input name="email" autoComplete="email" type="email" value={email} required maxLength={254} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
                <button className={styles.primary} type="submit">Continue to payment review <ArrowRight size={16} aria-hidden="true" /></button>
                <p className={styles.hint}>No charge is made here. Your details stay in this page until you send the email.</p>
              </form>
            ) : (
              <div>
                <button type="button" className={styles.back} onClick={() => { setStep('details'); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[name="name"]')?.focus()); }}><ArrowLeft size={15} aria-hidden="true" /> Edit your details</button>
                <div className={styles.paymentHeading}><h3 id="payment-title" tabIndex={-1}>Payment review</h3><span className={styles.previewBadge}>Preview only</span></div>
                <p className={styles.hint}>Your plan is ready to request. Our team will confirm payment details by email.</p>
                <div className={styles.paymentPreview} aria-label="Example payment method, preview only">
                  <div><CreditCard size={22} aria-hidden="true" /><strong>Card payment</strong><span>DEMO</span></div>
                  <p>•••• &nbsp; •••• &nbsp; •••• &nbsp; 4242</p>
                  <small>Example card · No payment information collected</small>
                </div>
                <p className={styles.paymentNote}>This is a preview of the payment step. Online payment is not connected. Send your request below to arrange payment and account activation with our team.</p>
                <a className={styles.primary} href={mailto(subject, body)}><Mail size={16} aria-hidden="true" /> Request payment details</a>
                <details className={styles.emailPreview}><summary>View or copy your request</summary><p>To: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />Subject: {subject}</p><pre>{body}</pre><button type="button" className={styles.secondary} onClick={() => void copy()}><Copy size={15} aria-hidden="true" />Copy email</button><p role="status">{copyStatus}</p></details>
              </div>
            )}
          </div>
          <aside className={styles.orderSummary} aria-label="Order summary">
            <span className={styles.eyebrow}>ORDER SUMMARY</span>
            <h3>Novi {selected.name}</h3><p>{selected.summary}</p>
            <div className={styles.summaryRow}><span>Device allowance</span><strong>{selected.devices}</strong></div>
            <div className={styles.summaryRow}><span>Billing</span><strong>{plan === 'lifetime' ? 'One-time' : 'Monthly'}</strong></div>
            <div className={`${styles.summaryRow} ${styles.total}`}><span>Plan price</span><strong>{selected.price}<small>{selected.unit}</small></strong></div>
            <p className={styles.hint}>AI provider usage is separate. Your account is activated after payment is confirmed.</p>
            <a className={styles.changePlan} href="#plans">Compare or change plan <ArrowRight size={14} aria-hidden="true" /></a>
          </aside>
        </div>
      </section>
    </>
  );
}

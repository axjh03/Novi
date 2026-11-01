import type { CSSProperties } from 'react';
import { mailto, PLANS, type PlanId } from '@/lib/site';
import chapters from '@/components/Chapters.module.css';
import styles from './get-access.module.css';

const planIds = Object.keys(PLANS) as PlanId[];
const tones: Record<PlanId, string> = { core: 'tone-paper', pro: 'tone-rose', ultimate: 'tone-wine', lifetime: 'tone-deep' };

/* The request is an email with the plan written in. No checkout on the page. */
export function requestMail(plan: PlanId | null, referral = '') {
  const selected = plan ? PLANS[plan] : null;
  const body = [
    'Hi Novi team,', '',
    "I'd like to get access to Novi. Please send me the payment details for this plan.", '',
    `Plan: ${selected ? selected.name : '(Core, Pro, Ultimate or Lifetime)'}`,
    ...(selected ? [`Price: ${selected.price} ${selected.unit}`, `Billing: ${plan === 'lifetime' ? 'One-time payment for lifetime access' : 'Monthly'}`] : []),
    ...(referral.trim() ? [`Referral code: ${referral.trim()}`] : []),
    'Name:', 'Email:', '',
    'I understand that AI provider usage is billed separately.', '', 'Thanks!',
  ].join('\n');
  return mailto(`Novi access request${selected ? `: ${selected.name}` : ''}`, body);
}

export default function Plans({ referral = '' }: { referral?: string }) {
  return (
    <section className={styles.plans} id="plans" aria-label="Novi plans">
      {planIds.map(id => (
        <article key={id} id={`plan-${id}`} className={`${styles.plan} ${chapters[tones[id]]}`} aria-labelledby={`plan-${id}-name`}>
          <h2 id={`plan-${id}-name`} data-reveal>{PLANS[id].name}</h2>
          <p className={styles.price} data-reveal style={{ '--i': 1 } as CSSProperties}><strong>{PLANS[id].price}</strong><span>{PLANS[id].unit}</span></p>
          <p className={styles.summary} data-reveal style={{ '--i': 2 } as CSSProperties}>{PLANS[id].summary}</p>
          <ul className={styles.features} data-reveal style={{ '--i': 3 } as CSSProperties}>{PLANS[id].features.map(feature => <li key={feature}>{feature}</li>)}</ul>
          <a className={styles.choose} href={requestMail(id, referral)} data-reveal style={{ '--i': 4 } as CSSProperties}>Request {PLANS[id].name}</a>
        </article>
      ))}
      <p className={styles.plansNote}>All prices in USD. Every plan uses your own AI provider key; the provider bills the usage, Lifetime included.</p>
    </section>
  );
}

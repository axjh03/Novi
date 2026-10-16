import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, Banknote, Link2, Users } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { mailto, PLANS } from '@/lib/site';
import styles from './referral.module.css';

export const metadata: Metadata = {
  title: 'Referral program — Bhaichara on Top | Novi',
  description: 'Bring a friend to Novi through your referral code or link and earn 50% of the plan they purchase, paid into your bank account.',
};
const join = mailto('Novi referral program — request enrollment', 'Hi Novi team,\n\nI’d like to request enrollment in the referral program and receive my referral code and link.\n\nName:\nNovi username (if you have one):\n\nThanks!');
export default function ReferralPage() {
  return <div className={styles.page}>
    <PublicNavbar active="referral" />
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="referral-title">
        <div><span className={styles.eyebrow}>THE NOVI REFERRAL PROGRAM</span><h1 id="referral-title">Bhaichara<br /><em>on Top.</em></h1><p>Bring us a friend. When they buy a plan through your referral code or link, you get <strong>50% of what they pay</strong>—cash credited to your bank account.</p><div className={styles.actions}><a className={styles.primary} href={join}>Get my referral code <ArrowUpRight size={17} /></a><a className={styles.secondary} href="#rewards">Show me the rewards <ArrowDown size={15} /></a></div><span className={styles.tagline}>Bhaichara on Top 🤝</span></div>
        <div className={styles.friendVisual} aria-label="Bhaichara on Top">
          <span aria-hidden="true">🤝</span><strong>Good people<br />back each other.</strong><small>Bhaichara on Top.</small>
        </div>
      </section>

      <section className={styles.how} aria-labelledby="how-title"><div className={styles.sectionHeading}><span className={styles.eyebrow}>THREE STEPS. ONE GOOD INTRODUCTION.</span><h2 id="how-title">You make the introduction.<br />We share the upside.</h2></div><div className={styles.steps}>
        <article><span className={styles.stepIcon}><Link2 size={23} /></span><small>01 / SHARE</small><h3>Send your code or link.</h3><p>Ask our team for your personal referral code and link. Send it to that friend who could use a little interview backup.</p></article>
        <article><span className={styles.stepIcon}><Users size={23} /></span><small>02 / THEY JOIN</small><h3>They choose their plan.</h3><p>Your friend uses your link or includes your code in their access request. We connect their purchase to your referral.</p></article>
        <article><span className={styles.stepIcon}><Banknote size={23} /></span><small>03 / YOU EARN</small><h3>Your bank gets a thank-you.</h3><p>When their purchase is confirmed, you earn 50% of the plan amount they paid. Our team coordinates your bank payout.</p></article>
      </div></section>

      <section className={styles.rewards} id="rewards" aria-labelledby="rewards-title"><div className={styles.sectionHeading}><span className={styles.eyebrow}>DO THE FRIENDSHIP MATH</span><h2 id="rewards-title">Any plan. Half comes back to you.</h2><p>Here’s what one referral earns at our listed prices.</p></div><div className={styles.rewardGrid}>{Object.entries(PLANS).map(([id, plan]) => <article key={id}><span>{plan.name}</span><p>They pay {plan.price} {plan.unit}</p><strong>${(Number(plan.price.slice(1)) / 2).toFixed(2)}</strong><small>{plan.unit === 'one-time' ? 'One-time reward' : 'Per paid month'}</small></article>)}</div><p className={styles.rewardNote}>Amounts shown in USD before taxes. Monthly-plan rewards apply to each successfully collected monthly payment; Lifetime rewards are one-time. See the <Link href="/referral-terms">full referral terms</Link>.</p></section>

      <section className={styles.friendship}><div><span className={styles.eyebrow}>FRIENDS DON’T GATEKEEP THE GOOD STUFF</span><h2>Bhaichara on Top.</h2><p>They get a little backup for the next round. You get a little backup for your bank balance. That’s a friendship with benefits we can explain in the group chat.</p></div><div className={styles.friendNote}><Users size={35} /><strong>Help a brother out.</strong><span>Share Novi honestly. If your friend buys, you both know how the reward works.</span></div></section>

      <section className={styles.faq} aria-labelledby="faq-title"><h2 id="faq-title">Before you text the group chat.</h2><details><summary>How do I get my referral code?</summary><p><a href={join}>Email the Novi team</a> to request enrollment and a code. Novi will confirm your attribution in writing before the referred purchase.</p></details><details><summary>How does my friend give me credit?</summary><p>They can follow your referral link or enter your code in the referral field on the <Link href="/get-access">access request page</Link>. The code is included in the email they send to our team.</p></details><details><summary>Is this store credit?</summary><p>No. Eligible rewards are cash. Payout is coordinated manually after the related payment clears; never send bank details by ordinary email.</p></details><details><summary>Does Lifetime count too?</summary><p>Yes. A {PLANS.lifetime.price} Lifetime purchase earns you ${(Number(PLANS.lifetime.price.slice(1)) / 2).toFixed(2)}. See the <Link href="/referral-terms">referral terms</Link> for subscription renewals, eligibility, and payout details.</p></details><p className={styles.termsLink}><Link href="/referral-terms">Read the referral program terms <ArrowUpRight size={14} /></Link></p></section>

      <section className={styles.closing} aria-labelledby="closing-title"><span className={styles.eyebrow}>ONE LINK. ONE FRIEND. A LITTLE LOVE.</span><h2 id="closing-title">Help a brother out.</h2><p>Your friend’s next chapter could start with your message.</p><a className={styles.primary} href={join}>Let’s make it a referral <ArrowUpRight size={17} /></a></section>
    </main><SiteFooter />
  </div>;
}

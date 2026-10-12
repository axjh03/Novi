import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Check, HardDrive, KeyRound, Laptop, Smartphone } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Pricing — Novi',
  description: 'Novi license pricing: $79/month for students and $99/month for professionals and consultancy seats. Bring your own AI key.',
};

const features = [
  ['Transparent workspace', 'Adjustable transparency, click-through controls, and OS content protection when transparent mode is active.'],
  ['Phone companion', 'Connect your phone to control a Novi session and send actions remotely.'],
  ['Modes for the moment', 'Chat, recruiter call, coding, technical interview, system design, and behavioral interview modes.'],
  ['Your choice of AI', 'Bring your own key for OpenAI, Anthropic, Google Gemini, or a compatible endpoint; choose the model available through your provider.'],
  ['One login, one computer', 'Each desktop login is active on one computer at a time. Your documents and history stay on your device.'],
];

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <PublicNavbar active="pricing" />
      <main>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>CLEAR PRICING · ONE LICENSE PER SEAT</span>
          <h1>Tools for the moment.<br /><em>Pricing without surprises.</em></h1>
          <p>Novi is licensed per person. Choose the rate that fits you, then bring the AI provider key and model you prefer.</p>
        </section>

        <section className={styles.plans} aria-label="Monthly license plans">
          <article className={styles.plan}>
            <span className={styles.planLabel}>STUDENT</span>
            <h2>$79<span>/ month</span></h2>
            <p>For students preparing for interviews and important conversations.</p>
            <Link href="/get-access?plan=student" className={styles.planLink}>Get the student plan <ArrowUpRight size={16} /></Link>
          </article>
          <article className={`${styles.plan} ${styles.featured}`}>
            <span className={styles.planLabel}>INDIVIDUAL</span>
            <h2>$99<span>/ month</span></h2>
            <p>For professionals who want a focused, private desktop workspace.</p>
            <Link href="/get-access?plan=individual" className={styles.planLink}>Get the individual plan <ArrowUpRight size={16} /></Link>
          </article>
          <article className={styles.plan}>
            <span className={styles.planLabel}>CONSULTANCY</span>
            <h2>$99<span>/ seat / month</span></h2>
            <p>One Novi account for your team, with a desktop login for each person.</p>
            <Link href="/get-access?plan=consultancy" className={styles.planLink}>Get the consultancy plan <ArrowUpRight size={16} /></Link>
          </article>
        </section>

        <p className={styles.bulk}><strong>Buying in bulk?</strong> Eligible bulk purchases can receive up to 40% off. <a href="mailto:getnoviapp@outlook.com?subject=Interested%20in%20Novi%20bulk%20licensing">Contact us</a> for a quote.</p>

        <section className={styles.terms} aria-labelledby="license-details">
          <div>
            <span className={styles.eyebrow}>HOW LICENSING WORKS</span>
            <h2 id="license-details">One person. One active device.</h2>
            <p>Each license comes with one desktop login, and a login is active on one computer at a time. Consultancies manage every person&apos;s login from one Novi account.</p>
          </div>
          <div className={styles.details}>
            <div><Laptop aria-hidden="true" /><span><strong>One computer per login</strong><small>Sign out on one computer to sign in on another.</small></span></div>
            <div><HardDrive aria-hidden="true" /><span><strong>Your files stay local</strong><small>Documents and conversations are stored on your computer.</small></span></div>
            <div><KeyRound aria-hidden="true" /><span><strong>Bring your own key (BYOK)</strong><small>AI provider usage is billed by your provider, separately from Novi.</small></span></div>
            <div><Smartphone aria-hidden="true" /><span><strong>Phone companion included</strong><small>Connect a phone to your desktop session.</small></span></div>
          </div>
        </section>

        <section className={styles.features} aria-labelledby="features-title">
          <div className={styles.featureIntro}>
            <span className={styles.eyebrow}>INCLUDED WITH NOVI</span>
            <h2 id="features-title">Everything in your license.</h2>
            <p>One desktop workspace with controls and modes designed around how you work.</p>
          </div>
          <div className={styles.featureList}>
            {features.map(([title, description]) => <article key={title}><Check size={18} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></article>)}
          </div>
        </section>

        <section className={styles.compare}>
          <p>For context, Cluely lists its “Pro + Undetectability” plan at $149.99/month. Novi’s individual license is $99/month, with BYOK for AI usage.</p>
          <a href="https://cluely.com/pricing" target="_blank" rel="noreferrer">See Cluely’s current pricing <ArrowUpRight size={14} /></a>
        </section>

        <section className={styles.cta}>
          <h2>Ready to find your fit?</h2>
          <p>Choose a plan and send one email. We set up your account.</p>
          <Link href="/get-access">Get access <ArrowUpRight size={16} /></Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

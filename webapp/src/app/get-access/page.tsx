import type { Metadata } from 'next';
import { ArrowUpRight, Building2 } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { CONTACT_EMAIL, isPlanId, JOURNEY, mailto } from '@/lib/site';
import AccessRequest from './AccessRequest';
import styles from './get-access.module.css';

export const metadata: Metadata = {
  title: 'Pricing — Novi',
  description: 'Novi plans from $16 per month. Compare Core, Pro, Ultimate, and $399 Lifetime access. Consultancies and staffing firms can contact sales for team licensing.',
};

export default async function GetAccessPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { plan } = await searchParams;
  return (
    <div className={styles.page}>
      <PublicNavbar active="get-access" />
      <main>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>STRAIGHTFORWARD PRICING</span>
          <h1>A plan for your<br /><em>next chapter.</em></h1>
          <p>Start with the essentials, unlock the complete toolkit, or make Novi yours for a lifetime. Choose the features and device allowance that fit your work.</p>
          <div className={styles.audiences}><a href="#plans">Explore plans</a><a href="#consultancies">Consultancies &amp; staffing firms <ArrowUpRight size={14} aria-hidden="true" /></a></div>
        </section>

        <AccessRequest initialPlan={isPlanId(plan) ? plan : 'core'} />

        <section className={styles.sales} id="consultancies" aria-labelledby="sales-title">
          <div className={styles.salesIcon}><Building2 size={28} strokeWidth={1.5} aria-hidden="true" /></div>
          <div><span className={styles.eyebrow}>FOR YOUR ORGANIZATION</span><h2 id="sales-title">Consultancies &amp; staffing firms</h2><p>Bring Novi to your team. Contact our sales team to discuss licensing, desktop logins, and a shared account setup that fits your organization.</p></div>
          <div className={styles.salesActions}><a className={styles.primary} href={mailto('Novi sales enquiry: consultancy / staffing firm', 'Hi Novi sales team,\n\nWe would like to discuss Novi for our organization.\n\nCompany:\nNumber of people:\nWhat we need:\n\nThanks!')}>Contact sales <ArrowUpRight size={16} aria-hidden="true" /></a><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></div>
        </section>

        <section className={styles.section} aria-labelledby="next-title">
          <span className={styles.eyebrow}>WHAT HAPPENS NEXT</span><h2 id="next-title">From your plan to your first session.</h2>
          <ol className={styles.steps}>{JOURNEY.map((step, index) => <li key={step.title}><span>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        </section>
        <section className={styles.section} aria-labelledby="pricing-faq-title">
          <span className={styles.eyebrow}>THE DETAILS, UP FRONT</span><h2 id="pricing-faq-title">A few common questions.</h2>
          <div className={styles.faq}>
            <details><summary>What does Core include for $16?</summary><p>Core includes behavioral and technical modes, résumé and document context, screenshots, audio transcription, transparency, and local history on one device. Pro adds chat, recruiter mode, coding, system design, and eye tracking for $45/month. Ultimate adds local coding and the exclusive phone companion.</p></details>
            <details><summary>What is included in the $90 plan?</summary><p>Ultimate includes all Novi features, including coding assistance, system design, and local code context, on a maximum of three devices. Your AI provider bills its usage separately.</p></details>
            <details><summary>How does Lifetime work?</summary><p>Lifetime is a one-time $399 payment for the Pro toolkit on one device. Local coding and the phone companion are exclusive to Ultimate. There is no monthly Novi subscription fee. AI provider usage is still billed separately.</p></details>
            <details><summary>Can I pay on this page?</summary><p>The checkout currently previews your plan and payment step. It does not process a charge or collect card details. Send the prepared email and our team will arrange payment and activate your account.</p></details>
          </div>
        </section>
        <div className={styles.spacer} />
      </main>
      <SiteFooter />
    </div>
  );
}

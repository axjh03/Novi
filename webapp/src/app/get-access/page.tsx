import type { Metadata } from 'next';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { isPlanId, JOURNEY } from '@/lib/site';
import AccessRequest from './AccessRequest';
import styles from './get-access.module.css';

export const metadata: Metadata = {
  title: 'Get access — Novi',
  description: 'Request a Novi license for yourself or your consultancy. Choose a plan, send one email, and we set up your account.',
};

export default async function GetAccessPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { plan } = await searchParams;
  return (
    <div className={styles.page}>
      <PublicNavbar active="get-access" />
      <main>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>GET ACCESS</span>
          <h1>Request access to Novi.<br /><em>It takes one email.</em></h1>
          <p>Novi is available by private license. Choose a plan below and send the email we write for you. After payment, we set up your Novi account and licenses.</p>
        </section>

        <AccessRequest initialPlan={isPlanId(plan) ? plan : 'individual'} />

        <section className={styles.section} aria-labelledby="next-title">
          <span className={styles.eyebrow}>WHAT HAPPENS NEXT</span>
          <h2 id="next-title">From email to your first session.</h2>
          <ol className={styles.steps}>
            {JOURNEY.map((step, index) => <li key={step.title}><span>STEP {index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="accounts-title">
          <span className={styles.eyebrow}>ONE ACCOUNT, THE RIGHT NUMBER OF LOGINS</span>
          <h2 id="accounts-title">Individuals and consultancies.</h2>
          <div className={styles.accounts}>
            <article><h3>Individual or student</h3><p>One Novi account with one license. You add your AI key and create your desktop login, then sign in to the app on your computer.</p></article>
            <article><h3>Consultancy</h3><p>One Novi account for the whole team, with a license for each person. You create a desktop login for everyone and manage logins and AI keys in one place.</p></article>
          </div>
        </section>
        <div className={styles.spacer} />
      </main>
      <SiteFooter />
    </div>
  );
}

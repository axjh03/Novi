import type { Metadata } from 'next';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { ChapterPage, CloseRow, Faq, Title } from '@/components/Chapters';
import { CONTACT_EMAIL, referralCode, mailto, PLANS, PURCHASE_HELP, type PlanId } from '@/lib/site';
import Plans, { requestMail } from './Plans';
import chapters from '@/components/Chapters.module.css';
import styles from './get-access.module.css';

export const metadata: Metadata = {
  title: 'Pricing | Novi',
  description: `Novi plans from ${PLANS.core.price} a month: Core, Pro, Ultimate, and ${PLANS.lifetime.price} Lifetime access. AI provider usage is billed by the provider. Consultancies and staffing firms can contact sales for team licensing.`,
};

const faqs = [
  { q: `What does Core include for ${PLANS.core.price}?`, a: `Core includes behavioral and technical modes, resume and document context, screenshots, audio transcription, transparency, and local history. Pro adds chat, recruiter mode, coding, system design, and eye tracking for ${PLANS.pro.price} a month. Ultimate adds local coding and the exclusive phone companion.` },
  { q: `What is in the ${PLANS.ultimate.price} plan?`, a: 'Ultimate includes every Novi feature: coding assistance, system design, local code context, eye tracking and the phone companion. Your AI provider bills its usage separately.' },
  { q: 'How does Lifetime work?', a: `Lifetime is a one-time ${PLANS.lifetime.price} payment for the Pro toolkit. Local coding and the phone companion stay exclusive to Ultimate. There is no monthly Novi fee. AI provider usage is still billed separately.` },
  { q: 'Can I pay on this page?', a: `Not yet. Pick a plan and the page opens a prepared email; our team confirms payment details by reply. No card details are collected here. ${PURCHASE_HELP}` },
  { q: 'Is AI usage included?', a: 'No. Your plan covers Novi access. You connect your own key from OpenAI, Anthropic, Google Gemini or Kimi, and that provider bills you for what you use, on every plan including Lifetime.' },
];

export default async function GetAccessPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { ref } = await searchParams;
  const referral = referralCode(ref);
  const planIds = Object.keys(PLANS) as PlanId[];
  return (
    <ChapterPage>
      <PublicNavbar active="get-access" />
      <main>
        {/* 1 · The first screen is the price list. */}
        <section className={`${chapters.hero} ${styles.hero}`} aria-labelledby="pricing-title">
          <div className={chapters.heroCopy}>
            <Title id="pricing-title" lines={['Four plans.', 'Your own key.']} />
            <p className={chapters.lead} data-load style={{ '--d': '480ms' } as React.CSSProperties}>Novi charges for access. Your AI provider charges for usage, on every plan, Lifetime included. Individuals use one account on the web and the desktop. Teams get managed desktop logins.</p>
          </div>
          <ol className={`${chapters.heroSide} ${styles.priceList}`} aria-label="Plans and prices">
            {planIds.map((id, index) => (
              <li key={id} data-load style={{ '--d': `${300 + index * 90}ms` } as React.CSSProperties}>
                <a href={`#plan-${id}`}><span>{PLANS[id].name} <b>{id === 'lifetime' ? 'once' : 'a month'}</b></span><strong>{PLANS[id].price}</strong></a>
              </li>
            ))}
          </ol>
          <div className={`${chapters.actions} ${styles.heroActions}`} data-load style={{ '--d': '560ms' } as React.CSSProperties}>
            <a className={chapters.primary} href="#plans">Compare the plans</a>
            <a className={chapters.textLink} href={requestMail(null, referral)}>Request access</a>
          </div>
        </section>

        <Plans referral={referral} />

        {/* 4 · Teams: one field, one address. */}
        <section className={`${styles.teams} ${chapters['tone-paper']}`} id="consultancies" aria-labelledby="teams-title">
          <div className={styles.teamsWords}>
            <h2 id="teams-title" data-reveal>Consultancies and staffing firms.</h2>
            <p data-reveal style={{ '--i': 1 } as React.CSSProperties}>Bring Novi to the people you place. One owner account, managed desktop logins bound to licenses, shared provider keys, and a workspace that shows who is signed in on what. Tell us how many seats and what the rounds look like.</p>
          </div>
          <div className={styles.teamsActions} data-reveal style={{ '--i': 2 } as React.CSSProperties}>
            <a className={chapters.inkButton} href={mailto('Novi sales enquiry: consultancy / staffing firm', 'Hi Novi sales team,\n\nWe would like to discuss Novi for our organization.\n\nCompany:\nNumber of people:\nWhat we need:\n\nThanks!')}>Contact sales</a>
            <a className={chapters.inline} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
        </section>


        <Faq id="faq" name="pricing-faq" title="The details, up front." items={faqs} />

        <CloseRow id="pricing-close" title={<>Enough comparing.<br />Pick one.</>} text={`Start on Core for ${PLANS.core.price} a month, or take the full technical toolkit on Pro. Lifetime is Pro, paid once.`} action="Request access" href={requestMail(null, referral)} />
      </main>
      <SiteFooter />
    </ChapterPage>
  );
}

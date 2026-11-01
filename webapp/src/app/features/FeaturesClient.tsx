'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { ChapterPage, CloseRow, Title } from '@/components/Chapters';
import { FEATURES, FEATURE_GROUPS } from '@/lib/features';
import { PLANS, type PlanId } from '@/lib/site';
import { GazeScene, LocalCodingFragment } from './Illustrations';
import { NoviAnswer, chatService } from '@/components/Fragments';
import chapters from '@/components/Chapters.module.css';
import styles from './features.module.css';

/* Which plans unlock a feature, read from the label the feature already carries. */
const plansFor = (label: string): readonly PlanId[] => {
  if (label.startsWith('Ultimate only')) return ['ultimate'];
  if (label.startsWith('Pro')) return ['pro', 'ultimate', 'lifetime'];
  return ['core', 'pro', 'ultimate', 'lifetime'];
};
const planOrder: PlanId[] = ['core', 'pro', 'ultimate', 'lifetime'];

const comparison = [
  { feature: 'Live interview assistance', novi: true, interviewCoder: true, cluely: true, finalRound: true, lockedIn: true },
  { feature: 'Audio listening / transcription', novi: true, interviewCoder: true, cluely: true, finalRound: true, lockedIn: true },
  { feature: 'Coding interview support', novi: true, interviewCoder: true, cluely: false, finalRound: true, lockedIn: true },
  { feature: 'System design support', novi: true, interviewCoder: true, cluely: false, finalRound: true, lockedIn: true },
  { feature: 'Guided practice / mock rounds', novi: true, interviewCoder: false, cluely: false, finalRound: true, lockedIn: true },
  { feature: 'Bring your own AI API key', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Local Coding mode (project-aware coding agent)', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Webcam eye tracking', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Phone controls paired to desktop session', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Published paid price', novi: `${PLANS.core.price} Core · ${PLANS.pro.price} Pro · ${PLANS.ultimate.price} Ultimate a month, plus AI usage`, interviewCoder: '$299/month · $799 lifetime', cluely: '$19.99/month Pro', finalRound: '$25+/month Pro', lockedIn: '$109.98 monthly · $39.99/month billed quarterly' },
] as const;
const rivals = [
  { key: 'interviewCoder', name: 'Interview Coder', href: 'https://www.interviewcoder.co/' },
  { key: 'cluely', name: 'Cluely', href: 'https://cluely.com/pricing' },
  { key: 'finalRound', name: 'Final Round AI', href: 'https://www.finalroundai.com/interview-copilot' },
  { key: 'lockedIn', name: 'LockedIn AI', href: 'https://www.lockedinai.com/' },
] as const;

export default function FeaturesClient() {
  const [plan, setPlan] = useState<PlanId>('pro');
  const unlocked = FEATURES.filter(feature => plansFor(feature.label).includes(plan)).length;
  return (
    <ChapterPage>
      <PublicNavbar active="features" />
      <main>
        {/* 1 · The first screen: the count, the claim, the app at work. */}
        <section className={chapters.hero} aria-labelledby="features-title">
          <div className={chapters.heroCopy}>
            <Title id="features-title" lines={['Everything', 'in the app.']} />
            <p className={chapters.lead} data-load style={{ '--d': '480ms' } as CSSProperties}>{FEATURES.length} tools across seven session modes, on macOS, Windows and Linux. Core carries the conversation rounds. Pro adds the technical round. Ultimate adds your own codebase and your phone.</p>
            <div className={chapters.actions} data-load style={{ '--d': '560ms' } as CSSProperties}>
              <Link className={chapters.primary} href="/get-access">Find your plan</Link>
              <a className={chapters.textLink} href="#compare">Novi against four others</a>
            </div>
          </div>
          <div className={`${chapters.heroSide} ${styles.heroTile}`}>
            <div data-open><img src="/app/chat.png" alt="The Novi chat window answering a code question with an explanation" width={1180} height={940} decoding="async" /></div>
          </div>
        </section>

        {/* 2 · The catalogue, lit by the plan you pick. */}
        <section className={`${styles.catalogue} ${chapters['tone-paper']}`} id="all-features" aria-labelledby="catalogue-title">
          <div className={styles.catalogueSide}>
            <h2 id="catalogue-title" data-reveal>Pick a plan. See what lights up.</h2>
            <div className={styles.planSwitch} role="group" aria-label="Plan" data-reveal style={{ '--i': 1 } as CSSProperties}>
              {planOrder.map(id => <button type="button" key={id} aria-pressed={plan === id} onClick={() => setPlan(id)}>{PLANS[id].name}<span>{PLANS[id].price} {PLANS[id].unit}</span></button>)}
            </div>
            <p className={styles.planCount} aria-live="polite" data-reveal style={{ '--i': 2 } as CSSProperties}><strong>{unlocked} of {FEATURES.length}</strong> on {PLANS[plan].name}. {plan === 'lifetime' ? 'Lifetime is the Pro toolkit, paid once.' : plan === 'core' ? 'The dimmed rows need Pro or Ultimate.' : plan === 'pro' ? 'The two dimmed rows are Ultimate only.' : 'Every tool, including local coding and the phone.'}</p>
          </div>
          <div className={styles.ledger}>
            {FEATURE_GROUPS.map(group => (
              <div className={styles.group} key={group.id} id={group.id}>
                <h3 data-reveal>{group.title}</h3>
                <ul>
                  {FEATURES.filter(feature => feature.group === group.id).map((feature, index) => {
                    const on = plansFor(feature.label).includes(plan);
                    return (
                      <li key={feature.title} className={on ? '' : styles.off} data-reveal style={{ '--i': index % 4 } as CSSProperties}>
                        <h4>{feature.title}<span>{on ? feature.label : `Not on ${PLANS[plan].name} · ${feature.label}`}</span></h4>
                        <p>{feature.text}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 3 · Local coding: the agent reads, the proposal reads like a pull request. */}
        <section className={`${styles.split} ${chapters['tone-deep']}`} id="local-coding" aria-labelledby="local-title">
          <div className={styles.splitWords}>
            <h2 id="local-title" data-reveal>Your code, read.<br />Never run.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>Point Local Coding at a project folder and ask the question they just asked you. An agent searches and reads the files in the background, in the app, and comes back with the answer the way a reviewer would: which files it would touch, what changes in each, and the diff.</p>
            <p data-reveal style={{ '--i': 2 } as CSSProperties}>Codex, Claude or Antigravity, with your own key. Your source files stay untouched: proposals are never applied and never executed. You read, you decide, you type.</p>
            <p className={styles.plan} data-reveal style={{ '--i': 3 } as CSSProperties}>Ultimate only</p>
          </div>
          <div className={styles.splitPicture} data-reveal style={{ '--i': 2 } as CSSProperties}><LocalCodingFragment /></div>
        </section>

        {/* 4 · System design: the answer comes with the diagram. */}
        <section className={`${styles.split} ${styles.splitFlip} ${chapters['tone-rose']}`} id="system-design" aria-labelledby="design-title">
          <div className={styles.splitWords}>
            <h2 id="design-title" data-reveal>System design, drawn.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>“Design a chat service” is a whiteboard question, so the answer is a whiteboard. Novi lays out the boxes and the arrows for the architecture it proposes, then explains the data flow, the storage, and the failure cases underneath.</p>
            <p data-reveal style={{ '--i': 2 } as CSSProperties}>Ask for the trade-off behind any box and the diagram updates with the conversation. Say the arrows out loud; that is the answer they are grading.</p>
            <p className={styles.plan} data-reveal style={{ '--i': 3 } as CSSProperties}>Pro and above</p>
          </div>
          <div className={styles.splitPicture} data-reveal style={{ '--i': 2 } as CSSProperties}><NoviAnswer answer={chatService} question="Design a chat service for ten million users." time="31:08" interactive /></div>
        </section>

        {/* 4 · Eye tracking: the HUD follows the gaze. */}
        <section className={`${styles.split} ${chapters['tone-black']}`} id="eye-tracking" aria-labelledby="gaze-title">
          <div className={styles.splitWords}>
            <h2 id="gaze-title" data-reveal>The answer follows your eyes.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>Calibrate the webcam once, nine points, and the answer window moves to where you are looking instead of where you left it. Read the next line without turning your head toward a corner of the screen.</p>
            <p data-reveal style={{ '--i': 2 } as CSSProperties}>Camera position and lighting matter. New desk, new lamp, new laptop angle: recalibrate, it takes a minute.</p>
            <p className={styles.plan} data-reveal style={{ '--i': 3 } as CSSProperties}>Pro, Ultimate and Lifetime</p>
          </div>
          <div className={styles.splitPicture} data-reveal style={{ '--i': 2 } as CSSProperties}><GazeScene /></div>
        </section>

        {/* 5 · The phone: a second screen for the same session. */}
        <section className={`${styles.phone} ${chapters['tone-wine']}`} id="phone-companion" aria-labelledby="phone-title">
          <div className={styles.phoneWords}>
            <h2 id="phone-title" data-reveal>Your phone, on the same session.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>Keep the desktop on the question and give your hands a second place to work. Ask a follow-up, capture the desktop screen, or scroll an answer from the phone beside your monitor.</p>
            <ol className={styles.phoneSteps}>
              <li data-reveal style={{ '--i': 2 } as CSSProperties}><strong>Pair it.</strong> Open Phone Companion in the desktop app, choose Same Wi-Fi, and scan the code with the phone camera. Anywhere connects through a tunnel when one is available.</li>
              <li data-reveal style={{ '--i': 3 } as CSSProperties}><strong>Drive the conversation.</strong> Ask questions, request a screen capture, scroll responses. The desktop keeps the connection to your AI provider.</li>
              <li data-reveal style={{ '--i': 4 } as CSSProperties}><strong>Keep the desktop running.</strong> The companion extends the session; it does not replace it.</li>
            </ol>
            <Link className={chapters.primary} href="/get-access?plan=ultimate" data-reveal style={{ '--i': 5 } as CSSProperties}>Get Ultimate · {PLANS.ultimate.price} {PLANS.ultimate.unit}</Link>
          </div>
          <div className={styles.phonePictures} data-reveal style={{ '--i': 1 } as CSSProperties}>
            <img src="/app/companion-portrait.png" alt="The phone companion with its layout, scroll and capture controls" width={390} height={844} loading="lazy" decoding="async" />
            <img src="/app/companion-landscape.png" alt="The phone companion in landscape, with its layout and listening controls" width={844} height={390} loading="lazy" decoding="async" />
          </div>
        </section>

        {/* 6 · Novi against four others: a real table. */}
        <section className={`${styles.compare} ${chapters['tone-paper']}`} id="compare" aria-labelledby="compare-title">
          <div className={chapters.chapterHead}>
            <h2 id="compare-title" data-reveal>Novi against four others.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>The same checklist for every product: interview help, coding, practice, and the things only Novi does. They might look and feel pretty. Be real: after you secure the job, would you rather feel a pretty app, or feel a pretty wife?</p>
          </div>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Feature comparison of Novi and four competitors; scrolls sideways on small screens" data-reveal style={{ '--i': 2 } as CSSProperties}>
            <table>
              <caption>Published product features and USD prices, reviewed October 15, 2026.</caption>
              <thead><tr><th scope="col">Feature</th><th scope="col" className={styles.noviCol}>Novi</th>{rivals.map(rival => <th scope="col" key={rival.key}><a href={rival.href} target="_blank" rel="noreferrer">{rival.name}</a></th>)}</tr></thead>
              <tbody>
                {comparison.map(row => (
                  <tr key={row.feature}>
                    <th scope="row">{row.feature}</th>
                    {(['novi', ...rivals.map(rival => rival.key)] as const).map(key => {
                      const value = row[key];
                      return <td key={key} className={key === 'novi' ? styles.noviCol : ''}>{typeof value === 'boolean' ? <span className={value ? styles.yes : styles.no}>{value ? 'Yes' : 'Not listed'}</span> : value}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.sources} data-reveal>Sources: the public product and pricing pages of <a href="https://www.interviewcoder.co/" target="_blank" rel="noreferrer">Interview Coder</a>, <a href="https://cluely.com/pricing" target="_blank" rel="noreferrer">Cluely</a>, <a href="https://www.finalroundai.com/interview-copilot" target="_blank" rel="noreferrer">Final Round AI</a> and <a href="https://www.lockedinai.com/pricing" target="_blank" rel="noreferrer">LockedIn AI</a>. “Not listed” means we did not find the feature in their public product information, not proof it is unavailable. Prices change; LockedIn’s lower monthly figure is billed quarterly. Novi plans exclude AI provider usage, which the provider bills.</p>
        </section>

        <CloseRow id="features-close" title={<>Get the answer.<br />Handle the follow-up.</>} text={`Core from ${PLANS.core.price} a month. Pro from ${PLANS.pro.price} with the full technical toolkit. AI provider usage is separate.`} action="Choose your plan" href="/get-access" />
      </main>
      <SiteFooter />
    </ChapterPage>
  );
}

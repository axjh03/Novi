'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import PublicNavbar from './PublicNavbar';
import SiteFooter from './SiteFooter';
import { JOURNEY, PLANS } from '@/lib/site';
import { FEATURES } from '@/lib/features';
import styles from './PublicLanding.module.css';



export default function PublicLanding({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={styles.page}>
      <PublicNavbar onSignIn={onSignIn} />
      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <span className={styles.eyebrow}>THE INTERVIEW CHEAT CODE</span>
          <h1 id="landing-title">Fuck LeetCode.<br />Fuck HackerRank.<br />Fuck Assessment.<br /><em>We&apos;re here.</em></h1>
          <p className={styles.heroLead}>Another timed puzzle. Another technical grilling. Enough. Bring the question, a screenshot, or audio context. Novi puts AI backup on your desktop for the code, the explanation, and whatever follow-up comes next.</p>
          <div className={styles.actions}>
            <Link className={styles.primaryLink} href="/get-access">Get your backup <ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link className={styles.secondaryLink} href="/how-it-works">See how it works <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className={styles.heroMeta}><span>macOS · Windows · Linux</span><span>Bring your own AI provider</span><span>From {PLANS.core.price} / month</span></div>
        </section>

        <section className={styles.belsonQuote} aria-label="Novi parody quote from Jian Yang">
          <div className={styles.belsonPortrait}>
            <img
              src="https://siliconvalleyism.com/images/chinese-markets.jpg"
              alt="Jian-Yang from Silicon Valley standing by a whiteboard"
              referrerPolicy="no-referrer"
              width={640}
              height={800}
              loading="lazy"
              decoding="async"
            />
            <span>VERY LEGAL. VERY GOOD.</span>
          </div>
          <figure className={styles.belsonWords}>
            <span className={styles.quoteMark} aria-hidden="true">“</span>
            <blockquote>
              <p>“Herro. I am Jian-Yang. CEO of Novi. You spend four year learning computah science. Interviewah ask you reverse binary twee. You shit your pants. Very sad. So I make Novi. AI risten, AI write code, you just nod head like fucking genius. Google hire you. You make two hundwed thousand dollah. I make sixteen dollah. Six month later, you get fired. Not my problem. No refund. Fuck ReetCode.”</p>
            </blockquote>
            <figcaption><strong>Jian Yang</strong><span>CEO of Novi · <cite>Silicon Valley</cite> parody</span></figcaption>
          </figure>
        </section>

        <section className={styles.intro} aria-labelledby="intro-title">
          <div><span className={styles.eyebrow}>YOU KNOW THE WORK</span><h2 id="intro-title">The interview grind?<br />That&apos;s another story.</h2></div>
          <p>You&apos;ve built projects, solved problems, and shipped real work. Then a timed question asks you to remember an algorithm you haven&apos;t touched in months. Novi brings your notes, audio, screenshots, and project files together so you have something useful to work with when the question lands.</p>
        </section>

        <section className={styles.features} id="features" aria-labelledby="features-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>THE TOOLKIT</span><h2 id="features-title">Purposeful features.<br />Practical help.</h2></div><p>From the first introduction to a deeper technical discussion, choose the tools that fit the task.</p></div>
          <div className={styles.featureGrid}>
            {FEATURES.slice(0, 9).map(({ icon: Icon, title, text, label }) => (
              <article className={styles.feature} key={title}>
                <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
                <h3>{title}</h3><p>{text}</p><span>{label}</span>
              </article>
            ))}
          </div>
          <div className={styles.featureLinks}><Link className={styles.textLink} href="/features">Explore all {FEATURES.length} features <ArrowRight size={17} aria-hidden="true" /></Link><Link className={styles.textLink} href="/features#compare">Novi vs. Interview Coder &amp; Cluely <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
        </section>

        <section className={styles.workflow} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>A SIMPLE START</span><h2 id="workflow-title">Your first session,<br />one step at a time.</h2></div><Link className={styles.textLink} href="/how-it-works">The complete walkthrough <ArrowRight size={17} aria-hidden="true" /></Link></div>
          <ol className={styles.steps}>{JOURNEY.map((step, index) => <li key={step.title}><span>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        </section>

        <section className={styles.control} aria-labelledby="control-title">
          <div><span className={styles.eyebrow}>A SETUP YOU CONTROL</span><h2 id="control-title">Your workspace.<br />Your choice of AI.</h2><Link className={styles.textLink} href="/api-keys">Explore the setup guide <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
          <div className={styles.controlList}>
            <article><h3>Use the provider that fits your work</h3><p>Connect a supported AI provider with your own API key. Novi access and provider usage are separate, so you pay your provider directly for the AI you use.</p></article>
            <article><h3>Keep a useful record</h3><p>Documents and conversation history are stored on your computer. Revisit an explanation or build on an earlier conversation when you prepare for the next session.</p></article>
            <article><h3>Know where your context goes</h3><p>Questions and relevant context are sent to the AI provider you select. Your provider’s data policies apply to that content.</p></article>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <span className={styles.eyebrow}>A FEW THINGS TO KNOW</span><h2 id="faq-title">Before you get started.</h2>
          <details><summary>Which plan is right for me?</summary><p>Core includes behavioral and technical modes, document context, screenshots, transcription, and the transparent overlay. Pro adds chat, recruiter mode, coding assistance, system design, and eye tracking. Ultimate adds the local coding agent and exclusive phone companion. Lifetime provides the Pro toolkit for $399.</p></details>
          <details><summary>Is AI usage included in the price?</summary><p>Your plan covers Novi access. Connect your own AI provider key; any provider usage charges are separate, including on the Lifetime plan.</p></details>
          <details><summary>Can I set up Novi for my consultancy?</summary><p>Yes. Consultancies and staffing firms can contact our sales team for team licensing and account setup. You’ll find the contact details on the pricing page.</p></details>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title"><span className={styles.eyebrow}>YOUR NEXT ROUND IS COMING</span><h2 id="closing-title">Enough interview bullshit.<br />Bring Novi.</h2><p>The question lands. Your backup is already open.</p><Link className={styles.primaryLink} href="/get-access">Find your plan <ArrowUpRight size={18} aria-hidden="true" /></Link></section>
      </main>
      <SiteFooter onSignIn={onSignIn} />
    </div>
  );
}

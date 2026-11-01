'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import PublicNavbar from './PublicNavbar';
import SiteFooter from './SiteFooter';
import Testimonials from './Testimonials';
import { JOURNEY, PLANS } from '@/lib/site';
import { FEATURES } from '@/lib/features';
import { AddKeyFragment, DesktopSignInFragment, NoviAnswer, ScreenshotFragment, SignupFragment, answerFor, examples, reverseList } from './Fragments';
import ScreenCompare from './ScreenCompare';
import styles from './PublicLanding.module.css';

const faq = [
  { q: 'Which plan is right for me?', a: 'Core includes behavioral and technical modes, document context, screenshots, transcription, and the transparent overlay. Pro adds chat, recruiter mode, coding assistance, system design, and eye tracking. Ultimate adds the local coding agent and the phone companion. Lifetime is the Pro toolkit for $399, once.' },
  { q: 'Is AI usage included in the price?', a: 'No. Your plan covers Novi access. You connect your own AI provider key, and the provider bills you for what you use, on every plan including Lifetime.' },
  { q: 'Which AI providers can I connect?', a: 'OpenAI, Anthropic, Google Gemini, and Kimi. Add the key on this website once; the desktop app picks it up when you sign in with the same account.' },
  { q: 'Can the interviewer see it on a screen share?', a: 'Transparent mode turns on OS-level capture protection for Novi windows, and you can hide them from the Windows taskbar or macOS Dock. Results depend on your operating system and capture software, so test your actual setup before the call.' },
  { q: 'Which computers does it run on?', a: 'macOS, Windows, and Linux. One desktop device can be signed in at a time; the website stays signed in alongside it.' },
  { q: 'Do I need a separate desktop account?', a: 'No. Individuals use the same username and password on the website and in the app. Enterprise members use the desktop login their organisation provides.' },
  { q: 'Can I set up Novi for my consultancy?', a: 'Yes. Consultancies and staffing firms get managed desktop accounts under one owner, with shared keys. Contact sales from the pricing page for team licensing.' },
];

const sheets = [
  { feature: FEATURES[0], tone: 'rose', picture: <img src="/app/chat.png" alt="The Novi chat window answering a code question with an explanation" width={1180} height={940} loading="lazy" decoding="async" /> },
  { feature: FEATURES[1], tone: 'wine', picture: <img className={styles.sheetSmall} src="/app/modern-dark.png" alt="The listening widget with its transcript and follow-up questions" width={490} height={457} loading="lazy" decoding="async" /> },
  { feature: FEATURES[2], tone: 'paper', picture: <ScreenshotFragment /> },
  { feature: FEATURES[8], tone: 'deep', picture: <img className={styles.sheetPhone} src="/app/companion-portrait.png" alt="The phone companion with its layout, scroll and capture controls" width={390} height={844} loading="lazy" decoding="async" /> },
] as const;

const modes = ['Behavioral interview', 'Technical screen', 'Recruiter call', 'Chat', 'Code', 'System design', 'Local coding'];
const orderWords = ['First,', 'Then', 'Finally,'];
// The screen each step happens on: sign up here, add the key in the account, sign in on the desktop.
const stepScreens = [<SignupFragment key="signup" />, <AddKeyFragment key="key" />, <DesktopSignInFragment key="desktop" />];

export default function PublicLanding({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState(examples[0]);
  const [portrait, setPortrait] = useState(true);
  const answer = answerFor(question);

  // Reveal once as each block enters. Everything is visible without script; only a ready page hides anything.
  useLayoutEffect(() => {
    const page = root.current;
    if (!page || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const blocks = [...page.querySelectorAll<HTMLElement>('[data-reveal]')];
    page.classList.add(styles.ready);
    const show = (el: HTMLElement) => el.classList.add(styles.in);
    const io = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { show(entry.target as HTMLElement); io.unobserve(entry.target); } }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    for (const el of blocks) { if (el.getBoundingClientRect().top < innerHeight * 0.92) show(el); else io.observe(el); }
    return () => io.disconnect();
  }, []);
  return (
    <div className={styles.page} ref={root}>
      <PublicNavbar onSignIn={onSignIn} onSignUp={onSignUp} />
      <main>
        {/* 1 · Hero: the four lines on the ground, and the product at work on a wine stage. */}
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <h1 id="landing-title" className={styles.title}>
              {['Fuck LeetCode.', 'Fuck HackerRank.', 'Fuck Assessment.', 'Fuck it RAW.'].map((line, index) => <span className={styles.line} key={line}><span style={{ '--i': index } as CSSProperties}>{line}</span></span>)}
            </h1>
            <p className={styles.raw} data-load style={{ '--d': '560ms' } as CSSProperties}>(Random Access Wisdom)</p>
            <p className={styles.lead} data-load style={{ '--d': '640ms' } as CSSProperties}>Novi is an AI interview cheating app. Capture a live question from your screen or audio and get answers, code, and explanations during the interview. Behavioral round, technical screen, or another surprise follow-up: get the answer when you need it.</p>
            <div className={styles.actions} data-load style={{ '--d': '720ms' } as CSSProperties}>
              <Link className={styles.primary} href="/#signup" onClick={event => { event.preventDefault(); onSignUp(); }}>Create your account</Link>
              <Link className={styles.textLink} href="/how-it-works">See how it works</Link>
              <span className={styles.price}>From {PLANS.core.price} a month, with your own AI key</span>
            </div>
          </div>
          <div className={styles.stage}>
            <div className={styles.stageInner} data-open>
              <NoviAnswer answer={reverseList} question="Reverse a linked list in place." />
            </div>
          </div>
        </section>

        {/* 2 · Intro: a board of tiles. The slogan is the heading. */}
        <section className={styles.board} aria-labelledby="intro-title">
          <div className={`${styles.tile} ${styles.tileA}`} data-reveal><h2 id="intro-title">The interview grind?</h2></div>
          <div className={`${styles.tile} ${styles.tileB}`} data-reveal style={{ '--i': 1 } as CSSProperties}><span>Plans from</span><strong>{PLANS.core.price}</strong></div>
          <div className={`${styles.tile} ${styles.tileC}`} data-reveal style={{ '--i': 2 } as CSSProperties}><img src="/app/transparent.png" alt="Novi in transparent mode over a code review question" width={1180} height={940} loading="lazy" decoding="async" /></div>
          <div className={styles.tileD}>
            <ul className={styles.modes} aria-label="Session modes" data-reveal>{modes.map((mode, index) => <li key={mode} style={{ '--i': index } as CSSProperties}>{mode}</li>)}</ul>
            <p data-reveal>That&apos;s another story. You&apos;ve built projects, solved problems, and shipped real work. Then a timed question asks you to remember an algorithm you haven&apos;t touched in months. Novi brings your notes, audio, screenshots, and project files together so you have something useful to work with when the question lands.</p>
          </div>
        </section>

        {/* 3 · The live thing: type the question, see the shape of the answer. */}
        <section className={styles.ask} aria-labelledby="ask-title">
          <h2 id="ask-title" data-reveal>Type what they&apos;ll ask you.</h2>
          <label className={styles.srOnly} htmlFor="ask-input">Your interview question</label>
          <div className={styles.askLine} data-reveal style={{ '--i': 1 } as CSSProperties}>
            <input id="ask-input" className={styles.askInput} value={question} onChange={event => setQuestion(event.target.value.slice(0, 80))} spellCheck={false} autoComplete="off" aria-describedby="ask-note" data-ui />
          </div>
          <div className={styles.askBody}>
            <div className={styles.askAnswer} aria-live="polite" data-reveal style={{ '--i': 2 } as CSSProperties}><NoviAnswer answer={answer} question={question || '…'} compact /></div>
            <div className={styles.askExamples} data-reveal style={{ '--i': 3 } as CSSProperties}>
              <p id="ask-note">Sample answers from a saved session. In a live round Novi picks the mode from the question and answers with your own AI key.</p>
              <div role="group" aria-label="Example questions">{examples.map(example => <button type="button" key={example} aria-pressed={question === example} onClick={() => setQuestion(example)}>{example}</button>)}</div>
            </div>
          </div>
        </section>

        {/* 4 · Features as stacking colour sheets. */}
        <section className={styles.stackSection} id="features" aria-labelledby="features-title">
          <div className={styles.stackHead}><h2 id="features-title" data-reveal>The toolkit.</h2><p data-reveal style={{ '--i': 1 } as CSSProperties}>Four of the {FEATURES.length} things in the app. <Link href="/features">All features</Link> · <Link href="/features#compare">Novi against Interview Coder and Cluely</Link></p></div>
          <ol className={styles.sheets}>
            {sheets.map(({ feature, tone, picture }, index) => (
              <li className={`${styles.sheet} ${styles[`tone-${tone}` as keyof typeof styles]}`} style={{ '--n': index } as CSSProperties} key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.text} <span>{feature.label}.</span></p>
                <div className={styles.sheetPicture}>{picture}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* 4b · What the share shows against what you see: one laptop, one divider to drag. */}
        <section className={styles.compare} aria-labelledby="compare-title">
          <div className={styles.compareWords}>
            <h2 id="compare-title" data-reveal>What they see.<br />What you see.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>Transparent mode turns on OS-level capture protection for Novi&apos;s windows, and the floating bar can hide from the Dock and the taskbar. Drag across the screen: the left side is the share, the right side is your desk.</p>
            <p data-reveal style={{ '--i': 2 } as CSSProperties}>Results depend on your operating system and capture software, so test your own setup before the call.</p>
          </div>
          <ScreenCompare />
        </section>

        {/* 5 · The parody quotation: portrait left, the quote offset right. */}
        <section className={styles.parody} aria-labelledby="parody-title">
          <figure className={styles.portrait} data-reveal>
            {portrait
              ? <img src="https://siliconvalleyism.com/images/chinese-markets.jpg" alt="Jian-Yang from Silicon Valley standing by a whiteboard" referrerPolicy="no-referrer" width={640} height={853} loading="lazy" decoding="async" onError={() => setPortrait(false)} />
              : <div className={styles.portraitFallback} aria-hidden="true">JY</div>}
            <figcaption>Very legal. Very good.</figcaption>
          </figure>
          <div className={styles.words}>
            <h2 id="parody-title" data-reveal>Jian Yang, CEO of Novi.</h2>
            <blockquote data-reveal style={{ '--i': 1 } as CSSProperties}>
              <p>“Herro. I am Jian-Yang. CEO of Novi. You spend four year learning computah science. Interviewah ask you reverse binary twee. You shit your pants. Very sad. So I make Novi. AI risten, AI write code, you just nod head like fucking genius. Google hire you. You make two hundwed thousand dollah. I make sixteen dollah. Six month later, you get fired. Not my problem. No refund. Fuck ReetCode.”</p>
            </blockquote>
            <p className={styles.attribution} data-reveal style={{ '--i': 2 } as CSSProperties}><strong>Jian Yang</strong><span>CEO of Novi · a <cite>Silicon Valley</cite> parody</span></p>
          </div>
        </section>

        <Testimonials />

        {/* 7 · How it works: three fields, one card further along each time. */}
        <section className={styles.steps} aria-labelledby="steps-title">
          {JOURNEY.map((step, index) => (
            <div className={`${styles.step} ${styles[`step-${index}` as keyof typeof styles]}`} key={step.title}>
              {index === 0 && <h2 id="steps-title">Your first session.</h2>}
              <div className={styles.stepCard} data-reveal>{stepScreens[index]}</div>
              <div className={styles.stepWords} data-reveal style={{ '--i': 1 } as CSSProperties}>
                <p className={styles.clause}>{orderWords[index]} {step.title.charAt(0).toLowerCase() + step.title.slice(1)}.</p>
                <p>{step.text}</p>
              </div>
            </div>
          ))}
        </section>

        {/* 8 · Questions, as filled tiles. */}
        <section className={styles.faq} aria-labelledby="faq-title">
          <h2 id="faq-title" data-reveal>Before you get started.</h2>
          <div className={styles.faqList}>
            {faq.map((item, index) => (
              <details key={item.q} name="landing-faq" data-reveal style={{ '--i': index } as CSSProperties}>
                <summary>{item.q}<span aria-hidden="true" /></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 9 · The close: one row of tiles cropped from a longer board. */}
        <section className={styles.close} aria-labelledby="closing-title">
          <div className={`${styles.closeTile} ${styles.closeLeft}`} data-reveal aria-hidden="true" />
          <div className={`${styles.closeTile} ${styles.closeMain}`} data-reveal style={{ '--i': 1 } as CSSProperties}>
            <h2 id="closing-title">Enough interview bullshit.<br />Bring Novi.</h2>
            <p>Live interview answers, readable code, and explanations for the follow-up. Start with the plan that fits your next round.</p>
            <Link className={styles.closeAction} href="/get-access">Find your plan</Link>
          </div>
          <div className={`${styles.closeTile} ${styles.closeRight}`} data-reveal style={{ '--i': 2 } as CSSProperties} aria-hidden="true" />
        </section>
      </main>
      <SiteFooter onSignIn={onSignIn} onSignUp={onSignUp} />
    </div>
  );
}

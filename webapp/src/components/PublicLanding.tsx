'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import PublicNavbar from './PublicNavbar';
import SiteFooter from './SiteFooter';
import Testimonials from './Testimonials';
import { JOURNEY, PLANS } from '@/lib/site';
import { FEATURES } from '@/lib/features';
import styles from './PublicLanding.module.css';

/* ----------------------------------------------------------------------------------------------
   Sample answers for the question box. They show the shape of what Novi returns in each of its
   session modes; a live session uses the visitor's own AI key. Keep them short and true to the modes.
   ---------------------------------------------------------------------------------------------- */
type Mode = 'Code' | 'Behavioral' | 'System design' | 'Recruiter call' | 'Technical screen';
type Answer = { mode: Mode; title: string; code?: string[]; points?: string[]; flow?: string[]; meta: string };

const reverseList: Answer = { mode: 'Code', title: 'Reverse the list in place', code: [
  'function reverse(head) {',
  '  let prev = null, node = head;',
  '  while (node) {',
  '    const next = node.next;',
  '    node.next = prev;',
  '    prev = node;',
  '    node = next;',
  '  }',
  '  return prev;',
  '}',
], meta: 'O(n) time · O(1) space · edge case: empty list returns null' };
const twoSum: Answer = { mode: 'Code', title: 'Two numbers that add up to a target', code: [
  'function findPair(numbers, target) {',
  '  const seen = new Map();',
  '  for (const [i, value] of numbers.entries()) {',
  '    const match = target - value;',
  '    if (seen.has(match)) return [seen.get(match), i];',
  '    seen.set(value, i);',
  '  }',
  '  return null;',
  '}',
], meta: 'O(n) time · O(n) space · one pass, say why the map beats sorting' };
const failed: Answer = { mode: 'Behavioral', title: 'A time you failed, in STAR', points: [
  'Situation: the migration I owned slipped two weeks past the date I had promised.',
  'Task: I had estimated it alone and skipped the legacy auth module.',
  'Action: I split the rest into daily slices, posted a burn-down, and paired on the auth piece.',
  'Result: it shipped nine days late instead of a month, and estimates now get a second reviewer.',
], meta: 'Framework: STAR · pulled from your resume and project notes · 60 seconds spoken' };
const shortener: Answer = { mode: 'System design', title: 'A URL shortener', flow: ['Client', 'API', 'Key service', 'Store', 'Cache'], points: [
  'Write path: hand out pre-generated 7-character keys from a key service, store the mapping once.',
  'Read path: cache the hottest 20% of links; redirects are 301 for permanence, 302 to keep click analytics.',
  'Scale: 100M links is about 50 GB; shard the store by key prefix, replicate reads.',
], meta: 'Trade-offs to raise: custom aliases, expiry, abuse limits · diagram available' };
const whyJob: Answer = { mode: 'Recruiter call', title: 'Why this role', points: [
  'Lead with the overlap: their stack is the one from your last two projects.',
  'Name one concrete thing you want to work on there, taken from the job description.',
  'Close with timing: available in two weeks, open on the band they listed.',
], meta: 'Keep it under 45 seconds · they decide the next round on this call' };
const generic = (question: string): Answer => ({ mode: 'Technical screen', title: question.trim().replace(/\?$/, '') || 'Your question', points: [
  'Restate the problem in one sentence and confirm the input and output.',
  'Pick the structure that fits (map, heap, two pointers, graph walk) and say why.',
  'Walk one small example out loud, then write it, then state the complexity.',
], meta: 'Novi listens for the follow-up and keeps the same context' });

function answerFor(question: string): Answer {
  const q = question.toLowerCase();
  if (/linked list|reverse/.test(q)) return reverseList;
  if (/two sum|add up|pair|target/.test(q)) return twoSum;
  if (/design|shortener|scale|architecture|system/.test(q)) return shortener;
  if (/tell me|time (you|when)|fail|conflict|weakness|yourself|disagree/.test(q)) return failed;
  if (/why|salary|notice|this (job|role|company)|expect/.test(q)) return whyJob;
  return generic(question);
}
const examples = ['Reverse a linked list in place', 'Tell me about a time you failed', 'Design a URL shortener', 'Why do you want this job?'];

/* A fragment of the product's own interface, at true size. Marked data-ui so its small type and rules
   are read as the product's, not the page's. */
function NoviAnswer({ answer, question, compact = false }: { answer: Answer; question: string; compact?: boolean }) {
  return (
    <div className={`${styles.ui} ${compact ? styles.uiCompact : ''}`} data-ui>
      <div className={styles.uiBar}><span className={styles.uiMode}>{answer.mode}</span><span>Session · 12:04</span><span className={styles.uiLive}><i />Listening</span></div>
      <p className={styles.uiQuestion}><span>Interviewer</span>{question}</p>
      <div className={styles.uiAnswer}>
        <p className={styles.uiTitle}><span className={styles.uiMark}>n</span>{answer.title}</p>
        {answer.flow && <ol className={styles.uiFlow}>{answer.flow.map(step => <li key={step}>{step}</li>)}</ol>}
        {answer.code && <pre className={styles.uiCode}><code>{answer.code.map((line, index) => <span key={index}><i>{index + 1}</i>{line}</span>)}</code></pre>}
        {answer.points && <ul className={styles.uiPoints}>{answer.points.map(point => <li key={point}>{point}</li>)}</ul>}
        <p className={styles.uiMeta}>{answer.meta}</p>
      </div>
      <div className={styles.uiComposer}><span>Ask a follow-up…</span><b>Send</b></div>
    </div>
  );
}

/* The account card that moves through the three steps of getting started. */
function AccountCard({ step }: { step: 0 | 1 | 2 }) {
  return (
    <div className={styles.account} data-ui>
      <div className={styles.accountHead}><span className={styles.uiMark}>n</span><span>Your Novi account</span><span className={step === 2 ? styles.accountOn : ''}>{step === 2 ? 'Desktop online' : 'Web only'}</span></div>
      <dl>
        <div><dt>Login</dt><dd>@you · Individual</dd></div>
        <div><dt>Plan</dt><dd>{PLANS.pro.name} · {PLANS.pro.price} {PLANS.pro.unit}</dd></div>
        <div><dt>License</dt><dd>{step === 0 ? 'Pending our confirmation' : 'Active · 29 days left'}</dd></div>
        <div className={step < 1 ? styles.accountOff : ''}><dt>AI key</dt><dd>{step < 1 ? 'Not connected' : 'OpenAI · ends in 4f2a'}</dd></div>
        <div className={step < 2 ? styles.accountOff : ''}><dt>Device</dt><dd>{step < 2 ? 'No device yet' : 'MacBook Pro · signed in'}</dd></div>
      </dl>
    </div>
  );
}

function ScreenshotFragment() {
  return (
    <div className={`${styles.ui} ${styles.uiShot}`} data-ui>
      <div className={styles.uiBar}><span className={styles.uiMode}>Technical screen</span><span>Screenshot attached</span></div>
      <figure className={styles.uiCapture}><img src="/app/transparent.png" alt="A captured screenshot of a code question" width={1180} height={940} loading="lazy" decoding="async" /><figcaption>Captured 12:06 · the question on screen</figcaption></figure>
      <div className={styles.uiAnswer}>
        <p className={styles.uiTitle}><span className={styles.uiMark}>n</span>What the error means</p>
        <ul className={styles.uiPoints}><li>The copy keeps the original string; the function logs the message, so nothing mutates.</li><li>If they ask about the comment, it is a block comment and is ignored at runtime.</li></ul>
        <p className={styles.uiMeta}>Ask about the exact problem in front of you without retyping it</p>
      </div>
    </div>
  );
}

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

        {/* 5 · The parody quotation: portrait, offset quote, a small second picture. */}
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
            <figure className={styles.second} data-reveal style={{ '--i': 3 } as CSSProperties}><img src="/app/chat.png" alt="The Novi window with a code answer, the thing he is talking about" width={1180} height={940} loading="lazy" decoding="async" /></figure>
          </div>
        </section>

        <Testimonials />

        {/* 7 · How it works: three fields, one card further along each time. */}
        <section className={styles.steps} aria-labelledby="steps-title">
          {JOURNEY.map((step, index) => (
            <div className={`${styles.step} ${styles[`step-${index}` as keyof typeof styles]}`} key={step.title}>
              {index === 0 && <h2 id="steps-title">Your first session.</h2>}
              <div className={styles.stepCard} data-reveal><AccountCard step={index as 0 | 1 | 2} /></div>
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
          <div className={`${styles.closeTile} ${styles.closeLeft}`} data-reveal><img src="/app/companion-landscape.png" alt="The phone companion in landscape, with its layout and listening controls" width={844} height={390} loading="lazy" decoding="async" /></div>
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

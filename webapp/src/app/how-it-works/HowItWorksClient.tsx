'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { ChapterPage, CloseRow, Faq, Title } from '@/components/Chapters';
import { AddKeyFragment, DesktopSignInFragment, NoviAnswer, SignupFragment, failed, screenQuestion, shortener, twoSum, whyJob, type Answer } from '@/components/Fragments';
import { JOURNEY, PLANS } from '@/lib/site';
import DeskLaptop from '@/components/DeskLaptop';
import chapters from '@/components/Chapters.module.css';
import styles from './how-it-works.module.css';

const rounds: { name: string; question: string; answer: Answer }[] = [
  { name: 'Behavioral interview', question: 'Tell me about a time you failed.', answer: failed },
  { name: 'Technical screen', question: 'Walk me through your project.', answer: screenQuestion },
  { name: 'Code', question: 'Find two numbers that add up to a target.', answer: twoSum },
  { name: 'System design', question: 'Design a URL shortener.', answer: shortener },
  { name: 'Recruiter call', question: 'Why do you want this role?', answer: whyJob },
];
const stages = [
  { clause: 'They ask.', text: 'Type the question, attach a screenshot, or let Novi transcribe the audio. Mic, screen capture and the provider connection are checked beforehand: technical difficulties are a terrible opening bit.', state: 'listening', time: '12:04' },
  { clause: 'You see the answer.', text: 'The answer, the code, or the way through the problem, shaped by your resume and your project notes. “Let’s do a quick technical exercise” just got less fucking terrifying.', state: 'answer', time: '12:04' },
  { clause: 'They ask why.', text: 'Keep the same conversation going for trade-offs, edge cases and explanations. Check the details before you use them. The saved history is there for the next round of this apparently endless boss fight.', state: 'follow-up', time: '12:07' },
] as const;
const orderWords = ['First,', 'Then', 'Finally,'];
const screens = [<SignupFragment key="signup" />, <AddKeyFragment key="key" />, <DesktopSignInFragment key="desktop" />];

const faqs = [
  { q: 'What do I need to get locked in?', a: 'Create an individual account, activate a license, and connect your AI provider. Use the same login on web and desktop. Enterprise teams keep separate managed desktop logins. Install the desktop app, connect your provider key through your account, and check microphone and screen capture permissions for the tools you want to use.' },
  { q: 'Which plan handles the technical final boss?', a: 'Core includes behavioral and technical modes with context, screenshots, transcription, and transparency. Pro and Lifetime add coding, system design, chat, recruiter mode, and eye tracking. Ultimate adds local coding and the exclusive phone companion.' },
  { q: 'Is Local Coding about to YOLO my codebase?', a: 'Nope. Local Coding reads and searches a selected project folder to answer questions and propose changes. It does not apply those changes or run code. You review and make any changes yourself.' },
  { q: 'Is the AI bill included? No cap?', a: 'No cap: your plan covers access to Novi. You connect your own AI provider key and pay any provider usage charges separately. The same applies to Lifetime.' },
  { q: 'Phone companion? Eye tracking? What’s the side quest?', a: 'A little setup first. Pair your phone with the desktop session before using remote controls. For eye tracking, allow camera access and complete calibration for your current camera position and lighting.' },
];

export default function HowItWorksClient() {
  const [round, setRound] = useState(0);
  const current = rounds[round];
  return (
    <ChapterPage>
      <PublicNavbar active="how-it-works" />
      <main>
        {/* 1 · The claim, and the thing that listens. */}
        <section className={chapters.hero} aria-labelledby="how-title">
          <div className={chapters.heroCopy}>
            <Title id="how-title" lines={['Cheat the interview.', 'Chase the bag.']} />
            <p className={chapters.lead} data-load style={{ '--d': '480ms' } as CSSProperties}>We help you cheat in interviews. For real. Bring your resume, grab the question, and get the answer, the code, and the explanation for the follow-up they absolutely did not need to ask. macOS, Windows and Linux.</p>
            <div className={chapters.actions} data-load style={{ '--d': '560ms' } as CSSProperties}>
              <a className={chapters.primary} href="#session">See a session</a>
              <Link className={chapters.textLink} href="/download">Download Novi</Link>
            </div>
          </div>
          <div className={`${chapters.heroSide} ${styles.heroStage}`}>
            <div data-open><DeskLaptop /></div>
          </div>
        </section>

        {/* 2 · Before the call: three screens, three clauses. */}
        <section className={`${styles.before} ${chapters['tone-rose']}`} id="setup" aria-labelledby="before-title">
          <div className={chapters.chapterHead}>
            <h2 id="before-title" data-reveal>Before the call.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>The pre-interview side quest. Get it done before the recruiter says “can you hear me?”. Already have an account? <Link className={chapters.inline} href="/api-keys">Connect your provider</Link>, then <Link className={chapters.inline} href="/download">download Novi</Link>.</p>
          </div>
          <ol className={styles.beforeSteps}>
            {JOURNEY.map((step, index) => (
              <li key={step.title} data-reveal style={{ '--i': index } as CSSProperties}>
                <div className={styles.beforeScreen}>{screens[index]}</div>
                <p className={styles.clause}>{orderWords[index]} {step.title.charAt(0).toLowerCase() + step.title.slice(1)}.</p>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 3 · The session: pick the round, watch the three beats. */}
        <section className={`${styles.session} ${chapters['tone-paper']}`} id="session" aria-labelledby="session-title">
          <div className={styles.sessionSide}>
            <h2 id="session-title" data-reveal>Round six. Round seven. Whatever.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>At this point the hiring process has more lore than your resume. Load your context once, bring in each question, and keep the answers tied to your own experience. Pick the round you are in.</p>
            <div className={styles.rounds} role="group" aria-label="The round" data-reveal style={{ '--i': 2 } as CSSProperties}>
              {rounds.map((item, index) => <button type="button" key={item.name} aria-pressed={round === index} onClick={() => setRound(index)}>{item.name}</button>)}
            </div>
            <p className={styles.roundNote} data-reveal style={{ '--i': 3 } as CSSProperties}>Sample answers from a saved session. Live, Novi picks the mode from the question and answers with your own key.</p>
          </div>
          <ol className={styles.stages} aria-live="polite">
            {stages.map((stage, index) => (
              <li key={stage.clause} data-reveal style={{ '--i': index } as CSSProperties}>
                <div className={styles.stageWords}>
                  <p className={styles.clause}>{stage.clause}</p>
                  <p>{stage.text}</p>
                </div>
                <div className={styles.stageScreen}><NoviAnswer answer={current.answer} question={current.question} state={stage.state} time={stage.time} compact={index < 2} /></div>
              </li>
            ))}
          </ol>
        </section>

        {/* 4 · The rest of the desk: four filled tiles. */}
        <section className={styles.board} id="tools" aria-labelledby="tools-title">
          <h2 id="tools-title" className={chapters.srOnly}>The rest of the desk</h2>
          <div className={`${styles.tile} ${styles.tileA}`} data-reveal>
            <div><h3>Answers beside the interview.</h3><p>Set the overlay’s transparency, position and click-through so Novi sits where you need it, next to the call and the editor, never on top of what you are typing.</p></div>
            <img src="/app/transparent.png" alt="Novi in transparent mode over a code review question" width={1180} height={940} loading="lazy" decoding="async" />
          </div>
          <div className={`${styles.tile} ${styles.tileB}`} data-reveal style={{ '--i': 1 } as CSSProperties}>
            <h3>The window follows your eyes.</h3><p>Calibrate the camera once and the answer window moves to where you look. New lamp, new angle, new laptop: recalibrate. The camera needs the memo. <Link className={chapters.inline} href="/features#eye-tracking">See it move</Link>.</p>
          </div>
          <div className={`${styles.tile} ${styles.tileC}`} data-reveal style={{ '--i': 2 } as CSSProperties}>
            <h3>Your phone gets a side quest.</h3><p>Pair it with the desktop session to ask questions, capture the screen and scroll answers from beside your monitor. Ultimate only.</p>
          </div>
          <div className={`${styles.tile} ${styles.tileD}`} data-reveal style={{ '--i': 3 } as CSSProperties}>
            <h3>Bring your own AI brain.</h3><p>OpenAI, Anthropic, Google Gemini or Kimi, with your own key, added once in your account. The provider bills the usage; Novi bills the access, from {PLANS.core.price} a month. <Link className={chapters.inline} href="/api-keys">Get a key</Link>.</p>
          </div>
        </section>

        {/* 5 · Your data, straight. */}
        <section className={`${styles.data} ${chapters['tone-wine']}`} id="data" aria-labelledby="data-title">
          <h2 id="data-title" data-reveal>Your data deserves a straight answer.</h2>
          <p className={styles.dataLead} data-reveal style={{ '--i': 1 } as CSSProperties}>The jokes can be unhinged. This part is not. Here is what stays on your computer and what goes to the AI provider you chose.</p>
          <ul className={styles.dataList}>
            <li data-reveal style={{ '--i': 2 } as CSSProperties}><strong>Documents and history stay local.</strong><span>Your resume, notes and conversation history are stored on your computer, for you to revisit.</span></li>
            <li data-reveal style={{ '--i': 3 } as CSSProperties}><strong>Your provider processes the requests.</strong><span>Questions, attachments and the relevant context go to the provider you connected. That provider’s data policy applies to what you send.</span></li>
            <li data-reveal style={{ '--i': 4 } as CSSProperties}><strong>Your account holds access and keys.</strong><span>Keys are added through your Novi account, encrypted at rest. Individuals use the same login on the desktop; enterprise owners manage separate desktop logins for their teams.</span></li>
          </ul>
        </section>

        <Faq id="faq" name="how-faq" title="The “wait, but…” section." items={faqs} />

        <CloseRow id="how-close" title={<>Main quest:<br />get the bag.</>} text={`New role? Side quest income? Start with Core, or get coding answers and system design with Pro and above. The interview grind can kiss your ass.`} action="Pick your cheat code" href="/get-access" />
      </main>
      <SiteFooter />
    </ChapterPage>
  );
}

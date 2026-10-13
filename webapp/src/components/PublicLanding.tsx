'use client';

import Link from 'next/link';
import { ArrowDownUp, ArrowRight, ArrowUpRight, BookOpenText, Check, Code2, Eye, FileText, FolderOpen, Layers, LockKeyhole, Mic2, Monitor, ScanLine, ShieldCheck, Smartphone, Sparkles, Wifi } from 'lucide-react';
import PublicNavbar from './PublicNavbar';
import SiteFooter from './SiteFooter';
import { JOURNEY } from '@/lib/site';
import styles from './PublicLanding.module.css';

export default function PublicLanding({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={styles.page}>
      <PublicNavbar onSignIn={onSignIn} />

      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><span className={styles.eyebrowLine} /> THE INTERVIEW CHEAT CODE</span>
            <h1 id="landing-title">Fuck LeetCode.<br />Fuck HackerRank.<br />Fuck QA.<br /><em>We&apos;re here.</em></h1>
            <p className={styles.heroLead}><strong>Novi helps you cheat and pass interviews.</strong> Coding questions, technical grilling, behavioral rounds, and that blank-screen panic. Bring the question, a screenshot, or audio context. Get AI backup on your desktop and get through the fucking round.</p>
            <div className={styles.actions}>
              <Link className={styles.primaryLink} href="/get-access">Get the unfair advantage <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link className={styles.secondaryLink} href="/how-it-works">Show me how <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
            <p className={styles.heroFootnote}>Available by private license. Already have a Novi account? <Link href="/download">Download the desktop app.</Link></p>
          </div>

          <section className={styles.heroArt} aria-label="Novi feature previews">
            <div className={styles.artCaption}><span className={styles.artCaptionDot} /> YOUR OWN UNFAIR ADVANTAGE <span>FEATURE PREVIEW</span></div>

            <article className={`${styles.featureCard} ${styles.transparentCard}`} aria-labelledby="transparent-title">
              <div className={styles.featureHeading}>
                <span className={styles.featureIcon}><ShieldCheck size={19} aria-hidden="true" /></span>
                <h2 id="transparent-title">Transparent</h2>
                <span className={styles.featureNumber}>01</span>
              </div>
              <p className={styles.featureDescription}>On your screen. Off your screen share.</p>
              <div className={styles.screenComparison}>
                <div className={styles.screenView}>
                  <div className={styles.viewLabel}><Monitor size={12} aria-hidden="true" /> WHAT YOU SEE</div>
                  <div className={styles.editorPreview}>
                    <div className={styles.editorBar}><span className={styles.windowDots}><i /><i /><i /></span><span>two-sum.js</span></div>
                    <div className={styles.editorCode} aria-hidden="true"><span>01 <b>function</b> twoSum(nums) {'{'}</span><span>02 &nbsp; <b>const</b> seen = new Map();</span><span>03 &nbsp; <b>for</b> (const n of nums) {'{'}</span><span>04 &nbsp; &nbsp; // find the pair</span><span>05 &nbsp; {'}'}</span><span>06 {'}'}</span></div>
                    <div className={styles.privateAnswer}><span><Sparkles size={12} aria-hidden="true" /> novi <LockKeyhole size={10} aria-hidden="true" /></span><strong>Start with a hash map.</strong><p>Check the complement.<br />One pass. O(n) time.</p></div>
                  </div>
                  <div className={styles.viewFooter}><Eye size={12} aria-hidden="true" /> Your private AI overlay</div>
                </div>
                <div className={styles.screenView}>
                  <div className={styles.viewLabel}><span className={styles.sharingDot} /> WHAT THEY SEE</div>
                  <div className={styles.editorPreview}>
                    <div className={styles.editorBar}><span className={styles.windowDots}><i /><i /><i /></span><span>two-sum.js</span></div>
                    <div className={styles.editorCode} aria-hidden="true"><span>01 <b>function</b> twoSum(nums) {'{'}</span><span>02 &nbsp; <b>const</b> seen = new Map();</span><span>03 &nbsp; <b>for</b> (const n of nums) {'{'}</span><span>04 &nbsp; &nbsp; // find the pair</span><span>05 &nbsp; {'}'}</span><span>06 {'}'}</span></div>
                    <div className={styles.cleanShare}><ShieldCheck size={13} aria-hidden="true" /> Novi is hidden</div>
                  </div>
                  <div className={styles.viewFooter}><Check size={12} aria-hidden="true" /> Only your shared work</div>
                </div>
              </div>
            </article>

            <div className={styles.featurePair}>
              <article className={styles.featureCard} aria-labelledby="eye-tracking-title">
                <div className={styles.featureHeading}><span className={styles.featureIcon}><Eye size={19} aria-hidden="true" /></span><h2 id="eye-tracking-title">Eye Tracking</h2><span className={styles.featureNumber}>02</span></div>
                <p className={styles.featureDescription}>Your answer follows your gaze.</p>
                <div className={styles.gazePreview} role="img" aria-label="A gaze target beside an AI answer that follows where you look">
                  <div className={styles.gazeGuide} aria-hidden="true"><Eye size={25} /><span /><i /></div>
                  <span className={styles.gazeTarget} aria-hidden="true"><i /></span>
                  <div className={styles.gazeAnswer}><span><Sparkles size={11} aria-hidden="true" /> RIGHT WHERE YOU LOOK</span><strong>One lookup. One pass.</strong><p>Keep the explanation in sight.</p></div>
                  <span className={styles.gazeStatus}><span className={styles.artCaptionDot} /> GAZE CONNECTED</span>
                </div>
              </article>

              <article className={styles.featureCard} aria-labelledby="phone-companion-title">
                <div className={styles.featureHeading}><span className={styles.featureIcon}><Smartphone size={19} aria-hidden="true" /></span><h2 id="phone-companion-title">Phone Companion</h2><span className={styles.featureNumber}>03</span></div>
                <p className={styles.featureDescription}>Your phone. Your remote control.</p>
                <div className={styles.phonePreview} role="img" aria-label="A connected phone with controls to ask AI, capture the screen, and scroll answers on your desktop">
                  <div className={styles.phoneConnection}><span><Monitor size={22} aria-hidden="true" /><i /><Wifi size={17} aria-hidden="true" /></span><strong>Scan.<br />Connect.<br />Control.</strong><small>DESKTOP ↔ PHONE</small></div>
                  <div className={styles.phone} aria-hidden="true">
                    <div className={styles.phoneCamera} />
                    <div className={styles.phoneBrand}>novi<span>●</span></div>
                    <div className={styles.phoneSession}>Desktop connected</div>
                    <div className={styles.phoneAsk}><Sparkles size={13} /> Ask AI</div>
                    <div className={styles.phoneControl}><ScanLine size={12} /> Capture screen</div>
                    <div className={styles.phoneControl}><ArrowDownUp size={12} /> Scroll answer</div>
                    <div className={styles.phoneHome} />
                  </div>
                </div>
              </article>
            </div>
            <article className={`${styles.featureCard} ${styles.localCard}`} aria-labelledby="local-agent-title">
              <div className={styles.featureHeading}><span className={styles.featureIcon}><Code2 size={19} aria-hidden="true" /></span><h2 id="local-agent-title">Local Coding Agent</h2><span className={styles.featureNumber}>04</span></div>
              <p className={styles.featureDescription}>Your project. Your files. An agent with the context.</p>
              <div className={styles.localPreview} role="img" aria-label="A local project with App.tsx, cart.ts, and cart.test.ts, alongside an agent tracing an empty-cart bug through the related files">
                <div className={styles.projectTree}><span><FolderOpen size={12} aria-hidden="true" /> my-project</span><span>├ &nbsp; App.tsx</span><span className={styles.selectedFile}>├ &nbsp; cart.ts</span><span>└ &nbsp; cart.test.ts</span></div>
                <div className={styles.agentContext}><span><Sparkles size={12} aria-hidden="true" /> PROJECT CONTEXT</span><strong>“Fix the empty-cart bug.”</strong><p>Tracing the component, cart logic, and related tests.</p><small><Check size={11} aria-hidden="true" /> Working with your codebase</small></div>
              </div>
            </article>
            <p className={styles.mockupNote}>Illustrative previews of the Novi desktop experience.</p>
          </section>
        </section>

        <section className={styles.story} id="story" aria-labelledby="story-title">
          <div>
            <span className={styles.sectionTag}>LET&apos;S DROP THE POLITE VERSION</span>
            <h2 id="story-title">Yes, it helps you cheat.<br /><em>That&apos;s the point.</em></h2>
          </div>
          <div className={styles.storyText}>
            <p>Another timed puzzle. Another &ldquo;quick&rdquo; technical round. Another demand to remember an algorithm you last touched six months ago. Fuck the endless grind of trying to become a walking answer key.</p>
            <p>Novi puts an AI assistant beside the interview. Feed it the problem, ask for code, pull apart the explanation, and keep asking when the follow-up lands. You get something useful to work with while the conversation is actually happening.</p>
            <p>Call it cheating. Call it backup. We&apos;re here to help you get past the interview bullshit and give you a shot at the work on the other side.</p>
          </div>
        </section>

        <section className={styles.journey} aria-label="How to use Novi during interviews">
          <div className={styles.journeyIntro}><span className={styles.sectionTag}>THE GAME PLAN</span><h2>Load the context.<br />Bring the backup.</h2></div>
          <div className={styles.steps}>
            <article className={styles.step}>
              <span className={styles.stepNumber}>01 / BEFORE</span>
              <div className={styles.stepIcon}><BookOpenText size={23} aria-hidden="true" /></div>
              <h3>Give it the ammunition.</h3>
              <p>Load your résumé, project notes, and the job description. Tell Novi what you built, what role you want, and which details matter. Give it your actual story so the answer has more substance than generic AI waffle.</p>
              <div className={styles.stepDetail}><span>résumé.pdf</span><span>project-notes.txt</span><span>the role</span></div>
            </article>
            <article className={styles.step}>
              <span className={styles.stepNumber}>02 / DURING</span>
              <div className={styles.stepIcon}><Mic2 size={23} aria-hidden="true" /></div>
              <h3>Hit it with the question.</h3>
              <p>Type it, capture a screenshot, or bring in audio context. Ask for a solution, an explanation, or a better way to answer. When they change the question, keep the conversation going instead of starting from scratch.</p>
              <div className={styles.stepDetail}><span>screenshots</span><span>audio</span><span>chat</span></div>
            </article>
            <article className={styles.step}>
              <span className={styles.stepNumber}>03 / AFTER</span>
              <div className={styles.stepIcon}><BookOpenText size={23} aria-hidden="true" /></div>
              <h3>Get past &ldquo;uh, shit.&rdquo;</h3>
              <p>Work through the code, the edge cases, and the reasoning behind the answer. Keep useful responses in your local conversation history and come back to them for the next round.</p>
              <div className={styles.stepDetail}><span>code + explanations</span><span>saved conversations</span></div>
            </article>
          </div>
        </section>

        <section className={styles.product} aria-labelledby="product-title">
          <div className={styles.productCopy}>
            <span className={styles.sectionTag}>WHAT YOU ACTUALLY GET</span>
            <h2 id="product-title">For the code.<br />For the grilling.<br /><em>For the &ldquo;oh, fuck.&rdquo;</em></h2>
            <p>One desktop workspace for the parts of an interview that go sideways. Get help with the problem in front of you, keep the relevant context close, and choose the AI provider that does the heavy lifting.</p>
            <Link href="/how-it-works">See the whole setup <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className={styles.productList}>
            <div><FolderOpen size={20} aria-hidden="true" /><span><strong>A coding agent that knows your project</strong><small>Work on your local code with an agent that reads and searches your project files for context. Ask it to trace a bug, explain how the code fits together, or propose a change for your everyday development work.</small></span></div>
            <div><ScanLine size={20} aria-hidden="true" /><span><strong>Screenshot the damn question</strong><small>Attach the problem on your screen so you can ask about what is actually there, without retyping the whole thing.</small></span></div>
            <div><Mic2 size={20} aria-hidden="true" /><span><strong>Give the conversation some context</strong><small>Bring captured audio into the workflow through transcription, then ask Novi to help with the question or follow-up.</small></span></div>
            <div><Code2 size={20} aria-hidden="true" /><span><strong>Code, then explain the code</strong><small>Use Coding Mode for solutions, edge cases, complexity, and follow-ups. Keep code readable in its own viewer.</small></span></div>
            <div><FileText size={20} aria-hidden="true" /><span><strong>Survive the &ldquo;tell me about a time&rdquo; round</strong><small>Use your résumé and project notes as context for behavioral answers and technical conversations.</small></span></div>
            <div><Layers size={20} aria-hidden="true" /><span><strong>A workspace that stays out of your way</strong><small>Adjust transparency and click-through controls while keeping your desktop workspace close.</small></span></div>
            <div><LockKeyhole size={20} aria-hidden="true" /><span><strong>Your provider. Your model.</strong><small>Connect OpenAI, Anthropic, Gemini, or a compatible endpoint. Bring your own API key; provider usage is billed separately.</small></span></div>
          </div>
        </section>

        <section className={`${styles.journey} ${styles.start}`} id="get-started" aria-labelledby="start-title">
          <div className={styles.journeyIntro}><div><span className={styles.sectionTag}>ENOUGH TALK</span><h2 id="start-title">Get in.<br />Get your backup running.</h2></div><Link className={styles.startLink} href="/get-access">Choose a plan &amp; get access <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
          <ol className={styles.steps}>
            {JOURNEY.map((step, index) => (
              <li className={`${styles.step} ${styles.startStep}`} key={step.title}>
                <span className={styles.stepNumber}>STEP {index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <span className={styles.sectionTag}>STRAIGHT ANSWERS</span>
          <h2 id="faq-title">The questions you&apos;re thinking.</h2>
          <details><summary>So this is actually for cheating in interviews?</summary><p>Yes. Novi is built to help you cheat and get through interview questions with AI assistance. Bring the question, get help with the answer, and work through the follow-ups. That&apos;s the pitch.</p></details>
          <details><summary>What can I throw at it?</summary><p>Text, screenshots, photos, audio context, and your résumé or project notes. Use the mode that fits the round: coding, technical, system design, behavioral, or a recruiter conversation.</p></details>
          <details><summary>How do I get it running?</summary><p>Choose your plan on Get Access and send the request. Once your account is ready, connect your AI provider, create your desktop login, and install Novi on macOS, Windows, or Linux. Your provider bills AI usage separately.</p></details>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <span className={styles.sectionTag}>YOUR NEXT ROUND IS COMING</span>
          <h2 id="closing-title">Enough interview bullshit.<br /><em>Bring Novi.</em></h2>
          <p>The question lands. Your backup is already open. Let&apos;s fucking go.</p>
          <div className={styles.closingActions}>
            <Link className={styles.lightLink} href="/get-access">Get access <ArrowUpRight size={17} aria-hidden="true" /></Link>
            <Link className={styles.quietLink} href="/download">Already in? Download Novi <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>

      <SiteFooter onSignIn={onSignIn} />
    </div>
  );
}

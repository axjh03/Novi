'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BookOpenText, Code2, FileText, Layers, LockKeyhole, Mic2, ScanLine, Sparkles } from 'lucide-react';
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

          <div className={styles.heroArt} role="img" aria-label="Sample Novi workspace with an interview screenshot, audio context, and an explanation of a linear-time coding solution">
            <div className={styles.artCaption}><span className={styles.artCaptionDot} /> YOUR BACKUP HAS ENTERED THE CHAT <span>SAMPLE VIEW</span></div>
            <div className={styles.window}>
              <div className={styles.windowBar}>
                <div className={styles.windowDots}><i /><i /><i /></div>
                <span>novi <b>·</b> interview workspace</span>
                <span className={styles.windowStatus}>SESSION READY</span>
              </div>
              <div className={styles.windowBody}>
                <aside className={styles.windowAside}>
                  <span className={styles.mockLabel}>YOUR CONTEXT</span>
                  <div className={styles.contextFile}><ScanLine size={15} aria-hidden="true" /><span>Question screenshot</span></div>
                  <div className={styles.contextFile}><Mic2 size={15} aria-hidden="true" /><span>Audio context</span></div>
                  <div className={styles.contextFile}><FileText size={15} aria-hidden="true" /><span>My résumé</span></div>
                  <div className={styles.asideBottom}><span className={styles.asideDot} /> Your question. Your context. Your backup.</div>
                </aside>
                <div className={styles.windowConversation}>
                  <span className={styles.mockLabel}>THE CLOCK IS TICKING</span>
                  <div className={styles.question}><span>THE QUESTION</span><p>“Find two numbers that add up to the target. Can you do better than O(n²)?”</p></div>
                  <div className={styles.answer}>
                    <div className={styles.answerHeading}><Sparkles size={16} aria-hidden="true" /> Here&apos;s the move.</div>
                    <p>Use a hash map. For each number, check whether its complement is already stored. If it is, return both indices. Otherwise, store this number and keep going.</p>
                    <pre className={styles.answerCode}><code>{'const need = target - nums[i];\nif (seen.has(need)) {\n  return [seen.get(need), i];\n}\nseen.set(nums[i], i);'}</code></pre>
                    <div className={styles.answerSource}>Expected O(n) time <span>·</span> O(n) space</div>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.artNote}>Less panic.<br /><strong>More &ldquo;I&apos;ve got this.&rdquo;</strong></div>
          </div>
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

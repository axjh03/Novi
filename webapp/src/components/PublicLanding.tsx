'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, BookOpenText, Code2, FileText, LockKeyhole, Mic2, Sparkles } from 'lucide-react';
import PublicNavbar from './PublicNavbar';
import styles from './PublicLanding.module.css';

export default function PublicLanding({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={styles.page}>
      <PublicNavbar onSignIn={onSignIn} />

      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><span className={styles.eyebrowLine} /> A quieter kind of confidence</span>
            <h1 id="landing-title">You did the work.<br /><em>Bring your whole story.</em></h1>
            <p className={styles.heroLead}>The interview starts soon. Your best examples are scattered across a résumé, old projects, and notes you meant to organize. Novi brings the details together so you can speak from experience, not from a script.</p>
            <div className={styles.actions}>
              <Link className={styles.primaryLink} href="/download">Get Novi for desktop <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link className={styles.secondaryLink} href="#story">See the story <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
            <p className={styles.heroFootnote}>Your context. Your model. Your words. <Link href="/license">Available through private license.</Link></p>
          </div>

          <div className={styles.heroArt} role="img" aria-label="Illustrative Novi workspace showing personal context beside an interview question and a response outline">
            <div className={styles.artCaption}><span className={styles.artCaptionDot} /> AN ILLUSTRATIVE MOMENT IN NOVI <span>SAMPLE VIEW</span></div>
            <div className={styles.window}>
              <div className={styles.windowBar}>
                <div className={styles.windowDots}><i /><i /><i /></div>
                <span>novi <b>·</b> interview workspace</span>
                <span className={styles.windowStatus}>SESSION READY</span>
              </div>
              <div className={styles.windowBody}>
                <aside className={styles.windowAside}>
                  <span className={styles.mockLabel}>YOUR CONTEXT</span>
                  <div className={styles.contextFile}><FileText size={15} aria-hidden="true" /><span>My résumé</span></div>
                  <div className={styles.contextFile}><FileText size={15} aria-hidden="true" /><span>Project notes</span></div>
                  <div className={styles.contextFile}><FileText size={15} aria-hidden="true" /><span>Role description</span></div>
                  <div className={styles.asideBottom}><span className={styles.asideDot} /> The details are here when you need them.</div>
                </aside>
                <div className={styles.windowConversation}>
                  <span className={styles.mockLabel}>IN THE MOMENT</span>
                  <div className={styles.question}><span>THE QUESTION</span><p>“Tell me about a time you changed your approach.”</p></div>
                  <div className={styles.answer}>
                    <div className={styles.answerHeading}><Sparkles size={16} aria-hidden="true" /> A starting point, grounded in your work</div>
                    <p>“On the onboarding redesign, I started with a bigger rebuild. After talking with support and reviewing the drop-off points, I changed course…”</p>
                    <div className={styles.answerSource}>From your project notes <span>·</span> Make it your own</div>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.artNote}><span className={styles.artNoteMark}>“</span> The right detail can bring a story back to life.</div>
          </div>
        </section>

        <section className={styles.story} id="story" aria-labelledby="story-title">
          <div className={styles.storyHeading}>
            <span className={styles.sectionTag}>THE IDEA BEHIND NOVI</span>
            <h2 id="story-title">The answer was never missing.<br /><em>The moment just got loud.</em></h2>
          </div>
          <div className={styles.storyText}>
            <p>You know the project. You remember the tradeoffs, the late fixes, the small decisions that made it work. But under pressure, even familiar stories can be hard to put into words.</p>
            <p>Novi is a calm desktop space for those moments. Bring in the context that matters, choose the AI model you trust, and shape a response that still sounds like you.</p>
          </div>
        </section>

        <section className={styles.journey} aria-label="How Novi fits into your process">
          <div className={styles.journeyIntro}><span className={styles.sectionTag}>A MORE HUMAN WORKFLOW</span><h2>From scattered notes<br />to a clearer conversation.</h2></div>
          <div className={styles.steps}>
            <article className={styles.step}>
              <span className={styles.stepNumber}>01 / BEFORE</span>
              <div className={styles.stepIcon}><BookOpenText size={23} aria-hidden="true" /></div>
              <h3>Gather what matters.</h3>
              <p>Bring your résumé, project notes, and the role into one session. Give Novi the background behind your work, not just a list of keywords.</p>
              <div className={styles.stepDetail}><span>résumé.pdf</span><span>project-notes.txt</span><span>the role</span></div>
            </article>
            <article className={styles.step}>
              <span className={styles.stepNumber}>02 / DURING</span>
              <div className={styles.stepIcon}><Mic2 size={23} aria-hidden="true" /></div>
              <h3>Stay in the moment.</h3>
              <p>Use chat, audio capture, or coding mode when you need a thought partner. Find a useful starting point, then make the answer yours.</p>
              <div className={styles.stepDetail}><span>conversation</span><span>audio</span><span>code</span></div>
            </article>
            <article className={styles.step}>
              <span className={styles.stepNumber}>03 / AFTER</span>
              <div className={styles.stepIcon}><BookOpenText size={23} aria-hidden="true" /></div>
              <h3>Keep the thread.</h3>
              <p>Your conversations are saved locally across sessions. Return to an idea, sharpen an example, or prepare for the next conversation.</p>
              <div className={styles.stepDetail}><span>saved conversations</span><span>your pace</span></div>
            </article>
          </div>
        </section>

        <section className={styles.product} aria-labelledby="product-title">
          <div className={styles.productCopy}>
            <span className={styles.sectionTag}>MADE FOR REAL WORK</span>
            <h2 id="product-title">A little more clarity.<br /><em>A lot more you.</em></h2>
            <p>Whether you are explaining a system you built or thinking through a new problem, Novi helps you connect the question to the experience you already have.</p>
            <Link href="/how-it-works">Explore how Novi works <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className={styles.productList}>
            <div><FileText size={20} aria-hidden="true" /><span><strong>Grounded in your context</strong><small>Start with your own files, goals, and instructions.</small></span></div>
            <div><Code2 size={20} aria-hidden="true" /><span><strong>Ready for technical thinking</strong><small>Move between conversation, code, and behavioral answers.</small></span></div>
            <div><LockKeyhole size={20} aria-hidden="true" /><span><strong>Your choice of provider</strong><small>Connect an AI provider you use and manage your own credentials.</small></span></div>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <span className={styles.sectionTag}>WHEN YOU ARE READY</span>
          <h2 id="closing-title">Let your next conversation<br /><em>sound more like you.</em></h2>
          <p>Make space for the work you have done and the story only you can tell.</p>
          <div className={styles.closingActions}>
            <Link className={styles.lightLink} href="/download">Download Novi <ArrowUpRight size={17} aria-hidden="true" /></Link>
            <Link className={styles.quietLink} href="/license">Request a private license <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}><Image src="/logo.svg" width={28} height={28} alt="" /> <span>novi<span className={styles.brandDot}>.</span></span></div>
        <p>Thoughtful help for moments that matter.</p>
        <div><Link href="/how-it-works">How it works</Link><Link href="/api-keys">API guide</Link><a href="mailto:getnoviapp@outlook.com">Get in touch</a></div>
      </footer>
    </div>
  );
}

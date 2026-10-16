import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, AudioLines, Check, Code2, CreditCard, FileText, HardDrive, KeyRound, Layers, MessageSquare, Monitor, Send, Sparkles } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { JOURNEY } from '@/lib/site';
import styles from './how-it-works.module.css';

export const metadata: Metadata = {
  title: 'How it works — Prepare with Novi',
  description: 'Set up résumé and project context, use Novi to prepare and practice, and review the details before your next interview.',
};

const faqs = [
  ['What do I need to get locked in?', 'The starter pack: a Novi account, a desktop login, and a configured AI provider. Install the desktop app, connect your provider key through your account, and check microphone and screen capture permissions for the tools you want to use.'],
  ['Which plan handles the technical final boss?', 'Core includes behavioral and technical modes with context, screenshots, transcription, and transparency. Pro and Lifetime add coding, system design, chat, recruiter mode, and eye tracking. Ultimate adds local coding and the exclusive phone companion.'],
  ['Can I run this on my whole setup?', 'Core and Pro are limited to one device. Ultimate includes a maximum of three devices. Lifetime includes unlimited devices. For consultancy or staffing firm licensing, contact our sales team.'],
  ['Is Local Coding about to YOLO my codebase?', 'Nope. Local Coding reads and searches a selected project folder to answer questions and propose changes. It does not apply those changes or run code. You review and make any changes yourself.'],
  ['Is the AI bill included? No cap?', 'No cap: your plan covers access to Novi. You connect your own AI provider key and pay any provider usage charges separately. The same applies to Lifetime.'],
  ['Phone companion? Eye tracking? What’s the side quest?', 'A little setup first. Pair your phone with the desktop session before using remote controls. For eye tracking, allow camera access and complete calibration for your current camera position and lighting.'],
];

export default function HowItWorksPage() {
  return (
    <div className={styles.page}>
      <PublicNavbar active="how-it-works" />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>PREPARE WITH YOUR OWN CONTEXT</span>
            <h1>Know your work.<br /><em>Explain it clearly.</em></h1>
            <p>Bring your résumé, role details, notes, and selected project context into one workspace. Prepare, practice, and use Novi only in ways permitted by your interview and organization.</p>
            <a className={styles.heroAction} href="#setup">See how to get started <ArrowRight size={17} aria-hidden="true" /></a>
            <span className={styles.platforms}>Built for macOS, Windows &amp; Linux</span>
          </div>
          <figure className={styles.heroScene}>
            <div className={styles.sceneOrbit} aria-hidden="true" />
            <div className={styles.workspacePreview} aria-hidden="true">
              <div className={styles.windowBar}><span className={styles.windowDots}><i /><i /><i /></span><span>novi / interview backup</span><Layers size={14} /></div>
              <div className={styles.previewBody}>
                <div className={styles.previewSidebar}><span>CONTEXT</span><FileText size={20} /><span>Résumé</span><Code2 size={20} /><span>Projects</span><AudioLines size={20} /><span>Audio</span></div>
                <div className={styles.previewChat}>
                  <span className={styles.previewMode}><span />Technical interview</span>
                  <div className={styles.question}>“Walk me through your project.” Bro, I’m cooked.</div>
                  <div className={styles.answer}><Sparkles size={18} /><div><strong>You’ve got receipts.</strong><p>Start with the problem you solved. Explain your decision, the trade-off, and the result.</p><span className={styles.answerLine} /><span className={styles.answerLine} /></div></div>
                  <div className={styles.previewComposer}>They asked a follow-up…<ArrowUpRight size={18} /></div>
                </div>
              </div>
            </div>
            <div className={styles.floatingContext} aria-hidden="true"><span className={styles.floatIcon}><FileText size={20} /></span><div><strong>Your résumé = the lore</strong><span>Résumé + project notes</span></div><Check size={15} /></div>
            <div className={styles.floatingAudio} aria-hidden="true"><AudioLines size={26} /><div><strong>Catch the question</strong><span>Audio → transcription</span></div></div>
            <figcaption>Illustrative session · Interview chaos, meet backup</figcaption>
          </figure>
          <ul className={styles.jump} aria-label="On this page"><li><a href="#setup">01 · Set up</a></li><li><a href="#session">02 · Your session</a></li><li><a href="#tools">03 · Your toolkit</a></li><li><a href="#data">04 · Your data</a></li></ul>
        </section>

        <section className={styles.section} id="setup" aria-labelledby="setup-title">
          <span className={styles.eyebrow}>01 / PREPARE YOUR WORKSPACE</span><h2 id="setup-title">Get set up. Then get ready.</h2>
          <p className={styles.lead}>The pre-interview side quest: choose your plan, connect your AI provider, and install Novi. macOS, Windows, or Linux. Get this done before the recruiter says “can you hear me?”</p>
          <ol className={styles.steps}>{JOURNEY.map((step, index) => {
            const StepIcon = [CreditCard, KeyRound, Monitor][index];
            return <li key={step.title}><div className={styles.stepIcon}><StepIcon size={27} strokeWidth={1.5} aria-hidden="true" /><span>0{index + 1}</span></div><h3>{step.title}</h3><p>{step.text}</p></li>;
          })}</ol>
          <div className={styles.setupNote}><KeyRound size={19} aria-hidden="true" /><p><strong>Already have an account?</strong> Connect your provider using the <Link href="/api-keys">setup guide</Link>, then <Link href="/download">download Novi</Link> and sign in with your desktop login.</p></div>
        </section>

        <section className={styles.section} id="session" aria-labelledby="session-title">
          <span className={styles.eyebrow}>02 / ENTER THE INTERVIEW</span><h2 id="session-title">Round 6-7? For real?</h2>
          <p className={styles.lead}>Six rounds. Seven rounds. 6-7. At this point the hiring process has more lore than your résumé. Load your context once, bring in each question, and keep the backup rolling.</p>
          <div className={styles.sessionFlow} aria-hidden="true">
            <div className={styles.documentStack}><div><FileText size={18} /><span>Project notes</span></div><div><FileText size={18} /><span>Job description</span></div><div><FileText size={18} /><span>Your résumé</span><Check size={14} /></div></div>
            <div className={styles.flowConnector}><span>ADD CONTEXT</span><ArrowRight size={18} /></div>
            <div className={styles.noviCore}><Sparkles size={30} strokeWidth={1.5} /><strong>novi.</strong><span>Interview backup</span></div>
            <div className={styles.flowConnector}><span>GET BACKUP</span><ArrowRight size={18} /></div>
            <div className={styles.responsePreview}><MessageSquare size={20} /><strong>Less brain freeze.<br />More “I’ve got this.”</strong><span className={styles.answerLine} /><span className={styles.answerLine} /><span className={styles.responseTag}>Context → question → follow-up</span></div>
          </div>
          <ol className={styles.phases}>
            <li><span className={styles.tag}>01 / ADD YOUR CONTEXT</span><h3>Bring the details you can share.</h3><p>Add your résumé, job description, and project notes so Novi has relevant context. Pick a practice mode and check your audio, screen, and provider setup. Only include materials you are permitted to share with your selected provider.</p></li>
            <li><span className={styles.tag}>02 / SEND THE QUESTION</span><h3>They ask. You get backup.</h3><p>Type the question, attach a screenshot, or bring in transcribed audio. Ask Novi for an answer, a code explanation, or a way through the problem. “Let’s do a quick technical exercise” just got less fucking terrifying.</p></li>
            <li><span className={styles.tag}>03 / HANDLE THE FOLLOW-UP</span><h3>Keep the plot armor on.</h3><p>They ask “why?” Keep the same conversation going for trade-offs, edge cases, and explanations. Check the details before using the answer. Your saved history is there for the next round of this apparently endless boss fight.</p></li>
          </ol>
        </section>

        <section className={styles.section} id="tools" aria-labelledby="tools-title">
          <span className={styles.eyebrow}>03 / PICK YOUR LOADOUT</span><h2 id="tools-title">Fuck the whiteboard panic.</h2>
          <p className={styles.lead}>Recruiter small talk? Behavioral lore dump? A surprise algorithm? Pick the mode for the round you’re in and bring the backup that fits.</p>
          <div className={styles.toolGroups}>
            <article><div className={styles.conversationArt} aria-hidden="true"><div><AudioLines size={24} /><span>“Tell me about a time…”</span></div><div><Sparkles size={20} /><span>Your project notes have entered the chat.</span></div><span className={styles.modePill}>Chat · Recruiter · Technical · Behavioral</span></div><span className={styles.tag}>EVERY PLAN</span><h3>“Tell me about yourself” insurance</h3><p>Chat handles general questions. Recruiter mode helps with intros and role fit. Technical mode tackles fundamentals and project deep dives. Behavioral mode turns your own experience into a story with a point. Main-character energy, supporting evidence included.</p><ul><li>Résumé and document context</li><li>Screenshots and audio transcription</li><li>Local conversation history</li></ul></article>
            <article><div className={styles.codeArt} aria-hidden="true"><div className={styles.codeWindow}><span><Code2 size={15} /> The algorithm side quest</span><code><span>function</span> solve(question) {'{'}<br />&nbsp; understand(question);<br />&nbsp; explore(tradeoffs);<br />&nbsp; <span>return</span> nextStep;<br />{'}'}</code></div><span className={styles.codeBadge}><Layers size={16} />Architecture + reasoning</span></div><span className={styles.tag}>PRO, PLUS &amp; LIFETIME</span><h3>The technical round can catch these hands</h3><p>Bring the coding problem and work through solutions, complexity, and edge cases. Use System Design for architecture and trade-offs. Add a local project for code-aware questions. When “one quick question” becomes a distributed system, you’ve got backup.</p><ul><li>Readable code and explanations</li><li>Architecture diagrams and design reasoning</li><li>Read-only project search and change proposals</li></ul></article>
          </div>
          <ul className={styles.tools}>
            <li><strong>Your desktop, with backup attached</strong>Adjust the overlay’s transparency, position, and click-through behavior to put Novi where you need it alongside your work.</li>
            <li><strong>The HUD follows your gaze. Yes, really.</strong>Calibrate your camera so the answer HUD can respond to where you look. New lighting or a new position? Recalibrate. The camera needs the memo.</li>
            <li><strong>Your phone gets a side quest</strong>Pair it with the desktop session to ask questions, capture the screen, and scroll answers. Tiny screen, useful backup.</li>
            <li><strong>Bring your own AI brain</strong>Connect a supported provider with your own API key. Provider usage is billed separately from your Novi plan. Keep that in the budget for the bag.</li>
          </ul>
          <Link className={styles.textLink} href="/get-access">Compare features and device allowances <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <section className={styles.section} id="data" aria-labelledby="data-title">
          <span className={styles.eyebrow}>04 / THE RECEIPTS</span><h2 id="data-title">Your data deserves a straight answer.</h2>
          <p className={styles.lead}>The jokes can be unhinged. The data explanation should be clear. Here’s what stays on your computer and what goes to your selected AI provider.</p>
          <ul className={styles.privacy}>
            <li><HardDrive size={21} aria-hidden="true" /><span><strong>Documents and history are stored locally</strong><span>Your source documents and conversation history stay on your computer for you to revisit.</span></span></li>
            <li><Send size={21} aria-hidden="true" /><span><strong>Your selected provider processes AI requests</strong><span>Questions, attachments, and relevant context are sent to the AI provider you choose. That provider’s data policies apply to the content you send.</span></span></li>
            <li><KeyRound size={21} aria-hidden="true" /><span><strong>Your account manages access and provider keys</strong><span>Add your provider credentials and create desktop logins through your Novi account. Consultancies and staffing firms can contact sales for team licensing and setup.</span></span></li>
          </ul>
        </section>

        <section className={styles.section} id="faq" aria-labelledby="faq-title"><span className={styles.eyebrow}>BEFORE YOU SEND IT</span><h2 id="faq-title">The “wait, but…” section.</h2><div className={styles.faq}>{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
        <section className={styles.cta}><h2>Walk in prepared.</h2><p>Start with Core, or add coding, system design, and project context with higher plans. Use Novi in ways that fit the rules of your interview.</p><div className={styles.ctaActions}><Link className={styles.ctaPrimary} href="/get-access">Compare plans <ArrowUpRight size={16} aria-hidden="true" /></Link></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}

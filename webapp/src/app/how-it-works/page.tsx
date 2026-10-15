import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, HardDrive, KeyRound, Send } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { JOURNEY } from '@/lib/site';
import styles from './how-it-works.module.css';

export const metadata: Metadata = {
  title: 'How it works — Novi',
  description: 'Learn how to set up Novi, add your context, use conversation and coding tools, and manage your AI provider and local session history.',
};

const faqs = [
  ['What do I need before my first session?', 'A Novi account, a desktop login, and a configured AI provider. Install the desktop app, connect your provider key through your account, and check microphone and screen capture permissions for the tools you want to use.'],
  ['Which plan includes coding and system design?', 'Pro, Plus, and Lifetime include the coding assistant, system design diagrams, and local code context. Essential includes the core conversation tools, document context, screenshots, transcription, overlay, eye tracking, and phone companion.'],
  ['How many devices can I use?', 'Essential and Pro are limited to one device. Plus includes a maximum of two devices. Lifetime includes unlimited devices. For consultancy or staffing firm licensing, contact our sales team.'],
  ['Does Local Coding change my files?', 'Local Coding reads and searches a selected project folder to answer questions and propose changes. It does not apply those changes or run code. You review and make any changes yourself.'],
  ['Does Novi include AI usage?', 'Your plan covers access to Novi. You connect your own AI provider key and pay any provider usage charges separately. The same applies to Lifetime.'],
  ['Can I use the phone companion or eye tracking right away?', 'Pair your phone with the desktop session before using remote controls. For eye tracking, allow camera access and complete calibration for your current camera position and lighting.'],
];

export default function HowItWorksPage() {
  return (
    <div className={styles.page}>
      <PublicNavbar active="how-it-works" />
      <main>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>HOW NOVI WORKS</span>
          <h1>From a question<br /><em>to a clearer understanding.</em></h1>
          <p>Set up your workspace once. Bring the context that matters. Use the right tools to prepare, explore a problem, and work through the follow-up.</p>
          <ul className={styles.jump} aria-label="On this page"><li><a href="#setup">01 · Set up</a></li><li><a href="#session">02 · Your session</a></li><li><a href="#tools">03 · Your toolkit</a></li><li><a href="#data">04 · Your data</a></li></ul>
        </section>

        <section className={styles.section} id="setup" aria-labelledby="setup-title">
          <span className={styles.eyebrow}>01 / GETTING STARTED</span><h2 id="setup-title">A little setup. A useful starting point.</h2>
          <p className={styles.lead}>Novi runs on macOS, Windows, and Linux. Here is the path from choosing a plan to opening the desktop app.</p>
          <ol className={styles.steps}>{JOURNEY.map((step, index) => <li key={step.title}><span className={styles.tag}>STEP 0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
          <div className={styles.setupNote}><KeyRound size={19} aria-hidden="true" /><p><strong>Already have an account?</strong> Connect your provider using the <Link href="/api-keys">setup guide</Link>, then <Link href="/download">download Novi</Link> and sign in with your desktop login.</p></div>
        </section>

        <section className={styles.section} id="session" aria-labelledby="session-title">
          <span className={styles.eyebrow}>02 / YOUR SESSION</span><h2 id="session-title">Context in. Clarity out.</h2>
          <p className={styles.lead}>Each session builds on the information you provide. Start with your own material, then keep the conversation connected as you go deeper.</p>
          <ol className={styles.phases}>
            <li><span className={styles.tag}>PREPARE</span><h3>Bring your background.</h3><p>Add your résumé, role description, and project notes. Set the purpose of the session and choose a conversation mode. Check your microphone, screen capture permissions, and provider connection before you begin.</p></li>
            <li><span className={styles.tag}>EXPLORE</span><h3>Ask in the way that fits.</h3><p>Type a question, attach a screenshot, or use transcribed audio. Ask for a direct answer, a deeper explanation, or a different approach. Follow-up questions stay connected to the conversation.</p></li>
            <li><span className={styles.tag}>REFINE</span><h3>Build on what you learn.</h3><p>Work through the reasoning and check the details. Revisit locally saved conversations to improve an example, review a solution, or prepare for a future session.</p></li>
          </ol>
        </section>

        <section className={styles.section} id="tools" aria-labelledby="tools-title">
          <span className={styles.eyebrow}>03 / CHOOSE YOUR TOOLS</span><h2 id="tools-title">Different questions. The right kind of help.</h2>
          <p className={styles.lead}>Use the conversation mode that fits your task, with desktop controls that keep the workspace comfortable.</p>
          <div className={styles.toolGroups}>
            <article><span className={styles.tag}>EVERY PLAN</span><h3>Conversations with substance</h3><p>Use Chat for everyday questions, Recruiter mode for introductions and role fit, Technical mode for fundamentals and project deep dives, and Behavioral mode for experience stories grounded in your notes.</p><ul><li>Résumé and document context</li><li>Screenshots and audio transcription</li><li>Local conversation history</li></ul></article>
            <article><span className={styles.tag}>PRO, PLUS &amp; LIFETIME</span><h3>Technical work, in depth</h3><p>Explore solutions and edge cases with the coding assistant. Discuss architecture and trade-offs in System Design. Select a local project to ask questions with relevant code context.</p><ul><li>Readable code and explanations</li><li>Architecture diagrams and design reasoning</li><li>Read-only project search and change proposals</li></ul></article>
          </div>
          <ul className={styles.tools}>
            <li><strong>A flexible desktop overlay</strong>Adjust transparency, position, and click-through to keep the assistant alongside your work.</li>
            <li><strong>Camera-based eye tracking</strong>Calibrate your camera so the answer HUD can respond to where you look. Recalibrate when your position or lighting changes.</li>
            <li><strong>Your phone as a companion</strong>Pair your phone to ask questions, capture the screen, and scroll answers in the desktop session.</li>
            <li><strong>Your preferred AI provider</strong>Connect a supported provider with your own API key. Provider usage is billed separately from your Novi plan.</li>
          </ul>
          <Link className={styles.textLink} href="/get-access">Compare features and device allowances <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <section className={styles.section} id="data" aria-labelledby="data-title">
          <span className={styles.eyebrow}>04 / UNDERSTAND YOUR SETUP</span><h2 id="data-title">Know where your information goes.</h2>
          <p className={styles.lead}>Local storage and provider processing serve different purposes. Here is what that means for your session.</p>
          <ul className={styles.privacy}>
            <li><HardDrive size={21} aria-hidden="true" /><span><strong>Documents and history are stored locally</strong><span>Your source documents and conversation history stay on your computer for you to revisit.</span></span></li>
            <li><Send size={21} aria-hidden="true" /><span><strong>Your selected provider processes AI requests</strong><span>Questions, attachments, and relevant context are sent to the AI provider you choose. That provider’s data policies apply to the content you send.</span></span></li>
            <li><KeyRound size={21} aria-hidden="true" /><span><strong>Your account manages access and provider keys</strong><span>Add your provider credentials and create desktop logins through your Novi account. Consultancies and staffing firms can contact sales for team licensing and setup.</span></span></li>
          </ul>
        </section>

        <section className={styles.section} id="faq" aria-labelledby="faq-title"><span className={styles.eyebrow}>GOOD TO KNOW</span><h2 id="faq-title">Before your first session.</h2><div className={styles.faq}>{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
        <section className={styles.cta}><h2>A workspace ready for your next question.</h2><p>Start with Essential, or choose the complete toolkit with Pro and above.</p><div className={styles.ctaActions}><Link className={styles.ctaPrimary} href="/get-access">Explore plans <ArrowUpRight size={16} aria-hidden="true" /></Link></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}

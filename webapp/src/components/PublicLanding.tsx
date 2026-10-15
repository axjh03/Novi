'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, AudioLines, Code2, Eye, FileText, FolderOpen, Layers, Network, ScanLine, Smartphone } from 'lucide-react';
import PublicNavbar from './PublicNavbar';
import SiteFooter from './SiteFooter';
import { JOURNEY, PLANS } from '@/lib/site';
import styles from './PublicLanding.module.css';

const features = [
  { icon: FileText, title: 'Answers with your context', text: 'Bring your résumé, the job description, and project notes into the conversation. Prepare introductions, explain your experience, and work through follow-ups with the details that matter.', label: 'Every plan' },
  { icon: AudioLines, title: 'Listening & transcription', text: 'Turn microphone or system audio into text so you can work with the question as it is asked. Choose local transcription or a supported provider to fit your setup.', label: 'Every plan' },
  { icon: ScanLine, title: 'Screenshot understanding', text: 'Capture a question, diagram, or error from your screen and attach it to the conversation. Ask about the exact problem in front of you without retyping it.', label: 'Every plan' },
  { icon: Code2, title: 'A dedicated coding assistant', text: 'Work through algorithms, SQL, and technical problems with readable code, explanations, complexity analysis, and edge cases. Continue the conversation as the requirements change.', label: 'Pro and above' },
  { icon: Network, title: 'System design, explained', text: 'Explore requirements, architecture, data flow, and failure scenarios. Turn the conversation into a diagram and understand the trade-offs behind each design choice.', label: 'Pro and above' },
  { icon: FolderOpen, title: 'Your local code, in context', text: 'Select a project folder and ask an agent to read and search the relevant files. Trace a bug, understand a dependency, or review a proposed change. Local Coding is read-only; it does not apply or run changes.', label: 'Pro and above' },
  { icon: Layers, title: 'A workspace that adapts', text: 'Adjust the desktop overlay’s transparency and click-through behavior to keep your work visible. Position the assistant where it is useful alongside your other applications.', label: 'Every plan' },
  { icon: Eye, title: 'Gaze-aware answers', text: 'Use camera-based eye tracking to bring the answer HUD closer to where you look. Calibrate it for your camera, lighting, and position before a session.', label: 'Every plan' },
  { icon: Smartphone, title: 'A connected phone companion', text: 'Pair your phone with the desktop session to ask questions, capture the screen, and scroll answers remotely. Keep session controls within reach on a second screen.', label: 'Every plan' },
];

export default function PublicLanding({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={styles.page}>
      <PublicNavbar onSignIn={onSignIn} />
      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <span className={styles.eyebrow}>THE INTERVIEW CHEAT CODE</span>
          <h1 id="landing-title">Fuck LeetCode.<br />Fuck HackerRank.<br />Fuck QA.<br /><em>We&apos;re here.</em></h1>
          <p className={styles.heroLead}>Another timed puzzle. Another technical grilling. Enough. Bring the question, a screenshot, or audio context. Novi puts AI backup on your desktop for the code, the explanation, and whatever follow-up comes next.</p>
          <div className={styles.actions}>
            <Link className={styles.primaryLink} href="/get-access">Get your backup <ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link className={styles.secondaryLink} href="/how-it-works">See how it works <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className={styles.heroMeta}><span>macOS · Windows · Linux</span><span>Bring your own AI provider</span><span>From {PLANS.essential.price} / month</span></div>
        </section>

        <section className={styles.intro} aria-labelledby="intro-title">
          <div><span className={styles.eyebrow}>YOU KNOW THE WORK</span><h2 id="intro-title">The interview grind?<br />That&apos;s another story.</h2></div>
          <p>You&apos;ve built projects, solved problems, and shipped real work. Then a timed question asks you to remember an algorithm you haven&apos;t touched in months. Novi brings your notes, audio, screenshots, and project files together so you have something useful to work with when the question lands.</p>
        </section>

        <section className={styles.features} id="features" aria-labelledby="features-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>THE TOOLKIT</span><h2 id="features-title">Purposeful features.<br />Practical help.</h2></div><p>From the first introduction to a deeper technical discussion, choose the tools that fit the task.</p></div>
          <div className={styles.featureGrid}>
            {features.map(({ icon: Icon, title, text, label }) => (
              <article className={styles.feature} key={title}>
                <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
                <h3>{title}</h3><p>{text}</p><span>{label}</span>
              </article>
            ))}
          </div>
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
          <details><summary>Which plan is right for me?</summary><p>Essential includes conversation modes, document context, screenshots, transcription, the overlay, eye tracking, and the phone companion on one device. Pro adds coding assistance, system design, and local code context. Plus includes all features on up to two devices; Lifetime includes all features on unlimited devices.</p></details>
          <details><summary>Is AI usage included in the price?</summary><p>Your plan covers Novi access. Connect your own AI provider key; any provider usage charges are separate, including on the Lifetime plan.</p></details>
          <details><summary>Can I set up Novi for my consultancy?</summary><p>Yes. Consultancies and staffing firms can contact our sales team for team licensing and account setup. You’ll find the contact details on the pricing page.</p></details>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title"><span className={styles.eyebrow}>YOUR NEXT ROUND IS COMING</span><h2 id="closing-title">Enough interview bullshit.<br />Bring Novi.</h2><p>The question lands. Your backup is already open.</p><Link className={styles.primaryLink} href="/get-access">Find your plan <ArrowUpRight size={18} aria-hidden="true" /></Link></section>
      </main>
      <SiteFooter onSignIn={onSignIn} />
    </div>
  );
}

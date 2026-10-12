import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, HardDrive, KeyRound, Laptop, Send } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { JOURNEY } from '@/lib/site';
import { SESSION_MODES } from '../../../../src/shared/sessionModes';
import styles from './how-it-works.module.css';

export const metadata: Metadata = {
  title: 'How it works — Novi',
  description: 'What Novi does before, during and after an interview, how to get set up in three steps, and how your data is handled.',
};

const faqs = [
  ['Do I need a Novi account to use the app?', 'Yes. The desktop app signs in with a desktop login, which you create in your Novi account on this website. Request access to get an account.'],
  ['Which AI providers can I use?', 'OpenAI, Anthropic (Claude), Google Gemini, and Kimi (Moonshot AI). You add your own key and pay your provider directly for what you use. See the setup guide for how to get a key.'],
  ['Can I use Novi on more than one computer?', 'Each desktop login is active on one computer at a time. Sign out on one computer to sign in on another. If the app closed unexpectedly, you can sign in elsewhere after about 90 seconds.'],
  ['What happens if my internet drops?', 'Your session stays open and your documents, history, and local transcription keep working. Getting a new AI answer needs the internet, so Novi reconnects as soon as it can.'],
  ['Are my documents uploaded to Novi?', 'No. Your documents and conversations stay on your computer. When you ask a question, the app sends it straight to the AI provider you chose.'],
  ['How do I renew or add seats?', 'Email us from the Get access page. Renewals extend your current license, and consultancies can add licenses for new people at any time.'],
];

export default function HowItWorksPage() {
  return (
    <div className={styles.page}>
      <PublicNavbar active="how-it-works" />
      <main>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>HOW IT WORKS</span>
          <h1>Your experience, ready<br /><em>when the question comes.</em></h1>
          <p>Novi is a desktop app for interviews and important conversations. You load your résumé and notes, choose the AI model you trust, and get answers grounded in your own work.</p>
          <ul className={styles.jump} aria-label="On this page">
            <li><a href="#session">A session</a></li>
            <li><a href="#setup">Getting set up</a></li>
            <li><a href="#data">Your data</a></li>
            <li><a href="#faq">Questions</a></li>
          </ul>
        </section>

        <section className={styles.section} id="session" aria-labelledby="session-title">
          <span className={styles.eyebrow}>A SESSION IN NOVI</span>
          <h2 id="session-title">Before, during, and after.</h2>
          <p className={styles.lead}>Every session follows the same rhythm, so you always know what to do next.</p>
          <ol className={styles.phases}>
            <li><span className={styles.tag}>BEFORE</span><h3>Load your context.</h3><p>Choose the folders with your résumé, project notes, and the role description, then say what the session is for. Novi reads them and confirms what it understood.</p></li>
            <li><span className={styles.tag}>DURING</span><h3>Ask in the moment.</h3><p>Type a question, let Novi listen and transcribe it, or share a screenshot. Pick the mode that fits, and shape the answer into your own words.</p></li>
            <li><span className={styles.tag}>AFTER</span><h3>Keep the thread.</h3><p>Conversations are saved on your computer. Come back to an answer, sharpen an example, or prepare for the next round.</p></li>
          </ol>
          <ul className={styles.modes} aria-label="Modes">
            {SESSION_MODES.map(mode => <li key={mode.id}><strong>{mode.name}</strong><span>{mode.description}</span></li>)}
          </ul>
          <ul className={styles.tools}>
            <li><strong>Listening and transcription</strong>Capture your microphone or system audio and turn it into text, on your computer or through your AI provider.</li>
            <li><strong>Screenshots</strong>Capture your screen and ask about what is on it.</li>
            <li><strong>Code and diagram viewer</strong>Coding answers and system design diagrams open in their own window.</li>
            <li><strong>Transparent workspace and phone companion</strong>Adjust transparency and click-through, or control a session from your phone.</li>
          </ul>
        </section>

        <section className={styles.section} id="setup" aria-labelledby="setup-title">
          <span className={styles.eyebrow}>GETTING SET UP</span>
          <h2 id="setup-title">Three steps to your first session.</h2>
          <p className={styles.lead}>Novi is available by private license, so there is no public sign-up. Here is the whole process.</p>
          <ol className={styles.steps}>
            {JOURNEY.map((step, index) => <li key={step.title}><span className={styles.tag}>STEP {index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}
          </ol>
          <div className={styles.accounts}>
            <article><h3>Individual or student</h3><p>One Novi account with one license and one desktop login.</p></article>
            <article><h3>Consultancy</h3><p>One Novi account for the team, with a license and a desktop login for each person.</p></article>
          </div>
        </section>

        <section className={styles.section} id="data" aria-labelledby="data-title">
          <span className={styles.eyebrow}>YOUR DATA</span>
          <h2 id="data-title">Private by design.</h2>
          <ul className={styles.privacy}>
            <li><HardDrive size={18} aria-hidden="true" /><span><strong>Your files stay on your computer</strong><span>Documents and conversation history are stored locally. Novi has no analytics or cloud storage.</span></span></li>
            <li><Send size={18} aria-hidden="true" /><span><strong>Questions go straight to your AI provider</strong><span>The app talks directly to the provider you chose. Its own data policy applies to what you send.</span></span></li>
            <li><KeyRound size={18} aria-hidden="true" /><span><strong>Your AI key is protected</strong><span>Keys are encrypted in your Novi account and only held in the app&apos;s memory while you are signed in.</span></span></li>
            <li><Laptop size={18} aria-hidden="true" /><span><strong>One computer per login at a time</strong><span>A desktop login works on one computer at once, so a license stays with the person it belongs to.</span></span></li>
          </ul>
        </section>

        <section className={styles.section} id="faq" aria-labelledby="faq-title">
          <span className={styles.eyebrow}>QUESTIONS</span>
          <h2 id="faq-title">Good to know.</h2>
          <div className={styles.faq}>
            {faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className={styles.cta}>
          <h2>Ready when you are.</h2>
          <p>Request access in one email, or compare plans first.</p>
          <div className={styles.ctaActions}>
            <Link className={styles.ctaPrimary} href="/get-access">Get access <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link className={styles.ctaSecondary} href="/pricing">See pricing <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

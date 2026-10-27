'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, AudioLines, Check, ChevronRight, Code2, Download, FileText, KeyRound, Layers, LockKeyhole, MessageSquare, Monitor, Network, Play, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import PublicNavbar from './PublicNavbar';
import SiteFooter from './SiteFooter';
import Testimonials from './Testimonials';
import { JOURNEY, PLANS } from '@/lib/site';
import { FEATURES } from '@/lib/features';
import styles from './PublicLanding.module.css';

const previewModes = [
  { label: 'Context', icon: FileText, feature: FEATURES[0] },
  { label: 'Code', icon: Code2, feature: FEATURES[3] },
  { label: 'Design', icon: Network, feature: FEATURES[4] },
];
const previewCode = [
  'function findPair(numbers, target) {',
  '  const seen = new Map();',
  '  for (const [i, value] of numbers.entries()) {',
  '    const match = target - value;',
  '    if (seen.has(match)) {',
  '      return [seen.get(match), i];',
  '    }',
  '    seen.set(value, i);',
  '  }',
  '}',
];
const journeyIcons = [Layers, KeyRound, Download];

function WorkspacePreview() {
  const [mode, setMode] = useState(1);
  const selected = previewModes[mode];

  return (
    <div className={styles.previewScene}>
      <div className={styles.previewHalo} aria-hidden="true" />
      <div className={styles.previewWindow}>
        <div className={styles.windowBar}>
          <span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span>
          <span>novi<span className={styles.brandDot}>.</span> <span className={styles.windowLabel}>workspace</span></span>
          <span className={styles.previewLabel}>PRODUCT PREVIEW</span>
        </div>
        <div className={styles.previewBody}>
          <div className={styles.previewRail} aria-hidden="true"><img src="/logo.svg" alt="" width={25} height={25} /><MessageSquare size={17} /><Code2 size={17} /><FileText size={17} /><span /><Monitor size={17} /></div>
          <div className={styles.previewMain}>
            <div className={styles.previewToolbar}><span><span className={styles.liveDot} />Your workspace</span><span>01 / SESSION</span></div>
            <div className={styles.previewModes} role="group" aria-label="Explore the workspace preview">
              {previewModes.map(({ label, icon: Icon }, index) => <button type="button" key={label} aria-pressed={mode === index} aria-controls="landing-preview-content" onClick={() => setMode(index)}><Icon size={14} aria-hidden="true" />{label}</button>)}
            </div>
            <div id="landing-preview-content" className={styles.previewContent} key={mode} aria-live="polite">
              <div className={styles.previewQuestion}><span>YOU</span>{mode === 1 ? 'Find two numbers that add up to a target.' : mode === 0 ? 'Help me explain my experience.' : 'Walk me through the architecture.'}</div>
              <div className={styles.previewAnswerHeading}><span className={styles.noviMark}><Sparkles size={14} aria-hidden="true" /></span><span>novi</span><span>{selected.feature.label}</span></div>
              <h3>{selected.feature.title}</h3>
              {mode === 1 ? <>
                <pre className={styles.codePreview} aria-label="Example JavaScript answer"><code>{previewCode.map((line, index) => <span className={styles.codeLine} key={index}><span aria-hidden="true">{index + 1}</span><span>{line}</span></span>)}</code></pre>
                <div className={styles.answerMeta}><span><Check size={12} aria-hidden="true" />Explanation</span><span>O(n) time</span><span>O(n) space</span></div>
              </> : mode === 0 ? <>
                <div className={styles.previewDocuments}><span><FileText size={14} aria-hidden="true" />Resume</span><span><FileText size={14} aria-hidden="true" />Project notes</span></div>
                <p className={styles.previewText}>{selected.feature.text}</p>
              </> : <>
                <div className={styles.architecture} aria-label="Illustrative architecture: client to API to database"><span>Client</span><ArrowRight size={16} aria-hidden="true" /><span>API</span><ArrowRight size={16} aria-hidden="true" /><span>Database</span></div>
                <p className={styles.previewText}>{selected.feature.text}</p>
              </>}
            </div>
            <div className={styles.previewComposer} aria-hidden="true"><Plus size={15} /><span>Ask a follow-up…</span><span><ArrowUpRight size={15} /></span></div>
          </div>
        </div>
        <div className={styles.previewFooter}><span><ShieldCheck size={12} aria-hidden="true" />Your choice of AI provider</span><span>Desktop workspace</span></div>
      </div>
      <div className={styles.contextFloat} aria-hidden="true"><span><FileText size={17} /></span><div><strong>Your context, connected.</strong><small>Resume · Notes · Screenshots</small></div><Check size={14} /></div>
      <div className={styles.audioFloat} aria-hidden="true"><AudioLines size={17} /><span>Listening & transcription</span><span className={styles.miniWave}>{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span></div>
    </div>
  );
}

export default function PublicLanding({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div className={styles.page}>
      <PublicNavbar onSignIn={onSignIn} onSignUp={onSignUp} />
      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}><span aria-hidden="true" />THE INTERVIEW CHEAT CODE<ChevronRight size={13} aria-hidden="true" /></span>
            <h1 id="landing-title">Fuck LeetCode.<br />Fuck HackerRank.<br />Fuck Assessment.<br /><em>Fuck it RAW.</em></h1>
            <p className={styles.rawMeaning}>(Random Access Wisdom)</p>
            <p className={styles.heroLead}>Novi is an AI interview cheating app. Capture a live question from your screen or audio and get answers, code, and explanations during the interview. Behavioral round, technical screen, or another surprise follow-up: get the answer when you need it.</p>
            <div className={styles.actions}>
              <Link className={styles.primaryLink} href="/#signup" onClick={event => { event.preventDefault(); onSignUp(); }}>Create your account <ArrowUpRight size={17} aria-hidden="true" /></Link>
              <Link className={styles.secondaryLink} href="/how-it-works">See how it works <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <span className={styles.heroPrice}>From <strong>{PLANS.core.price}</strong> / month</span>
          </div>
          <WorkspacePreview />
        </section>

        <section className={styles.intro} aria-labelledby="intro-title">
          <div><span className={styles.eyebrow}>YOU KNOW THE WORK</span><h2 id="intro-title">The interview grind?<br /><em>That&apos;s another story.</em></h2></div>
          <p>You&apos;ve built projects, solved problems, and shipped real work. Then a timed question asks you to remember an algorithm you haven&apos;t touched in months. Novi brings your notes, audio, screenshots, and project files together so you have something useful to work with when the question lands.</p>
        </section>

        <section className={styles.developerDemo} aria-labelledby="developer-demo-title">
          <div className={styles.demoPoster} aria-label="Developer demo video placeholder"><span className={styles.demoPlay}><Play size={32} aria-hidden="true" /></span><span>YOUTUBE · LINK COMING SOON</span><span>15 MINUTES / WITH THE DEVELOPER</span></div>
          <div><span className={styles.eyebrow}>DEMO FROM THE DEVELOPER</span><h2 id="developer-demo-title">See how Novi works.<br /><em>In 15 minutes.</em></h2><p>A planned walkthrough of the features: set up your account, add context, capture interview questions, use Listening, and get live answers and code.</p><button type="button" className={styles.demoButton} disabled>YouTube demo coming soon<Play size={15} aria-hidden="true" /></button></div>
        </section>

        <section className={styles.features} id="features" aria-labelledby="features-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>THE TOOLKIT</span><h2 id="features-title">Purposeful features.<br /><em>Practical help.</em></h2></div><p>From the first introduction to a deeper technical discussion, choose the tools that fit the task.</p></div>
          <div className={styles.featureGrid}>
            {FEATURES.slice(0, 9).map(({ icon: Icon, title, text, label }, index) => (
              <article className={styles.feature} key={title}>
                <div className={styles.featureTop}><span className={styles.featureIcon}><Icon size={22} strokeWidth={1.5} aria-hidden="true" /></span><span className={styles.planLabel}>{label}</span></div>
                <h3>{title}</h3><p>{text}</p>
                {index === 0 && <div className={styles.contextArt} aria-hidden="true"><span><FileText size={16} />Resume<Check size={12} /></span><span><FileText size={16} />Job description<Check size={12} /></span><span><FileText size={16} />Project notes<Check size={12} /></span><span className={styles.artConnector} /><span className={styles.contextCore}><Sparkles size={20} /></span></div>}
                {index === 1 && <div className={styles.waveArt} aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} />)}</div>}
                <span className={styles.featureIndex} aria-hidden="true">0{index + 1}</span>
              </article>
            ))}
          </div>
          <div className={styles.featureLinks}><Link className={styles.textLink} href="/features">Explore all {FEATURES.length} features <ArrowRight size={16} aria-hidden="true" /></Link><Link className={styles.textLink} href="/features#compare">Novi vs. Interview Coder &amp; Cluely <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        </section>

        <section className={styles.belsonQuote} aria-label="Novi parody quote from Jian Yang">
          <div className={styles.belsonPortrait}>
            <span className={styles.portraitInitials} aria-hidden="true">JY<span>Silicon Valley · parody</span></span>
            <img
              src="https://siliconvalleyism.com/images/chinese-markets.jpg"
              alt="Jian-Yang from Silicon Valley standing by a whiteboard"
              referrerPolicy="no-referrer"
              width={640}
              height={800}
              loading="lazy"
              decoding="async"
              onError={event => { event.currentTarget.hidden = true; }}
            />
            <span className={styles.portraitCaption}>VERY LEGAL. VERY GOOD.</span>
          </div>
          <figure className={styles.belsonWords}>
            <div className={styles.quoteHeader}><span className={styles.eyebrow}>JIAN YANG / CEO OF NOVI</span><span className={styles.quoteMark} aria-hidden="true">“</span></div>
            <blockquote>
              <p>“Herro. I am Jian-Yang. CEO of Novi. You spend four year learning computah science. Interviewah ask you reverse binary twee. You shit your pants. Very sad. So I make Novi. AI risten, AI write code, you just nod head like fucking genius. Google hire you. You make two hundwed thousand dollah. I make sixteen dollah. Six month later, you get fired. Not my problem. No refund. Fuck ReetCode.”</p>
            </blockquote>
            <figcaption><span className={styles.quoteAvatar} aria-hidden="true">JY</span><div><strong>Jian Yang</strong><span>CEO of Novi · <cite>Silicon Valley</cite> parody</span></div></figcaption>
          </figure>
        </section>

        <section className={styles.workflow} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>A SIMPLE START</span><h2 id="workflow-title">Your first session,<br /><em>one step at a time.</em></h2></div><Link className={styles.textLink} href="/how-it-works">The complete walkthrough <ArrowRight size={16} aria-hidden="true" /></Link></div>
          <ol className={styles.steps}>{JOURNEY.map((step, index) => { const Icon = journeyIcons[index]; return <li key={step.title}><div className={styles.stepTop}><span>0{index + 1}</span><Icon size={20} aria-hidden="true" /></div><h3>{step.title}</h3><p>{step.text}</p></li>; })}</ol>
        </section>

        <section className={styles.control} aria-labelledby="control-title">
          <div className={styles.controlIntro}><span className={styles.eyebrow}>A SETUP YOU CONTROL</span><h2 id="control-title">Your workspace.<br /><em>Your choice of AI.</em></h2><Link className={styles.textLink} href="/api-keys">Explore the setup guide <ArrowUpRight size={16} aria-hidden="true" /></Link><div className={styles.providerArt} aria-hidden="true"><span><img src="/logo.svg" width={30} height={30} alt="" />novi.</span><div><span>OpenAI</span><span>Anthropic</span><span>Gemini</span><span>Kimi</span></div></div></div>
          <div className={styles.controlList}>
            <article><span><KeyRound size={18} aria-hidden="true" /></span><div><h3>Use the provider that fits your work</h3><p>Connect a supported AI provider with your own API key. Novi access and provider usage are separate, so you pay your provider directly for the AI you use.</p></div></article>
            <article><span><FileText size={18} aria-hidden="true" /></span><div><h3>Keep a useful record</h3><p>Documents and conversation history are stored on your computer. Revisit an explanation or build on an earlier conversation when you prepare for the next session.</p></div></article>
            <article><span><LockKeyhole size={18} aria-hidden="true" /></span><div><h3>Know where your context goes</h3><p>Questions and relevant context are sent to the AI provider you select. Your provider’s data policies apply to that content.</p></div></article>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <div><span className={styles.eyebrow}>A FEW THINGS TO KNOW</span><h2 id="faq-title">Before you<br /> <em>get started.</em></h2></div>
          <div className={styles.faqItems}>
            <details><summary>Which plan is right for me?<Plus size={18} aria-hidden="true" /></summary><p>Core includes behavioral and technical modes, document context, screenshots, transcription, and the transparent overlay. Pro adds chat, recruiter mode, coding assistance, system design, and eye tracking. Ultimate adds the local coding agent and exclusive phone companion. Lifetime provides the Pro toolkit for $399.</p></details>
            <details><summary>Is AI usage included in the price?<Plus size={18} aria-hidden="true" /></summary><p>Your plan covers Novi access. Connect your own AI provider key; any provider usage charges are separate, including on the Lifetime plan.</p></details>
            <details><summary>Can I set up Novi for my consultancy?<Plus size={18} aria-hidden="true" /></summary><p>Yes. Consultancies and staffing firms can contact our sales team for team licensing and account setup. You’ll find the contact details on the pricing page.</p></details>
          </div>
        </section>

        <Testimonials />
        <section className={styles.closing} aria-labelledby="closing-title"><div><span className={styles.eyebrow}>YOUR NEXT ROUND IS COMING</span><h2 id="closing-title">Enough interview bullshit.<br /><em>Bring Novi.</em></h2><p>Live interview answers, readable code, and explanations for the follow-up. Start with the plan that fits your next round.</p></div><Link className={styles.primaryLink} href="/get-access">Find your plan <ArrowUpRight size={18} aria-hidden="true" /></Link></section>
      </main>
      <SiteFooter onSignIn={onSignIn} onSignUp={onSignUp} />
    </div>
  );
}

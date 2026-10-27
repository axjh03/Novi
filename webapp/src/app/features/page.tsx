import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, AudioLines, Check, Code2, Eye, FileText, FolderOpen, Layers, Smartphone, Sparkles, X } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { FEATURES, FEATURE_GROUPS } from '@/lib/features';
import { PLANS } from '@/lib/site';
import styles from './features.module.css';

export const metadata: Metadata = {
  title: 'Features: Live interview answers, code and audio | Novi',
  description: 'Explore Novi’s interview modes, audio, screenshots, coding, eye tracking, phone companion, and local project context. Compare Novi with four interview assistant competitors.',
};

const comparison = [
  { feature: 'Live interview assistance', novi: true, interviewCoder: true, cluely: true, finalRound: true, lockedIn: true },
  { feature: 'Audio listening / transcription', novi: true, interviewCoder: true, cluely: true, finalRound: true, lockedIn: true },
  { feature: 'Coding interview support', novi: true, interviewCoder: true, cluely: false, finalRound: true, lockedIn: true },
  { feature: 'System design support', novi: true, interviewCoder: true, cluely: false, finalRound: true, lockedIn: true },
  { feature: 'Guided practice / mock rounds', novi: true, interviewCoder: false, cluely: false, finalRound: true, lockedIn: true },
  { feature: 'Bring your own AI API key', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Local Coding mode (project-aware coding agent)', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Webcam eye tracking', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Phone controls paired to desktop session', novi: true, interviewCoder: false, cluely: false, finalRound: false, lockedIn: false },
  { feature: 'Published paid price', novi: '$16 Core · $45 Pro · $90 Ultimate/month + AI usage', interviewCoder: '$299/month · $799 lifetime', cluely: '$19.99/month Pro', finalRound: '$25+/month Pro', lockedIn: '$109.98 monthly · $39.99/month billed quarterly' },
];

export default function FeaturesPage() {
  return (
    <div className={styles.page}>
      <PublicNavbar active="features" />
      <main>
        <section className={styles.hero} aria-labelledby="features-title">
          <span className={styles.eyebrow}>LIVE INTERVIEW TOOLS</span>
          <h1 id="features-title">Cheat through the question.<br /><em>Understand the answer.</em></h1>
          <p>They brought another round. You brought the toolkit. From “tell me about yourself” to “design this entire system,” here’s what Novi puts on your desktop.</p>
          <div className={styles.actions}><a className={styles.primary} href="#all-features">Explore every feature <ArrowRight size={17} aria-hidden="true" /></a><a className={styles.secondary} href="#compare">Compare the alternatives <ArrowUpRight size={17} aria-hidden="true" /></a></div>
          <figure className={styles.loadout}>
            <div className={styles.orbit} aria-hidden="true" />
            <div className={styles.stack} aria-hidden="true">
              <div className={styles.backPanel}><FileText size={20} /><span>YOUR CONTEXT</span><strong>The resume. The role. The receipts.</strong></div>
              <div className={styles.mainPanel}>
                <div className={styles.panelBar}><span><i /><i /><i /></span><span>novi / locked in</span><Layers size={15} /></div>
                <div className={styles.panelContent}><span className={styles.live}><span />Your interview workspace</span><strong>“Okay, now explain why.”</strong><div className={styles.sampleAnswer}><Sparkles size={22} /><p>The approach. The trade-offs.<br />The follow-up you saw coming.</p></div><div className={styles.answerLines}><i /><i /><i /></div></div>
              </div>
              <div className={styles.audioChip}><AudioLines size={23} /><div><strong>Catch the question</strong><span>Mic + system audio</span></div></div>
              <div className={styles.codeChip}><Code2 size={21} /><span>Code. Explain. Refine.</span><Check size={15} /></div>
              <div className={styles.phoneChip}><Smartphone size={25} /><span>Phone<br />companion</span></div>
            </div>
            <figcaption>Illustrative workspace · Features vary by plan and setup</figcaption>
          </figure>
          <div className={styles.stats}><div><strong>{FEATURES.length}</strong><span>features to explore</span></div><div><strong>7</strong><span>session modes across plans</span></div><div><strong>3</strong><span>desktop platforms</span></div><div><strong>Your keys</strong><span>your choice of AI provider</span></div></div>
        </section>

        <section className={styles.spotlights} aria-labelledby="spotlights-title">
          <div className={styles.heading}><span className={styles.eyebrow}>YES, IT DOES THAT TOO</span><h2 id="spotlights-title">The extras go a little hard.</h2><p>Some rounds need a code explanation. Some need your screen, your notes, and your phone working together.</p></div>
          <div className={styles.spotlightGrid}>
            <article className={styles.gazeCard}>
              <div className={styles.gazeArt} aria-hidden="true"><div className={styles.gazeScreen}><span>YOUR WORKSPACE</span><i /><i /><i /><div className={styles.gazeTarget}><Eye size={22} /></div><div className={styles.gazeAnswer}><Sparkles size={16} /><span>Answer HUD<br /><strong>Closer to your gaze.</strong></span></div></div><span className={styles.artLabel}>CALIBRATE → LOOK → READ</span></div>
              <span className={styles.badge}>Pro, Ultimate &amp; Lifetime</span><h3>Your eyes have entered the chat.</h3><p>Calibrate your webcam and bring the answer HUD closer to where you look. Camera position and lighting matter; recalibrate when your setup changes.</p>
            </article>
            <article className={styles.projectCard}>
              <div className={styles.projectArt} aria-hidden="true"><div className={styles.fileCard}><FolderOpen size={22} /><strong>your-project/</strong><span>src/ · tests/ · docs/</span></div><div className={styles.diffCard}><span><Code2 size={14} /> Proposed changes</span><code><del>− repeated work</del><br /><ins>+ a clearer approach</ins><br /><ins>+ edge cases explained</ins></code></div><span className={styles.artLabel}>SNAPSHOT → QUESTION → DIFF</span></div>
              <span className={styles.badge}>Ultimate only</span><h3>Your codebase is part of the lore.</h3><p>Ask Codex, Claude, or Antigravity about a captured project. Review proposed changes and iteration diffs. Your source files stay untouched; proposals are never applied or run.</p>
            </article>
          </div>
        </section>

        <section className={styles.phoneBoard} aria-labelledby="phone-title">
          <div><span className={styles.badge}>EXCLUSIVE TO ULTIMATE</span><h2 id="phone-title">Your phone. Your session controls.</h2><p>Keep your desktop focused on the question while your phone gives you a second place to interact with Novi. Ask a follow-up, capture your desktop screen, or scroll an answer without reaching for the desktop controls.</p><Link className={styles.primary} href="/get-access?plan=ultimate">Get Ultimate · $90/month <ArrowRight size={16} /></Link></div>
          <ol><li><strong>01 · Pair your phone</strong><p>Open Phone Companion in the desktop app. Choose Same Wi-Fi and scan the QR code with your phone camera. The Anywhere option can connect through a tunnel when it is available.</p></li><li><strong>02 · Control the conversation</strong><p>Use the paired phone to ask questions, request a screen capture, and scroll through responses. The desktop session stays connected to your chosen AI provider.</p></li><li><strong>03 · Keep your focus</strong><p>Place your phone beside your monitor for accessible controls while you review a problem or practice an answer. Your desktop must remain running; the companion extends that session.</p></li></ol>
        </section>

        <section className={styles.catalog} id="all-features" aria-labelledby="catalog-title">
          <div className={styles.heading}><span className={styles.eyebrow}>NO SIDE QUEST LEFT BEHIND</span><h2 id="catalog-title">Every feature. In one place.</h2><p>Core covers behavioral and technical conversations. Pro adds coding and system design; Ultimate adds local coding and the phone companion.</p></div>
          <nav className={styles.categoryLinks} aria-label="Feature categories">{FEATURE_GROUPS.map(group => <a key={group.id} href={`#${group.id}`}>{group.id === 'context' ? 'Context & conversations' : group.id === 'technical' ? 'Technical toolkit' : group.id === 'control' ? 'Desktop controls' : 'Setup & daily use'} <ArrowRight size={14} aria-hidden="true" /></a>)}</nav>
          {FEATURE_GROUPS.map(group => (
            <section className={styles.group} key={group.id} id={group.id} aria-labelledby={`${group.id}-title`}>
              <div className={styles.groupHeading}><h3 id={`${group.id}-title`}>{group.title}</h3><p>{group.description}</p></div>
              <div className={styles.featureGrid}>{FEATURES.filter(feature => feature.group === group.id).map(({ icon: Icon, title, text, label }) => <article className={styles.feature} key={title}><span className={styles.featureIcon}><Icon size={23} strokeWidth={1.5} aria-hidden="true" /></span><h4>{title}</h4><p>{text}</p><span className={styles.featurePlan}>{label}</span></article>)}</div>
            </section>
          ))}
        </section>

        <section className={styles.comparison} id="compare" aria-labelledby="compare-title">
          <div className={styles.heading}><span className={styles.eyebrow}>SIDE-BY-SIDE FEATURE CHECK</span><h2 id="compare-title">Novi and four interview tools.</h2><p>Same checklist for every product: interview help, coding, practice, and the tools that make Novi different.</p><p className={styles.comparisonJoke}>They might look and feel pretty. Be real: after you secure the job, would you rather feel a pretty app, or feel a pretty wife?</p></div>
          <p className={styles.scrollHint}>Scroll horizontally to see all four competitors <ArrowRight size={15} aria-hidden="true" /></p>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Feature comparison of Novi and four competitors; scroll horizontally on smaller screens">
            <table><caption>Published product features and USD prices · Reviewed October 15, 2026</caption><thead><tr><th scope="col">Feature</th><th scope="col">Novi<span className={styles.tableBadge}>Included in Novi</span></th><th scope="col"><a href="https://www.interviewcoder.co/" target="_blank" rel="noreferrer">Interview Coder <ArrowUpRight size={13} aria-hidden="true" /></a></th><th scope="col"><a href="https://cluely.com/pricing" target="_blank" rel="noreferrer">Cluely <ArrowUpRight size={13} aria-hidden="true" /></a></th><th scope="col"><a href="https://www.finalroundai.com/interview-copilot" target="_blank" rel="noreferrer">Final Round AI <ArrowUpRight size={13} aria-hidden="true" /></a></th><th scope="col"><a href="https://www.lockedinai.com/" target="_blank" rel="noreferrer">LockedIn AI <ArrowUpRight size={13} aria-hidden="true" /></a></th></tr></thead><tbody>{comparison.map(row => <tr key={row.feature}><th scope="row">{row.feature}</th>{(['novi', 'interviewCoder', 'cluely', 'finalRound', 'lockedIn'] as const).map(key => { const value = row[key]; return <td key={key}>{typeof value === 'boolean' ? <span className={value ? styles.yes : styles.no} aria-label={value ? 'Listed' : 'Not listed'} title={value ? 'Listed in public product information' : 'Not listed in reviewed public product information'}>{value ? <Check size={18} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}</span> : value}</td>; })}</tr>)}</tbody></table>
          </div>
          <p className={styles.sourceNote}>Sources: <a href="https://www.interviewcoder.co/" target="_blank" rel="noreferrer">Interview Coder</a>, <a href="https://cluely.com/pricing" target="_blank" rel="noreferrer">Cluely</a>, <a href="https://www.finalroundai.com/interview-copilot" target="_blank" rel="noreferrer">Final Round AI</a>, and <a href="https://www.lockedinai.com/pricing" target="_blank" rel="noreferrer">LockedIn AI</a>. ✓ means a feature is publicly listed; × means we didn’t find it in reviewed product information, not proof it is unavailable. Prices can change; LockedIn’s lower monthly equivalent is billed quarterly. Novi plans exclude separately billed AI provider usage.</p>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title"><span className={styles.eyebrow}>MAIN QUEST: GET THE BAG</span><h2 id="closing-title">Get the answer.<br />Handle the follow-up.</h2><p>Core starts at {PLANS.core.price}/month. Pro starts at {PLANS.pro.price}/month with the full technical toolkit. AI provider usage is separate.</p><div className={styles.actions}><Link className={styles.primary} href="/get-access">Choose your plan <ArrowUpRight size={17} aria-hidden="true" /></Link><Link className={styles.secondary} href="/how-it-works">See it in action <ArrowRight size={17} aria-hidden="true" /></Link></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}

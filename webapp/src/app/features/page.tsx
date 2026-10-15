import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, AudioLines, Check, Code2, Eye, FileText, FolderOpen, Layers, Network, Smartphone, Sparkles } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { FEATURES, FEATURE_GROUPS } from '@/lib/features';
import { PLANS } from '@/lib/site';
import styles from './features.module.css';

export const metadata: Metadata = {
  title: 'Features — Your interview loadout | Novi',
  description: 'Explore Novi’s interview modes, audio, screenshots, coding, eye tracking, phone companion, and local project context. Compare Novi with Interview Coder and Cluely.',
};

const comparison = [
  { feature: 'Main workflow', novi: 'Seven session modes, from recruiter calls to local code questions.', interviewCoder: 'Live interview assistance, including coding and system design.', cluely: 'Live meeting answers, transcripts, and meeting notes.' },
  { feature: 'AI access & billing', novi: 'Bring your own provider keys; AI usage billed separately.', interviewCoder: 'AI models included in paid access; monthly plan lists 1,000 usage credits.', cluely: 'Bundled AI; limited free access and unlimited responses on Pro.' },
  { feature: 'Camera-based eye tracking', novi: 'Calibrated webcam tracking with a gaze-aware answer HUD.', interviewCoder: 'Not described on the reviewed product page.', cluely: 'Describes a manually movable window; camera calibration is not described.' },
  { feature: 'Working with your codebase', novi: 'Read-only project snapshots, agent questions, proposed edits, and diff views.', interviewCoder: 'Coding and system design help; project snapshot/diff workflow not described.', cluely: 'Screen-aware answers; project snapshot/diff workflow not described.' },
  { feature: 'Phone workflow', novi: 'Pair a phone to control your desktop session, capture the screen, and ask questions.', interviewCoder: 'Paired phone controls not described on the reviewed product page.', cluely: 'Offers a mobile app; paired desktop remote controls not described.' },
  { feature: 'Published paid entry price', novi: `${PLANS.essential.price}/month + provider usage. ${PLANS.lifetime.price} lifetime option.`, interviewCoder: '$299/month. $799 lifetime option.', cluely: '$19.99/month Pro. A free tier is also available.' },
  { feature: 'Screen sharing', novi: 'Transparent mode enables OS capture protection. Check your OS and sharing setup.', interviewCoder: 'Advertises screen-share protection in paid interview plans.', cluely: 'Lists screen-share protection in Pro + Undetectability at $149.99/month.' },
];

export default function FeaturesPage() {
  return (
    <div className={styles.page}>
      <PublicNavbar active="features" />
      <main>
        <section className={styles.hero} aria-labelledby="features-title">
          <span className={styles.eyebrow}>THE WHOLE LOADOUT</span>
          <h1 id="features-title">Your interview backup.<br /><em>Absolutely stacked.</em></h1>
          <p>They brought another round. You brought the toolkit. From “tell me about yourself” to “design this entire system,” here’s what Novi puts on your desktop.</p>
          <div className={styles.actions}><a className={styles.primary} href="#all-features">Explore every feature <ArrowRight size={17} aria-hidden="true" /></a><a className={styles.secondary} href="#compare">Compare the alternatives <ArrowUpRight size={17} aria-hidden="true" /></a></div>
          <figure className={styles.loadout}>
            <div className={styles.orbit} aria-hidden="true" />
            <div className={styles.stack} aria-hidden="true">
              <div className={styles.backPanel}><FileText size={20} /><span>YOUR CONTEXT</span><strong>The résumé. The role. The receipts.</strong></div>
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
              <span className={styles.badge}>Every plan</span><h3>Your eyes have entered the chat.</h3><p>Calibrate your webcam and bring the answer HUD closer to where you look. Camera position and lighting matter; recalibrate when your setup changes.</p>
            </article>
            <article className={styles.projectCard}>
              <div className={styles.projectArt} aria-hidden="true"><div className={styles.fileCard}><FolderOpen size={22} /><strong>your-project/</strong><span>src/ · tests/ · docs/</span></div><div className={styles.diffCard}><span><Code2 size={14} /> Proposed changes</span><code><del>− repeated work</del><br /><ins>+ a clearer approach</ins><br /><ins>+ edge cases explained</ins></code></div><span className={styles.artLabel}>SNAPSHOT → QUESTION → DIFF</span></div>
              <span className={styles.badge}>Pro, Plus &amp; Lifetime</span><h3>Your codebase is part of the lore.</h3><p>Ask Codex, Claude, or Antigravity about a captured project. Review proposed changes and iteration diffs. Your source files stay untouched; proposals are never applied or run.</p>
            </article>
          </div>
        </section>

        <section className={styles.catalog} id="all-features" aria-labelledby="catalog-title">
          <div className={styles.heading}><span className={styles.eyebrow}>NO SIDE QUEST LEFT BEHIND</span><h2 id="catalog-title">Every feature. In one place.</h2><p>Start with the core toolkit. Pro and above unlock coding, system design, and local project assistance.</p></div>
          <nav className={styles.categoryLinks} aria-label="Feature categories">{FEATURE_GROUPS.map(group => <a key={group.id} href={`#${group.id}`}>{group.id === 'context' ? 'Context & conversations' : group.id === 'technical' ? 'Technical toolkit' : group.id === 'control' ? 'Desktop controls' : 'Setup & daily use'} <ArrowRight size={14} aria-hidden="true" /></a>)}</nav>
          {FEATURE_GROUPS.map(group => (
            <section className={styles.group} key={group.id} id={group.id} aria-labelledby={`${group.id}-title`}>
              <div className={styles.groupHeading}><h3 id={`${group.id}-title`}>{group.title}</h3><p>{group.description}</p></div>
              <div className={styles.featureGrid}>{FEATURES.filter(feature => feature.group === group.id).map(({ icon: Icon, title, text, label }) => <article className={styles.feature} key={title}><span className={styles.featureIcon}><Icon size={23} strokeWidth={1.5} aria-hidden="true" /></span><h4>{title}</h4><p>{text}</p><span className={styles.featurePlan}>{label}</span></article>)}</div>
            </section>
          ))}
        </section>

        <section className={styles.comparison} id="compare" aria-labelledby="compare-title">
          <div className={styles.heading}><span className={styles.eyebrow}>SHOW ME THE DIFFERENCE</span><h2 id="compare-title">Novi vs. Interview Coder vs. Cluely.</h2><p>Novi brings your own AI provider, calibrated eye tracking, a paired phone companion, and a read-only project workflow into one interview workspace. Here’s how that compares with their published offerings.</p></div>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Product comparison, scroll horizontally on smaller screens">
            <table><caption>Published product features and USD pricing · Reviewed October 15, 2026</caption><thead><tr><th scope="col">What matters</th><th scope="col">novi<span className={styles.tableBadge}>Your loadout</span></th><th scope="col"><a href="https://www.interviewcoder.co/" target="_blank" rel="noreferrer">Interview Coder <ArrowUpRight size={13} aria-hidden="true" /></a></th><th scope="col"><a href="https://cluely.com/" target="_blank" rel="noreferrer">Cluely <ArrowUpRight size={13} aria-hidden="true" /></a></th></tr></thead><tbody>{comparison.map(row => <tr key={row.feature}><th scope="row">{row.feature}</th><td>{row.novi}</td><td>{row.interviewCoder}</td><td>{row.cluely}</td></tr>)}</tbody></table>
          </div>
          <p className={styles.sourceNote}>Sources: <a href="https://www.interviewcoder.co/" target="_blank" rel="noreferrer">Interview Coder’s product &amp; pricing page</a>, <a href="https://cluely.com/" target="_blank" rel="noreferrer">Cluely’s product page</a>, and <a href="https://cluely.com/pricing" target="_blank" rel="noreferrer">Cluely’s pricing page</a>. “Not described” means the feature wasn’t documented on these pages. These are published claims, not an independent performance test. Monthly prices use monthly billing and can change. Novi provider charges are additional.</p>
          <div className={styles.difference}><Network size={26} aria-hidden="true" /><div><h3>The Novi difference: more of your setup, under your control.</h3><p>Bring your context, pick your provider, choose your screen, and connect your phone. Local transcription and local history are available; AI requests and relevant context are still sent to your chosen provider.</p></div></div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title"><span className={styles.eyebrow}>MAIN QUEST: GET THE BAG</span><h2 id="closing-title">Pick the loadout.<br />Bring the backup.</h2><p>Essential starts at {PLANS.essential.price}/month. Pro starts at {PLANS.pro.price}/month with the full technical toolkit. AI provider usage is separate.</p><div className={styles.actions}><Link className={styles.primary} href="/get-access">Choose your plan <ArrowUpRight size={17} aria-hidden="true" /></Link><Link className={styles.secondary} href="/how-it-works">See it in action <ArrowRight size={17} aria-hidden="true" /></Link></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}

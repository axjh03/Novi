'use client';

import Link from 'next/link';
import { CONTACT_EMAIL, INSTAGRAM_URL, SITE_LINKS } from '@/lib/site';
import styles from './SiteFooter.module.css';

// The name closes the page as a construction: each letter knocked out of its own block.
const blocks: { letter: string; tone: string; height: string }[] = [
  { letter: 'n', tone: 'wine', height: '100%' },
  { letter: 'o', tone: 'rose', height: '74%' },
  { letter: 'v', tone: 'paper', height: '88%' },
  { letter: 'i', tone: 'wine', height: '64%' },
  { letter: '.', tone: 'rose', height: '34%' },
];

// On the home page, sign-in is a screen switch rather than a navigation, so the page passes it in.
export default function SiteFooter({ onSignIn, onSignUp }: { onSignIn?: () => void; onSignUp?: () => void }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.mark} role="img" aria-label="novi.">
        {blocks.map(block => <span key={block.letter} className={`${styles.block} ${styles[block.tone as keyof typeof styles]}`} style={{ height: block.height }} aria-hidden="true">{block.letter}</span>)}
      </div>
      <div className={styles.columns}>
        <nav className={styles.column} aria-label="Product">
          <h2>Product</h2>
          {SITE_LINKS.filter(link => ['features', 'how-it-works', 'download'].includes(link.id)).map(link => <Link key={link.id} href={link.href}>{link.label}</Link>)}
          <Link href="/get-access">Pricing &amp; plans</Link>
        </nav>
        <nav className={styles.column} aria-label="Help">
          <h2>Help</h2>
          <Link href="/api-keys">Setup guide</Link>
          <Link href="/referral">Referrals</Link>
          <Link href="/get-access#consultancies">Teams and consultancies</Link>
        </nav>
        <nav className={styles.column} aria-label="Account">
          <h2>Account</h2>
          <Link href="/#signup" onClick={event => { if (onSignUp) { event.preventDefault(); onSignUp(); } }}>Create an individual account</Link>
          {onSignIn ? <Link href="/#signin" onClick={event => { event.preventDefault(); onSignIn(); }}>Account sign in</Link> : <Link href="/#signin">Account sign in</Link>}
        </nav>
        <div className={styles.contact}>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Instagram @getnoviapp</a>
          <p>macOS · Windows · Linux. Bring your own AI key.</p>
        </div>
      </div>
      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} Novi. All rights reserved.</p>
        <Link href="/download" className={styles.small}>Download Novi</Link>
      </div>
    </footer>
  );
}

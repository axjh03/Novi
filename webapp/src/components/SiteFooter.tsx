import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { CONTACT_EMAIL, INSTAGRAM_URL, SITE_LINKS } from '@/lib/site';
import styles from './SiteFooter.module.css';

// On the home page, sign-in is a screen switch rather than a navigation, so the page passes it in.
export default function SiteFooter({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <Link href="/" className={styles.brand}>
            <Image src="/logo.svg" width={32} height={32} alt="" style={{ borderRadius: 8 }} />
            <span>novi<span className={styles.dot}>.</span></span>
          </Link>
          <p className={styles.tagline}>Your context. A clearer next step.</p>
          <p className={styles.description}>An AI workspace for interview preparation, coding, and the questions that come next.</p>
        </div>
        <nav className={styles.column} aria-label="Product">
          <h2>Explore</h2>
          {SITE_LINKS.map(link => <Link key={link.id} href={link.href}>{link.label}</Link>)}
        </nav>
        <nav className={styles.column} aria-label="Get started">
          <h2>Get started</h2>
          <Link href="/get-access">Pricing & plans</Link>
          {onSignIn ? <Link href="/#signin" onClick={event => { event.preventDefault(); onSignIn(); }}>Account sign in</Link> : <Link href="/#signin">Account sign in</Link>}
        </nav>
        <div className={styles.column}>
          <h2>Let’s talk</h2>
          <a href={`mailto:${CONTACT_EMAIL}`}><span>{CONTACT_EMAIL}</span><ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><span>Instagram @getnoviapp</span><ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </div>
      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} Novi. All rights reserved.</p>
        <p>macOS · Windows · Linux</p>
        <p>Available by private license.</p>
      </div>
    </footer>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import { CONTACT_EMAIL, INSTAGRAM_URL, SITE_LINKS } from '@/lib/site';
import styles from './SiteFooter.module.css';

// On the home page, sign-in is a screen switch rather than a navigation, so the page passes it in.
export default function SiteFooter({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <Link href="/" className={styles.brand} style={{ color: 'inherit', textDecoration: 'none' }}>
            <Image src="/logo.svg" width={26} height={26} alt="" style={{ borderRadius: 7 }} />
            <span>novi<span className={styles.dot}>.</span></span>
          </Link>
          <p className={styles.tagline}>Less interview bullshit. More backup.</p>
        </div>
        <nav className={styles.column} aria-label="Product">
          <h2>PRODUCT</h2>
          {SITE_LINKS.map(link => <Link key={link.id} href={link.href}>{link.label}</Link>)}
        </nav>
        <nav className={styles.column} aria-label="Get started">
          <h2>GET STARTED</h2>
          <Link href="/get-access">Get access</Link>
          {onSignIn ? <Link href="/#signin" onClick={event => { event.preventDefault(); onSignIn(); }}>Sign in to your account</Link> : <Link href="/#signin">Sign in to your account</Link>}
        </nav>
        <div className={styles.column}>
          <h2>CONTACT</h2>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Instagram @getnoviapp</a>
        </div>
      </div>
      <p className={styles.bottom}>Novi is available by private license.</p>
    </footer>
  );
}

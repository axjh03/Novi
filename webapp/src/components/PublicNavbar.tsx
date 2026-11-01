'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { type SiteLinkId } from '@/lib/site';

// The plain bar: wordmark, four links, one action. Referrals and the setup guide live in the footer.
const navigationLinks = [
  { id: 'features', href: '/features', label: 'Features' },
  { id: 'how-it-works', href: '/how-it-works', label: 'How it works' },
  { id: 'get-access', href: '/get-access', label: 'Pricing' },
  { id: 'download', href: '/download', label: 'Download' },
] as const satisfies readonly { id: SiteLinkId; href: string; label: string }[];

export interface PublicNavbarProps {
  active?: SiteLinkId;
  onSignIn?: () => void;
  onSignUp?: () => void;
}

export default function PublicNavbar({ active, onSignIn, onSignUp }: PublicNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [menuOpen]);

  const signIn = onSignIn
    ? <button type="button" className="public-nav-signin" onClick={() => { closeMenu(); onSignIn(); }}>Log in</button>
    : <Link href="/#signin" className="public-nav-signin" onClick={closeMenu}>Log in</Link>;
  const signUp = onSignUp
    ? <button type="button" className="public-nav-action" onClick={() => { closeMenu(); onSignUp(); }}>Sign up</button>
    : <Link href="/#signup" className="public-nav-action" onClick={closeMenu}>Sign up</Link>;

  return (
    <header className="public-nav-shell">
      <nav className="public-nav" aria-label="Main">
        <Link href="/" className="public-brand" onClick={event => { closeMenu(); if (location.pathname === '/') event.preventDefault(); }}>
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span>novi<span className="brand-dot">.</span></span>
        </Link>
        <div className="public-nav-links">
          {navigationLinks.map(link => (
            <Link key={link.id} href={link.href} className="public-nav-item" aria-current={active === link.id ? 'page' : undefined}>{link.label}</Link>
          ))}
        </div>
        <div className="public-nav-auth">{signIn}{signUp}</div>
        <button type="button" className="mobile-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="public-mobile-menu" onClick={() => setMenuOpen(open => !open)}>
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}<span>Menu</span>
        </button>
      </nav>
      {menuOpen && (
        <div id="public-mobile-menu" className="mobile-nav-sheet">
          {navigationLinks.map(link => (
            <Link key={link.id} href={link.href} onClick={closeMenu} className="mobile-nav-item" aria-current={active === link.id ? 'page' : undefined}>{link.label}</Link>
          ))}
          <Link href="/referral" onClick={closeMenu} className="mobile-nav-item">Referrals</Link>
          <Link href="/api-keys" onClick={closeMenu} className="mobile-nav-item">Setup guide</Link>
          <div className="mobile-nav-auth">{signIn}{signUp}</div>
        </div>
      )}
    </header>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Download, Gift, KeyRound, Layers, Menu, UserRound, X } from 'lucide-react';
import { SITE_LINKS, type SiteLinkId } from '@/lib/site';

const navigationIcons = { features: Layers, 'how-it-works': BookOpen, download: Download, referral: Gift, 'setup-guide': KeyRound };

export interface PublicNavbarProps {
  active?: SiteLinkId;
  onSignIn?: () => void;
}

export default function PublicNavbar({ active, onSignIn }: PublicNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  // Sign-in is for Novi account owners; the main action for everyone else is requesting access.
  const signIn = (mobile: boolean) => onSignIn ? (
    <button type="button" className="public-nav-signin public-nav-item" aria-label="Sign in" onClick={() => { closeMenu(); onSignIn(); }} style={mobile ? { padding: '10px 12px', fontSize: 15, textAlign: 'left' } : undefined}><UserRound size={17} aria-hidden="true" /><span className="public-nav-text">Sign in</span></button>
  ) : (
    <Link href="/#signin" className="public-nav-signin public-nav-item" aria-label="Sign in" onClick={closeMenu} style={mobile ? { padding: '10px 12px', fontSize: 15 } : undefined}><UserRound size={17} aria-hidden="true" /><span className="public-nav-text">Sign in</span></Link>
  );

  return (
    <header className="public-nav-shell">
      <nav className="public-nav" aria-label="Main">
        <Link href="/" className="brand" onClick={closeMenu} style={{ textDecoration: 'none', color: 'inherit' }}>
          <img
            src="/logo.svg"
            alt="Novi"
            width={32}
            height={32}
            style={{ borderRadius: 8, objectFit: 'contain' }}
          />
          novi<span className="brand-dot">.</span>
        </Link>

        {/* Desktop Links */}
        <div className="public-nav-links">
          {SITE_LINKS.map(link => { const Icon = navigationIcons[link.id]; return (
            <Link
              key={link.id}
              href={link.href}
              className="public-nav-item"
              aria-label={link.label}
              aria-current={active === link.id ? 'page' : undefined}
              style={{
                textDecoration: 'none',
                color: active === link.id ? 'var(--ink)' : 'inherit',
                fontWeight: active === link.id ? 600 : 400,
              }}
            >
              <Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span className="public-nav-text">{link.label}</span>
            </Link>
          ); })}
          {signIn(false)}
          <Link href="/get-access" className="btn dark" aria-current={active === 'get-access' ? 'page' : undefined} style={{ textDecoration: 'none' }}>
            Pricing & plans <ArrowUpRight size={15} />
          </Link>
        </div>

        {/* Mobile Burger Toggle Button */}
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? 'public-mobile-menu' : undefined}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile Drawer Navigation Menu */}
      {menuOpen && (
        <div
          id="public-mobile-menu"
          className="mobile-nav-drawer"
        >
          {SITE_LINKS.map(link => { const Icon = navigationIcons[link.id]; return (
            <Link
              key={link.id}
              href={link.href}
              onClick={closeMenu}
              className="public-nav-item"
              aria-label={link.label}
              aria-current={active === link.id ? 'page' : undefined}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                color: active === link.id ? 'var(--accent)' : 'var(--ink)',
                fontWeight: active === link.id ? 600 : 500,
                background: active === link.id ? 'var(--accent-soft)' : 'transparent',
                fontSize: 15,
              }}
            >
              <Icon size={17} strokeWidth={1.7} aria-hidden="true" /><span className="public-nav-text">{link.label}</span>
            </Link>
          ); })}
          {signIn(true)}

          <div style={{ paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <Link
              href="/get-access"
              onClick={closeMenu}
              className="btn dark full"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px 16px',
                fontSize: 14,
                display: 'inline-flex',
                textDecoration: 'none',
              }}
            >
              Pricing & plans <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

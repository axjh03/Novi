'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, CreditCard, Download, Gift, KeyRound, Layers, Menu, X } from 'lucide-react';
import { SITE_LINKS, type SiteLinkId } from '@/lib/site';

const navigationIcons = { features: Layers, 'how-it-works': BookOpen, download: Download, referral: Gift, 'setup-guide': KeyRound, 'get-access': CreditCard };
const navigationLinks = [...SITE_LINKS, { id: 'get-access', href: '/get-access', label: 'Pricing & plans' }] as const;

export interface PublicNavbarProps {
  active?: SiteLinkId;
  onSignIn?: () => void;
  onSignUp?: () => void;
}

export default function PublicNavbar({ active, onSignIn, onSignUp }: PublicNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const signIn = (mobile: boolean) => onSignIn ? (
    <button type="button" className={`btn${mobile ? ' full' : ''}`} onClick={() => { closeMenu(); onSignIn(); }}>Log in</button>
  ) : (
    <Link href="/#signin" className={`btn${mobile ? ' full' : ''}`} onClick={closeMenu}>Log in</Link>
  );
  const signUp = (mobile: boolean) => onSignUp ? (
    <button type="button" className={`btn dark${mobile ? ' full' : ''}`} onClick={() => { closeMenu(); onSignUp(); }}>Sign up<ArrowUpRight size={15} aria-hidden="true" /></button>
  ) : (
    <Link href="/#signup" className={`btn dark${mobile ? ' full' : ''}`} onClick={closeMenu}>Sign up<ArrowUpRight size={15} aria-hidden="true" /></Link>
  );

  return (
    <header className="public-nav-shell">
      <nav className="public-nav" aria-label="Main">
        <Link href="/" className="brand" onClick={event => { closeMenu(); if (location.pathname === '/') event.preventDefault(); }} style={{ textDecoration: 'none', color: 'inherit' }}>
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
          {navigationLinks.map(link => { const Icon = navigationIcons[link.id]; return (
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
          {signUp(false)}
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
          {navigationLinks.map(link => { const Icon = navigationIcons[link.id]; return (
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
          <div className="public-nav-auth">{signIn(true)}{signUp(true)}</div>
        </div>
      )}
    </header>
  );
}

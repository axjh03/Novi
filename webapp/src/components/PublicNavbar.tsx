'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { SITE_LINKS, type SiteLinkId } from '@/lib/site';

export interface PublicNavbarProps {
  active?: SiteLinkId;
  onSignIn?: () => void;
}

export default function PublicNavbar({ active, onSignIn }: PublicNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  // Sign-in is for Novi account owners; the main action for everyone else is requesting access.
  const signIn = (mobile: boolean) => onSignIn ? (
    <button type="button" className="public-nav-signin" onClick={() => { closeMenu(); onSignIn(); }} style={mobile ? { padding: '10px 12px', fontSize: 15, textAlign: 'left' } : undefined}>Sign in</button>
  ) : (
    <Link href="/#signin" className="public-nav-signin" onClick={closeMenu} style={mobile ? { padding: '10px 12px', fontSize: 15 } : undefined}>Sign in</Link>
  );

  return (
    <header style={{
      width: '100%',
      background: 'rgba(255, 255, 255, 0.98)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid #eaeaea',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <nav className="public-nav" aria-label="Main" style={{ width: '100%', boxSizing: 'border-box' }}>
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
          {SITE_LINKS.map(link => (
            <Link
              key={link.id}
              href={link.href}
              aria-current={active === link.id ? 'page' : undefined}
              style={{
                textDecoration: 'none',
                color: active === link.id ? '#111' : 'inherit',
                fontWeight: active === link.id ? 600 : 400,
              }}
            >
              {link.label}
            </Link>
          ))}
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
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            background: 'none',
            border: '1px solid #e2e2e2',
            borderRadius: 7,
            padding: 8,
            cursor: 'pointer',
            color: '#111',
            display: 'none', // controlled via CSS media query
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile Drawer Navigation Menu */}
      {menuOpen && (
        <div
          className="mobile-nav-drawer"
          style={{
            borderTop: '1px solid #eaeaea',
            background: '#ffffff',
            padding: '16px 20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 12px 24px rgba(0,0,0,0.06)',
          }}
        >
          {SITE_LINKS.map(link => (
            <Link
              key={link.id}
              href={link.href}
              onClick={closeMenu}
              aria-current={active === link.id ? 'page' : undefined}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                color: active === link.id ? '#111' : '#444',
                fontWeight: active === link.id ? 600 : 500,
                background: active === link.id ? '#f4f4f4' : 'transparent',
                fontSize: 15,
              }}
            >
              {link.label}
            </Link>
          ))}
          {signIn(true)}

          <div style={{ paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
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

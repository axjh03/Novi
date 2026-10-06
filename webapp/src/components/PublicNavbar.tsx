'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';

export interface PublicNavbarProps {
  active?: 'download' | 'how-it-works' | 'api-keys' | 'license';
  onSignIn?: () => void;
}

export default function PublicNavbar({ active, onSignIn }: PublicNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

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
      <nav className="public-nav" style={{ width: '100%', boxSizing: 'border-box' }}>
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
          <Link
            href="/download"
            style={{
              textDecoration: 'none',
              color: active === 'download' ? '#111' : 'inherit',
              fontWeight: active === 'download' ? 600 : 400,
            }}
          >
            Download
          </Link>

          <Link
            href="/how-it-works"
            style={{
              textDecoration: 'none',
              color: active === 'how-it-works' ? '#111' : 'inherit',
              fontWeight: active === 'how-it-works' ? 600 : 400,
            }}
          >
            How It Works
          </Link>

          <Link
            href="/api-keys"
            style={{
              textDecoration: 'none',
              color: active === 'api-keys' ? '#111' : 'inherit',
              fontWeight: active === 'api-keys' ? 600 : 400,
            }}
          >
            API Guide
          </Link>

          <Link
            href="/license"
            style={{
              textDecoration: 'none',
              color: active === 'license' ? '#111' : 'inherit',
              fontWeight: active === 'license' ? 600 : 400,
            }}
          >
            Private License
          </Link>

          {onSignIn ? (
            <button
              type="button"
              className="btn dark"
              onClick={onSignIn}
              style={{ textDecoration: 'none', cursor: 'pointer' }}
            >
              Sign in <ArrowUpRight size={15} />
            </button>
          ) : (
            <Link
              href="/#signin"
              className="btn dark"
              style={{ textDecoration: 'none' }}
            >
              Sign in <ArrowUpRight size={15} />
            </Link>
          )}
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
          <Link
            href="/download"
            onClick={closeMenu}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              color: active === 'download' ? '#111' : '#444',
              fontWeight: active === 'download' ? 600 : 500,
              background: active === 'download' ? '#f4f4f4' : 'transparent',
              fontSize: 15,
            }}
          >
            Download
          </Link>

          <Link
            href="/how-it-works"
            onClick={closeMenu}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              color: active === 'how-it-works' ? '#111' : '#444',
              fontWeight: active === 'how-it-works' ? 600 : 500,
              background: active === 'how-it-works' ? '#f4f4f4' : 'transparent',
              fontSize: 15,
            }}
          >
            How It Works
          </Link>

          <Link
            href="/api-keys"
            onClick={closeMenu}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              color: active === 'api-keys' ? '#111' : '#444',
              fontWeight: active === 'api-keys' ? 600 : 500,
              background: active === 'api-keys' ? '#f4f4f4' : 'transparent',
              fontSize: 15,
            }}
          >
            API Guide
          </Link>

          <Link
            href="/license"
            onClick={closeMenu}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              color: active === 'license' ? '#111' : '#444',
              fontWeight: active === 'license' ? 600 : 500,
              background: active === 'license' ? '#f4f4f4' : 'transparent',
              fontSize: 15,
            }}
          >
            Private License
          </Link>

          <div style={{ paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
            {onSignIn ? (
              <button
                type="button"
                className="btn dark full"
                onClick={() => {
                  closeMenu();
                  onSignIn();
                }}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px 16px',
                  fontSize: 14,
                }}
              >
                Sign in <ArrowUpRight size={16} />
              </button>
            ) : (
              <Link
                href="/#signin"
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
                Sign in <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export interface PublicNavbarProps {
  active?: 'download' | 'how-it-works' | 'api-keys' | 'license';
  onSignIn?: () => void;
}

export default function PublicNavbar({ active, onSignIn }: PublicNavbarProps) {
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
        <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <img
            src="/logo.svg"
            alt="Novi"
            width={32}
            height={32}
            style={{ borderRadius: 8, objectFit: 'contain' }}
          />
          novi<span className="brand-dot">.</span>
        </Link>

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
      </nav>
    </header>
  );
}

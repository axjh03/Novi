import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Check, Copy, KeyRound, Lock, Mail, Shield, Sparkles, Building2, UserCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Private License — Novi',
  description: 'Novi is available exclusively via private license. Contact getnoviapp@outlook.com to request access.',
};

export default function LicensePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--paper, #f7f7f7)',
      color: 'var(--ink, #1f1f1f)',
      fontFamily: 'Arial, Helvetica, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top Navigation */}
      <header style={{
        maxWidth: 1240,
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 32px',
        borderBottom: '1px solid #e5e5e5',
      }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
          <img src="/logo.svg" alt="Novi" width={32} height={32} style={{ borderRadius: 8 }} />
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.8px' }}>novi<span style={{ color: '#888' }}>.</span></span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 13 }}>
          <Link href="/" style={{ color: '#666', textDecoration: 'none' }}>Home</Link>
          <Link href="/download" style={{ color: '#666', textDecoration: 'none' }}>Download</Link>
          <Link href="/license" style={{ color: '#111', fontWeight: 600, textDecoration: 'none' }}>License</Link>
          <Link href="/#signin" style={{
            background: '#242424',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 7,
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            Sign In <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 840, width: '100%', margin: '0 auto', padding: '60px 24px 90px', flex: 1 }}>
        {/* Header Header */}
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 14px',
            background: '#ededed',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            color: '#555',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            <Lock size={12} color="#444" /> Private License Only
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-1.5px', margin: '0 0 16px', lineHeight: 1.15 }}>
            Novi Private Licensing
          </h1>
          <p style={{ fontSize: 16, color: '#666', lineHeight: 1.6, margin: 0, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            To maintain high quality, strict privacy standards, and dedicated support, Novi is currently available exclusively via private license.
          </p>
        </div>

        {/* Primary Contact Action Card */}
        <div style={{
          background: '#fff',
          border: '1px solid #dedede',
          borderRadius: 16,
          padding: '40px 36px',
          boxShadow: '0 10px 35px rgba(0,0,0,0.04)',
          textAlign: 'center',
          marginBottom: 48,
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: '#1d1d1d',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}>
            <Mail size={24} />
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 10px' }}>Request a Private License</h2>
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 24px' }}>
            We provision licenses directly for individual professionals and engineering organizations. Send us an email with your organization or intended use case:
          </p>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            background: '#f5f5f5',
            border: '1px solid #e2e2e2',
            borderRadius: 10,
            padding: '12px 20px',
            marginBottom: 24,
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 600, color: '#111' }}>
              getnoviapp@outlook.com
            </span>
          </div>

          <div>
            <a
              href="mailto:getnoviapp@outlook.com?subject=Novi%20Private%20License%20Inquiry"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#1c1c1c',
                color: '#fff',
                padding: '13px 28px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Email Us to Request Access <ArrowUpRight size={16} />
            </a>
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 14 }}>
            Inquiries are typically reviewed and fulfilled within 24 hours.
          </div>
        </div>

        {/* What You Get With a Private License */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>What Every Private License Includes</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: '22px 20px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={16} color="#444" /> Bring Your Own Key
              </div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                Connect your OpenAI, Anthropic, Gemini, DeepSeek, or local LLMs. You only pay for your own provider usage with zero markup.
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: '22px 20px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={16} color="#444" /> Offline & Local Privacy
              </div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                No telemetry or cloud tracking. Your code, context, and conversation history stay strictly local on your machine.
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: '22px 20px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={16} color="#444" /> Organization Controls
              </div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                Team and enterprise accounts can centrally provision seat licenses, manage shared API credentials, and monitor device slots.
              </div>
            </div>
          </div>
        </div>

        {/* How Activation Works */}
        <div style={{ background: '#fff', border: '1px solid #e2e2e2', borderRadius: 12, padding: '30px 28px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 18 }}>How License Activation Works</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', background: '#222', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0
              }}>1</span>
              <div>
                <strong style={{ fontSize: 13, color: '#222' }}>Receive Your License Key:</strong>
                <p style={{ fontSize: 13, color: '#666', margin: '3px 0 0' }}>
                  Your license key arrives in the format <code>NVI-XXXX-XXXX-XXXX-XXXX</code>.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', background: '#222', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0
              }}>2</span>
              <div>
                <strong style={{ fontSize: 13, color: '#222' }}>Download the App:</strong>
                <p style={{ fontSize: 13, color: '#666', margin: '3px 0 0' }}>
                  Install the latest build for macOS, Windows, or Debian from our <Link href="/download" style={{ color: '#111', fontWeight: 600 }}>Download page</Link>.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', background: '#222', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0
              }}>3</span>
              <div>
                <strong style={{ fontSize: 13, color: '#222' }}>Activate and Start:</strong>
                <p style={{ fontSize: 13, color: '#666', margin: '3px 0 0' }}>
                  Paste your key on first launch. Your device is securely bound, and you can immediately connect your AI providers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #e5e5e5',
        padding: '28px 32px',
        textAlign: 'center',
        fontSize: 12,
        color: '#888',
      }}>
        Novi — Private, bring-your-own-key AI desktop companion. Inquiries: <a href="mailto:getnoviapp@outlook.com" style={{ color: '#555', textDecoration: 'underline' }}>getnoviapp@outlook.com</a>
      </footer>
    </div>
  );
}

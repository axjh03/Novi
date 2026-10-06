import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Check, Copy, KeyRound, Lock, Mail, Shield, Sparkles, Building2, UserCheck } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';

export const metadata: Metadata = {
  title: 'Private License — Novi',
  description: 'Novi is available exclusively via private license. Contact getnoviapp@outlook.com or DM @getnoviapp on Instagram to request access.',
};

const InstagramIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

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
      <PublicNavbar active="license" />

      <style dangerouslySetInnerHTML={{ __html: `
        .license-page-main {
          max-width: 840px;
          width: 100%;
          margin: 0 auto;
          padding: 60px 24px 90px;
          flex: 1;
        }
        .license-page-title {
          font-size: 44px;
          font-weight: 600;
          letter-spacing: -1.5px;
          margin: 0 0 16px;
          line-height: 1.15;
        }
        .license-card {
          background: #fff;
          border: 1px solid #dedede;
          border-radius: 16px;
          padding: 40px 36px;
          box-shadow: 0 10px 35px rgba(0,0,0,0.04);
          text-align: center;
          margin-bottom: 48px;
        }
        @media (max-width: 640px) {
          .license-page-main {
            padding: 24px 16px 60px !important;
          }
          .license-page-title {
            font-size: 28px !important;
            letter-spacing: -1px !important;
          }
          .license-card {
            padding: 24px 16px !important;
            margin-bottom: 32px !important;
          }
        }
      ` }} />

      {/* Main Content */}
      <main className="license-page-main">
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
          <h1 className="license-page-title">
            Novi Private Licensing
          </h1>
          <p style={{ fontSize: 16, color: '#666', lineHeight: 1.6, margin: 0, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            To maintain high quality, strict privacy standards, and dedicated support, Novi is currently available exclusively via private license.
          </p>
        </div>

        {/* Primary Contact Action Card */}
        <div className="license-card">
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
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 28px' }}>
            We provision licenses directly for individual professionals and engineering organizations. Reach out via email or direct message on Instagram:
          </p>

          {/* Two Channel Cards: Email & Instagram */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            maxWidth: 640,
            margin: '0 auto 24px',
            textAlign: 'left',
          }}>
            {/* Email Channel */}
            <div style={{
              background: '#fafafa',
              border: '1px solid #e2e2e2',
              borderRadius: 12,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  <Mail size={14} color="#111" /> Official Email
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 14 }}>
                  getnoviapp@outlook.com
                </div>
              </div>
              <a
                href="mailto:getnoviapp@outlook.com?subject=Novi%20Private%20License%20Inquiry"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: '#1c1c1c',
                  color: '#fff',
                  padding: '11px 20px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Send Email <ArrowUpRight size={15} />
              </a>
            </div>

            {/* Instagram Channel */}
            <div style={{
              background: '#fafafa',
              border: '1px solid #e2e2e2',
              borderRadius: 12,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  <InstagramIcon size={14} /> Official Instagram
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 14 }}>
                  @getnoviapp
                </div>
              </div>
              <a
                href="https://instagram.com/getnoviapp"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                  color: '#fff',
                  padding: '11px 20px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 2px 10px rgba(220, 39, 67, 0.25)',
                }}
              >
                Message @getnoviapp <ArrowUpRight size={15} />
              </a>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#888' }}>
            Inquiries received via email or Instagram are reviewed and fulfilled within 24 hours.
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

          <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#666' }}>Want to see the complete guide with interactive email templates and offline grace details?</span>
            <Link
              href="/how-it-works"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: '#111',
                textDecoration: 'none',
                background: '#f4f4f5',
                padding: '6px 14px',
                borderRadius: 6,
              }}
            >
              Read Full Licensing Guide <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </main>

    </div>
  );
}

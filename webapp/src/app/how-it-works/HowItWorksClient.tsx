'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Terminal,
  Zap,
  Cpu,
  Laptop,
  Building2,
  Mail,
  Lock,
  Download,
  CheckCircle2,
  WifiOff,
  Users,
  Clock,
  Sparkles,
  RefreshCw,
  MonitorSmartphone,
  ChevronDown,
  Info,
  Shield,
  FileText
} from 'lucide-react';

const InstagramIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

export default function HowItWorksClient() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('overview');

  // Interactive Email Generator State
  const [requestRole, setRequestRole] = useState<'individual' | 'team' | 'enterprise'>('individual');
  const [requestSeats, setRequestSeats] = useState('1');
  const [requestOS, setRequestOS] = useState('macOS (Apple Silicon)');
  const [requestLLM, setRequestLLM] = useState('Anthropic Claude');
  const [requestName, setRequestName] = useState('');
  const [requestCompany, setRequestCompany] = useState('');

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['overview', 'request-license', 'how-license-works', 'get-started', 'device-management', 'faq'];
      const scrollPos = window.scrollY + 160;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const generatedEmailSubject = encodeURIComponent(
    `Novi Private License Request — ${requestCompany || requestName || 'New Inquiry'} (${requestSeats} seat${requestSeats === '1' ? '' : 's'})`
  );

  const generatedEmailBodyText = `Hello Novi Team,

I would like to request a private license for Novi. Here are the details of our setup:

• Name: ${requestName || '[Your Name]'}
• Organization / Company: ${requestCompany || '[Individual / Company Name]'}
• License Type: ${requestRole === 'individual' ? 'Individual Professional' : requestRole === 'team' ? 'Engineering Team' : 'Enterprise Organization'}
• Number of Required Seats: ${requestSeats}
• Primary Operating System: ${requestOS}
• Primary AI Model Provider: ${requestLLM}

Please let us know the onboarding steps and provisioning timeline.

Thank you,
${requestName || '[Your Name]'}`;

  const generatedMailtoUrl = `mailto:getnoviapp@outlook.com?subject=${generatedEmailSubject}&body=${encodeURIComponent(generatedEmailBodyText)}`;

  const faqItems = [
    {
      q: 'Does Novi need an active internet connection to validate my license while coding?',
      a: 'No. When you activate your license, Novi generates an encrypted device token and caches it locally. Novi performs a background check every 4 hours, but includes a built-in 24-hour offline grace period. You can freely code on airplanes, trains, or during ISP outages without being locked out.'
    },
    {
      q: 'Can I transfer my license to a new computer or laptop?',
      a: 'Yes. If you upgrade your machine or reformat your drive, you can unlink the old device via the Settings menu or through your organization administrator dashboard. The seat is instantly freed and immediately available to activate on your new hardware.'
    },
    {
      q: 'Does the licensing system or telemetry send my private source code to Novi?',
      a: 'Never. The licensing handshake (POST /api/v1/licenses/activate) strictly transmits the license key hash and an anonymous cryptographic hardware hash. Zero lines of code, file names, prompts, or directory paths ever leave your local machine.'
    },
    {
      q: 'What format will my private license key arrive in?',
      a: 'Your license key is a 20-character alphanumeric string grouped into five blocks: NVI-XXXX-XXXX-XXXX-XXXX. It is tied to your organization or developer account.'
    },
    {
      q: 'How does Bring Your Own Key (BYOK) work with the license?',
      a: 'Novi separates licensing from AI model execution. Your Novi license unlocks the desktop engine, terminal execution, and autonomous agent orchestration. For model inference, you supply your own API keys from Anthropic, OpenAI, Google Gemini, or Kimi. You pay actual provider prices directly with zero markup or artificial token caps.'
    },
    {
      q: 'How do multi-seat team licenses work?',
      a: 'Engineering teams receive a pooled organizational license key. Administrators can view active developer machines, set shared API keys centrally without distributing raw secrets, and revoke or reassign seats in real time.'
    }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--paper, #f7f7f7)',
      color: 'var(--ink, #1f1f1f)',
      fontFamily: 'Arial, Helvetica, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top Navbar */}
      <PublicNavbar active="how-it-works" />

      <style dangerouslySetInnerHTML={{ __html: `
        .how-it-works-container {
          max-width: 1120px;
          width: 100%;
          margin: 0 auto;
          padding: 40px 24px 80px;
          flex: 1;
        }
        .how-it-works-heading {
          font-size: 42px;
          font-weight: 700;
          letter-spacing: -1.5px;
          line-height: 1.15;
          margin: 0 0 14px;
          color: #111;
        }
        .how-it-works-grid {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 40px;
          align-items: start;
        }
        .how-it-works-sidebar {
          position: sticky;
          top: 90px;
          background: #ffffff;
          border: 1px solid #e5e5e5;
          border-radius: 12px;
          padding: 20px 16px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
        }
        .how-it-works-card {
          background: #fff;
          border: 1px solid #e5e5e5;
          border-radius: 14px;
          padding: 32px 30px;
        }
        @media (max-width: 860px) {
          .how-it-works-container {
            padding: 24px 16px 60px !important;
          }
          .how-it-works-heading {
            font-size: 28px !important;
            letter-spacing: -1px !important;
          }
          .how-it-works-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          .how-it-works-sidebar {
            position: static !important;
            width: 100% !important;
            padding: 14px !important;
            box-sizing: border-box !important;
          }
          .how-it-works-card {
            padding: 20px 16px !important;
          }
        }
      ` }} />

      {/* Main Container */}
      <div className="how-it-works-container">
        
        {/* Breadcrumb Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#666', marginBottom: 20 }}>
          <Link href="/" style={{ color: '#666', textDecoration: 'none' }}>Home</Link>
          <span>/</span>
          <span style={{ color: '#111', fontWeight: 600 }}>How It Works</span>
        </div>

        {/* Hero Header */}
        <div style={{ marginBottom: 44, borderBottom: '1px solid #e5e5e5', paddingBottom: 36 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            background: '#ececec',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            color: '#444',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            <Lock size={12} color="#444" /> Private License Architecture & Guide
          </div>

          <h1 className="how-it-works-heading">
            How Novi Licensing Works
          </h1>

          <p style={{
            fontSize: 16,
            color: '#666',
            lineHeight: 1.6,
            maxWidth: 780,
            margin: 0,
          }}>
            Everything you need to know about requesting a private license, cryptographic device binding, offline grace periods, and getting started on your workstation.
          </p>
        </div>

        {/* 2-Column Documentation Layout */}
        <div className="how-it-works-grid">
          
          {/* Sticky Left Sidebar Navigation */}
          <aside className="how-it-works-sidebar">
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12, paddingLeft: 8 }}>
              On This Page
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { id: 'overview', label: '1. Architecture & Principles' },
                { id: 'request-license', label: '2. Requesting a License' },
                { id: 'get-started', label: '3. Getting Started (4 Steps)' },
                { id: 'how-license-works', label: '4. The Validation Engine' },
                { id: 'device-management', label: '5. Machine Transfers & Orgs' },
                { id: 'faq', label: '6. Frequently Asked Questions' },
              ].map(item => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  style={{
                    display: 'block',
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    color: activeSection === item.id ? '#111' : '#666',
                    background: activeSection === item.id ? '#f3f4f6' : 'transparent',
                    fontWeight: activeSection === item.id ? 600 : 400,
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                Need Help?
              </div>
              <p style={{ fontSize: 11, color: '#777', lineHeight: 1.4, margin: '0 0 10px' }}>
                Licenses are reviewed within 24 hours.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a
                  href="mailto:getnoviapp@outlook.com"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: '#111',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Mail size={13} /> getnoviapp@outlook.com
                </a>
                <a
                  href="https://instagram.com/getnoviapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: '#c13584',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <InstagramIcon size={13} /> @getnoviapp
                </a>
              </div>
            </div>
          </aside>

          {/* Right Main Content Sections */}
          <main style={{ minWidth: 0 }}>
            
            {/* SECTION 1: Architecture & Principles */}
            <section id="overview" style={{ marginBottom: 54, scrollMarginTop: 100 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: '32px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={20} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                    Architecture & Core Principles
                  </h2>
                </div>

                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.65, margin: '0 0 24px' }}>
                  Novi uses a high-trust, privacy-first licensing model designed for professional software engineers and security-conscious organizations. Unlike web SaaS tools that hold your code in a hosted cloud, Novi is a local native desktop runtime.
                </p>

                {/* 3 Core Pillars */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
                  <div style={{ background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 10, padding: '20px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, marginBottom: 8, color: '#111' }}>
                      <KeyRound size={16} color="#d97706" /> Bring Your Own Key
                    </div>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: 0 }}>
                      No marked-up token fees or artificial caps. You connect your own Anthropic Claude, OpenAI, Gemini, or Kimi keys directly.
                    </p>
                  </div>

                  <div style={{ background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 10, padding: '20px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, marginBottom: 8, color: '#111' }}>
                      <Lock size={16} color="#2563eb" /> Strict Local Privacy
                    </div>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: 0 }}>
                      License checks only verify device legitimacy. Zero telemetry, code repositories, prompts, or file contents are ever transmitted.
                    </p>
                  </div>

                  <div style={{ background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 10, padding: '20px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, marginBottom: 8, color: '#111' }}>
                      <WifiOff size={16} color="#059669" /> 24-Hour Offline Grace
                    </div>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: 0 }}>
                      Work in full offline isolation. When you lose connection on a flight or remote location, your active session remains unlocked.
                    </p>
                  </div>
                </div>

                {/* Visual Pipeline Flow */}
                <div style={{
                  background: '#0d0d10',
                  color: '#f4f4f5',
                  borderRadius: 10,
                  padding: '24px 20px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  lineHeight: 1.7,
                  overflowX: 'auto',
                }}>
                  <div style={{ color: '#a1a1aa', marginBottom: 6 }}>// High-Level Licensing & Runtime Topology</div>
                  <div><span style={{ color: '#60a5fa' }}>Step 1:</span> User requests private license  ──►  Provisioned & emailed in format: <span style={{ color: '#fbbf24' }}>NVI-XXXX-XXXX-XXXX-XXXX</span></div>
                  <div><span style={{ color: '#60a5fa' }}>Step 2:</span> Desktop launch & activation ──►  POST /api/v1/licenses/activate (Hash + Hardware Fingerprint)</div>
                  <div><span style={{ color: '#60a5fa' }}>Step 3:</span> Local Key Storage            ──►  Encrypted Device Token stored in OS Keyring</div>
                  <div><span style={{ color: '#60a5fa' }}>Step 4:</span> Periodic Heartbeat           ──►  Check-in every 4 hrs | 24-hr offline grace period guaranteed</div>
                  <div><span style={{ color: '#60a5fa' }}>Step 5:</span> Model Orchestration          ──►  Local agent runs directly with YOUR Claude/OpenAI/Gemini/Kimi keys</div>
                </div>
              </div>
            </section>


            {/* SECTION 2: How to Request a License */}
            <section id="request-license" style={{ marginBottom: 54, scrollMarginTop: 100 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: '32px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mail size={20} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                    How to Request a Private License
                  </h2>
                </div>

                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.65, margin: '0 0 24px' }}>
                  To maintain rigorous software quality and dedicated white-glove engineering support, licenses are currently issued on an invitation and review basis. Requests are open to solo developers, engineering teams, and organizations.
                </p>

                {/* Interactive Request Form / Template Generator */}
                <div style={{
                  background: '#fafafa',
                  border: '1px solid #e2e2e2',
                  borderRadius: 12,
                  padding: '24px 22px',
                  marginBottom: 24,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 16 }}>
                    <Sparkles size={16} color="#d97706" /> Interactive Email Template Builder
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
                    {/* Role / Tier */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Account Type</label>
                      <select
                        value={requestRole}
                        onChange={(e) => setRequestRole(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: '1px solid #ccc',
                          background: '#fff',
                          fontSize: 13,
                        }}
                      >
                        <option value="individual">Individual Professional</option>
                        <option value="team">Engineering Team (2-20)</option>
                        <option value="enterprise">Enterprise (20+ seats)</option>
                      </select>
                    </div>

                    {/* Number of Seats */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Number of Seats</label>
                      <input
                        type="text"
                        value={requestSeats}
                        onChange={(e) => setRequestSeats(e.target.value)}
                        placeholder="e.g. 1 or 5"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: '1px solid #ccc',
                          background: '#fff',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Primary OS */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Workstation OS</label>
                      <select
                        value={requestOS}
                        onChange={(e) => setRequestOS(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: '1px solid #ccc',
                          background: '#fff',
                          fontSize: 13,
                        }}
                      >
                        <option value="macOS (Apple Silicon)">macOS (Apple Silicon M1/M2/M3/M4)</option>
                        <option value="macOS (Intel)">macOS (Intel x64)</option>
                        <option value="Windows 11 / 10">Windows 11 / Windows 10</option>
                        <option value="Linux (Ubuntu / Debian / AppImage)">Linux (Ubuntu / Debian / Mint / AppImage)</option>
                      </select>
                    </div>

                    {/* Primary LLM Preference */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Primary AI Model</label>
                      <select
                        value={requestLLM}
                        onChange={(e) => setRequestLLM(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: '1px solid #ccc',
                          background: '#fff',
                          fontSize: 13,
                        }}
                      >
                        <option value="Anthropic Claude">Anthropic Claude (3.7 Sonnet / Opus)</option>
                        <option value="OpenAI">OpenAI (GPT-4o / o1 / o3-mini)</option>
                        <option value="Google Gemini">Google Gemini (2.5 Pro / Flash)</option>
                        <option value="Kimi (Moonshot AI)">Kimi / Moonshot AI (K1.5)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Your Name (Optional)</label>
                      <input
                        type="text"
                        value={requestName}
                        onChange={(e) => setRequestName(e.target.value)}
                        placeholder="e.g. Alex Chen"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: '1px solid #ccc',
                          background: '#fff',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Company / Organization</label>
                      <input
                        type="text"
                        value={requestCompany}
                        onChange={(e) => setRequestCompany(e.target.value)}
                        placeholder="e.g. Acme Engineering or Independent"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: '1px solid #ccc',
                          background: '#fff',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Preformatted Email Preview Box */}
                  <div style={{ position: 'relative', marginBottom: 18 }}>
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #d4d4d8',
                      borderRadius: 8,
                      padding: '14px 16px',
                      fontSize: 13,
                      fontFamily: 'monospace',
                      color: '#27272a',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.55,
                      maxHeight: 180,
                      overflowY: 'auto',
                    }}>
                      {generatedEmailBodyText}
                    </div>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedEmailBodyText, 'template')}
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: copiedKey === 'template' ? '#15803d' : '#27272a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {copiedKey === 'template' ? <Check size={14} /> : <Copy size={14} />}
                      {copiedKey === 'template' ? 'Copied!' : 'Copy Template'}
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                    <a
                      href={generatedMailtoUrl}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#111',
                        color: '#fff',
                        padding: '12px 24px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: 'none',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      }}
                    >
                      <Mail size={16} /> Send Email via Mail Client <ArrowUpRight size={15} />
                    </a>

                    <a
                      href="https://instagram.com/getnoviapp"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                        color: '#fff',
                        padding: '12px 22px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: 'none',
                        boxShadow: '0 2px 8px rgba(220, 39, 67, 0.25)',
                      }}
                    >
                      <InstagramIcon size={16} /> DM on Instagram @getnoviapp <ArrowUpRight size={15} />
                    </a>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#666' }}>
                      or send manually to <code style={{ background: '#eee', padding: '3px 8px', borderRadius: 4, color: '#111', fontWeight: 600 }}>getnoviapp@outlook.com</code>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f4f4f5', padding: '12px 16px', borderRadius: 8, fontSize: 13, color: '#52525b' }}>
                  <Clock size={16} color="#71717a" style={{ flexShrink: 0 }} />
                  <span><strong>Turnaround SLA:</strong> All inquiries are reviewed by the engineering team within 24 hours. Your license key and download credentials are dispatched directly to your inbox.</span>
                </div>
              </div>
            </section>


            {/* SECTION 3: Getting Started Step-by-Step */}
            <section id="get-started" style={{ marginBottom: 54, scrollMarginTop: 100 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: '32px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={20} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                    Getting Started: From Key to Coding in 4 Steps
                  </h2>
                </div>

                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.65, margin: '0 0 28px' }}>
                  Once your request is approved, onboarding takes less than 2 minutes. Follow these four simple steps:
                </p>

                {/* 4 Steps Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  {/* Step 1 */}
                  <div style={{ display: 'flex', gap: 18, background: '#fafafa', border: '1px solid #ededed', borderRadius: 12, padding: '22px 20px' }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#111',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      1
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>
                        Receive Your License Key
                      </h3>
                      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 10px' }}>
                        Your key is issued via email in the standard 20-character format:
                      </p>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #d4d4d8', padding: '6px 14px', borderRadius: 6, fontFamily: 'monospace', fontWeight: 600, fontSize: 14, color: '#09090b' }}>
                        NVI-7K9A-4M2P-9X1Q-8W3E
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div style={{ display: 'flex', gap: 18, background: '#fafafa', border: '1px solid #ededed', borderRadius: 12, padding: '22px 20px' }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#111',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      2
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>
                        Download & Install the Desktop App
                      </h3>
                      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
                        Head over to our official <Link href="/download" style={{ color: '#111', fontWeight: 600 }}>Download Page</Link> and pick the package matching your machine:
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <Link href="/download#macos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#fff', border: '1px solid #d4d4d8', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', color: '#111', fontWeight: 500 }}>
                          <Download size={13} /> macOS (.dmg Apple Silicon / Intel)
                        </Link>
                        <Link href="/download#windows" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#fff', border: '1px solid #d4d4d8', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', color: '#111', fontWeight: 500 }}>
                          <Download size={13} /> Windows (.exe Installer)
                        </Link>
                        <Link href="/download#linux" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#fff', border: '1px solid #d4d4d8', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', color: '#111', fontWeight: 500 }}>
                          <Download size={13} /> Linux (.deb / AppImage)
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div style={{ display: 'flex', gap: 18, background: '#fafafa', border: '1px solid #ededed', borderRadius: 12, padding: '22px 20px' }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#111',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      3
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>
                        Activate License in the Desktop App
                      </h3>
                      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 10px' }}>
                        Launch Novi. On the initial startup screen, paste your license key into the <strong>License Key</strong> input.
                      </p>
                      <div style={{ background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#555', lineHeight: 1.5 }}>
                        ✨ The app immediately calls the licensing endpoint, verifies seat availability, creates a hardware-bound device token, and unlocks the complete developer workspace.
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div style={{ display: 'flex', gap: 18, background: '#fafafa', border: '1px solid #ededed', borderRadius: 12, padding: '22px 20px' }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#111',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      4
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>
                        Connect Your AI Model Provider Key (BYOK)
                      </h3>
                      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
                        In Novi <strong>Settings ➔ API Credentials</strong>, paste your API key from Anthropic, OpenAI, Google Gemini, or Kimi.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link
                          href="/api-keys"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            color: '#111',
                            fontWeight: 600,
                            textDecoration: 'none',
                            background: '#e4e4e7',
                            padding: '6px 12px',
                            borderRadius: 6,
                          }}
                        >
                          Read our Step-by-Step API Key Guide <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </section>


            {/* SECTION 4: How the Validation Engine Works */}
            <section id="how-license-works" style={{ marginBottom: 54, scrollMarginTop: 100 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: '32px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Cpu size={20} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                    How the Validation Engine Works Under the Hood
                  </h2>
                </div>

                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.65, margin: '0 0 24px' }}>
                  The Novi licensing architecture is built with cryptographic security, offline-first reliability, and strict privacy guarantees:
                </p>

                {/* 3 Technical Mechanism Blocks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 28 }}>
                  
                  <div style={{ borderLeft: '3px solid #111', paddingLeft: 18 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>
                      1. Cryptographic Device Fingerprinting
                    </h3>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                      When you activate on a machine, Novi computes a one-way cryptographic SHA-256 hash of stable hardware identifiers (motherboard UUID, CPU architecture, and machine identifier). It never reads personal folders, usernames, or IP logs. This hash binds the license key to that specific physical workstation.
                    </p>
                  </div>

                  <div style={{ borderLeft: '3px solid #111', paddingLeft: 18 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>
                      2. Secure Heartbeat Daemon (4-Hour Cadence)
                    </h3>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                      While running, the background daemon periodically transmits a lightweight verification check to <code style={{ background: '#f4f4f5', padding: '2px 6px', borderRadius: 4 }}>POST /api/v1/devices/heartbeat</code> using a signed bearer token. It simply confirms that the license status remains <span style={{ color: '#15803d', fontWeight: 600 }}>ACTIVE</span> and checks if the organization administrator has made seat adjustments.
                    </p>
                  </div>

                  <div style={{ borderLeft: '3px solid #111', paddingLeft: 18 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>
                      3. Built-in 24-Hour Offline Grace Guarantee
                    </h3>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                      Software engineering doesn't just happen at a desk with gigabit fiber. If you board a transcontinental flight, commute through tunnels, or suffer a regional ISP outage, the licensing subsystem smoothly enters <span style={{ color: '#d97706', fontWeight: 600 }}>GRACE</span> mode. You get 24 continuous hours of full application capability before a reconnect is requested.
                    </p>
                  </div>

                </div>

                {/* API Request Spec Card */}
                <div style={{ background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: 10, padding: '20px 22px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#222', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Terminal size={15} /> License Activation Payload Specification
                  </div>
                  <pre style={{
                    background: '#0d0d10',
                    color: '#e4e4e7',
                    padding: '16px 18px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    margin: 0,
                    lineHeight: 1.6,
                  }}>
{`// POST /api/v1/licenses/activate
{
  "licenseKey": "NVI-7K9A-4M2P-9X1Q-8W3E",
  "deviceFingerprint": "sha256:8f4c2e...b3a19",
  "deviceName": "MacBook Pro (16-inch, M3 Max)",
  "platform": "darwin-arm64",
  "appVersion": "0.1.0"
}

// 200 OK Response
{
  "success": true,
  "deviceToken": "eyJhbGciOiJIUzI1NiIs...",
  "licenseStatus": "ACTIVE",
  "tier": "PROFESSIONAL",
  "offlineGraceSeconds": 86400
}`}
                  </pre>
                </div>
              </div>
            </section>


            {/* SECTION 5: Machine Transfers & Org Management */}
            <section id="device-management" style={{ marginBottom: 54, scrollMarginTop: 100 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: '32px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MonitorSmartphone size={20} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                    Machine Transfers & Team Management
                  </h2>
                </div>

                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.65, margin: '0 0 24px' }}>
                  Whether you are replacing your personal laptop or provisioning 50 developers across an engineering department, managing devices is seamless:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  
                  {/* Card: Moving to a New Machine */}
                  <div style={{ background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 12, padding: '24px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 10 }}>
                      <RefreshCw size={18} color="#2563eb" /> Transferring to a New Mac/PC
                    </div>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 14px' }}>
                      Upgraded your MacBook or assembled a new Linux workstation? You don't need to purchase another license:
                    </p>
                    <ol style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
                      <li>On the old computer, open <strong>Novi Settings ➔ License</strong> and click <strong>Deactivate Device</strong>.</li>
                      <li>Install Novi on the new machine and paste your existing <code style={{ background: '#eee', padding: '1px 5px', borderRadius: 4 }}>NVI-XXXX</code> key.</li>
                      <li>The seat quota transfers instantly with zero waiting time.</li>
                    </ol>
                  </div>

                  {/* Card: Organization & Team Controls */}
                  <div style={{ background: '#fafafa', border: '1px solid #eaeaea', borderRadius: 12, padding: '24px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 10 }}>
                      <Building2 size={18} color="#d97706" /> Centralized Team Administration
                    </div>
                    <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 14px' }}>
                      For engineering leads and IT administrators:
                    </p>
                    <ul style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
                      <li><strong>Seat Pool:</strong> Grant all team members access from a pooled organizational license key.</li>
                      <li><strong>Device Visibility:</strong> View which developer laptops are currently active, platform versions, and check-in times.</li>
                      <li><strong>Remote Revocation:</strong> Instantly de-authorize lost laptops or departed contractors with one click.</li>
                      <li><strong>Shared Credentials:</strong> Distribute enterprise model keys safely via policy without exposing raw secrets.</li>
                    </ul>
                  </div>

                </div>
              </div>
            </section>


            {/* SECTION 6: Frequently Asked Questions */}
            <section id="faq" style={{ marginBottom: 40, scrollMarginTop: 100 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, padding: '32px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={20} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                    Frequently Asked Questions
                  </h2>
                </div>

                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.65, margin: '0 0 24px' }}>
                  Common questions about private licensing, offline limits, and billing:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {faqItems.map((item, idx) => {
                    const isOpen = openFaq === idx;
                    return (
                      <div
                        key={idx}
                        style={{
                          border: '1px solid #e4e4e7',
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: isOpen ? '#fcfcfd' : '#ffffff',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenFaq(isOpen ? null : idx)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 15,
                            fontWeight: 600,
                            color: '#18181b',
                            gap: 12,
                          }}
                        >
                          <span>{item.q}</span>
                          <ChevronDown
                            size={18}
                            color="#71717a"
                            style={{
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease',
                              flexShrink: 0,
                            }}
                          />
                        </button>
                        {isOpen && (
                          <div style={{
                            padding: '0 20px 18px',
                            fontSize: 14,
                            color: '#52525b',
                            lineHeight: 1.65,
                            borderTop: '1px solid #f4f4f5',
                            paddingTop: 14,
                          }}>
                            {item.a}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Bottom Call to Action */}
            <div style={{
              background: '#111114',
              color: '#ffffff',
              borderRadius: 14,
              padding: '36px 32px',
              textAlign: 'center',
              boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
            }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 10px', color: '#fff' }}>
                Ready to Experience Novi?
              </h2>
              <p style={{ fontSize: 14, color: '#a1a1aa', maxWidth: 540, margin: '0 auto 24px', lineHeight: 1.6 }}>
                Request your private license key today. We evaluate each inquiry and respond with your key within 24 hours.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <a
                  href="mailto:getnoviapp@outlook.com?subject=Novi%20Private%20License%20Inquiry"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#ffffff',
                    color: '#09090b',
                    padding: '12px 24px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  <Mail size={16} /> Request via Email
                </a>
                <a
                  href="https://instagram.com/getnoviapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                    color: '#ffffff',
                    padding: '12px 22px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: 'none',
                    boxShadow: '0 2px 10px rgba(220, 39, 67, 0.3)',
                  }}
                >
                  <InstagramIcon size={16} /> DM on Instagram @getnoviapp
                </a>
                <Link
                  href="/download"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(255,255,255,0.1)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '12px 22px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Download size={16} /> Download Desktop App
                </Link>
              </div>
            </div>

          </main>

        </div>
      </div>
    </div>
  );
}

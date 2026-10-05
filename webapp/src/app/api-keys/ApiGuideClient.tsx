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
  AlertCircle,
  ChevronRight,
  Layers,
  Lock,
  BookOpen,
  Info,
  Link as LinkIcon
} from 'lucide-react';

// Official Brand Logos
const AnthropicLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#D97706" style={{ flexShrink: 0 }}>
    <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.541Zm1.9074 4.5422 2.222 5.765H6.3813Z" />
  </svg>
);

const OpenAILogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#10A37F" style={{ flexShrink: 0 }}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1683a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4023-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1635a.0804.0804 0 0 1-.038-.0567V6.0748a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4598a.7948.7948 0 0 0-.3927.6813l-.0048 6.7219zm1.1026-1.576l2.5884-1.492 2.5836 1.492v2.984l-2.5836 1.492-2.5884-1.492z" />
  </svg>
);

const GeminiLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#2563EB" style={{ flexShrink: 0 }}>
    <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81Z" />
  </svg>
);

const KimiLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#9333EA" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" stroke="#9333EA" strokeWidth="2" fill="none" />
    <path d="M8 8v8l8-8v8" stroke="#9333EA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ApiGuideClient() {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeHeading, setActiveHeading] = useState('overview');

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  useEffect(() => {
    const handleScroll = () => {
      const headings = document.querySelectorAll('section[id], div[id]');
      const scrollPos = window.scrollY + 140;

      for (let i = headings.length - 1; i >= 0; i--) {
        const h = headings[i] as HTMLElement;
        if (h.offsetTop <= scrollPos) {
          setActiveHeading(h.id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      color: '#1a1a1a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top Header Navigation */}
      <PublicNavbar active="api-keys" />

      {/* Docs Shell Layout: Left Sidebar + Center Content */}
      <div style={{
        maxWidth: 1380,
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flex: 1,
        alignItems: 'flex-start',
      }}>
        {/* Left Sticky Documentation Sidebar */}
        <aside style={{
          width: 280,
          position: 'sticky',
          top: 85,
          height: 'calc(100vh - 85px)',
          overflowY: 'auto',
          padding: '30px 24px 40px 28px',
          borderRight: '1px solid #f0f0f0',
          fontSize: 13,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: '#111', marginBottom: 20 }}>
            <BookOpen size={16} />
            <span>Developer Documentation</span>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Getting Started
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>
                <a href="#overview" style={{
                  display: 'block',
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'overview' ? '#111' : '#666',
                  fontWeight: activeHeading === 'overview' ? 600 : 400,
                  background: activeHeading === 'overview' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>Overview & Setup</a>
              </li>
              <li>
                <a href="#model-matrix" style={{
                  display: 'block',
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'model-matrix' ? '#111' : '#666',
                  fontWeight: activeHeading === 'model-matrix' ? 600 : 400,
                  background: activeHeading === 'model-matrix' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>Model Comparison Matrix</a>
              </li>
            </ul>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Provider Guides & URLs
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>
                <a href="#claude" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'claude' ? '#111' : '#666',
                  fontWeight: activeHeading === 'claude' ? 600 : 400,
                  background: activeHeading === 'claude' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>
                  <AnthropicLogo size={15} />
                  <span>Anthropic Claude</span>
                </a>
              </li>
              <li>
                <a href="#openai" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'openai' ? '#111' : '#666',
                  fontWeight: activeHeading === 'openai' ? 600 : 400,
                  background: activeHeading === 'openai' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>
                  <OpenAILogo size={15} />
                  <span>OpenAI</span>
                </a>
              </li>
              <li>
                <a href="#gemini" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'gemini' ? '#111' : '#666',
                  fontWeight: activeHeading === 'gemini' ? 600 : 400,
                  background: activeHeading === 'gemini' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>
                  <GeminiLogo size={15} />
                  <span>Google Gemini</span>
                </a>
              </li>
              <li>
                <a href="#kimi" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'kimi' ? '#111' : '#666',
                  fontWeight: activeHeading === 'kimi' ? 600 : 400,
                  background: activeHeading === 'kimi' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>
                  <KimiLogo size={15} />
                  <span>Kimi (Moonshot AI)</span>
                </a>
              </li>
            </ul>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Deployment Methods
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>
                <a href="#admin-distribution" style={{
                  display: 'block',
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'admin-distribution' ? '#111' : '#666',
                  fontWeight: activeHeading === 'admin-distribution' ? 600 : 400,
                  background: activeHeading === 'admin-distribution' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>Admin Central Distribution</a>
              </li>
              <li>
                <a href="#desktop-import" style={{
                  display: 'block',
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'desktop-import' ? '#111' : '#666',
                  fontWeight: activeHeading === 'desktop-import' ? 600 : 400,
                  background: activeHeading === 'desktop-import' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>Desktop App BYOK Import</a>
              </li>
            </ul>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Security
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>
                <a href="#security" style={{
                  display: 'block',
                  padding: '6px 10px',
                  borderRadius: 6,
                  color: activeHeading === 'security' ? '#111' : '#666',
                  fontWeight: activeHeading === 'security' ? 600 : 400,
                  background: activeHeading === 'security' ? '#f5f5f5' : 'transparent',
                  textDecoration: 'none'
                }}>Security & Local Encryption</a>
              </li>
            </ul>
          </div>
        </aside>

        {/* Main Continuous Document Reading Area */}
        <main style={{
          flex: 1,
          padding: '40px 60px 100px',
          maxWidth: 960,
          minWidth: 0,
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888', marginBottom: 16 }}>
            <span>Docs</span>
            <ChevronRight size={13} />
            <span>Integrations</span>
            <ChevronRight size={13} />
            <span style={{ color: '#222', fontWeight: 600 }}>API Keys & Provider Setup</span>
          </div>

          {/* Document Title Header */}
          <h1 style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-1.5px',
            lineHeight: 1.15,
            color: '#111',
            margin: '0 0 16px',
          }}>
            How to Get &amp; Connect Your API Keys
          </h1>
          <p style={{ fontSize: 17, color: '#555', lineHeight: 1.65, margin: '0 0 36px' }}>
            Direct URLs and step-by-step instructions for generating API keys from <b>Anthropic Claude</b>, <b>OpenAI</b>, <b>Google Gemini</b>, and <b>Kimi (Moonshot AI)</b>, and connecting them to Novi.
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '30px 0 40px' }} />

          {/* SECTION 1: OVERVIEW */}
          <section id="overview" style={{ marginBottom: 60, scrollMarginTop: 100 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', marginBottom: 16 }}>
              Overview &amp; Direct Connection
            </h2>
            <p style={{ fontSize: 15, color: '#444', lineHeight: 1.7, marginBottom: 16 }}>
              Novi connects directly to your AI providers from your local desktop workspace. You provide your own API key, and all chat queries, coding questions, and live voice transcripts route directly to your chosen provider with zero intermediary logging.
            </p>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '18px 22px',
              marginBottom: 24,
              fontSize: 14,
              lineHeight: 1.6,
              color: '#334155'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
                <Info size={16} style={{ color: '#2563eb' }} />
                Quick Links to API Key Portals
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#92400e', textDecoration: 'none', fontWeight: 500, fontSize: 13, background: '#fff', border: '1px solid #fed7aa', padding: '8px 12px', borderRadius: 6 }}>
                  <AnthropicLogo size={16} /> Anthropic API Keys <ExternalLink size={13} />
                </a>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#065f46', textDecoration: 'none', fontWeight: 500, fontSize: 13, background: '#fff', border: '1px solid #a7f3d0', padding: '8px 12px', borderRadius: 6 }}>
                  <OpenAILogo size={16} /> OpenAI API Keys <ExternalLink size={13} />
                </a>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1e40af', textDecoration: 'none', fontWeight: 500, fontSize: 13, background: '#fff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: 6 }}>
                  <GeminiLogo size={16} /> Google Gemini API Keys <ExternalLink size={13} />
                </a>
                <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b21a8', textDecoration: 'none', fontWeight: 500, fontSize: 13, background: '#fff', border: '1px solid #e9d5ff', padding: '8px 12px', borderRadius: 6 }}>
                  <KimiLogo size={16} /> Kimi (Moonshot) Keys <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </section>

          {/* SECTION 2: MODEL COMPARISON MATRIX */}
          <section id="model-matrix" style={{ marginBottom: 60, scrollMarginTop: 100 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', marginBottom: 16 }}>
              Supported Models &amp; Recommendations
            </h2>
            <p style={{ fontSize: 15, color: '#444', lineHeight: 1.7, marginBottom: 20 }}>
              When you paste an API key in Novi, available models are auto-discovered. Here is how models compare for technical interview practice:
            </p>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: '#555' }}>Model ID</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: '#555' }}>Context Window</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: '#555' }}>Speed / Profile</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: '#555' }}>Best Used For</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Copy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                      claude-3-7-sonnet-20250219
                    </td>
                    <td style={{ padding: '12px 16px', color: '#666' }}>200K</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ color: '#be185d', fontWeight: 600 }}>Deep Reasoning</span></td>
                    <td style={{ padding: '12px 16px', color: '#444' }}>Complex algorithm proofs, architectural diagrams, in-depth refactoring.</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button type="button" onClick={() => copyToClipboard('claude-3-7-sonnet-20250219', 'm1')} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '3px 7px', fontSize: 11, cursor: 'pointer' }}>
                        {copiedText === 'm1' ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                      claude-3-5-sonnet-20241022
                    </td>
                    <td style={{ padding: '12px 16px', color: '#666' }}>200K</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ color: '#1d4ed8', fontWeight: 600 }}>Fast</span></td>
                    <td style={{ padding: '12px 16px', color: '#444' }}>General LeetCode live problem-solving and structured technical interview answers.</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button type="button" onClick={() => copyToClipboard('claude-3-5-sonnet-20241022', 'm2')} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '3px 7px', fontSize: 11, cursor: 'pointer' }}>
                        {copiedText === 'm2' ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                      gemini-2.0-flash
                    </td>
                    <td style={{ padding: '12px 16px', color: '#666' }}>1M</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ color: '#047857', fontWeight: 600 }}>Ultra-Fast (~350ms)</span></td>
                    <td style={{ padding: '12px 16px', color: '#444' }}>Real-time voice speech transcription and instantaneous coding hints.</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button type="button" onClick={() => copyToClipboard('gemini-2.0-flash', 'm3')} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '3px 7px', fontSize: 11, cursor: 'pointer' }}>
                        {copiedText === 'm3' ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                      gpt-4o
                    </td>
                    <td style={{ padding: '12px 16px', color: '#666' }}>128K</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ color: '#1d4ed8', fontWeight: 600 }}>Fast</span></td>
                    <td style={{ padding: '12px 16px', color: '#444' }}>Multimodal screenshot analysis and balanced code explanation.</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button type="button" onClick={() => copyToClipboard('gpt-4o', 'm4')} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '3px 7px', fontSize: 11, cursor: 'pointer' }}>
                        {copiedText === 'm4' ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                      o3-mini
                    </td>
                    <td style={{ padding: '12px 16px', color: '#666' }}>200K</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ color: '#be185d', fontWeight: 600 }}>Deep Reasoning</span></td>
                    <td style={{ padding: '12px 16px', color: '#444' }}>Rigorous dynamic programming, math puzzles, and hard edge cases.</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button type="button" onClick={() => copyToClipboard('o3-mini', 'm5')} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '3px 7px', fontSize: 11, cursor: 'pointer' }}>
                        {copiedText === 'm5' ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'monospace' }}>
                      kimi-latest
                    </td>
                    <td style={{ padding: '12px 16px', color: '#666' }}>128K - 200K</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ color: '#1d4ed8', fontWeight: 600 }}>Fast</span></td>
                    <td style={{ padding: '12px 16px', color: '#444' }}>Large resume files, project documentation, and bilingual Chinese/English questions.</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button type="button" onClick={() => copyToClipboard('kimi-latest', 'm6')} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '3px 7px', fontSize: 11, cursor: 'pointer' }}>
                        {copiedText === 'm6' ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '40px 0' }} />

          {/* SECTION 3: ANTHROPIC CLAUDE */}
          <section id="claude" style={{ marginBottom: 70, scrollMarginTop: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AnthropicLogo size={32} />
                <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', margin: 0 }}>
                  Anthropic Claude
                </h2>
              </div>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#d97706',
                  color: '#fff',
                  padding: '9px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                Go to Anthropic API Keys <ExternalLink size={14} />
              </a>
            </div>

            <p style={{ fontSize: 15, color: '#555', lineHeight: 1.7, marginBottom: 16 }}>
              Follow these steps to generate your Anthropic API key:
            </p>

            {/* Direct URL Reference Box */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <LinkIcon size={14} style={{ color: '#d97706' }} />
                <b style={{ color: '#92400e' }}>Direct Console Links:</b>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#78350f' }}>
                <li>Console Home: <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit' }}>https://console.anthropic.com/</a></li>
                <li>Direct Keys Page: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit', fontWeight: 600 }}>https://console.anthropic.com/settings/keys</a></li>
                <li>Base URL: <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>https://api.anthropic.com/v1</code></li>
                <li>Key Format: <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>sk-ant-api03-...</code></li>
              </ul>
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 600, color: '#111', margin: '20px 0 10px' }}>
              Step-by-Step Instructions
            </h3>
            <ol style={{ paddingLeft: 22, fontSize: 14, color: '#333', lineHeight: 1.8 }}>
              <li>
                Visit <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>console.anthropic.com</a> and sign up or sign in.
              </li>
              <li>
                Complete account SMS verification if prompted by Anthropic to enable API key generation.
              </li>
              <li>
                Navigate directly to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>console.anthropic.com/settings/keys</a>.
              </li>
              <li>
                Click the <b>Create Key</b> button.
              </li>
              <li>
                Enter a name (such as <code>Novi Desktop</code>) and click <b>Create Key</b>.
              </li>
              <li>
                Copy the generated key (starts with <code>sk-ant-api03-</code>). Anthropic will only show this once.
              </li>
            </ol>

            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', margin: '20px 0 8px' }}>
              Test Key in Terminal
            </h3>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => copyToClipboard(`curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: YOUR_KEY_HERE" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":128,"messages":[{"role":"user","content":"Ping"}]}'`, 'curl-claude')}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: '#2d3748',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {copiedText === 'curl-claude' ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                {copiedText === 'curl-claude' ? 'Copied' : 'Copy'}
              </button>
              <pre style={{ background: '#1a202c', color: '#edf2f7', padding: '16px 20px', borderRadius: 8, fontSize: 12, overflowX: 'auto', margin: 0, lineHeight: 1.6 }}>
                <code>{`curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: YOUR_KEY_HERE" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":128,"messages":[{"role":"user","content":"Ping"}]}'`}</code>
              </pre>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '40px 0' }} />

          {/* SECTION 4: OPENAI */}
          <section id="openai" style={{ marginBottom: 70, scrollMarginTop: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <OpenAILogo size={32} />
                <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', margin: 0 }}>
                  OpenAI
                </h2>
              </div>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#10a37f',
                  color: '#fff',
                  padding: '9px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                Go to OpenAI API Keys <ExternalLink size={14} />
              </a>
            </div>

            <p style={{ fontSize: 15, color: '#555', lineHeight: 1.7, marginBottom: 16 }}>
              Follow these steps to generate your OpenAI secret API key:
            </p>

            {/* Direct URL Reference Box */}
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <LinkIcon size={14} style={{ color: '#10a37f' }} />
                <b style={{ color: '#065f46' }}>Direct Platform Links:</b>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#064e3b' }}>
                <li>Platform Home: <a href="https://platform.openai.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit' }}>https://platform.openai.com/</a></li>
                <li>Direct Keys Page: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit', fontWeight: 600 }}>https://platform.openai.com/api-keys</a></li>
                <li>Base URL: <code style={{ background: '#d1fae5', padding: '1px 5px', borderRadius: 4 }}>https://api.openai.com/v1</code></li>
                <li>Key Format: <code style={{ background: '#d1fae5', padding: '1px 5px', borderRadius: 4 }}>sk-proj-...</code></li>
              </ul>
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 600, color: '#111', margin: '20px 0 10px' }}>
              Step-by-Step Instructions
            </h3>
            <ol style={{ paddingLeft: 22, fontSize: 14, color: '#333', lineHeight: 1.8 }}>
              <li>
                Go to the OpenAI Developer Platform at <a href="https://platform.openai.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>platform.openai.com</a>.
              </li>
              <li>
                Click directly into the API Keys section at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>platform.openai.com/api-keys</a>.
              </li>
              <li>
                Click <b>+ Create new secret key</b>.
              </li>
              <li>
                Set a name (e.g. <code>Novi Desktop</code>) and select permissions (<em>All</em> or <em>Model Capabilities</em>).
              </li>
              <li>
                Click <b>Create secret key</b> and copy the string starting with <code>sk-proj-</code>.
              </li>
            </ol>

            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', margin: '20px 0 8px' }}>
              Test Key in Terminal
            </h3>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => copyToClipboard(`curl https://api.openai.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY_HERE" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Ping"}]}'`, 'curl-openai')}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: '#2d3748',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {copiedText === 'curl-openai' ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                {copiedText === 'curl-openai' ? 'Copied' : 'Copy'}
              </button>
              <pre style={{ background: '#1a202c', color: '#edf2f7', padding: '16px 20px', borderRadius: 8, fontSize: 12, overflowX: 'auto', margin: 0, lineHeight: 1.6 }}>
                <code>{`curl https://api.openai.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY_HERE" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Ping"}]}'`}</code>
              </pre>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '40px 0' }} />

          {/* SECTION 5: GOOGLE GEMINI */}
          <section id="gemini" style={{ marginBottom: 70, scrollMarginTop: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <GeminiLogo size={32} />
                <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', margin: 0 }}>
                  Google Gemini
                </h2>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#2563eb',
                  color: '#fff',
                  padding: '9px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                Go to Google AI Studio <ExternalLink size={14} />
              </a>
            </div>

            <p style={{ fontSize: 15, color: '#555', lineHeight: 1.7, marginBottom: 16 }}>
              Follow these steps to generate your Google Gemini API key:
            </p>

            {/* Direct URL Reference Box */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <LinkIcon size={14} style={{ color: '#2563eb' }} />
                <b style={{ color: '#1e40af' }}>Direct AI Studio Links:</b>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#1e3a8a' }}>
                <li>AI Studio Home: <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit' }}>https://aistudio.google.com/</a></li>
                <li>Direct Keys Page: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit', fontWeight: 600 }}>https://aistudio.google.com/app/apikey</a></li>
                <li>Base URL: <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>https://generativelanguage.googleapis.com/v1beta</code></li>
                <li>Key Format: <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>AIzaSy...</code> (39 characters)</li>
              </ul>
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 600, color: '#111', margin: '20px 0 10px' }}>
              Step-by-Step Instructions
            </h3>
            <ol style={{ paddingLeft: 22, fontSize: 14, color: '#333', lineHeight: 1.8 }}>
              <li>
                Open <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>aistudio.google.com</a> and sign in with your Google account.
              </li>
              <li>
                Go directly to the API key creation page: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>aistudio.google.com/app/apikey</a>.
              </li>
              <li>
                Click <b>Create API key</b> (or <em>Create API key in new project</em>).
              </li>
              <li>
                Google will generate your key immediately. Copy the key beginning with <code>AIzaSy</code>.
              </li>
            </ol>

            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', margin: '20px 0 8px' }}>
              Test Key in Terminal
            </h3>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => copyToClipboard(`curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_KEY_HERE" \\
  -H 'Content-Type: application/json' \\
  -d '{"contents":[{"parts":[{"text":"Ping"}]}]}'`, 'curl-gemini')}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: '#2d3748',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {copiedText === 'curl-gemini' ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                {copiedText === 'curl-gemini' ? 'Copied' : 'Copy'}
              </button>
              <pre style={{ background: '#1a202c', color: '#edf2f7', padding: '16px 20px', borderRadius: 8, fontSize: 12, overflowX: 'auto', margin: 0, lineHeight: 1.6 }}>
                <code>{`curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_KEY_HERE" \\
  -H 'Content-Type: application/json' \\
  -d '{"contents":[{"parts":[{"text":"Ping"}]}]}'`}</code>
              </pre>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '40px 0' }} />

          {/* SECTION 6: KIMI MOONSHOT */}
          <section id="kimi" style={{ marginBottom: 70, scrollMarginTop: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <KimiLogo size={32} />
                <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', margin: 0 }}>
                  Kimi (Moonshot AI)
                </h2>
              </div>
              <a
                href="https://platform.moonshot.cn/console/api-keys"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#9333ea',
                  color: '#fff',
                  padding: '9px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                Go to Moonshot API Keys <ExternalLink size={14} />
              </a>
            </div>

            <p style={{ fontSize: 15, color: '#555', lineHeight: 1.7, marginBottom: 16 }}>
              Follow these steps to generate your Kimi (Moonshot AI) API key:
            </p>

            {/* Direct URL Reference Box */}
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <LinkIcon size={14} style={{ color: '#9333ea' }} />
                <b style={{ color: '#6b21a8' }}>Direct Moonshot Platform Links:</b>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#581c87' }}>
                <li>Platform Home: <a href="https://platform.moonshot.cn/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit' }}>https://platform.moonshot.cn/</a></li>
                <li>Direct Keys Page: <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'inherit', fontWeight: 600 }}>https://platform.moonshot.cn/console/api-keys</a></li>
                <li>Base URL: <code style={{ background: '#f3e8ff', padding: '1px 5px', borderRadius: 4 }}>https://api.moonshot.cn/v1</code></li>
                <li>Key Format: <code style={{ background: '#f3e8ff', padding: '1px 5px', borderRadius: 4 }}>sk-...</code></li>
              </ul>
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 600, color: '#111', margin: '20px 0 10px' }}>
              Step-by-Step Instructions
            </h3>
            <ol style={{ paddingLeft: 22, fontSize: 14, color: '#333', lineHeight: 1.8 }}>
              <li>
                Register or log in at <a href="https://platform.moonshot.cn/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>platform.moonshot.cn</a>.
              </li>
              <li>
                Navigate directly to <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>platform.moonshot.cn/console/api-keys</a>.
              </li>
              <li>
                Click <b>新建 API Key</b> (Create API Key).
              </li>
              <li>
                Assign a label and copy the generated <code>sk-...</code> key.
              </li>
              <li>
                In Novi Desktop, configure your connection with Base URL <code>https://api.moonshot.cn/v1</code> and model <code>kimi-latest</code> or <code>moonshot-v1-8k</code>.
              </li>
            </ol>

            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', margin: '20px 0 8px' }}>
              Test Key in Terminal
            </h3>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => copyToClipboard(`curl https://api.moonshot.cn/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY_HERE" \\
  -d '{"model":"moonshot-v1-8k","messages":[{"role":"user","content":"Ping"}]}'`, 'curl-kimi')}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: '#2d3748',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {copiedText === 'curl-kimi' ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                {copiedText === 'curl-kimi' ? 'Copied' : 'Copy'}
              </button>
              <pre style={{ background: '#1a202c', color: '#edf2f7', padding: '16px 20px', borderRadius: 8, fontSize: 12, overflowX: 'auto', margin: 0, lineHeight: 1.6 }}>
                <code>{`curl https://api.moonshot.cn/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY_HERE" \\
  -d '{"model":"moonshot-v1-8k","messages":[{"role":"user","content":"Ping"}]}'`}</code>
              </pre>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '40px 0' }} />

          {/* SECTION 7: NOVI CONFIGURATION MODES */}
          <section id="admin-distribution" style={{ marginBottom: 60, scrollMarginTop: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Building2 size={24} style={{ color: '#059669' }} />
              <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', margin: 0 }}>
                Method 1: Centralized Admin Key Distribution
              </h2>
            </div>
            <p style={{ fontSize: 15, color: '#444', lineHeight: 1.7, marginBottom: 16 }}>
              For organizations, administrators input API keys once into the web dashboard. All licensed desktop users automatically inherit access without seeing or handling the raw keys:
            </p>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '24px', background: '#fafafa', marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Administrator Setup Steps:</h4>
              <ol style={{ paddingLeft: 20, margin: 0, fontSize: 14, color: '#444', lineHeight: 1.8 }}>
                <li>Log in to the Novi Web Portal at <Link href="/#signin" style={{ textDecoration: 'underline', color: 'inherit', fontWeight: 600 }}>/#signin</Link> with your Admin, Corp, or Subcorp account.</li>
                <li>Click the <b>API Management</b> tab in the sidebar navigation.</li>
                <li>Click <b>+ Add API key</b>.</li>
                <li>Choose the provider from the dropdown:
                  <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                    <li><b>OpenAI</b> (<code>https://api.openai.com/v1</code>)</li>
                    <li><b>Anthropic / Claude</b> (<code>https://api.anthropic.com/v1</code>)</li>
                    <li><b>Google Gemini</b> (<code>https://generativelanguage.googleapis.com/v1beta</code>)</li>
                    <li><b>Kimi (Moonshot AI)</b> (<code>https://api.moonshot.cn/v1</code>)</li>
                  </ul>
                </li>
                <li>Give the connection a clear nickname (e.g. <em>&quot;Team Primary Claude 3.7&quot;</em>).</li>
                <li>Paste your API key. The server encrypts it immediately with <b>AES-256-GCM</b> and masks it so only the last 4 characters are visible.</li>
                <li>When desktop users sign in or sync, the connection is instantly delivered to their app memory.</li>
              </ol>
            </div>
          </section>

          <section id="desktop-import" style={{ marginBottom: 60, scrollMarginTop: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Laptop size={24} style={{ color: '#2563eb' }} />
              <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', margin: 0 }}>
                Method 2: Desktop App BYOK Direct Import
              </h2>
            </div>
            <p style={{ fontSize: 15, color: '#444', lineHeight: 1.7, marginBottom: 16 }}>
              Individual users can save their personal API keys directly inside the Novi Desktop App:
            </p>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '24px', background: '#fafafa', marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Desktop App Step-by-Step:</h4>
              <ol style={{ paddingLeft: 20, margin: 0, fontSize: 14, color: '#444', lineHeight: 1.8 }}>
                <li>Open the <b>Novi Desktop Application</b> on your computer.</li>
                <li>Press <kbd style={{ background: '#e5e5e5', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>Alt + ,</kbd> or click the <b>Settings</b> gear icon in the header.</li>
                <li>Navigate to <b>Provider Connections</b>.</li>
                <li>Click <b>+ Add Connection</b>.</li>
                <li>Select the provider:
                  <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                    <li><b>Anthropic / Claude:</b> Auto-configured to <code>https://api.anthropic.com/v1</code></li>
                    <li><b>OpenAI:</b> Auto-configured to <code>https://api.openai.com/v1</code></li>
                    <li><b>Google Gemini:</b> Auto-configured to <code>https://generativelanguage.googleapis.com/v1beta</code></li>
                    <li><b>OpenAI Compatible:</b> For Kimi, enter Base URL <code>https://api.moonshot.cn/v1</code></li>
                  </ul>
                </li>
                <li>Paste your API key and click <b>Test Connection</b>. Novi will ping the provider and retrieve the live list of models available on your account.</li>
                <li>Choose your default model and click <b>Save Connection</b>.</li>
              </ol>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '40px 0' }} />

          {/* SECTION 8: SECURITY */}
          <section id="security" style={{ marginBottom: 60, scrollMarginTop: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <ShieldCheck size={24} style={{ color: '#059669' }} />
              <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.8px', color: '#111', margin: 0 }}>
                Security &amp; Local Encryption
              </h2>
            </div>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7 }}>
              Key handling in Novi adheres to strict enterprise encryption standards:
            </p>
            <ul style={{ fontSize: 14, color: '#444', lineHeight: 1.8, paddingLeft: 20 }}>
              <li><b>Zero Logging:</b> Prompts, live transcriptions, and screen snapshots are never recorded or stored on any intermediate server.</li>
              <li><b>Server-Side Encryption:</b> Admin keys are encrypted at rest using AES-256-GCM authenticated cipher with unique per-credential initialization vectors.</li>
              <li><b>Local OS Keychain:</b> Standalone desktop keys are protected using native OS secure enclaves (macOS Keychain, Windows DPAPI, and Linux Secret Service).</li>
            </ul>
          </section>

          {/* Document Footer Call to Action */}
          <div style={{
            borderTop: '1px solid #eaeaea',
            paddingTop: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 20
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Ready to start practicing?</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Download the native desktop application and connect your key in under 60 seconds.</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link href="/download" className="btn dark" style={{ textDecoration: 'none' }}>
                Download Desktop App <ArrowUpRight size={15} />
              </Link>
              <Link href="/license" className="btn" style={{ textDecoration: 'none' }}>
                Private License
              </Link>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

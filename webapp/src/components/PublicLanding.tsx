'use client';

import React from 'react';
import Link from 'next/link';
import PublicNavbar from './PublicNavbar';
import {
  ArrowUpRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Command,
  Mic,
  Cpu,
  Sparkles,
  CheckCircle2,
  Lock,
  Keyboard,
  Target,
  Zap,
  Activity,
  Layers,
  ArrowRight,
  FileText
} from 'lucide-react';

interface PublicLandingProps {
  onSignIn: () => void;
}

export default function PublicLanding({ onSignIn }: PublicLandingProps) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--paper, #fbfbfb)',
      color: 'var(--ink, #212121)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <PublicNavbar onSignIn={onSignIn} />

      <style dangerouslySetInnerHTML={{ __html: `
        .hero-section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 70px 24px 80px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
        }
        .hero-title {
          font-size: 56px;
          line-height: 1.05;
          letter-spacing: -3px;
          font-weight: 700;
          color: #111;
          margin: 20px 0;
        }
        .hero-title span {
          color: #2563eb;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-sub {
          font-size: 16px;
          line-height: 1.7;
          color: #666;
          margin-bottom: 32px;
          max-width: 520px;
        }
        .hero-card-preview {
          background: #09090b;
          border: 1px solid #27272a;
          border-radius: 18px;
          padding: 24px;
          color: #f4f4f5;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
          position: relative;
        }
        .landing-feature-grid {
          max-width: 1200px;
          margin: 0 auto 90px;
          padding: 0 24px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        .feature-card {
          background: #ffffff;
          border: 1px solid #e4e4e7;
          border-radius: 16px;
          padding: 28px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
        }
        .feature-card:hover {
          border-color: #a1a1aa;
          transform: translateY(-2px);
          box-shadow: 0 12px 30px -10px rgba(0,0,0,0.08);
        }
        .feature-icon-wrapper {
          width: 48px;
          height: 48px;
          borderRadius: 12px;
          background: #f4f4f5;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          color: #18181b;
        }
        .models-banner {
          max-width: 1200px;
          margin: 0 auto 90px;
          padding: 40px 32px;
          background: #09090b;
          color: #ffffff;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 40px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }
        .hotkeys-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-top: 16px;
        }
        .hotkey-pill {
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          fontSize: 12px;
          fontWeight: 600;
        }
        @media (max-width: 960px) {
          .hero-section {
            grid-template-columns: 1fr !important;
            padding: 40px 20px 60px !important;
            gap: 40px !important;
          }
          .hero-title {
            font-size: 38px !important;
            letter-spacing: -1.5px !important;
          }
          .landing-feature-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .models-banner {
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 28px 20px !important;
            gap: 24px !important;
          }
          .hotkeys-grid {
            grid-template-columns: 1fr !important;
          }
        }
      ` }} />

      <main style={{ flex: 1 }}>
        {/* HERO SECTION */}
        <section className="hero-section">
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              <Sparkles size={13} color="#2563eb" /> AI Interview Copilot · Personal & Context-Aware
            </div>

            <h1 className="hero-title">
              Master Every Interview.<br />
              <span>Real-Time AI Copilot.</span>
            </h1>

            <p className="hero-sub">
              Novi loads your resume, target job description, and personal context. It listens to live system audio, tracks your gaze, and delivers instant, structured answers right on your screen—completely invisible to interviewers.
            </p>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
              <Link
                href="/download"
                className="btn dark large"
                style={{
                  textDecoration: 'none',
                  background: '#09090b',
                  color: '#ffffff',
                  padding: '14px 24px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                }}
              >
                Download Novi App <ArrowUpRight size={18} />
              </Link>
              <Link
                href="/license"
                className="btn large"
                style={{
                  textDecoration: 'none',
                  background: '#ffffff',
                  color: '#18181b',
                  border: '1px solid #e4e4e7',
                  padding: '14px 22px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Private License
              </Link>
            </div>

            {/* Quick Platform Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>Supported Platforms:</span>
              {[
                { name: 'macOS (.dmg)', icon: '/apple-logo.png', hash: '#mac' },
                { name: 'Windows (.exe)', icon: '/microsoft.png', hash: '#windows' },
                { name: 'Linux (.deb)', icon: '/ubuntu.png', hash: '#linux' },
              ].map((plat) => (
                <Link
                  key={plat.name}
                  href={`/download${plat.hash}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#27272a',
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    padding: '5px 10px',
                    borderRadius: 6,
                    textDecoration: 'none',
                  }}
                >
                  <img src={plat.icon} alt={plat.name} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                  {plat.name}
                </Link>
              ))}
            </div>
          </div>

          {/* HERO PREVIEW CARD */}
          <div className="hero-card-preview">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid #27272a', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'monospace', color: '#22c55e', fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                STEALTH HUD · INVISIBLE TO SCREEN SHARE
              </div>
              <span style={{ fontSize: 10, background: '#27272a', padding: '2px 8px', borderRadius: 4, color: '#a1a1aa' }}>
                Zoom / Teams Safe
              </span>
            </div>

            {/* Live Audio Transcript Box */}
            <div style={{ background: '#18181b', borderRadius: 10, padding: '14px', marginBottom: 14, border: '1px solid #27272a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#38bdf8', fontWeight: 600, marginBottom: 4 }}>
                <Mic size={12} /> Live System Audio STT (Interviewer):
              </div>
              <p style={{ fontSize: 12.5, color: '#e4e4e7', fontStyle: 'italic', margin: 0 }}>
                "Can you walk me through a time you scaled a distributed microservice under heavy load?"
              </p>
            </div>

            {/* Gaze-Anchored Answer Box */}
            <div style={{ background: '#09090b', borderRadius: 10, padding: '16px', border: '1px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>
                  <Target size={13} /> GAZE ANCHORED ANSWER (STAR Framework):
                </div>
                <span style={{ fontSize: 9.5, color: '#22c55e', background: '#052e16', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                  PUPIL GAZE MATCH 100%
                </span>
              </div>

              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#f4f4f5', lineHeight: 1.6 }}>
                <li><strong>Situation:</strong> API throughput choked at 45k RPS during peak flash sales.</li>
                <li><strong>Task:</strong> Redesign caching layer and eliminate database lock contention.</li>
                <li><strong>Action:</strong> Introduced Redis cluster caching + async message queues.</li>
                <li><strong>Result:</strong> Reduced latency by 68% and handled 120k RPS with zero downtime.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 5 CORE PILLARS FEATURE GRID */}
        <section style={{ maxWidth: 1200, margin: '0 auto 30px', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 50px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#71717a', textTransform: 'uppercase' }}>
              ENGINEERED FOR HIGH-STAKES INTERVIEWS
            </span>
            <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-1.5px', marginTop: 8, color: '#111' }}>
              Built for Invisible, Context-Aware Assistance
            </h2>
          </div>
        </section>

        <div className="landing-feature-grid">
          {/* Feature 1: Completely Invisible / Stealth */}
          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: '#fef2f2', color: '#dc2626' }}>
              <EyeOff size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>
              100% Invisible to Viewers
            </h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
              Novi runs as a transparent, click-through overlay. Whether sharing your desktop on Zoom, Google Meet, Microsoft Teams, or Webex, the overlay remains completely invisible to screen capture and remote viewers.
            </p>
          </div>

          {/* Feature 2: Gaze Tracking & Answer Where Eye Is */}
          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: '#eff6ff', color: '#2563eb' }}>
              <Target size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>
              Eye Tracking: Answer Where Eye Is
            </h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
              Maintain 100% natural eye contact. Novi's real-time MediaPipe gaze detection tracks your pupil vector and positions response text right near your webcam or wherever your eyes are looking.
            </p>
          </div>

          {/* Feature 3: Live Audio STT */}
          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <Mic size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>
              Live System Audio Transcription
            </h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
              Captures system audio loopback automatically without virtual audio cables. Listens to interviewer questions in real time, transcribes speech, and instantly generates structured response points.
            </p>
          </div>

          {/* Feature 4: Global Hotkeys */}
          <div className="feature-card" style={{ gridColumn: 'span 2' }}>
            <div className="feature-icon-wrapper" style={{ background: '#faf5ff', color: '#9333ea' }}>
              <Keyboard size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>
              Global Silent Hotkeys
            </h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
              Control Novi instantly with silent global keyboard shortcuts without moving your mouse cursor or interrupting your interview flow.
            </p>

            <div className="hotkeys-grid">
              <div className="hotkey-pill">
                <span>Toggle Click-Through & Stealth</span>
                <code style={{ background: '#ffffff', padding: '3px 7px', borderRadius: 5, border: '1px solid #d4d4d8' }}>
                  Alt + C
                </code>
              </div>
              <div className="hotkey-pill">
                <span>Silent Screen Capture</span>
                <code style={{ background: '#ffffff', padding: '3px 7px', borderRadius: 5, border: '1px solid #d4d4d8' }}>
                  Alt + 3
                </code>
              </div>
              <div className="hotkey-pill">
                <span>Live Audio Record STT</span>
                <code style={{ background: '#ffffff', padding: '3px 7px', borderRadius: 5, border: '1px solid #d4d4d8' }}>
                  Alt + A
                </code>
              </div>
              <div className="hotkey-pill">
                <span>Trigger STAR Behavioral Response</span>
                <code style={{ background: '#ffffff', padding: '3px 7px', borderRadius: 5, border: '1px solid #d4d4d8' }}>
                  Alt + B
                </code>
              </div>
            </div>
          </div>

          {/* Feature 5: Candidate Context Matching */}
          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: '#fffbeb', color: '#d97706' }}>
              <FileText size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111' }}>
              Tailored to Your Resume & Context
            </h3>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
              Load your resume, past project metrics, and target job description into Novi. The AI grounds every answer in your actual work history and experience.
            </p>
          </div>
        </div>

        {/* MULTI-MODEL AI SUPPORT BANNER */}
        <div style={{ padding: '0 24px' }}>
          <div className="models-banner">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Cpu size={16} /> Any Provider · Any Model
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 12px', color: '#ffffff' }}>
                Supported AI Models & Local Privacy
              </h2>
              <p style={{ fontSize: 14, color: '#a1a1aa', maxWidth: 540, lineHeight: 1.6, margin: 0 }}>
                Connect your favorite AI providers or run 100% offline models locally on your machine with zero data leaving your hardware.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, minWidth: 320 }}>
              {[
                { name: 'OpenAI', models: 'GPT-4o, o1-mini' },
                { name: 'Anthropic', models: 'Claude 3.5 Sonnet' },
                { name: 'Google Gemini', models: 'Gemini 1.5 Pro' },
                { name: 'DeepSeek', models: 'DeepSeek-V3 / R1' },
                { name: 'Local Offline', models: 'Ollama & LM Studio' },
                { name: 'Custom Endpoints', models: 'OpenAI-Compatible APIs' },
              ].map((prov) => (
                <div
                  key={prov.name}
                  style={{
                    background: '#18181b',
                    border: '1px solid #27272a',
                    padding: '12px 14px',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{prov.name}</div>
                  <div style={{ fontSize: 11, color: '#71717a', marginTop: 2, fontFamily: 'monospace' }}>{prov.models}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{
        borderTop: '1px solid #e4e4e7',
        padding: '30px 24px',
        background: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        color: '#71717a',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.svg" alt="Novi Logo" width={24} height={24} style={{ borderRadius: 6 }} />
          <span><strong>Novi AI</strong> · Private Interview Copilot</span>
        </div>

        <div>
          Licensed desktop access · Contact <a href="mailto:getnoviapp@outlook.com" style={{ color: '#111', fontWeight: 600 }}>getnoviapp@outlook.com</a>
        </div>
      </footer>
    </div>
  );
}

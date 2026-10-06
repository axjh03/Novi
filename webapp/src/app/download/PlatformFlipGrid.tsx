'use client';

import React, { useState, useEffect } from 'react';
import { Download, Copy, Check, Terminal, Shield, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { ReleaseData } from './DownloadClient';

interface PlatformFlipGridProps {
  release: ReleaseData;
  siteOrigin: string;
  detectedOS: 'mac' | 'windows' | 'linux';
  setDetectedOS: (os: 'mac' | 'windows' | 'linux') => void;
  copiedMirror: string | null;
  copyMirrorUrl: (url: string, id: string) => void;
  isDark?: (os: 'mac' | 'windows' | 'linux') => boolean;
  setHoveredOS?: (os: 'mac' | 'windows' | 'linux' | null) => void;
}

export function PlatformFlipGrid({
  release,
  siteOrigin,
  detectedOS,
  setDetectedOS,
  copiedMirror,
  copyMirrorUrl,
}: PlatformFlipGridProps) {
  // Default selected OS tab matches user's detected OS
  const [selectedOS, setSelectedOS] = useState<'mac' | 'windows' | 'linux'>(detectedOS);

  useEffect(() => {
    if (detectedOS) {
      setSelectedOS(detectedOS);
    }
  }, [detectedOS]);

  const osTabs = [
    {
      id: 'mac' as const,
      name: 'macOS',
      subtitle: 'Apple Silicon & Intel',
      logo: '/apple-logo.png',
      badge: 'macOS 11.0+',
    },
    {
      id: 'windows' as const,
      name: 'Windows',
      subtitle: 'Windows 10 & 11 (64-bit)',
      logo: '/microsoft.png',
      badge: 'x64 Installer',
    },
    {
      id: 'linux' as const,
      name: 'Linux',
      subtitle: 'Debian, Ubuntu & AppImage',
      logo: '/ubuntu.png',
      badge: '.deb & AppImage',
    },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        .novi-grid-split {
          display: grid;
          grid-template-columns: 30% 70%;
          gap: 24px;
          margin-bottom: 40px;
          align-items: stretch;
        }
        .novi-os-sidebar {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .novi-os-tab {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 18px;
          border-radius: 14px;
          border: 1px solid #e4e4e7;
          background: #ffffff;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          text-align: left;
          position: relative;
        }
        .novi-os-tab:hover {
          border-color: #a1a1aa;
          background: #fafafa;
          transform: translateY(-1px);
        }
        .novi-os-tab.active {
          border-color: #18181b;
          background: #09090b;
          color: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
        }
        .novi-os-tab.active .novi-tab-subtitle {
          color: #a1a1aa !important;
        }
        .novi-os-tab.active .novi-tab-badge {
          background: #27272a !important;
          color: #f4f4f5 !important;
          border-color: #3f3f46 !important;
        }
        .novi-os-card-detail {
          background: #ffffff;
          border: 1px solid #e4e4e7;
          border-radius: 18px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 4px 20px rgba(0,0,0,0.03);
        }
        @media (max-width: 860px) {
          .novi-grid-split {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .novi-os-sidebar {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 10px !important;
          }
          .novi-os-tab {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            padding: 14px 10px !important;
            gap: 8px !important;
          }
          .novi-os-tab img {
            width: 28px !important;
            height: 28px !important;
          }
          .novi-tab-subtitle {
            display: none !important;
          }
          .novi-os-card-detail {
            padding: 22px 18px !important;
          }
        }
      ` }} />

      <div className="novi-grid-split">
        {/* Left Column: 30% width vertically stacked OS tabs */}
        <div className="novi-os-sidebar">
          {osTabs.map((tab) => {
            const isSelected = selectedOS === tab.id;
            const isUserOS = detectedOS === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                className={`novi-os-tab ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  setSelectedOS(tab.id);
                  setDetectedOS(tab.id);
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: isSelected ? '#ffffff' : '#f4f4f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: 6,
                  boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                }}>
                  <img
                    src={tab.logo}
                    alt={tab.name}
                    style={{ width: 26, height: 26, objectFit: 'contain' }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                      {tab.name}
                    </span>
                    {isUserOS && (
                      <span
                        className="novi-tab-badge"
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 12,
                          background: isSelected ? '#16a34a' : '#dcfce7',
                          color: isSelected ? '#ffffff' : '#15803d',
                          border: isSelected ? 'none' : '1px solid #bbf7d0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                        }}
                      >
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: isSelected ? '#ffffff' : '#16a34a' }} />
                        YOUR SYSTEM
                      </span>
                    )}
                  </div>

                  <div
                    className="novi-tab-subtitle"
                    style={{
                      fontSize: 12,
                      color: isSelected ? '#a1a1aa' : '#71717a',
                      marginTop: 3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {tab.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: 70% width Active OS Download Card */}
        <div className="novi-os-card-detail">
          {/* Active macOS Details */}
          {selectedOS === 'mac' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* OS Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: '1px solid #f4f4f5' }}>
                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: '#f4f4f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 10,
                }}>
                  <img src="/apple-logo.png" alt="macOS" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>
                    Novi for macOS
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                    Apple Silicon & Intel Macs · Version {release.version}
                  </div>
                </div>
              </div>

              {/* Primary Download CTAs */}
              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Direct Installer Packages (.dmg)
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <a
                    href={release.downloads.macArm64}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#09090b',
                      color: '#ffffff',
                      padding: '14px 18px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Download size={20} color="#ffffff" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Apple Silicon (arm64)</div>
                      <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1, fontFamily: 'monospace' }}>
                        {release.fileNames.macArm64 || 'Novi-arm64.dmg'}
                      </div>
                    </div>
                  </a>

                  <a
                    href={release.downloads.macX64}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#f4f4f5',
                      color: '#18181b',
                      border: '1px solid #e4e4e7',
                      padding: '14px 18px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Download size={20} color="#18181b" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Intel (x64)</div>
                      <div style={{ fontSize: 11, color: '#71717a', marginTop: 1, fontFamily: 'monospace' }}>
                        {release.fileNames.macX64 || 'Novi-x64.dmg'}
                      </div>
                    </div>
                  </a>
                </div>
              </div>

              {/* 1-Click Terminal Command */}
              <div style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
                borderRadius: 12,
                padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
                    <Terminal size={14} /> 1-Click macOS Terminal Install
                  </div>

                  <button
                    type="button"
                    onClick={() => copyMirrorUrl(`curl -fsSL ${siteOrigin}/install.sh | bash`, 'mac-cli')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #d4d4d8',
                      background: copiedMirror === 'mac-cli' ? '#15803d' : '#ffffff',
                      color: copiedMirror === 'mac-cli' ? '#ffffff' : '#18181b',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedMirror === 'mac-cli' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedMirror === 'mac-cli' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>

                <code style={{
                  display: 'block',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#0284c7',
                  background: '#ffffff',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                }}>
                  {`curl -fsSL ${siteOrigin}/install.sh | bash`}
                </code>
                <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                  Bypasses Gatekeeper quarantine policy automatically & launches Novi.
                </div>
              </div>
            </div>
          )}

          {/* Active Windows Details */}
          {selectedOS === 'windows' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* OS Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: '1px solid #f4f4f5' }}>
                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: '#edf5fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 10,
                }}>
                  <img src="/microsoft.png" alt="Windows" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>
                    Novi for Windows
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                    Windows 10 & Windows 11 (64-bit) · Version {release.version}
                  </div>
                </div>
              </div>

              {/* Primary Download CTAs */}
              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Direct Installer Package (.exe)
                </span>

                <a
                  href={release.downloads.windows}
                  download
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    background: '#0078d4',
                    color: '#ffffff',
                    padding: '16px 20px',
                    borderRadius: 12,
                    textDecoration: 'none',
                    boxShadow: '0 4px 16px rgba(0,120,212,0.25)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Download size={22} color="#ffffff" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Download Novi-Setup.exe</div>
                    <div style={{ fontSize: 11, color: '#e0f2fe', marginTop: 2, fontFamily: 'monospace' }}>
                      {release.fileNames.windows || 'Novi-Setup.exe'}
                    </div>
                  </div>
                </a>
              </div>

              {/* 1-Click PowerShell Command */}
              <div style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
                borderRadius: 12,
                padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#0078d4' }}>
                    <Terminal size={14} /> 1-Click PowerShell Install
                  </div>

                  <button
                    type="button"
                    onClick={() => copyMirrorUrl(`irm ${siteOrigin}/install.ps1 | iex`, 'win-cli')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #d4d4d8',
                      background: copiedMirror === 'win-cli' ? '#15803d' : '#ffffff',
                      color: copiedMirror === 'win-cli' ? '#ffffff' : '#18181b',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedMirror === 'win-cli' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedMirror === 'win-cli' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>

                <code style={{
                  display: 'block',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#0284c7',
                  background: '#ffffff',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                }}>
                  {`irm ${siteOrigin}/install.ps1 | iex`}
                </code>
                <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                  Runs silent background installation and launches Novi automatically.
                </div>
              </div>
            </div>
          )}

          {/* Active Linux Details */}
          {selectedOS === 'linux' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* OS Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: '1px solid #f4f4f5' }}>
                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: '#fffbeb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 10,
                }}>
                  <img src="/ubuntu.png" alt="Linux" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>
                    Novi for Linux
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                    Ubuntu, Debian, Mint & Universal AppImage · Version {release.version}
                  </div>
                </div>
              </div>

              {/* Primary Download CTAs */}
              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Direct Linux Packages (.deb & .AppImage)
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <a
                    href={release.downloads.linuxDeb}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#09090b',
                      color: '#ffffff',
                      padding: '14px 18px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Download size={20} color="#ffffff" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Debian / Ubuntu (.deb)</div>
                      <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1, fontFamily: 'monospace' }}>
                        {release.fileNames.linuxDeb || 'Novi.deb'}
                      </div>
                    </div>
                  </a>

                  <a
                    href={release.downloads.linuxAppImage}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#f4f4f5',
                      color: '#18181b',
                      border: '1px solid #e4e4e7',
                      padding: '14px 18px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Download size={20} color="#18181b" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Universal (.AppImage)</div>
                      <div style={{ fontSize: 11, color: '#71717a', marginTop: 1, fontFamily: 'monospace' }}>
                        {release.fileNames.linuxAppImage || 'Novi.AppImage'}
                      </div>
                    </div>
                  </a>
                </div>
              </div>

              {/* 1-Click Terminal Command */}
              <div style={{
                background: '#fafafa',
                border: '1px solid #e4e4e7',
                borderRadius: 12,
                padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#d97706' }}>
                    <Terminal size={14} /> 1-Click Linux Terminal Install
                  </div>

                  <button
                    type="button"
                    onClick={() => copyMirrorUrl(`curl -fsSL ${siteOrigin}/install.sh | bash`, 'linux-cli')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #d4d4d8',
                      background: copiedMirror === 'linux-cli' ? '#15803d' : '#ffffff',
                      color: copiedMirror === 'linux-cli' ? '#ffffff' : '#18181b',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedMirror === 'linux-cli' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedMirror === 'linux-cli' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>

                <code style={{
                  display: 'block',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#0284c7',
                  background: '#ffffff',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                }}>
                  {`curl -fsSL ${siteOrigin}/install.sh | bash`}
                </code>
                <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                  Detects package architecture, provisions `.deb` or `.AppImage`, and launches Novi.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

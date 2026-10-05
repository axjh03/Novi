'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import TuxPenguinLogo from '@/components/TuxPenguinLogo';
import {
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Tag
} from 'lucide-react';

export interface ReleaseAssetInfo {
  macArm64: string;
  macX64: string;
  windows: string;
  linuxDeb: string;
  linuxAppImage: string;
}

export interface ReleaseData {
  version: string;
  buildNumber: number;
  releaseTag: string;
  releaseDate: string;
  updatedAt: string;
  repo: string;
  releaseNotes?: string;
  downloads: ReleaseAssetInfo;
  fileNames: {
    macArm64: string;
    macX64: string;
    windows: string;
    linuxDeb: string;
    linuxAppImage: string;
  };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 0) return 'recently';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return '';
  } catch {
    return '';
  }
}

export default function DownloadClient({ initialRelease }: { initialRelease: ReleaseData }) {
  const [release, setRelease] = useState<ReleaseData>(initialRelease);
  const [isLiveFromGitHub, setIsLiveFromGitHub] = useState(false);
  const [detectedOS, setDetectedOS] = useState<'mac' | 'windows' | 'linux'>('mac');
  const [hoveredOS, setHoveredOS] = useState<'mac' | 'windows' | 'linux' | null>(null);
  const [copiedMirror, setCopiedMirror] = useState<string | null>(null);

  const copyMirrorUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedMirror(id);
    setTimeout(() => setCopiedMirror(null), 2000);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      if (ua.includes('win')) setDetectedOS('windows');
      else if (ua.includes('linux') || ua.includes('x11')) setDetectedOS('linux');
      else setDetectedOS('mac');
    }
  }, []);

  const isDark = (p: 'mac' | 'windows' | 'linux') => {
    if (hoveredOS) return hoveredOS === p;
    return detectedOS === p;
  };

  useEffect(() => {
    // Attempt to sync latest live release dynamically from our backend API
    fetch('/api/releases/latest')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!json || !json.data || !json.data.releaseTag) return;
        const d = json.data;

        setRelease((prev) => ({
          ...prev,
          version: d.version,
          releaseTag: d.releaseTag,
          releaseDate: d.releaseDate,
          updatedAt: d.updatedAt,
          repo: d.repo || 'axjh03/Novi',
          releaseNotes: d.releaseNotes,
          downloads: d.downloads || prev.downloads,
          fileNames: d.fileNames || prev.fileNames,
        }));
        setIsLiveFromGitHub(true);
      })
      .catch(() => {
        // Fall back seamlessly to pre-baked release-info.json
      });
  }, [initialRelease]);

  const relativeTime = timeAgo(release.updatedAt);
  const repoSlug = release.repo || 'axjh03/Novi';
  const githubReleasesUrl = `https://github.com/${repoSlug}/releases`;

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
      <PublicNavbar active="download" />

      {/* Main Content */}
      <main style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '60px 24px 80px', flex: 1 }}>
        <div style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 50px' }}>
          {/* Version badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            background: '#ededed',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            color: '#555',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            <Sparkles size={13} color="#444" /> Desktop App · Version {release.version} (Build #{release.buildNumber})
          </div>

          <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-1.5px', margin: '0 0 16px', lineHeight: 1.15 }}>
            Download Novi for your platform
          </h1>

          <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6, margin: '0 0 20px' }}>
            A calm, transparent, and private AI companion for your desktop. Choose your operating system below to get started.
          </p>

          {/* Prominent LAST UPDATE DATE display */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 16px',
            background: '#fff',
            border: '1px solid #dfdfdf',
            borderRadius: 24,
            fontSize: 12,
            fontWeight: 500,
            color: '#333',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}>
            <Calendar size={14} color="#0078d4" />
            <span>
              LAST UPDATE DATE: <strong style={{ color: '#111' }}>{release.releaseDate}</strong>
            </span>
            {relativeTime && (
              <span style={{ color: '#777', fontSize: 11 }}>
                ({relativeTime})
              </span>
            )}
            {isLiveFromGitHub && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: '#107c41',
                fontSize: 11,
                fontWeight: 600,
                marginLeft: 4,
                paddingLeft: 8,
                borderLeft: '1px solid #eee'
              }}>
                <CheckCircle2 size={12} /> Live GitHub Sync
              </span>
            )}
          </div>
        </div>

        {/* Platform Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 28,
          marginBottom: 50,
        }}>
          {/* macOS Card */}
          {(() => {
            const dark = isDark('mac');
            return (
              <div
                id="mac"
                onMouseEnter={() => setHoveredOS('mac')}
                onMouseLeave={() => setHoveredOS(null)}
                onClick={() => setDetectedOS('mac')}
                style={{
                  background: dark ? '#0d0d10' : '#fafafc',
                  border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                  borderRadius: 18,
                  padding: '38px 30px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: dark ? '0 20px 48px -12px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.02)',
                  transform: dark ? 'translateY(-4px)' : 'translateY(0)',
                  transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                  cursor: 'pointer',
                  opacity: dark ? 1 : 0.88,
                }}
              >
                {detectedOS === 'mac' && (
                  <div style={{
                    position: 'absolute',
                    top: 18,
                    right: 20,
                    background: dark ? '#27272a' : '#f0f0f2',
                    color: dark ? '#f4f4f5' : '#52525b',
                    border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    padding: '4px 10px',
                    borderRadius: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                    YOUR SYSTEM
                  </div>
                )}

                <div>
                  {/* Big Apple SVG Logo */}
                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: dark ? '#18181b' : '#f4f4f5',
                    border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 24,
                    color: dark ? '#ffffff' : '#52525b',
                    transition: 'all 0.28s ease',
                  }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.64-.78 1.08-1.86.96-2.95-1 .04-2.13.67-2.79 1.45-.58.67-1.1 1.77-.96 2.84 1.12.09 2.15-.56 2.79-1.34z" />
                    </svg>
                  </div>

                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: dark ? '#ffffff' : '#18181b', transition: 'color 0.28s ease' }}>
                    macOS
                  </h2>
                  <p style={{ fontSize: 13, color: dark ? '#a1a1aa' : '#71717a', margin: '0 0 26px', transition: 'color 0.28s ease' }}>
                    Apple Silicon (M1/M2/M3/M4) & Intel
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a
                    href={release.downloads.macArm64}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: dark ? '#ffffff' : '#18181b',
                      color: dark ? '#09090b' : '#ffffff',
                      padding: '13px 20px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center',
                      boxShadow: dark ? '0 4px 16px rgba(255,255,255,0.18)' : 'none',
                      transition: 'all 0.28s ease',
                    }}
                  >
                    <Download size={16} /> Download .dmg (Apple Silicon)
                  </a>

                  <a
                    href={release.downloads.macX64}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      background: dark ? '#18181b' : 'transparent',
                      color: dark ? '#d4d4d8' : '#71717a',
                      border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                      padding: '10px 16px',
                      borderRadius: 9,
                      fontSize: 12,
                      fontWeight: 500,
                      textDecoration: 'none',
                      textAlign: 'center',
                      transition: 'all 0.28s ease',
                    }}
                  >
                    Download for Intel Mac (.dmg)
                  </a>
                </div>
              </div>
            );
          })()}

          {/* Windows Card */}
          {(() => {
            const dark = isDark('windows');
            return (
              <div
                id="windows"
                onMouseEnter={() => setHoveredOS('windows')}
                onMouseLeave={() => setHoveredOS(null)}
                onClick={() => setDetectedOS('windows')}
                style={{
                  background: dark ? '#0d0d10' : '#fafafc',
                  border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                  borderRadius: 18,
                  padding: '38px 30px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: dark ? '0 20px 48px -12px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.02)',
                  transform: dark ? 'translateY(-4px)' : 'translateY(0)',
                  transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                  cursor: 'pointer',
                  opacity: dark ? 1 : 0.88,
                }}
              >
                {detectedOS === 'windows' && (
                  <div style={{
                    position: 'absolute',
                    top: 18,
                    right: 20,
                    background: dark ? '#27272a' : '#f0f0f2',
                    color: dark ? '#f4f4f5' : '#52525b',
                    border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    padding: '4px 10px',
                    borderRadius: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                    YOUR SYSTEM
                  </div>
                )}

                <div>
                  {/* Big Windows SVG Logo */}
                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: dark ? '#0078d4' : '#edf5fd',
                    border: dark ? '1px solid #0078d4' : '1px solid #d0e5fb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 24,
                    color: dark ? '#ffffff' : '#0078d4',
                    transition: 'all 0.28s ease',
                  }}>
                    <svg width="36" height="36" viewBox="0 0 88 88" fill="currentColor">
                      <path d="M0 12.402l35.689-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.016 45.728zm4.326-39.027L87.914 0v41.525l-47.918.275zm47.918 43.665L87.914 88l-47.918-6.766V46.068z" />
                    </svg>
                  </div>

                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: dark ? '#ffffff' : '#18181b', transition: 'color 0.28s ease' }}>
                    Windows
                  </h2>
                  <p style={{ fontSize: 13, color: dark ? '#a1a1aa' : '#71717a', margin: '0 0 26px', transition: 'color 0.28s ease' }}>
                    Windows 10 / Windows 11 (64-bit)
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a
                    href={release.downloads.windows}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: dark ? '#ffffff' : '#18181b',
                      color: dark ? '#09090b' : '#ffffff',
                      padding: '13px 20px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center',
                      boxShadow: dark ? '0 4px 16px rgba(255,255,255,0.18)' : 'none',
                      transition: 'all 0.28s ease',
                    }}
                  >
                    <Download size={16} /> Download .exe (Installer)
                  </a>
                </div>
              </div>
            );
          })()}

          {/* Linux Card */}
          {(() => {
            const dark = isDark('linux');
            return (
              <div
                id="linux"
                onMouseEnter={() => setHoveredOS('linux')}
                onMouseLeave={() => setHoveredOS(null)}
                onClick={() => setDetectedOS('linux')}
                style={{
                  background: dark ? '#0d0d10' : '#fafafc',
                  border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                  borderRadius: 18,
                  padding: '38px 30px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: dark ? '0 20px 48px -12px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.02)',
                  transform: dark ? 'translateY(-4px)' : 'translateY(0)',
                  transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                  cursor: 'pointer',
                  opacity: dark ? 1 : 0.88,
                }}
              >
                {detectedOS === 'linux' && (
                  <div style={{
                    position: 'absolute',
                    top: 18,
                    right: 20,
                    background: dark ? '#27272a' : '#f0f0f2',
                    color: dark ? '#f4f4f5' : '#52525b',
                    border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    padding: '4px 10px',
                    borderRadius: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                    YOUR SYSTEM
                  </div>
                )}

                <div>
                  {/* Big Linux Tux Penguin SVG Logo */}
                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: dark ? '#f59e0b' : '#fffbeb',
                    border: dark ? '1px solid #f59e0b' : '1px solid #fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 24,
                    color: dark ? '#09090b' : '#d97706',
                    transition: 'all 0.28s ease',
                  }}>
                    <TuxPenguinLogo size={42} />
                  </div>

                  <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: dark ? '#ffffff' : '#18181b', transition: 'color 0.28s ease' }}>
                    Linux
                  </h2>
                  <p style={{ fontSize: 13, color: dark ? '#a1a1aa' : '#71717a', margin: '0 0 26px', transition: 'color 0.28s ease' }}>
                    Ubuntu, Debian, Mint & AppImage
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a
                    href={release.downloads.linuxDeb}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: dark ? '#ffffff' : '#18181b',
                      color: dark ? '#09090b' : '#ffffff',
                      padding: '13px 20px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center',
                      boxShadow: dark ? '0 4px 16px rgba(255,255,255,0.18)' : 'none',
                      transition: 'all 0.28s ease',
                    }}
                  >
                    <Download size={16} /> Download .deb (Debian / Ubuntu)
                  </a>

                  <a
                    href={release.downloads.linuxAppImage}
                    download
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      background: dark ? '#18181b' : 'transparent',
                      color: dark ? '#d4d4d8' : '#71717a',
                      border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                      padding: '10px 16px',
                      borderRadius: 9,
                      fontSize: 12,
                      fontWeight: 500,
                      textDecoration: 'none',
                      textAlign: 'center',
                      transition: 'all 0.28s ease',
                    }}
                  >
                    Download .AppImage (Universal)
                  </a>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Direct Download Mirrors & GitHub CDN Assets */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e2e2',
          borderRadius: 14,
          padding: '28px 28px',
          marginBottom: 36,
          boxShadow: '0 2px 12px rgba(0,0,0,0.02)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 14,
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: '1px solid #f0f0f0',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700, color: '#111' }}>
                <ExternalLink size={18} color="#0078d4" /> Direct GitHub Release Mirrors
              </div>
              <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
                Direct binary download links hosted on GitHub Releases CDN. Fast, resumable, and zero rate-limits.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <a
                href={`https://github.com/${repoSlug}/releases/tag/${release.releaseTag}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#111',
                  background: '#f4f4f5',
                  border: '1px solid #e4e4e7',
                  padding: '7px 14px',
                  borderRadius: 8,
                  textDecoration: 'none',
                }}
              >
                Release {release.releaseTag} <ArrowUpRight size={13} />
              </a>
              <a
                href={githubReleasesUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#666',
                  textDecoration: 'none',
                }}
              >
                All Releases <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                platform: 'macOS Apple Silicon',
                arch: 'arm64',
                filename: release.fileNames.macArm64,
                url: release.downloads.macArm64,
                badge: '.dmg installer',
              },
              {
                platform: 'macOS Intel',
                arch: 'x64',
                filename: release.fileNames.macX64,
                url: release.downloads.macX64,
                badge: '.dmg installer',
              },
              {
                platform: 'Windows 10 / 11',
                arch: 'x64',
                filename: release.fileNames.windows,
                url: release.downloads.windows,
                badge: 'NSIS .exe',
              },
              {
                platform: 'Linux (Ubuntu / Debian / Mint)',
                arch: 'amd64',
                filename: release.fileNames.linuxDeb,
                url: release.downloads.linuxDeb,
                badge: '.deb package',
              },
              {
                platform: 'Linux Universal',
                arch: 'x64',
                filename: release.fileNames.linuxAppImage,
                url: release.downloads.linuxAppImage,
                badge: '.AppImage binary',
              },
            ].map((mirror) => (
              <div
                key={mirror.filename}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#fafafa',
                  border: '1px solid #eaeaea',
                  borderRadius: 8,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 260 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{mirror.platform}</span>
                  <span style={{ fontSize: 11, background: '#eee', padding: '2px 8px', borderRadius: 4, color: '#555', fontFamily: 'monospace' }}>
                    {mirror.badge}
                  </span>
                </div>

                <div style={{
                  flex: 1,
                  minWidth: 200,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#555',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {mirror.filename}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => copyMirrorUrl(mirror.url, mirror.filename)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      background: copiedMirror === mirror.filename ? '#15803d' : '#ffffff',
                      color: copiedMirror === mirror.filename ? '#ffffff' : '#444444',
                      border: '1px solid #d4d4d8',
                      padding: '6px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {copiedMirror === mirror.filename ? <Check size={12} /> : <Copy size={12} />}
                    {copiedMirror === mirror.filename ? 'Copied' : 'Copy Mirror URL'}
                  </button>

                  <a
                    href={mirror.url}
                    download
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      background: '#18181b',
                      color: '#ffffff',
                      padding: '6px 14px',
                      borderRadius: 6,
                      textDecoration: 'none',
                    }}
                  >
                    <Download size={12} /> Direct Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Private License Notice Banner */}
        <div style={{
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: 12,
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: '#f4f4f4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#333',
              flexShrink: 0,
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#222' }}>
                Desktop Access Requires a Private License Key
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                Novi is only in private release. You will be prompted to enter your license key on first launch.
              </div>
            </div>
          </div>

          <Link
            href="/license"
            style={{
              background: '#f4f4f4',
              color: '#222',
              border: '1px solid #dcdcdc',
              padding: '9px 18px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Learn About Private Licenses <ArrowUpRight size={14} />
          </Link>
        </div>
      </main>

    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import TuxPenguinLogo from '@/components/TuxPenguinLogo';
import { PlatformFlipGrid } from './PlatformFlipGrid';
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
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [copiedMirror, setCopiedMirror] = useState<string | null>(null);
  const [siteOrigin, setSiteOrigin] = useState('https://novi-virid.vercel.app');

  const copyMirrorUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedMirror(id);
    setTimeout(() => setCopiedMirror(null), 2000);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.origin) setSiteOrigin(window.location.origin);
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

      <style dangerouslySetInnerHTML={{
        __html: `
        .download-content-main {
          max-width: 1100px;
          width: 100%;
          margin: 0 auto;
          padding: 60px 24px 80px;
          flex: 1;
        }
        .download-heading-h1 {
          font-size: 44px;
          font-weight: 600;
          letter-spacing: -1.5px;
          margin: 0 0 16px;
          line-height: 1.15;
        }
        .download-mirror-card {
          background: #ffffff;
          border: 1px solid #e2e2e2;
          border-radius: 14px;
          padding: 28px;
          margin-bottom: 36px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.02);
        }
        .download-mirror-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #fafafa;
          border: 1px solid #eaeaea;
          border-radius: 8px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .download-mirror-info {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 240px;
        }
        .download-mirror-filename {
          flex: 1;
          min-width: 180px;
          font-family: monospace;
          font-size: 12px;
          color: #555;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .download-mirror-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .download-license-banner {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 24px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .download-content-main {
            padding: 30px 16px 60px !important;
          }
          .download-heading-h1 {
            font-size: 30px !important;
            letter-spacing: -1px !important;
          }
          .download-mirror-card {
            padding: 18px 16px !important;
          }
          .download-mirror-row {
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 14px 12px !important;
            gap: 10px !important;
          }
          .download-mirror-info {
            min-width: 0 !important;
            width: 100% !important;
            justify-content: space-between !important;
          }
          .download-mirror-filename {
            min-width: 0 !important;
            width: 100% !important;
            white-space: normal !important;
            word-break: break-all !important;
            font-size: 11px !important;
          }
          .download-mirror-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .download-mirror-actions > button,
          .download-mirror-actions > a {
            justify-content: center !important;
            padding: 8px 10px !important;
            text-align: center !important;
          }
          .download-license-banner {
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 18px 16px !important;
            gap: 14px !important;
          }
          .download-license-banner a {
            justify-content: center !important;
            width: 100% !important;
          }
        }
      ` }} />

      {/* Main Content */}
      <main className="download-content-main">
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

          <h1 className="download-heading-h1">
            Download Novi for your platform
          </h1>

          <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6, margin: '0 0 20px' }}>
            A calm, transparent, and private AI companion for your desktop. Choose your operating system below to get started.
          </p>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, margin: '0 0 20px' }}>
            You sign in to the app with a desktop login from your Novi account. No account yet? <Link href="/get-access" style={{ color: '#111', fontWeight: 600 }}>Get access first</Link>.
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
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            <Calendar size={14} color="#0078d4" />
            <span>
              Last Release: <strong style={{ color: '#111' }}>{release.releaseDate}</strong>
            </span>
            {relativeTime && (
              <span style={{ color: '#777', fontSize: 11 }}>
                ({relativeTime})
              </span>
            )}
            {isLiveFromGitHub && (
              <span
                title="Synced live from GitHub Releases"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: '#16a34a',
                  marginLeft: 4,
                  paddingLeft: 8,
                  borderLeft: '1px solid #eee'
                }}
              >
                <CheckCircle2 size={14} />
              </span>
            )}
          </div>
        </div>

        {/* Platform Flip Cards Grid (Compact, KISS, 3D hover flip with centered logos) */}
        <PlatformFlipGrid
          release={release}
          siteOrigin={siteOrigin}
          detectedOS={detectedOS}
          setDetectedOS={setDetectedOS}
          copiedMirror={copiedMirror}
          copyMirrorUrl={copyMirrorUrl}
          isDark={isDark}
          setHoveredOS={setHoveredOS}
        />

        {/* Direct Download Mirrors & GitHub CDN Assets Table */}
        <div className="download-mirror-card">
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

          {/* Mirrors Table Wrapper */}
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e4e4e7' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #e4e4e7', color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px' }}>Platform & Architecture</th>
                  <th style={{ padding: '12px 16px' }}>Format</th>
                  <th style={{ padding: '12px 16px' }}>Release Artifact File</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    platform: 'macOS Apple Silicon',
                    arch: 'arm64',
                    logo: '/apple-logo.png',
                    filename: release.fileNames.macArm64,
                    url: release.downloads.macArm64,
                    badge: '.dmg installer',
                  },
                  {
                    platform: 'macOS Intel',
                    arch: 'x64',
                    logo: '/apple-logo.png',
                    filename: release.fileNames.macX64,
                    url: release.downloads.macX64,
                    badge: '.dmg installer',
                  },
                  {
                    platform: 'Windows 10 / 11',
                    arch: 'x64',
                    logo: '/microsoft.png',
                    filename: release.fileNames.windows,
                    url: release.downloads.windows,
                    badge: 'NSIS .exe',
                  },
                  {
                    platform: 'Linux (Ubuntu / Debian)',
                    arch: 'amd64',
                    logo: '/ubuntu.png',
                    filename: release.fileNames.linuxDeb,
                    url: release.downloads.linuxDeb,
                    badge: '.deb package',
                  },
                  {
                    platform: 'Linux Universal',
                    arch: 'x64',
                    logo: '/ubuntu.png',
                    filename: release.fileNames.linuxAppImage,
                    url: release.downloads.linuxAppImage,
                    badge: '.AppImage binary',
                  },
                ].map((mirror, idx, arr) => (
                  <tr
                    key={mirror.filename}
                    style={{
                      borderBottom: idx === arr.length - 1 ? 'none' : '1px solid #f0f0f0',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#111' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                          <img src={mirror.logo} alt={mirror.platform} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                        </div>
                        <span>{mirror.platform}</span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 11, background: '#f4f4f5', border: '1px solid #e4e4e7', padding: '3px 8px', borderRadius: 6, color: '#444', fontFamily: 'monospace', fontWeight: 600 }}>
                        {mirror.badge}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: 12, color: '#555' }}>
                      {mirror.filename}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
                            padding: '6px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {copiedMirror === mirror.filename ? <Check size={12} /> : <Copy size={12} />}
                          {copiedMirror === mirror.filename ? 'Copied ✓' : 'Copy URL'}
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
                            background: '#09090b',
                            color: '#ffffff',
                            padding: '6px 14px',
                            borderRadius: 6,
                            textDecoration: 'none',
                          }}
                        >
                          <Download size={12} /> Download
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Private License Notice Banner */}
        <div className="download-license-banner">
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
                You need a desktop login to use the app
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                Sign in to your Novi account on this website to create one, then use it to sign in to the desktop app.
              </div>
            </div>
          </div>

          <Link
            href="/get-access"
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
            Get access <ArrowUpRight size={14} />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

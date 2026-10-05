'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
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

  useEffect(() => {
    // Attempt to sync latest live release directly from GitHub Releases API
    const repoSlug = initialRelease.repo || 'axjh03/Astra';
    fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data || !data.tag_name) return;

        const tagName = String(data.tag_name);
        const version = tagName.replace(/^v/, '');
        const publishedDate = data.published_at ? formatDate(data.published_at) : initialRelease.releaseDate;
        const updatedAt = data.published_at || initialRelease.updatedAt;

        // Map live assets if available
        const downloads: ReleaseAssetInfo = { ...initialRelease.downloads };
        const fileNames = { ...initialRelease.fileNames };

        if (Array.isArray(data.assets)) {
          for (const asset of data.assets) {
            const name = String(asset.name || '');
            const downloadUrl = asset.browser_download_url;

            if (name.endsWith('.dmg')) {
              if (name.includes('arm64')) {
                downloads.macArm64 = downloadUrl;
                fileNames.macArm64 = name;
              } else {
                downloads.macX64 = downloadUrl;
                fileNames.macX64 = name;
              }
            } else if (name.endsWith('.exe')) {
              downloads.windows = downloadUrl;
              fileNames.windows = name;
            } else if (name.endsWith('.deb')) {
              downloads.linuxDeb = downloadUrl;
              fileNames.linuxDeb = name;
            } else if (name.endsWith('.AppImage')) {
              downloads.linuxAppImage = downloadUrl;
              fileNames.linuxAppImage = name;
            }
          }
        }

        setRelease((prev) => ({
          ...prev,
          version,
          releaseTag: tagName,
          releaseDate: publishedDate,
          updatedAt,
          downloads,
          fileNames
        }));
        setIsLiveFromGitHub(true);
      })
      .catch(() => {
        // Fall back seamlessly to pre-baked release-info.json
      });
  }, [initialRelease]);

  const relativeTime = timeAgo(release.updatedAt);
  const repoSlug = release.repo || 'axjh03/Astra';
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
          <Link href="/download" style={{ color: '#111', fontWeight: 600, textDecoration: 'none' }}>Download</Link>
          <Link href="/license" style={{ color: '#666', textDecoration: 'none' }}>License</Link>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: 24,
          marginBottom: 50,
        }}>
          {/* macOS Card */}
          <div id="mac" style={{
            background: '#fff',
            border: '1px solid #e2e2e2',
            borderRadius: 14,
            padding: '36px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: '#f2f2f2',
              color: '#555',
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 5,
            }}>
              RECOMMENDED
            </div>
            <div>
              {/* Apple SVG Logo */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#181818',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                color: '#fff',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.64-.78 1.08-1.86.96-2.95-1 .04-2.13.67-2.79 1.45-.58.67-1.1 1.77-.96 2.84 1.12.09 2.15-.56 2.79-1.34z"/>
                </svg>
              </div>

              <h2 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 8px' }}>macOS</h2>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 20px', lineHeight: 1.5 }}>
                Native build for Apple Silicon (M1/M2/M3/M4) and Intel Macs.
              </p>

              <div style={{ fontSize: 12, color: '#555', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>• Format: <b>.dmg</b> installer</div>
                <div>• Version: <b>{release.version}</b></div>
                <div>• macOS 11.0 (Big Sur) or later</div>
              </div>
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
                  background: '#1a1a1a',
                  color: '#fff',
                  padding: '12px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  textAlign: 'center',
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
                  background: '#f4f4f4',
                  color: '#333',
                  border: '1px solid #ddd',
                  padding: '9px 14px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                Download for Intel Mac (.dmg)
              </a>

              <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 4 }}>
                Build: {release.fileNames.macArm64}
              </div>
            </div>
          </div>

          {/* Windows Card */}
          <div id="windows" style={{
            background: '#fff',
            border: '1px solid #e2e2e2',
            borderRadius: 14,
            padding: '36px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          }}>
            <div>
              {/* Windows SVG Logo */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#0078d4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                color: '#fff',
              }}>
                <svg width="22" height="22" viewBox="0 0 88 88" fill="currentColor">
                  <path d="M0 12.402l35.689-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.016 45.728zm4.326-39.027L87.914 0v41.525l-47.918.275zm47.918 43.665L87.914 88l-47.918-6.766V46.068z"/>
                </svg>
              </div>

              <h2 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 8px' }}>Windows</h2>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 20px', lineHeight: 1.5 }}>
                Standard NSIS executable installer with desktop shortcut and start menu integration.
              </p>

              <div style={{ fontSize: 12, color: '#555', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>• Format: <b>.exe</b> (NSIS installer)</div>
                <div>• Architecture: <b>64-bit (x64)</b></div>
                <div>• Windows 10 / Windows 11</div>
              </div>
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
                  background: '#1a1a1a',
                  color: '#fff',
                  padding: '12px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                <Download size={16} /> Download .exe (Installer)
              </a>

              <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 12 }}>
                Build: {release.fileNames.windows}
              </div>
            </div>
          </div>

          {/* Debian / Linux Card */}
          <div id="debian" style={{
            background: '#fff',
            border: '1px solid #e2e2e2',
            borderRadius: 14,
            padding: '36px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          }}>
            <div>
              {/* Debian SVG Logo */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#d70a53',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                color: '#fff',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.88 12.685c-.4 0 .08.2.601.28.14-.1.27-.22.39-.33a3.001 3.001 0 01-.99.05m2.14-.53c.23-.33.4-.69.47-1.06-.06.27-.2.5-.33.73-.75.47-.07-.27 0-.56-.8 1.01-.11.6-.14.89m.781-2.05c.05-.721-.14-.501-.2-.221.07.04.13.5.2.22M12.38.31c.2.04.45.07.42.12.23-.05.28-.1-.43-.12m.43.12l-.15.03.14-.01V.43m6.633 9.944c.02.64-.2.95-.38 1.5l-.35.181c-.28.54.03.35-.17.78-.44.39-1.34 1.22-1.62 1.301-.201 0 .14-.25.19-.34-.591.4-.481.6-1.371.85l-.03-.06c-2.221 1.04-5.303-1.02-5.253-3.842-.03.17-.07.13-.12.2a3.551 3.552 0 012.001-3.501 3.361 3.362 0 013.732.48 3.341 3.342 0 00-2.721-1.3c-1.18.01-2.281.76-2.651 1.57-.6.38-.67 1.47-.93 1.661-.361 2.601.66 3.722 2.38 5.042.27.19.08.21.12.35a4.702 4.702 0 01-1.53-1.16c.23.33.47.66.8.91-.55-.18-1.27-1.3-1.48-1.35.93 1.66 3.78 2.921 5.261 2.3a6.203 6.203 0 01-2.33-.28c-.33-.16-.77-.51-.7-.57a5.802 5.803 0 005.902-.84c.44-.35.93-.94 1.07-.95-.2.32.04.16-.12.44.44-.72-.2-.3.46-1.24l.24.33c-.09-.6.74-1.321.66-2.262.19-.3.2.3 0 .97.29-.74.08-.85.15-1.46.08.2.18.42.23.63-.18-.7.2-1.2.28-1.6-.09-.05-.28.3-.32-.53 0-.37.1-.2.14-.28-.08-.05-.26-.32-.38-.861.08-.13.22.33.34.34-.08-.42-.2-.75-.2-1.08-.34-.68-.12.1-.4-.3-.34-1.091.3-.25.34-.74.54.77.84 1.96.981 2.46-.1-.6-.28-1.2-.49-1.76.16.07-.26-1.241.21-.37A7.823 7.824 0 0017.702 1.6c.18.17.42.39.33.42-.75-.45"/>
                </svg>
              </div>

              <h2 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 8px' }}>Debian / Ubuntu</h2>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 20px', lineHeight: 1.5 }}>
                Native Debian package for Ubuntu, Linux Mint, Debian, and derivatives.
              </p>

              <div style={{ fontSize: 12, color: '#555', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>• Format: <b>.deb</b> (and portable .AppImage)</div>
                <div>• Architecture: <b>64-bit (x64)</b></div>
                <div>• Debian 11+ / Ubuntu 20.04 LTS+</div>
              </div>
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
                  background: '#1a1a1a',
                  color: '#fff',
                  padding: '12px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                <Download size={16} /> Download .deb
              </a>

              <a
                href={release.downloads.linuxAppImage}
                download
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: '#f4f4f4',
                  color: '#333',
                  border: '1px solid #ddd',
                  padding: '9px 14px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                Download .AppImage
              </a>

              <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 4 }}>
                Build: {release.fileNames.linuxDeb}
              </div>
            </div>
          </div>
        </div>

        {/* GitHub Releases Link Card */}
        <div style={{
          textAlign: 'center',
          marginBottom: 40,
        }}>
          <a
            href={githubReleasesUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: '#555',
              textDecoration: 'none',
              fontWeight: 500,
              padding: '6px 14px',
              borderRadius: 6,
              background: '#f0f0f0',
            }}
          >
            <Tag size={14} /> View all releases, tags & full changelog on GitHub <ExternalLink size={13} />
          </a>
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
                Novi is currently in private release. You will be prompted to enter your license key on first launch.
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

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #e5e5e5',
        padding: '28px 32px',
        textAlign: 'center',
        fontSize: 12,
        color: '#888',
      }}>
        Novi — Private, bring-your-own-key AI desktop companion.
      </footer>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';
import type { ReleaseData } from './DownloadClient';

interface PlatformFlipGridProps {
  release: ReleaseData;
  siteOrigin: string;
  detectedOS: 'mac' | 'windows' | 'linux';
  setDetectedOS: (os: 'mac' | 'windows' | 'linux') => void;
  copiedMirror: string | null;
  copyMirrorUrl: (url: string, id: string) => void;
  isDark: (os: 'mac' | 'windows' | 'linux') => boolean;
  setHoveredOS: (os: 'mac' | 'windows' | 'linux' | null) => void;
}

function TuxPenguinLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2z" />
    </svg>
  );
}

export function PlatformFlipGrid({
  release,
  siteOrigin,
  detectedOS,
  setDetectedOS,
  copiedMirror,
  copyMirrorUrl,
  isDark,
  setHoveredOS,
}: PlatformFlipGridProps) {
  const [flippedCard, setFlippedCard] = useState<string | null>(null);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .novi-flip-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
          margin-bottom: 50px;
          align-items: stretch;
        }
        @media (max-width: 1040px) {
          .novi-flip-grid {
            grid-template-columns: 1fr !important;
            max-width: 520px;
            margin: 0 auto 50px auto;
          }
        }
        .novi-flip-card {
          perspective: 1200px;
          height: 320px;
          user-select: none;
        }
        .novi-flip-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          transform-style: preserve-3d;
          border-radius: 18px;
        }
        @media (hover: hover) and (pointer: fine) {
          .novi-flip-card:hover .novi-flip-inner {
            transform: rotateY(180deg);
          }
        }
        .novi-flip-card.is-flipped .novi-flip-inner {
          transform: rotateY(180deg);
        }
        .novi-flip-front,
        .novi-flip-back {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          border-radius: 18px;
          box-sizing: border-box;
        }
        .novi-flip-front {
          display: flex;
          flex-direction: column;
          align-items: center;
          justifyContent: center;
          padding: 24px 20px;
          cursor: pointer;
        }
        .novi-flip-back {
          transform: rotateY(180deg);
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          padding: 22px 20px;
          text-align: left;
          cursor: default;
        }
      ` }} />

      <div className="novi-flip-grid">
        {/* ============================================================== */}
        {/* 1. macOS Card */}
        {/* ============================================================== */}
        {(() => {
          const dark = isDark('mac');
          const isFlipped = flippedCard === 'mac';
          return (
            <div
              id="mac"
              className={`novi-flip-card ${isFlipped ? 'is-flipped' : ''}`}
              onMouseEnter={() => setHoveredOS('mac')}
              onMouseLeave={() => setHoveredOS(null)}
              onClick={() => setDetectedOS('mac')}
            >
              <div className="novi-flip-inner">
                {/* Front: Centered Logo & Title */}
                <div
                  className="novi-flip-front"
                  onClick={() => setFlippedCard(isFlipped ? null : 'mac')}
                  style={{
                    background: dark ? '#0d0d10' : '#fafafc',
                    border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                    boxShadow: dark ? '0 16px 36px -10px rgba(0,0,0,0.4)' : '0 2px 10px rgba(0,0,0,0.02)',
                  }}
                >
                  {detectedOS === 'mac' && (
                    <div style={{
                      position: 'absolute',
                      top: 14,
                      right: 14,
                      background: dark ? '#27272a' : '#f0f0f2',
                      color: dark ? '#f4f4f5' : '#52525b',
                      border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '3px 8px',
                      borderRadius: 20,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                      YOUR SYSTEM
                    </div>
                  )}

                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: dark ? '#ffffff' : '#000000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    color: dark ? '#000000' : '#ffffff',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  }}>
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.64-.78 1.08-1.86.96-2.95-1 .04-2.13.67-2.79 1.45-.58.67-1.1 1.77-.96 2.84 1.12.09 2.15-.56 2.79-1.34z" />
                    </svg>
                  </div>

                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: dark ? '#ffffff' : '#18181b' }}>
                    macOS
                  </h2>
                  <p style={{ fontSize: 12, color: dark ? '#a1a1aa' : '#71717a', margin: '0 0 16px' }}>
                    Apple Silicon & Intel
                  </p>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: dark ? '#60a5fa' : '#2563eb',
                    background: dark ? '#1e293b' : '#eff6ff',
                    padding: '4px 10px',
                    borderRadius: 14,
                  }}>
                    Hover / Tap to Install ➔
                  </div>
                </div>

                {/* Back: Action Options */}
                <div
                  className="novi-flip-back"
                  style={{
                    background: dark ? '#111115' : '#ffffff',
                    border: dark ? '1px solid #3f3f46' : '1px solid #d4d4d8',
                    boxShadow: dark ? '0 18px 40px -10px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.06)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: dark ? '#60a5fa' : '#2563eb', textTransform: 'uppercase' }}>
                        ⚡ 1-Click Terminal
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyMirrorUrl(`curl -fsSL ${siteOrigin}/install.sh | bash`, 'mac-cli');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            fontFamily: 'monospace',
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: dark ? '1px solid #3f3f46' : '1px solid #d4d4d8',
                            background: copiedMirror === 'mac-cli' ? '#16a34a' : (dark ? '#27272a' : '#f4f4f5'),
                            color: copiedMirror === 'mac-cli' ? '#ffffff' : (dark ? '#f4f4f5' : '#18181b'),
                            cursor: 'pointer',
                          }}
                        >
                          {copiedMirror === 'mac-cli' ? <Check size={10} /> : <Copy size={10} />}
                          {copiedMirror === 'mac-cli' ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFlippedCard(null);
                          }}
                          aria-label="Flip back"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: dark ? '#a1a1aa' : '#71717a',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <code style={{
                      display: 'block',
                      fontFamily: 'monospace',
                      fontSize: 10.5,
                      color: dark ? '#38bdf8' : '#0284c7',
                      background: dark ? '#09090b' : '#f8fafc',
                      padding: '7px 8px',
                      borderRadius: 6,
                      border: dark ? '1px solid #1e293b' : '1px solid #e2e8f0',
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                    }}>
                      {`curl -fsSL ${siteOrigin}/install.sh | bash`}
                    </code>
                    <div style={{ fontSize: 9.5, color: dark ? '#71717a' : '#a1a1aa', marginTop: 4 }}>
                      Bypasses Gatekeeper quarantine & launches Novi.
                    </div>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: dark ? '#a1a1aa' : '#71717a', textTransform: 'uppercase', marginBottom: 6 }}>
                      Direct .dmg Download
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={release.downloads.macArm64}
                        download
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          background: dark ? '#ffffff' : '#18181b',
                          color: dark ? '#09090b' : '#ffffff',
                          padding: '7px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        <Download size={12} /> Apple Silicon
                      </a>
                      <a
                        href={release.downloads.macX64}
                        download
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          background: dark ? '#27272a' : '#f4f4f5',
                          color: dark ? '#ffffff' : '#18181b',
                          padding: '7px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          textDecoration: 'none',
                          border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                        }}
                      >
                        <Download size={12} /> Intel
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ============================================================== */}
        {/* 2. Windows Card */}
        {/* ============================================================== */}
        {(() => {
          const dark = isDark('windows');
          const isFlipped = flippedCard === 'windows';
          return (
            <div
              id="windows"
              className={`novi-flip-card ${isFlipped ? 'is-flipped' : ''}`}
              onMouseEnter={() => setHoveredOS('windows')}
              onMouseLeave={() => setHoveredOS(null)}
              onClick={() => setDetectedOS('windows')}
            >
              <div className="novi-flip-inner">
                {/* Front: Centered Logo & Title */}
                <div
                  className="novi-flip-front"
                  onClick={() => setFlippedCard(isFlipped ? null : 'windows')}
                  style={{
                    background: dark ? '#0d0d10' : '#fafafc',
                    border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                    boxShadow: dark ? '0 16px 36px -10px rgba(0,0,0,0.4)' : '0 2px 10px rgba(0,0,0,0.02)',
                  }}
                >
                  {detectedOS === 'windows' && (
                    <div style={{
                      position: 'absolute',
                      top: 14,
                      right: 14,
                      background: dark ? '#27272a' : '#f0f0f2',
                      color: dark ? '#f4f4f5' : '#52525b',
                      border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '3px 8px',
                      borderRadius: 20,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                      YOUR SYSTEM
                    </div>
                  )}

                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: dark ? '#0078d4' : '#edf5fd',
                    border: dark ? '1px solid #0078d4' : '1px solid #d0e5fb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    color: dark ? '#ffffff' : '#0078d4',
                    boxShadow: '0 8px 24px rgba(0,120,212,0.18)',
                  }}>
                    <svg width="34" height="34" viewBox="0 0 88 88" fill="currentColor">
                      <path d="M0 12.402l35.689-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.016 45.728zm4.326-39.027L87.914 0v41.525l-47.918.275zm47.918 43.665L87.914 88l-47.918-6.766V46.068z" />
                    </svg>
                  </div>

                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: dark ? '#ffffff' : '#18181b' }}>
                    Windows
                  </h2>
                  <p style={{ fontSize: 12, color: dark ? '#a1a1aa' : '#71717a', margin: '0 0 16px' }}>
                    Windows 10 & 11 (64-bit)
                  </p>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#0078d4',
                    background: dark ? '#0c2742' : '#edf5fd',
                    padding: '4px 10px',
                    borderRadius: 14,
                  }}>
                    Hover / Tap to Install ➔
                  </div>
                </div>

                {/* Back: Actions */}
                <div
                  className="novi-flip-back"
                  style={{
                    background: dark ? '#111115' : '#ffffff',
                    border: dark ? '1px solid #3f3f46' : '1px solid #d4d4d8',
                    boxShadow: dark ? '0 18px 40px -10px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.06)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: dark ? '#60a5fa' : '#2563eb', textTransform: 'uppercase' }}>
                        ⚡ PowerShell
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyMirrorUrl(`irm ${siteOrigin}/install.ps1 | iex`, 'win-cli');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            fontFamily: 'monospace',
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: dark ? '1px solid #3f3f46' : '1px solid #d4d4d8',
                            background: copiedMirror === 'win-cli' ? '#16a34a' : (dark ? '#27272a' : '#f4f4f5'),
                            color: copiedMirror === 'win-cli' ? '#ffffff' : (dark ? '#f4f4f5' : '#18181b'),
                            cursor: 'pointer',
                          }}
                        >
                          {copiedMirror === 'win-cli' ? <Check size={10} /> : <Copy size={10} />}
                          {copiedMirror === 'win-cli' ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFlippedCard(null);
                          }}
                          aria-label="Flip back"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: dark ? '#a1a1aa' : '#71717a',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <code style={{
                      display: 'block',
                      fontFamily: 'monospace',
                      fontSize: 10.5,
                      color: dark ? '#38bdf8' : '#0284c7',
                      background: dark ? '#09090b' : '#f8fafc',
                      padding: '7px 8px',
                      borderRadius: 6,
                      border: dark ? '1px solid #1e293b' : '1px solid #e2e8f0',
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                    }}>
                      {`irm ${siteOrigin}/install.ps1 | iex`}
                    </code>
                    <div style={{ fontSize: 9.5, color: dark ? '#71717a' : '#a1a1aa', marginTop: 4 }}>
                      Runs silent background installer & launches Novi.
                    </div>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: dark ? '#a1a1aa' : '#71717a', textTransform: 'uppercase', marginBottom: 6 }}>
                      Direct .exe Installer
                    </span>
                    <a
                      href={release.downloads.windows}
                      download
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        background: dark ? '#ffffff' : '#18181b',
                        color: dark ? '#09090b' : '#ffffff',
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <Download size={13} /> Download Novi-Setup.exe
                    </a>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ============================================================== */}
        {/* 3. Linux Card */}
        {/* ============================================================== */}
        {(() => {
          const dark = isDark('linux');
          const isFlipped = flippedCard === 'linux';
          return (
            <div
              id="linux"
              className={`novi-flip-card ${isFlipped ? 'is-flipped' : ''}`}
              onMouseEnter={() => setHoveredOS('linux')}
              onMouseLeave={() => setHoveredOS(null)}
              onClick={() => setDetectedOS('linux')}
            >
              <div className="novi-flip-inner">
                {/* Front: Centered Logo & Title */}
                <div
                  className="novi-flip-front"
                  onClick={() => setFlippedCard(isFlipped ? null : 'linux')}
                  style={{
                    background: dark ? '#0d0d10' : '#fafafc',
                    border: dark ? '1px solid #27272a' : '1px solid #e4e4e7',
                    boxShadow: dark ? '0 16px 36px -10px rgba(0,0,0,0.4)' : '0 2px 10px rgba(0,0,0,0.02)',
                  }}
                >
                  {detectedOS === 'linux' && (
                    <div style={{
                      position: 'absolute',
                      top: 14,
                      right: 14,
                      background: dark ? '#27272a' : '#f0f0f2',
                      color: dark ? '#f4f4f5' : '#52525b',
                      border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '3px 8px',
                      borderRadius: 20,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                      YOUR SYSTEM
                    </div>
                  )}

                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: dark ? '#f59e0b' : '#fffbeb',
                    border: dark ? '1px solid #f59e0b' : '1px solid #fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    color: dark ? '#09090b' : '#d97706',
                    boxShadow: '0 8px 24px rgba(245,158,11,0.18)',
                  }}>
                    <TuxPenguinLogo size={38} />
                  </div>

                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: dark ? '#ffffff' : '#18181b' }}>
                    Linux
                  </h2>
                  <p style={{ fontSize: 12, color: dark ? '#a1a1aa' : '#71717a', margin: '0 0 16px' }}>
                    Debian, Ubuntu & AppImage
                  </p>

                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#d97706',
                    background: dark ? '#342308' : '#fef3c7',
                    padding: '4px 10px',
                    borderRadius: 14,
                  }}>
                    Hover / Tap to Install ➔
                  </div>
                </div>

                {/* Back: Actions */}
                <div
                  className="novi-flip-back"
                  style={{
                    background: dark ? '#111115' : '#ffffff',
                    border: dark ? '1px solid #3f3f46' : '1px solid #d4d4d8',
                    boxShadow: dark ? '0 18px 40px -10px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.06)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: dark ? '#60a5fa' : '#2563eb', textTransform: 'uppercase' }}>
                        ⚡ Terminal
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyMirrorUrl(`curl -fsSL ${siteOrigin}/install.sh | bash`, 'linux-cli');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            fontFamily: 'monospace',
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: dark ? '1px solid #3f3f46' : '1px solid #d4d4d8',
                            background: copiedMirror === 'linux-cli' ? '#16a34a' : (dark ? '#27272a' : '#f4f4f5'),
                            color: copiedMirror === 'linux-cli' ? '#ffffff' : (dark ? '#f4f4f5' : '#18181b'),
                            cursor: 'pointer',
                          }}
                        >
                          {copiedMirror === 'linux-cli' ? <Check size={10} /> : <Copy size={10} />}
                          {copiedMirror === 'linux-cli' ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFlippedCard(null);
                          }}
                          aria-label="Flip back"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: dark ? '#a1a1aa' : '#71717a',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <code style={{
                      display: 'block',
                      fontFamily: 'monospace',
                      fontSize: 10.5,
                      color: dark ? '#38bdf8' : '#0284c7',
                      background: dark ? '#09090b' : '#f8fafc',
                      padding: '7px 8px',
                      borderRadius: 6,
                      border: dark ? '1px solid #1e293b' : '1px solid #e2e8f0',
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                    }}>
                      {`curl -fsSL ${siteOrigin}/install.sh | bash`}
                    </code>
                    <div style={{ fontSize: 9.5, color: dark ? '#71717a' : '#a1a1aa', marginTop: 4 }}>
                      Provisions .deb or AppImage & launches automatically.
                    </div>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: dark ? '#a1a1aa' : '#71717a', textTransform: 'uppercase', marginBottom: 6 }}>
                      Direct Packages
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={release.downloads.linuxDeb}
                        download
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          background: dark ? '#27272a' : '#f4f4f5',
                          color: dark ? '#ffffff' : '#18181b',
                          padding: '7px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          textDecoration: 'none',
                          border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                        }}
                      >
                        <Download size={12} /> .deb
                      </a>
                      <a
                        href={release.downloads.linuxAppImage}
                        download
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          background: dark ? '#27272a' : '#f4f4f5',
                          color: dark ? '#ffffff' : '#18181b',
                          padding: '7px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          textDecoration: 'none',
                          border: dark ? '1px solid #3f3f46' : '1px solid #e4e4e7',
                        }}
                      >
                        <Download size={12} /> AppImage
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

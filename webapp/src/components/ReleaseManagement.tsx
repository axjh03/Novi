'use client';

import React, { useState, useEffect } from 'react';
import {
  Rocket,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  GitCommit,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Tag,
  Check,
  Terminal,
  Zap,
  Loader2
} from 'lucide-react';

interface CommitItem {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  runNumber: number;
}

interface ReleaseData {
  repo: string;
  currentTag: string;
  currentVersion: string;
  nextSuggestedVersion: string;
  isOutdated: boolean;
  commitsAhead: number;
  commits: CommitItem[];
  latestRun: WorkflowRun | null;
  configured: boolean;
}

export default function ReleaseManagement({ admin }: { admin: boolean }) {
  const [data, setData] = useState<ReleaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [customVersion, setCustomVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/control/release', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch release status');
      setData(json.data);
      if (!customVersion) {
        setCustomVersion(json.data.nextSuggestedVersion || '');
      }
      if (!releaseNotes && json.data.commits?.length > 0) {
        const bulletList = json.data.commits
          .map((c: CommitItem) => `• ${c.message}`)
          .join('\n');
        setReleaseNotes(bulletList);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching release info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTriggerRelease = async () => {
    if (!customVersion) return;
    setTriggering(true);
    setError(null);
    setSuccessMsg(null);
    setShowConfirm(false);

    try {
      const res = await fetch('/api/control/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          version: customVersion,
          releaseNotes,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to trigger release');

      setSuccessMsg(
        `🚀 Release v${json.data.version} successfully started! GitHub Actions is compiling .dmg, .exe, and .deb packages.`
      );
      // Refresh status after 3 seconds
      setTimeout(() => {
        fetchStatus();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to trigger release');
    } finally {
      setTriggering(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666' }}>
        <RefreshCw size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 12, fontSize: 14 }}>Connecting to GitHub Actions & inspecting commit status…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Banner / Outdated Alert */}
      {data && (
        <div>
          {data.isOutdated ? (
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 12,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>
                    Release is Outdated ({data.commitsAhead} new {data.commitsAhead === 1 ? 'commit' : 'commits'} pushed to main)
                  </div>
                  <p style={{ fontSize: 13, color: '#b45309', margin: '4px 0 0' }}>
                    Current desktop installers are on <strong>{data.currentTag}</strong>. You have unreleased changes waiting to be packaged.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn dark"
                onClick={() => setShowConfirm(true)}
                disabled={triggering}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 20px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Rocket size={16} /> Release v{customVersion || data.nextSuggestedVersion} Now
              </button>
            </div>
          ) : (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 12,
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>
                    Desktop Releases are Up to Date
                  </div>
                  <p style={{ fontSize: 13, color: '#15803d', margin: '2px 0 0' }}>
                    The latest commit on main is packaged in <strong>{data.currentTag}</strong>. Zero pending commits.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchStatus}
                style={{
                  background: '#fff',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  padding: '7px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={13} /> Check Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div style={{
          background: '#09090b',
          color: '#ffffff',
          padding: '16px 20px',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <Check size={18} color="#22c55e" />
            <span>{successMsg}</span>
          </div>
          <a
            href="https://github.com/axjh03/Novi/actions"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#60a5fa',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Watch Build on GitHub <ArrowUpRight size={14} />
          </a>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 2-Column Grid: Release Control & Commits Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        
        {/* Left Card: 1-Click Release Form */}
        <section className="panel" style={{ padding: '24px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Rocket size={18} color="#111" />
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Trigger New Desktop Release</h2>
          </div>
          <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: '0 0 20px' }}>
            Compiles cross-platform desktop installers (<strong>macOS .dmg</strong>, <strong>Windows .exe</strong>, <strong>Linux .deb & AppImage</strong>) via GitHub Actions CI/CD runners.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                Release Version (SemVer)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#777', fontWeight: 600 }}>v</span>
                <input
                  type="text"
                  value={customVersion}
                  onChange={(e) => setCustomVersion(e.target.value.replace(/^v/, ''))}
                  placeholder="0.1.2"
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    fontSize: 14,
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                Release Notes / Changelog
              </label>
              <textarea
                rows={4}
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="List features or bug fixes in this release..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  fontSize: 13,
                  fontFamily: 'sans-serif',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ background: '#f8f8f8', border: '1px solid #eaeaea', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#555' }}>
              <div style={{ fontWeight: 600, color: '#111', marginBottom: 4 }}>What happens when you click build:</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li>GitHub creates git tag <code>v{customVersion || '0.1.2'}</code> on <code>main</code>.</li>
                <li>GitHub Actions spins up 3 parallel runners: Mac, Windows, Ubuntu.</li>
                <li>Executable binaries are uploaded to GitHub Releases for instant download.</li>
              </ul>
            </div>

            <button
              type="button"
              className="btn dark full"
              onClick={() => setShowConfirm(true)}
              disabled={triggering || !customVersion}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {triggering ? <RefreshCw size={16} className="spin" /> : <Rocket size={16} />}
              {triggering ? 'Triggering Release...' : `Build & Release v${customVersion || '0.1.2'} on GitHub Actions`}
            </button>
          </div>
        </section>

        {/* Right Card: Commits Since Last Release */}
        <section className="panel" style={{ padding: '24px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitCommit size={18} color="#111" />
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Commits Since {data?.currentTag || 'Last Release'}</h2>
            </div>
            <span className="badge">
              {data?.commitsAhead || 0} {data?.commitsAhead === 1 ? 'commit' : 'commits'}
            </span>
          </div>

          {data && data.commits && data.commits.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
              {data.commits.map((c) => (
                <div
                  key={c.sha}
                  style={{
                    background: '#fafafa',
                    border: '1px solid #eaeaea',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{c.message}</span>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        background: '#e4e4e7',
                        color: '#18181b',
                        padding: '2px 6px',
                        borderRadius: 4,
                        textDecoration: 'none',
                        flexShrink: 0,
                      }}
                    >
                      {c.sha} <ExternalLink size={10} style={{ display: 'inline' }} />
                    </a>
                  </div>
                  <div style={{ fontSize: 11, color: '#71717a' }}>
                    by {c.author} · {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#777' }}>
              <CheckCircle2 size={32} color="#16a34a" style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#222' }}>All commits are packaged</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>No new commits have been pushed since {data?.currentTag}.</p>
            </div>
          )}

          {/* GitHub Actions Latest Run Status */}
          {data?.latestRun && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} /> Latest GitHub Actions Run (#{data.latestRun.runNumber})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f5', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: data.latestRun.status === 'in_progress' ? '#eab308' : data.latestRun.conclusion === 'success' ? '#22c55e' : '#ef4444',
                  }} />
                  <strong>Status:</strong> {data.latestRun.status} {data.latestRun.conclusion ? `(${data.latestRun.conclusion})` : ''}
                </span>
                <a
                  href={data.latestRun.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#111', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  View Run <ExternalLink size={11} />
                </a>
              </div>
            </div>
          )}
        </section>

      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <dialog
          open
          className="modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            border: 'none',
            width: '100%',
            height: '100%',
          }}
        >
          <div className="modal-card" style={{ maxWidth: 440, width: '100%', background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              Confirm Desktop Release v{customVersion}
            </h2>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: '0 0 20px' }}>
              Are you sure you want to trigger a build for <strong>v{customVersion}</strong>? This will create tag <code>v{customVersion}</code> on GitHub and start parallel runners for macOS, Windows, and Linux.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setShowConfirm(false)}
                disabled={triggering}
                style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn dark"
                onClick={handleTriggerRelease}
                disabled={triggering}
                style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {triggering ? 'Triggering...' : 'Yes, Start Release'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

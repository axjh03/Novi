'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Loader2,
  AlertOctagon,
  Cpu,
  Monitor,
  Package,
  Sparkles
} from 'lucide-react';
import TuxPenguinLogo from './TuxPenguinLogo';

interface CommitItem {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface WorkflowJobSummary {
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | null
  startedAt: string | null;
  completedAt: string | null;
}

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  runNumber: number;
  headBranch?: string;
}

interface ReleaseAssetSummary {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  browserDownloadUrl: string;
}

interface SemVerOptions {
  current: string;
  nextPatch: string;
  nextMinor: string;
  nextMajor: string;
  defaultNext: string;
}

interface ReleaseData {
  repo: string;
  currentTag: string;
  currentVersion: string;
  semver: SemVerOptions;
  nextSuggestedVersion: string;
  releaseDate: string;
  releaseName: string;
  releaseBody: string;
  releaseAssets: ReleaseAssetSummary[];
  state: 'BUILDING' | 'FAILED' | 'OUTDATED' | 'UP_TO_DATE';
  stateReason: string;
  isOutdated: boolean;
  commitsAhead: number;
  commits: CommitItem[];
  latestRun: WorkflowRun | null;
  jobs: WorkflowJobSummary[];
  configured: boolean;
}

export default function ReleaseManagement({ admin }: { admin: boolean }) {
  const [data, setData] = useState<ReleaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [selectedType, setSelectedType] = useState<'patch' | 'minor' | 'major' | 'custom'>('patch');
  const [customVersion, setCustomVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/control/release', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch release status');
      
      const relData: ReleaseData = json.data;
      setData(relData);

      // Auto-set version according to semver logic if not yet manually modified
      if (!customVersion && relData.semver) {
        setCustomVersion(relData.semver.nextPatch);
        setSelectedType('patch');
      }

      // Auto-fill release notes from commits
      if (!releaseNotes && relData.commits?.length > 0) {
        const bulletList = relData.commits
          .map((c: CommitItem) => `• ${c.message}`)
          .join('\n');
        setReleaseNotes(bulletList);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching release info');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Live polling when a build is actively queued or in progress
  useEffect(() => {
    if (data?.state === 'BUILDING') {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(() => {
          fetchStatus(true);
        }, 5000);
      }
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [data?.state]);

  const selectSemVer = (type: 'patch' | 'minor' | 'major') => {
    if (!data?.semver) return;
    setSelectedType(type);
    if (type === 'patch') setCustomVersion(data.semver.nextPatch);
    if (type === 'minor') setCustomVersion(data.semver.nextMinor);
    if (type === 'major') setCustomVersion(data.semver.nextMajor);
  };

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
        `🚀 Release v${json.data.version} triggered! GitHub Actions is now compiling installers sequentially for macOS, Windows, and Linux.`
      );
      // Immediately refresh status
      setTimeout(() => {
        fetchStatus();
      }, 2500);
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
        <p style={{ marginTop: 12, fontSize: 14 }}>Connecting to GitHub Actions & inspecting build status…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      
      {/* Dynamic Health State Banner */}
      {data && (
        <div>
          {/* STATE 1: BUILDING IN PROGRESS */}
          {data.state === 'BUILDING' && (
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
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
                  background: '#dbeafe',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Loader2 size={24} className="spin" style={{ animation: 'spin 1.2s linear infinite' }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Desktop Build in Progress on GitHub Actions</span>
                    <span style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                      Live Polling
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#2563eb', margin: '4px 0 0' }}>
                    {data.stateReason} macOS, Windows, and Linux installers are compiling sequentially.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {data.latestRun && (
                  <a
                    href={data.latestRun.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn dark"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '9px 16px',
                      borderRadius: 8,
                      fontSize: 13,
                      textDecoration: 'none',
                    }}
                  >
                    View Live Logs <ExternalLink size={13} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => fetchStatus(false)}
                  style={{
                    background: '#fff',
                    border: '1px solid #bfdbfe',
                    color: '#1d4ed8',
                    padding: '8px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                  }}
                >
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>
            </div>
          )}

          {/* STATE 2: LAST BUILD FAILED */}
          {data.state === 'FAILED' && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
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
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <AlertOctagon size={24} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Last Release Build Failed</span>
                    <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                      Action Required
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#b91c1c', margin: '4px 0 0' }}>
                    {data.stateReason} Desktop installers were <strong>not</strong> published to users.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {data.latestRun && (
                  <a
                    href={data.latestRun.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: '#fff',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      padding: '9px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    View Failure Logs <ExternalLink size={13} />
                  </a>
                )}
                <button
                  type="button"
                  className="btn dark"
                  onClick={() => setShowConfirm(true)}
                  disabled={triggering}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Rocket size={15} /> Retry Release v{customVersion || data.nextSuggestedVersion}
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: OUTDATED (COMMITS AHEAD) */}
          {data.state === 'OUTDATED' && (
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
                    Release is Outdated ({data.commitsAhead} new {data.commitsAhead === 1 ? 'commit' : 'commits'} on main)
                  </div>
                  <p style={{ fontSize: 13, color: '#b45309', margin: '4px 0 0' }}>
                    Current desktop installers are on <strong>{data.currentTag}</strong>. Pending code updates are ready to be compiled into <strong>v{customVersion || data.nextSuggestedVersion}</strong>.
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
                <Rocket size={16} /> 1-Click Release v{customVersion || data.nextSuggestedVersion}
              </button>
            </div>
          )}

          {/* STATE 4: UP TO DATE & VERIFIED */}
          {data.state === 'UP_TO_DATE' && (
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
                    Desktop Releases are Up to Date & Verified
                  </div>
                  <p style={{ fontSize: 13, color: '#15803d', margin: '2px 0 0' }}>
                    The latest code on main is compiled in <strong>{data.currentTag}</strong> ({data.releaseAssets?.length || 0} installer assets live). Zero pending commits.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => fetchStatus(false)}
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
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  style={{
                    background: '#166534',
                    border: 'none',
                    color: '#fff',
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
                  <Rocket size={13} /> Re-build Release
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Runner Pipeline Monitor Matrix */}
      {data?.jobs && data.jobs.length > 0 && (
        <section className="panel" style={{ padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={16} color="#111" />
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                CI/CD Multi-Platform Runner Status ({data.latestRun?.headBranch || data.currentTag})
              </h3>
            </div>
            {data.latestRun && (
              <a
                href={data.latestRun.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#666', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Run #{data.latestRun.runNumber} <ExternalLink size={11} />
              </a>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {data.jobs.map((job) => {
              const isMac = job.name.includes('macos');
              const isWin = job.name.includes('windows');
              const isLinux = job.name.includes('ubuntu');

              const isSuccess = job.conclusion === 'success';
              const isJobFailed = job.conclusion === 'failure';
              const isRunning = job.status === 'in_progress';
              const isQueued = job.status === 'queued';

              let statusColor = '#71717a';
              let statusBg = '#f4f4f5';
              let statusText = 'Queued';

              if (isRunning) {
                statusColor = '#2563eb';
                statusBg = '#dbeafe';
                statusText = 'Building...';
              } else if (isSuccess) {
                statusColor = '#16a34a';
                statusBg = '#dcfce7';
                statusText = 'Success ✓';
              } else if (isJobFailed) {
                statusColor = '#dc2626';
                statusBg = '#fee2e2';
                statusText = 'Failed ✕';
              }

              return (
                <div
                  key={job.name}
                  style={{
                    background: '#fafafa',
                    border: '1px solid #eaeaea',
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: '#ffffff', border: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                      {isMac && <img src="/apple-logo.png" alt="macOS" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
                      {isWin && <img src="/microsoft.png" alt="Windows" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
                      {isLinux && <img src="/ubuntu.png" alt="Linux" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                        {isMac ? 'macOS (arm64 + x64)' : isWin ? 'Windows (x64 .exe)' : 'Linux (Debian + AppImage)'}
                      </div>
                      <div style={{ fontSize: 11, color: '#777', fontFamily: 'monospace' }}>
                        {job.name}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: statusBg,
                    color: statusColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    {isRunning && <Loader2 size={11} className="spin" style={{ animation: 'spin 1s linear infinite' }} />}
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
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
            Watch Runners <ArrowUpRight size={14} />
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        
        {/* Left Card: 1-Click Automated Release */}
        <section className="panel" style={{ padding: '24px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Rocket size={18} color="#111" />
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Trigger New Desktop Release</h2>
          </div>
          <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: '0 0 20px' }}>
            Version numbers and changelog are computed automatically from git. Click build to publish.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Version Increment Selector (Smart Pills) */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 8 }}>
                Select Next Release Version:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {data?.semver && (
                  <>
                    <button
                      type="button"
                      onClick={() => selectSemVer('patch')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 8,
                        border: selectedType === 'patch' ? '2px solid #111' : '1px solid #ddd',
                        background: selectedType === 'patch' ? '#111' : '#fff',
                        color: selectedType === 'patch' ? '#fff' : '#111',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.8, fontWeight: 700 }}>Patch (Auto)</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', marginTop: 2 }}>v{data.semver.nextPatch}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectSemVer('minor')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 8,
                        border: selectedType === 'minor' ? '2px solid #111' : '1px solid #ddd',
                        background: selectedType === 'minor' ? '#111' : '#fff',
                        color: selectedType === 'minor' ? '#fff' : '#111',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.8, fontWeight: 700 }}>Minor</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', marginTop: 2 }}>v{data.semver.nextMinor}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectSemVer('major')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 8,
                        border: selectedType === 'major' ? '2px solid #111' : '1px solid #ddd',
                        background: selectedType === 'major' ? '#111' : '#fff',
                        color: selectedType === 'major' ? '#fff' : '#111',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.8, fontWeight: 700 }}>Major</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', marginTop: 2 }}>v{data.semver.nextMajor}</div>
                    </button>
                  </>
                )}
              </div>

              {/* Exact Version Edit */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#777', fontWeight: 600 }}>v</span>
                <input
                  type="text"
                  value={customVersion}
                  onChange={(e) => {
                    setCustomVersion(e.target.value.replace(/^v/, ''));
                    setSelectedType('custom');
                  }}
                  placeholder="0.1.3"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            {/* Release Notes */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
                  Release Notes / Changelog
                </label>
                <span style={{ fontSize: 11, color: '#888' }}>Auto-filled from git</span>
              </div>
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
              <div style={{ fontWeight: 600, color: '#111', marginBottom: 4 }}>Sequential compilation pipeline:</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Step 1: <strong>macOS 14</strong> builds Universal .dmg (Apple Silicon & Intel).</li>
                <li>Step 2: <strong>Windows Latest</strong> builds standalone Setup .exe.</li>
                <li>Step 3: <strong>Ubuntu 24.04</strong> packages Debian .deb & AppImage.</li>
                <li>Direct CDN mirror links update automatically on <code>/download</code>.</li>
              </ul>
            </div>

            <button
              type="button"
              className="btn dark full"
              onClick={() => setShowConfirm(true)}
              disabled={triggering || !customVersion || data?.state === 'BUILDING'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px',
                fontSize: 14,
                fontWeight: 600,
                cursor: data?.state === 'BUILDING' ? 'not-allowed' : 'pointer',
                opacity: data?.state === 'BUILDING' ? 0.7 : 1,
              }}
            >
              {triggering ? <RefreshCw size={16} className="spin" /> : <Rocket size={16} />}
              {triggering
                ? 'Triggering Release...'
                : data?.state === 'BUILDING'
                ? 'Build Currently in Progress...'
                : `Build & Release v${customVersion || '0.1.3'} on GitHub Actions`}
            </button>
          </div>
        </section>

        {/* Right Card: Commits & Active Release Assets */}
        <section className="panel" style={{ padding: '24px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitCommit size={18} color="#111" />
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Commits Since {data?.currentTag || 'v0.1.2'}</h2>
            </div>
            <span className="badge">
              {data?.commitsAhead || 0} {data?.commitsAhead === 1 ? 'commit' : 'commits'}
            </span>
          </div>

          {data && data.commits && data.commits.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
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
            <div style={{ textAlign: 'center', padding: '30px 20px', color: '#777' }}>
              <CheckCircle2 size={28} color="#16a34a" style={{ marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#222' }}>All commits are packaged</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>No new commits have been pushed since {data?.currentTag}.</p>
            </div>
          )}

          {/* Active Release Assets */}
          {data?.releaseAssets && data.releaseAssets.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={13} /> Active Installers in {data.currentTag} ({data.releaseAssets.length} files)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {data.releaseAssets.map((asset) => (
                  <div
                    key={asset.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8f8f8',
                      padding: '7px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#222' }}>
                      {asset.name}
                    </span>
                    <span style={{ color: '#777', fontSize: 11 }}>
                      {(asset.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                ))}
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
              Are you sure you want to trigger a build for <strong>v{customVersion}</strong>? This will create tag <code>v{customVersion}</code> on GitHub and run sequential builders for macOS, Windows, and Linux.
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
                {triggering ? 'Starting...' : 'Yes, Start Release'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
  Folder,
  FileText,
  Download,
  Archive,
  RefreshCw,
  X,
  ChevronRight,
  HardDrive,
  Home,
  FileCode,
  Image,
  ArrowUp,
  Loader2,
  AlertCircle
} from 'lucide-react';
import type { FileItem, FileResponse } from '@/lib/remote-file-explorer';
import { parentPath } from '@/lib/remote-paths';

interface RemoteFileExplorerProps {
  sessionId: string;
  deviceName: string;
  username: string;
  pin: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(name: string, isDir: boolean) {
  if (isDir) return <Folder size={18} color="#eab308" />;
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext || '')) {
    return <Image size={18} color="#06b6d4" />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'sh', 'css', 'html'].includes(ext || '')) {
    return <FileCode size={18} color="#8b5cf6" />;
  }
  if (['zip', 'tar', 'gz', 'dmg', 'exe'].includes(ext || '')) {
    return <Archive size={18} color="#f97316" />;
  }
  return <FileText size={18} color="#71717a" />;
}

export default function RemoteFileExplorer({
  sessionId,
  deviceName,
  username,
  pin,
  onClose,
}: RemoteFileExplorerProps) {
  const [currentPath, setCurrentPath] = useState<string>(':app_data');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeShortcut, setActiveShortcut] = useState(':app_data');

  const sendCommand = async (action: 'list_dir' | 'read_file' | 'zip_folder', path?: string) => {
    const res = await fetch('/api/control/file-explorer/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, action, path: path ?? currentPath, pin }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to communicate with device');
    return json.data as FileResponse;
  };

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    setActiveShortcut(path.startsWith(':') ? path : '');
    try {
      const resp = await sendCommand('list_dir', path);
      if (resp.items) {
        setItems(resp.items);
        setCurrentPath(resp.currentPath || path);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to list directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(':app_data');
    return () => {
      // Notify server session stopped
      fetch('/api/control/file-explorer/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    };
  }, [sessionId]);

  const handleDownloadFile = async (filePath: string, filename: string) => {
    setDownloading(true);
    try {
      const resp = await sendCommand('read_file', filePath);
      if (resp.base64Data) {
        const link = document.createElement('a');
        link.href = `data:${resp.mimeType || 'application/octet-stream'};base64,${resp.base64Data}`;
        link.download = resp.filename || filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      alert(`Download failed: ${err?.message || err}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadFolderZip = async (folderPath?: string) => {
    setDownloading(true);
    try {
      const resp = await sendCommand('zip_folder', folderPath || currentPath);
      if (resp.base64Data) {
        const link = document.createElement('a');
        link.href = `data:application/zip;base64,${resp.base64Data}`;
        link.download = resp.filename || 'folder.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      alert(`Zip download failed: ${err?.message || err}`);
    } finally {
      setDownloading(false);
    }
  };

  const upPath = parentPath(currentPath);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        width: '950px',
        maxWidth: '100%',
        height: '80vh',
        maxHeight: '750px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        border: '1px solid #e4e4e7',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #e4e4e7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fafafa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Folder size={20} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Remote File Explorer</span>
                <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                  Live On-Demand
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                Device: <strong>{deviceName}</strong> · User: <strong>@{username}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => handleDownloadFolderZip()}
              disabled={loading || downloading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                background: '#09090b',
                color: '#ffffff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              {downloading ? <Loader2 size={13} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Archive size={13} />}
              Download Folder (.ZIP)
            </button>

            <button
              type="button"
              onClick={() => loadDirectory(currentPath)}
              disabled={loading}
              title="Refresh"
              style={{
                background: '#ffffff',
                border: '1px solid #d4d4d8',
                borderRadius: 8,
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close"
              style={{
                background: '#ffffff',
                border: '1px solid #d4d4d8',
                borderRadius: 8,
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Quick Location Shortcuts & Breadcrumbs */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid #f0f0f0',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          {/* Shortcuts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[
              { label: 'This PC / Root', path: ':root', icon: HardDrive },
              { label: 'My User', path: ':home', icon: Home },
              { label: 'Documents', path: ':documents', icon: Folder },
              { label: 'Downloads', path: ':downloads', icon: Download },
              { label: 'Novi Data', path: ':app_data', icon: HardDrive },
            ].map((shortcut) => (
              <button
                key={shortcut.path}
                type="button"
                onClick={() => loadDirectory(shortcut.path)}
                disabled={loading}
                aria-current={activeShortcut === shortcut.path ? 'location' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: activeShortcut === shortcut.path ? '#18181b' : '#f4f4f5',
                  color: activeShortcut === shortcut.path ? '#ffffff' : '#3f3f46',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                <shortcut.icon size={12} />
                {shortcut.label}
              </button>
            ))}
          </div>

          {/* Up Navigation */}
          <button
            type="button"
            onClick={() => { if (upPath) loadDirectory(upPath); }}
            disabled={loading || !upPath}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              background: '#f4f4f5',
              border: '1px solid #e4e4e7',
              padding: '5px 10px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <ArrowUp size={12} /> Up one level
          </button>
        </div>

        {/* Path Bar */}
        <div style={{
          padding: '8px 24px',
          background: '#fafafa',
          borderBottom: '1px solid #eaeaea',
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#555',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}>
          <span>{currentPath === ':root' ? 'This PC' : 'Path:'}</span>
          <span style={{ color: '#111', fontWeight: 600 }}>{currentPath}</span>
        </div>

        {/* Content Explorer Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          {error && (
            <div style={{
              margin: '20px 0',
              padding: '12px 16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#b91c1c',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#71717a' }}>
              <Loader2 size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: 10, fontSize: 13 }}>Connecting on-demand and loading files…</p>
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a1a1aa' }}>
              <Folder size={36} color="#d4d4d8" />
              <p style={{ marginTop: 10, fontSize: 13 }}>Directory is empty.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#71717a', fontSize: 11, borderBottom: '1px solid #e4e4e7', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 8px' }}>Name</th>
                  <th style={{ padding: '12px 8px', width: '100px' }}>Size</th>
                  <th style={{ padding: '12px 8px', width: '150px' }}>Modified</th>
                  <th style={{ padding: '12px 8px', width: '160px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.path}
                    style={{
                      borderBottom: '1px solid #f4f4f5',
                      cursor: item.isDir ? 'pointer' : 'default',
                    }}
                    onDoubleClick={() => {
                      if (item.isDir) loadDirectory(item.path);
                      else handleDownloadFile(item.path, item.name);
                    }}
                  >
                    <td style={{ padding: '10px 8px', fontWeight: item.isDir ? 600 : 400 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, color: item.isDir ? '#111' : '#333' }}
                        onClick={() => { if (item.isDir) loadDirectory(item.path); }}
                      >
                        {getFileIcon(item.name, item.isDir)}
                        <span>{item.name}</span>
                      </div>
                    </td>

                    <td style={{ padding: '10px 8px', color: '#71717a', fontFamily: 'monospace' }}>
                      {item.isDir ? '—' : formatBytes(item.size)}
                    </td>

                    <td style={{ padding: '10px 8px', color: '#71717a' }}>
                      {item.modifiedAt ? new Date(item.modifiedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>

                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      {item.isDir ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => loadDirectory(item.path)}
                            style={{
                              background: '#f4f4f5',
                              border: '1px solid #e4e4e7',
                              padding: '4px 8px',
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Open ➔
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadFolderZip(item.path)}
                            disabled={downloading}
                            title="Download folder as .ZIP"
                            style={{
                              background: '#ffffff',
                              border: '1px solid #d4d4d8',
                              padding: '4px 8px',
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <Archive size={11} /> Zip
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(item.path, item.name)}
                          disabled={downloading}
                          style={{
                            background: '#09090b',
                            color: '#ffffff',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: 5,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Download size={11} /> Download
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid #e4e4e7',
          background: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#71717a',
        }}>
          <span>{items.length} items in current directory</span>
          <span>Double-click folder to open · Double-click file to download</span>
        </div>
      </div>
    </div>
  );
}

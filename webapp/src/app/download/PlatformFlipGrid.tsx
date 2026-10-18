'use client';

import { useState } from 'react';
import { Check, Copy, Download, Terminal } from 'lucide-react';
import type { DesktopPlatform } from '@/lib/download-platform';
import type { ReleaseData, ReleaseAssetInfo } from './DownloadClient';
import styles from './download.module.css';

const platforms = [
  // Novi 4.0.26 and later run on Electron 44, which needs macOS 13 (Ventura) or later.
  { id: 'mac', name: 'macOS', description: 'macOS 13 or later · Apple Silicon & Intel', logo: '/apple-logo.png' },
  { id: 'windows', name: 'Windows', description: 'Windows 10 & 11 · x64', logo: '/microsoft.png' },
  { id: 'linux', name: 'Linux', description: 'Debian, Ubuntu & AppImage', logo: '/ubuntu.png' },
] as const;
const packages: Record<DesktopPlatform, { key: keyof ReleaseAssetInfo; title: string; detail: string }[]> = {
  mac: [
    { key: 'macArm64', title: 'Apple Silicon', detail: 'M-series processors · .dmg' },
    { key: 'macX64', title: 'Intel', detail: 'Intel processors · .dmg' },
  ],
  windows: [{ key: 'windows', title: 'Windows installer', detail: '64-bit · .exe' }],
  linux: [
    { key: 'linuxDeb', title: 'Debian / Ubuntu', detail: 'x64 · .deb' },
    { key: 'linuxAppImage', title: 'Universal AppImage', detail: 'x64 · .AppImage' },
    { key: 'linuxDebArm64', title: 'Debian / Ubuntu', detail: 'ARM64 · .deb' },
    { key: 'linuxAppImageArm64', title: 'Universal AppImage', detail: 'ARM64 · .AppImage' },
  ],
};

export function PlatformFlipGrid({ release, siteOrigin, detectedOS, copiedMirror, copyMirrorUrl }: {
  release: ReleaseData;
  siteOrigin: string;
  detectedOS: DesktopPlatform | null;
  copiedMirror: string | null;
  copyMirrorUrl: (text: string, id: string) => void;
}) {
  const [selection, setSelection] = useState<DesktopPlatform | null>(null);
  const selected = selection ?? detectedOS ?? 'mac';
  const platform = platforms.find(item => item.id === selected)!;
  const command = selected === 'windows' ? `irm ${siteOrigin}/install.ps1 | iex` : `curl -fsSL ${siteOrigin}/install.sh | bash`;
  const commandId = `${selected}-cli`;
  const available = packages[selected].filter(item => release.downloads[item.key]);

  return <section className={styles.downloads} aria-label="Choose your desktop download">
    <div className={styles.platforms} aria-label="Operating system">
      {platforms.map(item => <button key={item.id} aria-pressed={selected === item.id} aria-controls="platform-downloads" onClick={() => setSelection(item.id)} className={selected === item.id ? styles.selected : ''}><img src={item.logo} width={28} height={28} alt="" /><span><strong>{item.name}</strong><small>{item.description}</small></span>{detectedOS === item.id && selected === item.id && <span className={styles.systemBadge}>This system</span>}</button>)}
    </div>
    <div className={styles.downloadPanel} id="platform-downloads">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>DESKTOP APP · {release.version}</span><h2>Novi for {platform.name}</h2><p>{platform.description}. Choose the package for your computer.</p></div><span className={styles.platformIcon}><img src={platform.logo} width={38} height={38} alt="" /></span></div>
      <div className={styles.packages}>{available.map(item => <a className={styles.package} href={release.downloads[item.key]} download key={item.key}><span><strong>{item.title}</strong><small>{item.detail}</small><code>{release.fileNames[item.key]}</code></span><Download size={20} /><span className={styles.downloadLabel}>Download</span></a>)}</div>
      {!available.length && <p>No installer is available for this platform in this release. Check the previous releases below.</p>}
      {selected === 'mac' && <p className={styles.hint}>Not sure which Mac you have? Open Apple menu → About This Mac and check Chip or Processor.</p>}
      <div className={styles.terminal}>
        <h3><Terminal size={17} />Terminal install command</h3>
        <div className={styles.command}><span className={styles.terminalPrompt} aria-hidden="true">{selected === 'windows' ? 'PS&gt;' : '$'}</span><code>{siteOrigin ? command : 'Preparing install command…'}</code><button disabled={!siteOrigin} aria-label="Copy install command" onClick={() => copyMirrorUrl(command, commandId)}>{copiedMirror === commandId ? <Check size={16} /> : <Copy size={16} />}{copiedMirror === commandId ? 'Copied' : 'Copy'}</button></div>
      </div>
    </div>
  </section>;
}

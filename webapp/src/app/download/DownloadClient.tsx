'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Copy, Download, ShieldCheck } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { detectDesktopPlatform, type DesktopPlatform } from '@/lib/download-platform';
import { PlatformFlipGrid } from './PlatformFlipGrid';
import styles from './download.module.css';

export interface ReleaseAssetInfo {
  macArm64: string;
  macX64: string;
  windows: string;
  linuxDeb: string;
  linuxAppImage: string;
  linuxDebArm64?: string;
  linuxAppImageArm64?: string;
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
    linuxDebArm64?: string;
    linuxAppImageArm64?: string;
  };
}


export default function DownloadClient({ initialRelease }: { initialRelease: ReleaseData }) {
  const [release, setRelease] = useState(initialRelease);
  const [live, setLive] = useState(false);
  const [detectedOS, setDetectedOS] = useState<DesktopPlatform | null>(null);
  const [checkedDevice, setCheckedDevice] = useState(false);
  const [siteOrigin, setSiteOrigin] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSiteOrigin(window.location.origin);
    setDetectedOS(detectDesktopPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setCheckedDevice(true);
    const controller = new AbortController();
    fetch('/api/releases/latest', { signal: controller.signal })
      .then(res => { if (!res.ok) throw new Error('Release unavailable'); return res.json(); })
      .then(json => {
        if (!json?.data?.releaseTag) return;
        const data = json.data;
        setRelease(previous => ({ ...previous, ...data, downloads: data.downloads || previous.downloads, fileNames: data.fileNames || previous.fileNames }));
        setLive(true);
      }).catch(() => { /* The bundled release remains available when the live service cannot be reached. */ });
    return () => { controller.abort(); if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);

  async function copyText(text: string, id: string) {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2500);
    } catch { setCopyError('Could not copy automatically. Select the command or open the download link to copy it manually.'); }
  }

  const assets = [
    { key: 'macArm64', label: 'macOS 13 or later · Apple Silicon', format: 'DMG' },
    { key: 'macX64', label: 'macOS 13 or later · Intel', format: 'DMG' },
    { key: 'windows', label: 'Windows · x64', format: 'EXE' },
    { key: 'linuxDeb', label: 'Linux · x64', format: 'DEB' },
    { key: 'linuxAppImage', label: 'Linux · x64', format: 'AppImage' },
    { key: 'linuxDebArm64', label: 'Linux · ARM64', format: 'DEB' },
    { key: 'linuxAppImageArm64', label: 'Linux · ARM64', format: 'AppImage' },
  ] as const;
  const repo = `https://github.com/${release.repo || 'axjh03/Novi'}/releases`;
  return <div className={styles.page}>
    <PublicNavbar active="download" />
    <main className={styles.main}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>YOUR WORKSPACE, READY TO GO</span>
        <h1>Get Novi.<br /><em>Get live interview answers.</em></h1>
        <p>Get Novi for your desktop. Choose your platform, install the app, and sign in with your individual account or enterprise desktop login.</p>
        <div className={styles.releaseMeta}><span className={styles.version}>Novi {release.version}</span><span>Build {release.buildNumber}</span><span>Released {release.releaseDate}</span>{live && <span className={styles.live}><Check size={13} />Release verified</span>}</div>
      </header>
      {checkedDevice && !detectedOS && <div className={styles.deviceNote}>Browsing on a phone, tablet, or another system? Choose the computer you’ll install Novi on. These installers are for desktop computers.</div>}
      <PlatformFlipGrid release={release} siteOrigin={siteOrigin} detectedOS={detectedOS} copiedMirror={copied} copyMirrorUrl={copyText} />
      <p className={styles.copyStatus} role="status">{copyError || (copied ? 'Copied to clipboard.' : '')}</p>
      <section className={styles.steps} aria-label="Get started"><article><span>01</span><h2>Choose your installer</h2><p>Pick your operating system and processor. All available packages are listed below.</p></article><article><span>02</span><h2>Install Novi</h2><p>Open the downloaded package and follow the installation steps for your computer.</p></article><article><span>03</span><h2>Sign in & settle in</h2><p>Individuals use the same web login; enterprise members use their assigned desktop login. <Link href="/api-keys">Follow the setup guide <ArrowUpRight size={13} /></Link></p></article></section>
      <details className={styles.allDownloads}>
        <summary><span><strong>All downloads</strong><small>Every architecture, package, and direct release link</small></span><Download size={20} /></summary>
        <div className={styles.assetList}>{assets.filter(asset => release.downloads[asset.key] && release.fileNames[asset.key]).map(asset => <div className={styles.assetRow} key={asset.key}><div><strong>{asset.label} <span className={styles.format}>{asset.format}</span></strong><code>{release.fileNames[asset.key]}</code></div><div className={styles.assetActions}><button aria-label={`Copy ${asset.label} ${asset.format} download link`} onClick={() => void copyText(release.downloads[asset.key]!, asset.key)}>{copied === asset.key ? <Check size={16} /> : <Copy size={16} />}Copy link</button><a href={release.downloads[asset.key]} download><Download size={16} />Download</a></div></div>)}</div>
      </details>
      <div className={styles.releaseLinks}><a href={`${repo}/tag/${release.releaseTag}`} target="_blank" rel="noreferrer">Release notes · {release.releaseTag} <ArrowUpRight size={14} /></a><a href={repo} target="_blank" rel="noreferrer">Previous releases <ArrowUpRight size={14} /></a></div>
      <section className={styles.access}><ShieldCheck size={28} /><div><h2>One individual login. Web and desktop.</h2><p>Individuals can create an account themselves and use it in the app after license activation. Enterprise teams keep their managed desktop accounts.</p></div><Link href="/#signup">Create an account <ArrowUpRight size={16} /></Link></section>
    </main>
    <SiteFooter />
  </div>;
}

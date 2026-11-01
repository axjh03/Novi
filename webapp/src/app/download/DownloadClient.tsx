'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { ChapterPage, CloseRow, Title } from '@/components/Chapters';
import { DesktopSignInFragment } from '@/components/Fragments';
import { detectDesktopPlatform, type DesktopPlatform } from '@/lib/download-platform';
import chapters from '@/components/Chapters.module.css';
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

type AssetKey = keyof ReleaseAssetInfo;
const platforms: { id: DesktopPlatform; name: string; requires: string; logo: string; tone: string; packages: { key: AssetKey; title: string; detail: string }[] }[] = [
  // Novi runs on Electron 44, which needs macOS 13 (Ventura) or later.
  { id: 'mac', name: 'macOS', requires: 'macOS 13 or later', logo: '/apple-logo.png', tone: 'tone-paper', packages: [
    { key: 'macArm64', title: 'Apple Silicon', detail: 'M-series chips · .dmg' },
    { key: 'macX64', title: 'Intel', detail: 'Intel processors · .dmg' },
  ] },
  { id: 'windows', name: 'Windows', requires: 'Windows 10 and 11, 64-bit', logo: '/microsoft.png', tone: 'tone-rose', packages: [
    { key: 'windows', title: 'Windows installer', detail: '64-bit · .exe' },
  ] },
  { id: 'linux', name: 'Linux', requires: 'Debian, Ubuntu, or any distribution with AppImage', logo: '/ubuntu.png', tone: 'tone-wine', packages: [
    { key: 'linuxDeb', title: 'Debian / Ubuntu', detail: 'x64 · .deb' },
    { key: 'linuxAppImage', title: 'AppImage', detail: 'x64 · .AppImage' },
    { key: 'linuxDebArm64', title: 'Debian / Ubuntu', detail: 'ARM64 · .deb' },
    { key: 'linuxAppImageArm64', title: 'AppImage', detail: 'ARM64 · .AppImage' },
  ] },
];
const assets: { key: AssetKey; label: string; format: string }[] = [
  { key: 'macArm64', label: 'macOS 13 or later · Apple Silicon', format: 'DMG' },
  { key: 'macX64', label: 'macOS 13 or later · Intel', format: 'DMG' },
  { key: 'windows', label: 'Windows · x64', format: 'EXE' },
  { key: 'linuxDeb', label: 'Linux · x64', format: 'DEB' },
  { key: 'linuxAppImage', label: 'Linux · x64', format: 'AppImage' },
  { key: 'linuxDebArm64', label: 'Linux · ARM64', format: 'DEB' },
  { key: 'linuxAppImageArm64', label: 'Linux · ARM64', format: 'AppImage' },
];

// Browser facts that the server render cannot know: read once on the client, nothing on the server.
const noSubscription = () => () => {};
const useDetectedPlatform = () => useSyncExternalStore(noSubscription, () => detectDesktopPlatform(navigator.userAgent, navigator.maxTouchPoints), () => null);
const useSiteOrigin = () => useSyncExternalStore(noSubscription, () => window.location.origin, () => '');
const useIsClient = () => useSyncExternalStore(noSubscription, () => true, () => false);

export default function DownloadClient({ initialRelease }: { initialRelease: ReleaseData }) {
  const [release, setRelease] = useState(initialRelease);
  const [live, setLive] = useState(false);
  const detected = useDetectedPlatform();
  const checkedDevice = useIsClient();
  const siteOrigin = useSiteOrigin();
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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

  const repo = `https://github.com/${release.repo || 'axjh03/Novi'}/releases`;
  const primary = detected ? platforms.find(platform => platform.id === detected)! : null;
  const primaryPackage = primary?.packages.find(item => release.downloads[item.key]);
  const command = (id: DesktopPlatform) => id === 'windows' ? `irm ${siteOrigin || 'https://novi.app'}/install.ps1 | iex` : `curl -fsSL ${siteOrigin || 'https://novi.app'}/install.sh | bash`;

  return (
    <ChapterPage>
      <PublicNavbar active="download" />
      <main>
        {/* 1 · The version, the one button for this computer. */}
        <section className={chapters.hero} aria-labelledby="download-title">
          <div className={chapters.heroCopy}>
            <Title id="download-title" lines={[`Novi ${release.version},`, 'on your desk.']} />
            <p className={chapters.lead} data-load style={{ '--d': '480ms' } as CSSProperties}>macOS 13 or later, Windows 10 and 11, Debian, Ubuntu and AppImage. Install it, sign in with the account you made here, and your keys are already there.</p>
            <div className={chapters.actions} data-load style={{ '--d': '560ms' } as CSSProperties}>
              {primary && primaryPackage
                ? <a className={chapters.primary} href={release.downloads[primaryPackage.key]} download>Download for {primary.name} · {primaryPackage.title}</a>
                : <a className={chapters.primary} href="#installers">Choose your installer</a>}
              <a className={chapters.textLink} href="#all-downloads">Every package</a>
              <span className={chapters.note}>Build {release.buildNumber} · released {release.releaseDate}{live ? ' · verified against the latest release' : ''}{checkedDevice && !detected ? ' · these installers are for desktop computers' : ''}</span>
            </div>
          </div>
          <div className={`${chapters.heroSide} ${styles.heroTile}`}>
            <div data-open><img src="/app/modern-light.png" alt="The floating Novi bar in its light theme, with a transcript and follow-up questions" width={490} height={457} decoding="async" /></div>
          </div>
        </section>

        {/* 2 · Three fields, one per system. */}
        <section className={styles.installers} id="installers" aria-label="Installers by operating system">
          {platforms.map(platform => {
            const available = platform.packages.filter(item => release.downloads[item.key] && release.fileNames[item.key]);
            const commandId = `${platform.id}-cli`;
            return (
              <article key={platform.id} className={`${styles.system} ${chapters[platform.tone]}`} id={platform.id} aria-labelledby={`${platform.id}-title`}>
                <div className={styles.systemHead} data-reveal>
                  <img src={platform.logo} alt="" width={40} height={40} className={platform.id === 'mac' ? styles.invert : ''} />
                  <h2 id={`${platform.id}-title`}>{platform.name}</h2>
                  {detected === platform.id && <span className={styles.thisComputer}>This computer</span>}
                </div>
                <p className={styles.requires} data-reveal style={{ '--i': 1 } as CSSProperties}>{platform.requires}.</p>
                <ul className={styles.packages} data-reveal style={{ '--i': 2 } as CSSProperties}>
                  {available.map(item => (
                    <li key={item.key}><a href={release.downloads[item.key]} download><strong>{item.title}</strong><span>{item.detail}</span><code>{release.fileNames[item.key]}</code></a></li>
                  ))}
                  {!available.length && <li className={styles.none}>No installer for this system in this release. Check the previous releases below.</li>}
                </ul>
                {platform.id === 'mac' && <p className={styles.help} data-reveal style={{ '--i': 3 } as CSSProperties}>Not sure which Mac? Apple menu, About This Mac, then read Chip or Processor.</p>}
                <div className={styles.terminal} data-reveal style={{ '--i': 3 } as CSSProperties}>
                  <p>Or from the terminal{platform.id === 'windows' ? ' (PowerShell)' : ''}:</p>
                  <pre><code>{siteOrigin ? command(platform.id) : 'Preparing the install command…'}</code></pre>
                  <button type="button" className={styles.copy} disabled={!siteOrigin} onClick={() => void copyText(command(platform.id), commandId)}>{copied === commandId ? 'Copied' : 'Copy the command'}</button>
                </div>
              </article>
            );
          })}
        </section>
        <p className={styles.copyStatus} role="status">{copyError || (copied ? 'Copied to the clipboard.' : '')}</p>

        {/* 3 · After the install: sign in, the keys come with you. */}
        <section className={`${styles.after} ${chapters['tone-deep']}`} aria-labelledby="after-title">
          <div className={styles.afterWords}>
            <h2 id="after-title" data-reveal>Then sign in. That is the setup.</h2>
            <ul className={styles.afterList}>
              <li data-reveal style={{ '--i': 1 } as CSSProperties}><strong>Same login as this website.</strong><span>Individuals use their web username and password. Enterprise members use the desktop login their organisation created.</span></li>
              <li data-reveal style={{ '--i': 2 } as CSSProperties}><strong>Your keys are already there.</strong><span>The provider keys you added in your account appear under Settings, API management. Pick one per provider. <Link className={chapters.inline} href="/api-keys">The setup guide</Link> walks through getting a key.</span></li>
              <li data-reveal style={{ '--i': 3 } as CSSProperties}><strong>One desktop at a time.</strong><span>Signing in on a second computer signs the first one out. The website stays signed in alongside.</span></li>
            </ul>
          </div>
          <div className={styles.afterScreen} data-reveal style={{ '--i': 2 } as CSSProperties}><DesktopSignInFragment /></div>
        </section>

        {/* 4 · Every package, as a table. */}
        <section className={styles.all} id="all-downloads" aria-labelledby="all-title">
          <div className={chapters.chapterHead}>
            <h2 id="all-title" data-reveal>Every package.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>Each architecture and format for {release.releaseTag}, with the direct link. <a className={chapters.inline} href={`${repo}/tag/${release.releaseTag}`} target="_blank" rel="noreferrer">Release notes</a> · <a className={chapters.inline} href={repo} target="_blank" rel="noreferrer">Previous releases</a></p>
          </div>
          <div className={styles.tableScroll} data-reveal style={{ '--i': 2 } as CSSProperties}>
            <table>
              <thead><tr><th scope="col">System</th><th scope="col">Format</th><th scope="col">File</th><th scope="col"><span className={chapters.srOnly}>Actions</span></th></tr></thead>
              <tbody>
                {assets.filter(asset => release.downloads[asset.key] && release.fileNames[asset.key]).map(asset => (
                  <tr key={asset.key}>
                    <th scope="row">{asset.label}</th>
                    <td>{asset.format}</td>
                    <td><code>{release.fileNames[asset.key]}</code></td>
                    <td className={styles.rowActions}>
                      <button type="button" onClick={() => void copyText(new URL(release.downloads[asset.key]!, siteOrigin || 'https://novi.app').toString(), asset.key)}>{copied === asset.key ? 'Copied' : 'Copy link'}</button>
                      <a href={release.downloads[asset.key]} download>Download</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <CloseRow id="download-close" title={<>No account yet?<br />Make one first.</>} text="Individuals sign up here and use the same login in the app once a license is attached. Teams get managed desktop logins from their owner." action="Create an account" href="/#signup" />
      </main>
      <SiteFooter />
    </ChapterPage>
  );
}

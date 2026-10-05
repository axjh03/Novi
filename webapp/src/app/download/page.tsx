import type { Metadata } from 'next';
import DownloadClient, { type ReleaseData } from './DownloadClient';
import defaultReleaseInfo from '@/lib/release-info.json';

export const metadata: Metadata = {
  title: 'Download Novi — macOS, Windows & Debian',
  description: 'Download the Novi AI companion desktop application for macOS (.dmg), Windows (.exe), and Debian / Ubuntu (.deb).',
};

export default function DownloadPage() {
  const initialRelease = defaultReleaseInfo as unknown as ReleaseData;
  return <DownloadClient initialRelease={initialRelease} />;
}

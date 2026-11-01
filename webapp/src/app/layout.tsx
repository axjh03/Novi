import type { Metadata, Viewport } from 'next';
import { Inter, Libre_Franklin, Source_Serif_4 } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import CanadaPrank from '@/components/CanadaPrank'; // CANADA PRANK: removable import.

// Three faces, each with one job: Libre Franklin sets every headline on the public site, Source Serif 4
// sets its running text, and Inter sets the workspace. All are self-hosted by next/font at build time.
const display = Libre_Franklin({ subsets: ['latin'], weight: ['400', '500', '700'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap' });
const text = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'], variable: '--font-text', display: 'swap' });
const ui = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-ui', display: 'swap' });

export const metadata: Metadata = {
  title: 'Novi | Your AI companion',
  description: 'Prepare for interviews, solve technical questions, and sharpen your coding skills with a transparent, low-distraction AI workspace.',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0b',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${ui.variable}`}>
      <body>
        <div className="site-content">{children}</div>
        <CanadaPrank /> {/* CANADA PRANK: removable render, covers every page. */}
        {/* Vercel Web Analytics: counts visitors and page views on every page. It only sends data on
            Vercel deployments (the script is served from this site's own /_vercel/insights path),
            so local development and other hosts send nothing. */}
        <Analytics />
      </body>
    </html>
  );
}

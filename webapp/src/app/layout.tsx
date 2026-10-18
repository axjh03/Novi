import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Vercel Web Analytics: counts visitors and page views on every page. It only sends data on
            Vercel deployments (the script is served from this site's own /_vercel/insights path),
            so local development and other hosts send nothing. */}
        <Analytics />
      </body>
    </html>
  );
}

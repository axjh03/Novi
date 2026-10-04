import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Novi — Your workspace, organized', description: 'Manage accounts, desktop licenses, and AI providers in one considered workspace.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

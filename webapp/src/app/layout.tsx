import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Novi — Your AI companion', description: 'Prepare for interviews, solve technical questions, and sharpen your coding skills with a transparent, low-distraction AI workspace.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

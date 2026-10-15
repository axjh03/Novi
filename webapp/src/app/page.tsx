import type { Metadata } from 'next';
import ManagementApp from '@/components/ManagementApp';

export const metadata: Metadata = {
  title: 'Novi — Fuck LeetCode. Bring backup.',
  description: 'Enough interview bullshit. Get AI backup for coding questions, technical conversations, screenshots, audio, and your local code. Plans from $16 per month.',
};

export default function Home() { return <ManagementApp />; }

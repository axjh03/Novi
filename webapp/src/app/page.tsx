import type { Metadata } from 'next';
import ManagementApp from '@/components/ManagementApp';

export const metadata: Metadata = {
  title: 'Novi — Cheat the interview. Skip the bullshit.',
  description: 'Novi helps you cheat and pass interviews with AI answers, coding help, screenshots, audio context, and your own notes. Get your desktop backup.',
};

export default function Home() { return <ManagementApp />; }

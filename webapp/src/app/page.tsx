import type { Metadata } from 'next';
import ManagementApp from '@/components/ManagementApp';

export const metadata: Metadata = {
  title: 'NOVI',
  description: 'Cheat in interviews with live AI answers, coding solutions, screenshots, audio transcription, and your own context. Individual accounts work on web and desktop. Plans from $16 per month.',
};

export default function Home() { return <ManagementApp />; }

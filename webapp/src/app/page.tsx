import type { Metadata } from 'next';
import ManagementApp from '@/components/ManagementApp';

export const metadata: Metadata = {
  title: 'Novi — A clearer way to prepare, think, and build.',
  description: 'A focused AI desktop workspace for interview preparation, technical conversations, coding assistance, and local code context. Plans from $16.99 per month.',
};

export default function Home() { return <ManagementApp />; }

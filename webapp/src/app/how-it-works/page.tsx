import type { Metadata } from 'next';
import HowItWorksClient from './HowItWorksClient';

export const metadata: Metadata = {
  title: 'How It Works & Licensing Guide — Novi',
  description: 'Learn how Novi private licensing works, how to request a license, cryptographic device binding, 24-hour offline grace periods, and how to get started.',
};

export default function HowItWorksPage() {
  return <HowItWorksClient />;
}

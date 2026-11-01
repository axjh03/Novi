import type { Metadata } from 'next';
import HowItWorksClient from './HowItWorksClient';

export const metadata: Metadata = {
  title: 'How it works: Your interview cheat code | Novi',
  description: 'Your interview cheat code: bring your resume, capture the question, and get live AI answers, code, and follow-ups. Set up before the call, pick your round, keep your data straight.',
};

export default function HowItWorksPage() {
  return <HowItWorksClient />;
}

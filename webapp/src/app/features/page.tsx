import type { Metadata } from 'next';
import FeaturesClient from './FeaturesClient';

export const metadata: Metadata = {
  title: 'Features: Live interview answers, code and audio | Novi',
  description: 'Every tool in Novi: interview modes, audio, screenshots, coding, system design, local coding, eye tracking and the phone companion, lit by the plan you pick. Compared with four interview assistants.',
};

export default function FeaturesPage() {
  return <FeaturesClient />;
}

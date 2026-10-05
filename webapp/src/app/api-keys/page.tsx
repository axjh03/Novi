import type { Metadata } from 'next';
import ApiGuideClient from './ApiGuideClient';

export const metadata: Metadata = {
  title: 'API Keys Setup Guide — Claude, OpenAI, Gemini & Kimi | Novi',
  description: 'Step-by-step documentation for obtaining and configuring API keys from Anthropic Claude, OpenAI, Google Gemini, and Kimi (Moonshot AI) in Novi.',
};

export default function ApiKeysPage() {
  return <ApiGuideClient />;
}

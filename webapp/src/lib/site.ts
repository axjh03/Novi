// One source for the public site's journey, plans and contact links, so every page tells the same story.

export const CONTACT_EMAIL = 'getnoviapp@outlook.com';
export const INSTAGRAM_URL = 'https://instagram.com/getnoviapp';

export function mailto(subject: string, body?: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
}

/** The three steps from first visit to a working desktop app. Repeated on every page that explains getting started. */
export const JOURNEY = [
  { title: 'Choose your plan', text: 'Select a plan and send your access request. Our team confirms payment details and creates your account after payment.' },
  { title: 'Connect your AI provider', text: 'Sign in on this website, add your AI provider key, and create your desktop login. AI usage is billed separately by your provider.' },
  { title: 'Download and sign in', text: 'Install the desktop app on macOS, Windows, or Linux and sign in with your desktop login.' },
] as const;

export const CORE_FEATURES = [
  'AI chat, recruiter, technical, and behavioral modes',
  'Résumé, job description, and document context',
  'Screenshots and audio transcription',
  'Transparent overlay and click-through controls',
  'Eye tracking and phone companion',
  'Local conversation history and your choice of AI provider',
] as const;

export const ADVANCED_FEATURES = [
  'Coding assistant with explanations and edge cases',
  'System design guidance and architecture diagrams',
  'Local code context: read and search your project files',
] as const;

export type PlanId = 'essential' | 'pro' | 'plus' | 'lifetime';
export const PLANS: Record<PlanId, { name: string; price: string; unit: string; devices: string; summary: string; features: readonly string[] }> = {
  essential: { name: 'Essential', price: '$16.99', unit: '/ month', devices: '1 device', summary: 'The essentials for thoughtful preparation and focused conversations.', features: CORE_FEATURES },
  pro: { name: 'Pro', price: '$25', unit: '/ month', devices: '1 device', summary: 'A complete workspace for interviews, coding, and system design.', features: ['Everything in Essential', ...ADVANCED_FEATURES] },
  plus: { name: 'Plus', price: '$30', unit: '/ month', devices: '2 devices maximum', summary: 'Every feature, with room for your second computer.', features: ['Everything in Pro', 'All Novi features included', 'Access on up to 2 devices'] },
  lifetime: { name: 'Lifetime', price: '$299', unit: 'one-time', devices: 'Unlimited devices', summary: 'The complete Novi workspace. One payment, lifetime access.', features: ['Everything in Plus', 'Unlimited devices', 'Lifetime access with no monthly Novi fee'] },
};
export const isPlanId = (value: unknown): value is PlanId => typeof value === 'string' && Object.hasOwn(PLANS, value);

export const SITE_LINKS = [
  { id: 'how-it-works', href: '/how-it-works', label: 'How it works' },
  { id: 'download', href: '/download', label: 'Download' },
  { id: 'setup-guide', href: '/api-keys', label: 'Setup guide' },
] as const;
export type SiteLinkId = (typeof SITE_LINKS)[number]['id'] | 'get-access';

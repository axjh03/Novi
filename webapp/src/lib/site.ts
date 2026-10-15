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
  'Behavioral interview and technical screen modes',
  'Résumé, job description, and document context',
  'Screenshots and audio transcription',
  'Transparent overlay and click-through controls',
  'Local conversation history and your choice of AI provider',
] as const;
export const ADVANCED_FEATURES = [
  'AI chat and recruiter call modes',
  'Coding assistant with explanations and edge cases',
  'System design guidance and architecture diagrams',
  'Camera-based eye tracking',
] as const;
export type PlanId = 'core' | 'pro' | 'ultimate' | 'lifetime';
export const PLANS: Record<PlanId, { name: string; price: string; unit: string; devices: string; summary: string; features: readonly string[] }> = {
  core: { name: 'Core', price: '$16', unit: '/ month', devices: '1 device', summary: 'Focused support for behavioral interviews and technical screens.', features: CORE_FEATURES },
  pro: { name: 'Pro', price: '$45', unit: '/ month', devices: '1 device', summary: 'The interview toolkit, with coding, system design, and eye tracking.', features: ['Everything in Core', ...ADVANCED_FEATURES] },
  ultimate: { name: 'Ultimate', price: '$90', unit: '/ month', devices: '3 devices', summary: 'Your complete workspace, connected across your setup.', features: ['Everything in Pro', 'Local coding agent and project context', 'Phone companion — exclusive to Ultimate', 'Access on up to 3 devices'] },
  lifetime: { name: 'Lifetime', price: '$399', unit: 'one-time', devices: '1 device', summary: 'The Pro toolkit with one payment and lifetime access.', features: ['Everything in Pro', '1 device', 'Lifetime access with no monthly Novi fee'] },
};
export const isPlanId = (value: unknown): value is PlanId => typeof value === 'string' && Object.hasOwn(PLANS, value);

export const SITE_LINKS = [
  { id: 'features', href: '/features', label: 'Features' },
  { id: 'how-it-works', href: '/how-it-works', label: 'How it works' },
  { id: 'download', href: '/download', label: 'Download' },
  { id: 'setup-guide', href: '/api-keys', label: 'Setup guide' },
] as const;
export type SiteLinkId = (typeof SITE_LINKS)[number]['id'] | 'get-access';

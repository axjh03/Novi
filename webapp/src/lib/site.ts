// One source for the public site's journey, plans and contact links, so every page tells the same story.

export const CONTACT_EMAIL = 'getnoviapp@outlook.com';
export const PURCHASE_HELP = "Online payment isn't ready yet. Call MUKUL KAWADI WALA, the developer, for help.";
export const INSTAGRAM_URL = 'https://instagram.com/getnoviapp';

export function mailto(subject: string, body?: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
}

/** The three steps from first visit to a working desktop app. Repeated on every page that explains getting started. */
export const JOURNEY = [
  { title: 'Create your account and choose a plan', text: 'Individuals can sign up themselves. Our team confirms payment and attaches the license directly to your account. Enterprise teams can contact sales for managed accounts.' },
  { title: 'Connect your AI provider', text: 'Add your AI provider key on this website. Individuals use their own keys; enterprise desktop accounts inherit their team’s connections. AI usage is billed separately by your provider.' },
  { title: 'Download and sign in', text: 'Install Novi and use the same individual username and password as the website. Enterprise members use the desktop login their organization provides.' },
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
export const PLANS: Record<PlanId, { name: string; price: string; unit: string; summary: string; features: readonly string[] }> = {
  core: { name: 'Core', price: '$16', unit: '/ month', summary: 'Focused support for behavioral interviews and technical screens.', features: CORE_FEATURES },
  pro: { name: 'Pro', price: '$45', unit: '/ month', summary: 'The interview toolkit, with coding, system design, and eye tracking.', features: ['Everything in Core', ...ADVANCED_FEATURES] },
  ultimate: { name: 'Ultimate', price: '$90', unit: '/ month', summary: 'Your complete workspace, connected across your setup.', features: ['Everything in Pro', 'Local coding agent and project context', 'Phone companion, exclusive to Ultimate'] },
  lifetime: { name: 'Lifetime', price: '$399', unit: 'one-time', summary: 'The Pro toolkit with one payment and lifetime access.', features: ['Everything in Pro', 'Lifetime access with no monthly Novi fee'] },
};
export const isPlanId = (value: unknown): value is PlanId => typeof value === 'string' && Object.hasOwn(PLANS, value);

export const SITE_LINKS = [
  { id: 'features', href: '/features', label: 'Features' },
  { id: 'how-it-works', href: '/how-it-works', label: 'How it works' },
  { id: 'download', href: '/download', label: 'Download' },
  { id: 'referral', href: '/referral', label: 'Referrals' },
  { id: 'setup-guide', href: '/api-keys', label: 'Setup guide' },
] as const;
export type SiteLinkId = (typeof SITE_LINKS)[number]['id'] | 'get-access';

export const referralCode = (value: unknown): string => typeof value === 'string' ? value.replace(/[\r\n]/g, '').slice(0, 80) : '';

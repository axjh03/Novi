// One source for the public site's journey, plans and contact links, so every page tells the same story.

export const CONTACT_EMAIL = 'getnoviapp@outlook.com';
export const INSTAGRAM_URL = 'https://instagram.com/getnoviapp';

export function mailto(subject: string, body?: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
}

/** The three steps from first visit to a working desktop app. Repeated on every page that explains getting started. */
export const JOURNEY = [
  { title: 'Request access', text: 'Tell us which plan you want. Once payment is confirmed, we create your Novi account and your licenses.' },
  { title: 'Set up your account', text: 'Sign in on this website, add your AI provider key, and create a desktop login: one for an individual, one per person for a consultancy.' },
  { title: 'Download and sign in', text: 'Install the desktop app on macOS, Windows, or Linux and sign in with your desktop login.' },
] as const;

export type PlanId = 'student' | 'individual' | 'consultancy';
export const PLANS: Record<PlanId, { name: string; price: string; unit: string; summary: string }> = {
  student: { name: 'Student', price: '$79', unit: '/ month', summary: 'For students preparing for interviews and important conversations.' },
  individual: { name: 'Individual', price: '$99', unit: '/ month', summary: 'For professionals who want a focused, private desktop workspace.' },
  consultancy: { name: 'Consultancy', price: '$99', unit: '/ seat / month', summary: 'One Novi account for your team, with a desktop login for each person.' },
};
export const isPlanId = (value: unknown): value is PlanId => typeof value === 'string' && Object.hasOwn(PLANS, value);

export const SITE_LINKS = [
  { id: 'how-it-works', href: '/how-it-works', label: 'How it works' },
  { id: 'pricing', href: '/pricing', label: 'Pricing' },
  { id: 'download', href: '/download', label: 'Download' },
  { id: 'setup-guide', href: '/api-keys', label: 'Setup guide' },
] as const;
export type SiteLinkId = (typeof SITE_LINKS)[number]['id'] | 'get-access';

import type { AppMode } from './types';
import { SESSION_MODES } from './sessionModes';

/**
 * License plans and what each one unlocks. The single source of truth for plan enforcement:
 * the web server (webapp/src/lib/access.ts) sends the desktop app its plan's feature list from this
 * table, and the desktop app locks everything that is not on it. Keep it in step with the plans the
 * website sells (webapp/src/lib/site.ts and webapp/src/lib/features.ts); tests/plans.test.ts checks both.
 */
export const LICENSE_PLANS = ['CORE', 'PRO', 'ULTIMATE', 'LIFETIME'] as const;
export type LicensePlan = (typeof LICENSE_PLANS)[number];

/**
 * Something a plan can include: one of the seven session modes, eye tracking, or the phone companion.
 * Everything else in Novi (documents, screenshots, listening, transparency, shortcuts, smart
 * placement, Practice run, Get ready, history) is on every plan and is never checked.
 */
export type Feature = AppMode | 'eye-tracking' | 'phone-companion';

const CORE: readonly Feature[] = ['technical', 'behavioral'];
const PRO: readonly Feature[] = [...CORE, 'normal', 'recruiter', 'coding', 'system-design', 'eye-tracking'];
const ULTIMATE: readonly Feature[] = [...PRO, 'local-coding', 'phone-companion'];

/** The features each plan includes. Lifetime is the Pro toolkit with no expiry. */
export const PLAN_FEATURES: Record<LicensePlan, readonly Feature[]> = { CORE, PRO, ULTIMATE, LIFETIME: PRO };
/** Every feature id, for checking feature lists that arrive from the server. */
export const FEATURES: readonly Feature[] = ULTIMATE;
export const PLAN_NAMES: Record<LicensePlan, string> = { CORE: 'Core', PRO: 'Pro', ULTIMATE: 'Ultimate', LIFETIME: 'Lifetime' };

/**
 * The expiry stored for Lifetime licenses. Lifetime never expires, but the database keeps an expiry
 * date on every license, so Lifetime uses this far-future date and every existing "is it still valid"
 * check keeps working unchanged. Screens show "Never" instead of the date.
 */
export const LIFETIME_EXPIRY = new Date('9999-12-31T00:00:00.000Z');

/**
 * Request header the desktop app sends (with the value "1") on every call to the access server, to
 * say that it enforces plans. Apps from before plans existed don't send it and unlock everything, so
 * the server lets them use only Ultimate licenses, whose plan already includes everything.
 */
export const PLANS_HEADER = 'x-novi-plans';

/** Whether a value is one of the four plan ids. Used to validate input and server replies. */
export function isLicensePlan(value: unknown): value is LicensePlan {
  return typeof value === 'string' && (LICENSE_PLANS as readonly string[]).includes(value);
}

/** Whether a value is a known feature id. Used to drop anything unexpected from a server reply. */
export function isFeature(value: unknown): value is Feature {
  return typeof value === 'string' && (FEATURES as readonly string[]).includes(value);
}

/** The name people see for a feature, for example 'coding' => "Code", 'eye-tracking' => "Eye tracking". */
export function featureName(feature: Feature): string {
  if (feature === 'eye-tracking') return 'Eye tracking';
  if (feature === 'phone-companion') return 'Phone companion';
  return SESSION_MODES.find((mode) => mode.id === feature)?.name ?? feature;
}

/**
 * The cheapest monthly plan that includes a feature, for the small tag next to a lock: "Pro" or
 * "Ultimate". Lifetime is left out because it is never cheaper than Pro and has the same features.
 */
export function planTag(feature: Feature): string {
  const plan = (['CORE', 'PRO', 'ULTIMATE'] as const).find((id) => PLAN_FEATURES[id].includes(feature)) ?? 'ULTIMATE';
  return PLAN_NAMES[plan];
}

/**
 * The sentence shown when a locked feature is used, in the app and in errors from the main process.
 * Lists every plan that includes the feature, for example:
 *   "Code is included with Pro, Ultimate and Lifetime. Ask your Novi administrator to upgrade your license."
 */
export function lockedMessage(feature: Feature): string {
  const names = LICENSE_PLANS.filter((plan) => PLAN_FEATURES[plan].includes(feature)).map((plan) => PLAN_NAMES[plan]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `${featureName(feature)} is included with ${list}. Ask your Novi administrator to upgrade your license.`;
}

/**
 * The mode to use when the current one is locked, or when a toggle (such as the Code shortcut) is
 * switched off: Chat when the plan includes it, otherwise Technical, which every plan includes.
 *
 * @param features the plan's features, or undefined when there is no plan information (signed out,
 *   or a server from before plans), in which case every mode is allowed and Chat is used.
 */
export function fallbackMode(features: readonly Feature[] | undefined): AppMode {
  return !features || features.includes('normal') ? 'normal' : 'technical';
}

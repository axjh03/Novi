/**
 * Get ready results: the pre-session checks (storage, AI connection, speech files, microphone,
 * system audio, screen capture) and what each one found.
 *
 * Results live in memory for the current launch and are also saved in localStorage
 * (`novi_readiness`) for the rest of the day, per account. So relaunching Novi later the same day
 * shows the earlier results instead of forcing every check again, while another account on the same
 * computer never sees them.
 */

/** The id of one Get ready check. */
export type ReadinessCheck = 'storage' | 'ai' | 'speech' | 'microphone' | 'system' | 'screen';
/** One check's outcome: passed or not, the plain-language result, and the raw error text if it failed. */
export interface ReadinessResult { ok: boolean; detail: string; /** The browser's own error text, shown under Details. */ details?: string }
/** All results for one account, plus when they were checked. */
export interface Readiness {
  checkedAt: number;
  /** When Get ready last ran every check. */ ranAt?: number;
  results: Partial<Record<ReadinessCheck, ReadinessResult>>;
  /** Loaded from an earlier launch today rather than checked in this one. */ restored?: boolean;
}

/** Every check in the order Get ready shows them, with the name shown to the user. */
export const READINESS_CHECKS: Array<{ id: ReadinessCheck; name: string }> = [
  { id: 'storage', name: 'App storage' },
  { id: 'ai', name: 'AI connection' },
  { id: 'speech', name: 'Speech files' },
  { id: 'microphone', name: 'Microphone' },
  { id: 'system', name: 'System audio' },
  { id: 'screen', name: 'Screen capture' },
];

/** localStorage key for the saved results. Stored as `{ owner: <account id>, readiness: <Readiness> }`. */
const STORAGE_KEY = 'novi_readiness';
/** The current results in memory (this launch). */
let latest: Readiness | null = null;
/** The account the in-memory results belong to. Results are never shown to a different account. */
let owner: string | null = null;
/** The calendar day of a timestamp in local time, used to drop results from an earlier day. */
const day = (time: number) => new Date(time).toDateString();
/** Returns localStorage, or null where it's blocked (private windows, some test environments). */
function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
/** Saves the in-memory results for the current account. Failures are ignored: saving is only a convenience. */
function save() {
  if (!owner) return;
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify({ owner, readiness: latest })); } catch { /* convenience only */ }
}

/** Returns the current in-memory results (null before any check has run or been loaded). */
export function readReadiness(): Readiness | null { return latest; }

/**
 * Loads this account's saved results from earlier today and makes this account the owner.
 *
 * - Saved results for this account from today: returned, marked `restored: true` so the screen can
 *   say they came from earlier.
 * - Results for another account, or from an earlier day: ignored (returns null).
 * - localStorage unreadable: keeps this launch's in-memory results if they belong to the same
 *   account, otherwise starts empty.
 *
 * @param userId the signed-in account's id.
 * @param now    the current time (tests pass a fixed time).
 */
export function loadReadiness(userId: string, now = Date.now()): Readiness | null {
  let saved: Readiness | null = null, readable = false;
  try {
    const store = storage();
    readable = store !== null;
    const record = JSON.parse(store?.getItem(STORAGE_KEY) || 'null');
    if (record?.owner === userId && record.readiness?.results && day(record.readiness.checkedAt) === day(now)) saved = { ...record.readiness, restored: true };
  } catch { readable = false; }
  latest = saved ?? (!readable && owner === userId ? latest : null);
  owner = userId;
  return latest;
}

/**
 * Get ready is shown once per app launch for each account. After the user continues from it,
 * ending a session goes straight back to session setup instead of showing Get ready again.
 * This is memory only, so the next launch (or a different account) shows Get ready again.
 */
let continuedFor: string | null = null;
/** True when this account already continued past Get ready during this launch. */
export function getReadyContinued(userId: string): boolean { return continuedFor === userId; }
/** Records that this account continued past Get ready. */
export function continueFromGetReady(userId: string) { continuedFor = userId; }

/** Stores one check's result (replacing any earlier result for that check) and saves. */
export function recordReadiness(check: ReadinessCheck, result: ReadinessResult): Readiness {
  latest = { ...latest, restored: false, checkedAt: Date.now(), results: { ...latest?.results, [check]: result } };
  save();
  return latest;
}

/** Records that the user ran the full set of checks now (`ranAt`) and saves. */
export function markReadinessRun(): Readiness {
  latest = { checkedAt: Date.now(), results: {}, ...latest, restored: false, ranAt: Date.now() };
  save();
  return latest;
}

/** True only when every check has a passing result. */
export function allReady(readiness: Readiness | null): boolean {
  return READINESS_CHECKS.every(({ id }) => readiness?.results[id]?.ok === true);
}

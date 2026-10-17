export type ReadinessCheck = 'storage' | 'ai' | 'speech' | 'microphone' | 'system' | 'screen';
export interface ReadinessResult { ok: boolean; detail: string; /** The browser's own error text, shown under Details. */ details?: string }
export interface Readiness {
  checkedAt: number;
  /** When Get ready last ran every check. */ ranAt?: number;
  results: Partial<Record<ReadinessCheck, ReadinessResult>>;
  /** Loaded from an earlier launch today rather than checked in this one. */ restored?: boolean;
}

export const READINESS_CHECKS: Array<{ id: ReadinessCheck; name: string }> = [
  { id: 'storage', name: 'App storage' },
  { id: 'ai', name: 'AI connection' },
  { id: 'speech', name: 'Speech files' },
  { id: 'microphone', name: 'Microphone' },
  { id: 'system', name: 'System audio' },
  { id: 'screen', name: 'Screen capture' },
];

// Results are kept on this device for the rest of the day, per account, so a relaunch doesn't force every check again.
const STORAGE_KEY = 'novi_readiness';
let latest: Readiness | null = null;
let owner: string | null = null;
const day = (time: number) => new Date(time).toDateString();
function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function save() {
  if (!owner) return;
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify({ owner, readiness: latest })); } catch { /* convenience only */ }
}

export function readReadiness(): Readiness | null { return latest; }

/** Loads this account's results from earlier today. Without readable storage, this launch's results for the same account are kept. */
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

// Get ready shows once per app launch for each account; ending a session returns straight to session setup.
let continuedFor: string | null = null;
export function getReadyContinued(userId: string): boolean { return continuedFor === userId; }
export function continueFromGetReady(userId: string) { continuedFor = userId; }

export function recordReadiness(check: ReadinessCheck, result: ReadinessResult): Readiness {
  latest = { ...latest, restored: false, checkedAt: Date.now(), results: { ...latest?.results, [check]: result } };
  save();
  return latest;
}

export function markReadinessRun(): Readiness {
  latest = { checkedAt: Date.now(), results: {}, ...latest, restored: false, ranAt: Date.now() };
  save();
  return latest;
}

export function allReady(readiness: Readiness | null): boolean {
  return READINESS_CHECKS.every(({ id }) => readiness?.results[id]?.ok === true);
}

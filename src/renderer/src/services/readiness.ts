export type ReadinessCheck = 'storage' | 'ai' | 'speech' | 'microphone' | 'system' | 'screen';
export interface ReadinessResult { ok: boolean; detail: string }
export interface Readiness { checkedAt: number; /** When Get ready last ran every check. */ ranAt?: number; results: Partial<Record<ReadinessCheck, ReadinessResult>> }

export const READINESS_CHECKS: Array<{ id: ReadinessCheck; name: string }> = [
  { id: 'storage', name: 'App storage' },
  { id: 'ai', name: 'AI connection' },
  { id: 'speech', name: 'Speech files' },
  { id: 'microphone', name: 'Microphone' },
  { id: 'system', name: 'System audio' },
  { id: 'screen', name: 'Screen capture' },
];

// Kept in memory for this app run only, so returning to Get ready after a session shows the last results.
let latest: Readiness | null = null;

export function readReadiness(): Readiness | null { return latest; }

export function recordReadiness(check: ReadinessCheck, result: ReadinessResult): Readiness {
  latest = { ...latest, checkedAt: Date.now(), results: { ...latest?.results, [check]: result } };
  return latest;
}

export function markReadinessRun(): Readiness {
  latest = { checkedAt: Date.now(), results: {}, ...latest, ranAt: Date.now() };
  return latest;
}

export function allReady(readiness: Readiness | null): boolean {
  return READINESS_CHECKS.every(({ id }) => readiness?.results[id]?.ok === true);
}

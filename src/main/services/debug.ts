import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import type { DebugEvent, DebugOperation, DebugState } from '../../shared/debug';

type Context = { current: DebugOperation; secrets: Set<string>; failed: boolean; lastRecorded: number };
type Identity = Pick<DebugOperation, 'conversationId' | 'connectionId' | 'model' | 'engine' | 'taskId'>;

/** Bounded, per-launch diagnostics. Never pass prompts, headers, tool results or raw engine output. */
export class DebugService {
  private enabled = false;
  private events: DebugEvent[] = [];
  private active = new Map<string, Context>();
  private context = new AsyncLocalStorage<Context>();
  private sequence = 0;

  snapshot(): DebugState {
    return { enabled: this.enabled, active: this.enabled ? [...this.active.values()].map(item => ({ ...item.current })) : [], events: [...this.events] };
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.clear();
    return this.snapshot();
  }
  clear() { this.events = []; return this.snapshot(); }
  reset() { this.enabled = false; this.events = []; this.active.clear(); }

  secret(value: string) {
    if (value) { this.context.getStore()?.secrets.add(value); this.context.getStore()?.secrets.add(encodeURIComponent(value)); }
  }
  private clean(value: string, context?: Context): string {
    let result = stripVTControlCharacters(value);
    for (const secret of context?.secrets ?? []) result = result.split(secret).join('[REDACTED]');
    return result.replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:sk-[\w-]{16,}|AIza[\w-]{20,})\b/g, '[REDACTED]').slice(0, 500);
  }
  identify(identity: Identity) {
    const context = this.context.getStore();
    if (!context || !this.active.has(context.current.id)) return;
    for (const key of Object.keys(identity) as Array<keyof Identity>) {
      if (identity[key] !== undefined) context.current[key] = this.clean(identity[key]!, context);
    }
  }
  event(stage: string, details: DebugEvent['details'] = {}, level: DebugEvent['level'] = 'info', throttleMs = 0) {
    const context = this.context.getStore();
    if (!context || !this.active.has(context.current.id)) return;
    const now = Date.now();
    const sameStage = context.current.stage === stage;
    context.current.stage = stage;
    context.current.lastActivityAt = now;
    if (level === 'error') context.failed = true;
    if (!this.enabled || (sameStage && now - context.lastRecorded < throttleMs)) return;
    context.lastRecorded = now;
    const safe = Object.fromEntries(Object.entries(details).slice(0, 20).map(([key, value]) => [key, typeof value === 'string' ? this.clean(value, context) : value]));
    this.events.push({ ...context.current, sequence: ++this.sequence, time: now, level, details: safe });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }
  async run<T>(operation: string, callback: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const context: Context = { current: { id: randomUUID(), operation, startedAt: now, lastActivityAt: now, stage: 'Request received' }, secrets: new Set(), failed: false, lastRecorded: 0 };
    this.active.set(context.current.id, context);
    return this.context.run(context, async () => {
      this.event('Request received');
      try { return await callback(); }
      catch (error) { this.event('Request failed', { error: error instanceof Error ? error.name : 'Unknown error' }, 'error'); throw error; }
      finally {
        this.event(context.failed ? 'Request ended with an error' : 'Request finished', { elapsedMs: Date.now() - now }, context.failed ? 'error' : 'info');
        this.active.delete(context.current.id);
      }
    });
  }
}

export const debug = new DebugService();

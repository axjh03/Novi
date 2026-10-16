import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { version } from '../../../package.json';
import type { EngineId, TaskState } from '../../shared/localCoding';

/** Local failure diagnostics only; callers must not pass prompts, images or tool results. */
export function writeLocalCodingError(userData: string, context: { taskId: string; engine: EngineId; model: string; state: TaskState; reason?: string }, error: unknown, apiKey: string): string | null {
  try {
    const seen = new WeakSet<object>();
    const secrets = apiKey ? [apiKey, encodeURIComponent(apiKey)] : [];
    const record = JSON.stringify({ time: new Date().toISOString(), appVersion: version, platform: process.platform, arch: process.arch, ...context, error }, (_key, value) => {
      if (typeof value === 'string') {
        let text = stripVTControlCharacters(value);
        for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
        return text.replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
          .replace(/\b(?:sk-[\w-]{16,}|AIza[\w-]{20,})\b/g, '[REDACTED]').slice(0, 16_384);
      }
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
        if (value instanceof Error) {
          const detail = value as NodeJS.ErrnoException & { diagnostics?: unknown };
          return { name: detail.name, message: detail.message, stack: detail.stack, code: detail.code, syscall: detail.syscall, cause: detail.cause, diagnostics: detail.diagnostics };
        }
      }
      return value;
    });
    const directory = join(userData, 'logs'), file = join(directory, 'local-coding.log');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const line = record.length <= 65_536 ? record : JSON.stringify({ time: new Date().toISOString(), taskId: context.taskId, diagnostic: record.slice(0, 60_000), truncated: true });
    if (existsSync(file) && statSync(file).size + Buffer.byteLength(line) > 1024 * 1024) renameSync(file, `${file}.1`);
    appendFileSync(file, `${line}\n`, { mode: 0o600 });
    return file;
  } catch { return null; } // A disk/logging failure must not replace the engine error.
}

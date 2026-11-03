import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { version } from '../../../package.json';

/**
 * A plain-text record of one session, kept only while Debug is on in Settings. Every request's steps and
 * errors are appended as they happen, so even a request that never finishes leaves a file the user can
 * share. Keys are redacted; prompts, file contents and engine output are never written.
 */
export class SessionTrace {
  readonly file: string | null;
  private readonly started = Date.now();
  private readonly secrets = new Set<string>();

  /** One file per session under `<userData>/logs`, named after the session and its start time. */
  constructor(userData: string, sessionName: string, details = '') {
    const stamp = new Date(this.started).toISOString().slice(0, 16).replace(/[:.]/g, '-').replace('T', '-');
    const slug = sessionName.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'session';
    const directory = join(userData, 'logs');
    let file: string | null = join(directory, `${slug}-${stamp}.txt`);
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      appendFileSync(file, `Novi ${version} · ${process.platform} ${process.arch}\nSession "${sessionName}" · started ${new Date(this.started).toISOString()}${details ? `\n${details}` : ''}\nShare this file when reporting a problem. It holds steps and errors only: no prompts, file contents or keys.\n\n`, { mode: 0o600 });
    } catch { file = null; }
    this.file = file;
  }

  addSecret(value: string) { if (value) { this.secrets.add(value); this.secrets.add(encodeURIComponent(value)); } }

  private clean(text: string): string {
    let out = stripVTControlCharacters(text);
    for (const secret of this.secrets) out = out.split(secret).join('[REDACTED]');
    return out.replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]').replace(/\b(?:sk-[\w-]{16,}|AIza[\w-]{20,})\b/g, '[REDACTED]');
  }

  line(stage: string, detail = '', limit = 2000) {
    if (!this.file) return;
    const elapsed = `+${((Date.now() - this.started) / 1000).toFixed(1)}s`.padStart(9);
    try { appendFileSync(this.file, `${new Date().toISOString().slice(11, 23)} ${elapsed}  ${this.clean(stage)}${detail ? `  ${this.clean(detail).slice(0, limit)}` : ''}\n`); }
    catch { /* the trace is best effort; the request goes on without it */ }
  }

  error(error: unknown) {
    const detail = error instanceof Error ? error : new Error(String(error));
    const { cause, diagnostics } = detail as { cause?: unknown; diagnostics?: unknown };
    this.line('ERROR', `${detail.name}: ${detail.message}\n${detail.stack ?? ''}${cause !== undefined ? `\nCause: ${safe(cause)}` : ''}${diagnostics !== undefined ? `\nDiagnostics: ${safe(diagnostics)}` : ''}`, 16_000);
  }
}

/**
 * Serializes an error's cause or diagnostics for the trace without engine output. Engine stderr and
 * stdout can quote the request or project files, so only their length is written. A nested error keeps
 * its name, code and first message line but not its stack: execFile copies stderr into both.
 */
function safe(value: unknown): string {
  try {
    return JSON.stringify(value, (key, item) => {
      if ((key === 'stderr' || key === 'stdout') && typeof item === 'string') return `[${item.length} characters not written]`;
      if (item instanceof Error) return { name: item.name, code: (item as NodeJS.ErrnoException).code, message: item.message.split('\n')[0], cause: item.cause };
      return item;
    }, 1) ?? String(value);
  }
  catch { return String(value); }
}

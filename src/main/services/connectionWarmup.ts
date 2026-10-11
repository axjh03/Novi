import type { ProviderConnection } from '../../shared/types';
import { endpoint } from './providerTransport.ts';

// Node's fetch closes idle sockets after about 4 s, so a warm connection is only useful
// when the real request follows soon. Re-warm at most this often per origin.
const MIN_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 64 * 1024;
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

// The unauthenticated model-list URL for the connection a request will use, or null.
// HEAD is not used: providers answer it with `Connection: close`, which defeats reuse.
export function warmupUrl(connection: ProviderConnection | null | undefined): string | null {
  if (!connection || connection.enabled === false || !connection.model) return null;
  try {
    const url = new URL(`${endpoint(connection)}/models`);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.includes(url.hostname))) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

// Reads a little of the body so the socket returns to the pool; cancelling a large body
// closes the socket instead, which is harmless.
async function drain(body: ReadableStream<Uint8Array> | null) {
  if (!body) return;
  const reader = body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) { await reader.cancel(); return; }
    }
  } finally { reader.releaseLock(); }
}

// Opens the provider connection shortly before a likely request so the TLS handshake overlaps
// user activity or the access check. Sends no API key or content and never rejects.
export class ConnectionWarmer {
  private started = new Map<string, number>();
  private inFlight = new Set<string>();
  constructor(
    private fetchImpl: (input: string, init: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
    private now: () => number = Date.now,
  ) {}
  async warm(url: string | null): Promise<boolean> {
    if (!url) return false;
    let origin: string;
    try { origin = new URL(url).origin; } catch { return false; }
    const time = this.now();
    if (this.inFlight.has(origin) || time - (this.started.get(origin) ?? -Infinity) < MIN_INTERVAL_MS) return false;
    this.inFlight.add(origin);
    this.started.set(origin, time);
    try {
      const response = await this.fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
      await drain(response.body);
      return true;
    } catch { return false; }
    finally { this.inFlight.delete(origin); }
  }
}

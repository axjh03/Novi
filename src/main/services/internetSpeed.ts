import { UserError } from './validation';

/** A small public download checks reachability without sending account or provider credentials. */
export async function testInternet(): Promise<string> {
  const size = 262_144;
  const started = performance.now();
  try {
    const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${size}`, { signal: AbortSignal.timeout(10_000), cache: 'no-store', credentials: 'omit', redirect: 'error' });
    const latency = Math.round(performance.now() - started);
    if (!response.ok || !response.body) throw new Error('Download unavailable');
    const reader = response.body.getReader();
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > size) { await reader.cancel(); throw new Error('Unexpected download size'); }
      }
    } finally { reader.releaseLock(); }
    if (bytes !== size) throw new Error('Incomplete download');
    // shortcut: one small download estimates speed; use sustained multi-size tests for network diagnostics.
    const mbps = bytes * 8 / (Math.max(1, performance.now() - started - latency) * 1000);
    return `${latency} ms response · ${mbps.toFixed(1)} Mbps sample download`;
  } catch { throw new UserError('Internet speed test unavailable. Check your connection or retry.'); }
}

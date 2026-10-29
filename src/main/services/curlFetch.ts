import { execFile } from 'node:child_process';
import { UserError } from './validation';

/** Keep credentials and request data on stdin, never in the process arguments or error output. */
export function curlFetch(url: string, headers: Record<string, string>, signal: AbortSignal, body?: unknown): Promise<Response> {
  if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new UserError('The cURL fallback requires an HTTP provider URL.');
  if (Object.values(headers).some(value => /[\r\n\0]/.test(value))) throw new UserError('The provider key contains invalid header characters.');
  const config = [
    'silent', 'show-error', 'include', 'globoff', 'max-time = 90',
    `url = ${JSON.stringify(url)}`, `request = "${body === undefined ? 'GET' : 'POST'}"`,
    ...Object.entries(headers).map(([name, value]) => `header = ${JSON.stringify(`${name}: ${value}`)}`),
    ...(body === undefined ? [] : [`data-binary = ${JSON.stringify(JSON.stringify(body))}`]),
  ].join('\n');
  return new Promise((resolve, reject) => {
    const child = execFile('curl', ['--disable', '--config', '-', '--suppress-connect-headers'], { encoding: 'utf8', maxBuffer: 2_000_000, signal, windowsHide: true }, (error, stdout) => {
      if (error) { reject(new UserError('The cURL fallback could not connect. Check that cURL is installed and your network permits the provider.')); return; }
      try {
        let remaining = stdout, status = 0;
        let responseHeaders: Headers;
        do {
          const boundary = /\r?\n\r?\n/.exec(remaining);
          if (!boundary) throw new Error('Missing headers');
          const end = boundary.index;
          const lines = remaining.slice(0, end).split(/\r?\n/);
          const match = lines.shift()?.match(/^HTTP\/\S+\s+(\d{3})\b/);
          if (!match) throw new Error('Invalid status');
          status = Number(match[1]); responseHeaders = new Headers();
          for (const line of lines) {
            const colon = line.indexOf(':');
            if (colon > 0) responseHeaders.append(line.slice(0, colon), line.slice(colon + 1).trim());
          }
          remaining = remaining.slice(end + boundary[0].length);
        } while (status >= 100 && status < 200);
        resolve(new Response(remaining || null, { status, headers: responseHeaders! }));
      } catch { reject(new UserError('The cURL fallback returned an unreadable provider response.')); }
    });
    child.stdin?.on('error', () => { /* Process failures are reported by execFile. */ });
    child.stdin?.end(config);
  });
}

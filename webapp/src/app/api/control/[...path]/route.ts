import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { activity, desktop, login, mutate, state } from '@/lib/access';
import { AccessError } from '@/lib/access-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function setCors(response: NextResponse, req: Request) {
  const origin = req.headers.get('origin');
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return response;
}

export async function OPTIONS(req: Request) {
  return setCors(new NextResponse(null, { status: 204 }), req);
}

async function route(req: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  try {
    if (req.method !== 'GET' && !req.headers.get('content-type')?.startsWith('application/json')) throw new AccessError('JSON content required.', 415);
    let body: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      const raw = await req.text();
      if (raw.length > 16_384) throw new AccessError('Request too large.', 413);
      try { body = JSON.parse(raw || '{}'); } catch { throw new AccessError('Invalid JSON.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccessError('Invalid request.');
    }
    let data: unknown;
    if (path.join('/') === 'login' && req.method === 'POST') {
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
      return setCors(response, req);
    }
    if (path.join('/') === 'state' && req.method === 'GET') data = await state(req);
    else if (path.join('/') === 'activity' && req.method === 'GET') data = await activity(req);
    else if (path.join('/') === 'desktop' && req.method === 'GET') data = await desktop(req);
    else if (['POST', 'PATCH', 'DELETE'].includes(req.method) && path.length <= 2) data = await mutate(req, path[0], path[1], body);
    else throw new AccessError('Not found.', 404);
    const response = NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
    if (path[0] === 'logout') response.cookies.delete('astra_session');
    return setCors(response, req);
  } catch (error) {
    const known = error instanceof AccessError;
    const conflict = error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034', 'P1008'].includes(error.code);
    const missing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
    if (!known && !conflict && !missing) console.error('Access request failed:', error instanceof Error ? error.name : 'UnknownError');
    const response = NextResponse.json({
      error: known ? error.message : conflict ? 'This username, license, or device session is already in use. Refresh and try again.' : missing ? 'Record not found.' : 'The service could not complete this request. Check server configuration.'
    }, {
      status: known ? error.status : conflict ? 409 : missing ? 404 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
    return setCors(response, req);
  }
}
export { route as GET, route as POST, route as PATCH, route as DELETE };

import { NextResponse } from 'next/server';

// Retire the prototype endpoints so they cannot bypass the new access rules.
export function proxy() {
  return NextResponse.json({ error: 'This API has been retired. Use /api/control.' }, { status: 410 });
}
export const config = { matcher: '/api/v1/:path*' };

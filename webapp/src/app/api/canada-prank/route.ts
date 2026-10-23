// CANADA PRANK: set false to disable. Remove this route, CanadaPrank.tsx/.module.css,
// public/canada-prank.png, and the marked import/render in app/layout.tsx to delete it.
const CANADA_PRANK_ENABLED = true;

export function GET(request: Request) {
  return Response.json({ showPrank: CANADA_PRANK_ENABLED && request.headers.get('x-vercel-ip-country') === 'CA' }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

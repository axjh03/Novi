import { NextResponse } from 'next/server';

const GITHUB_REPO = 'axjh03/Novi';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get('asset') || searchParams.get('platform') || searchParams.get('target') || '';
  const requestedFile = searchParams.get('file') || '';

  const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  if (!token) {
    return new NextResponse('Server configuration error: GITHUB_PAT missing', { status: 500 });
  }

  try {
    // 1. Fetch latest release assets
    const relRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token.trim()}`,
        'User-Agent': 'Novi-Download-Proxy',
      },
      cache: 'no-store',
    });

    if (!relRes.ok) {
      return new NextResponse('Release not found', { status: 404 });
    }

    const relData = await relRes.json();
    const assets = Array.isArray(relData.assets) ? relData.assets : [];

    // 2. Identify the target asset
    let targetAsset = assets.find((a: any) => {
      const name = (a.name || '').toLowerCase();
      if (requestedFile && name === requestedFile.toLowerCase()) return true;

      switch (assetType.toLowerCase()) {
        case 'mac-arm64':
        case 'macarm64':
        case 'apple-silicon':
          return name.endsWith('.dmg') && name.includes('arm64');
        case 'mac-x64':
        case 'macx64':
        case 'intel':
          return name.endsWith('.dmg') && (name.includes('x64') || name.includes('intel'));
        case 'mac':
        case 'macos':
          return name.endsWith('.dmg');
        case 'windows':
        case 'win':
        case 'exe':
          return name.endsWith('.exe');
        case 'linux-deb':
        case 'deb':
          return name.endsWith('.deb');
        case 'linux-appimage':
        case 'appimage':
          return name.endsWith('.appimage');
        case 'linux':
          return name.endsWith('.deb') || name.endsWith('.appimage');
        default:
          return false;
      }
    });

    // Fallback: if user asked for mac and no specific arch matched, pick first .dmg
    if (!targetAsset && assetType.includes('mac')) {
      targetAsset = assets.find((a: any) => a.name.endsWith('.dmg'));
    }

    if (!targetAsset || !targetAsset.url) {
      return new NextResponse(`Asset not found for type: ${assetType}`, { status: 404 });
    }

    // 3. Request pre-signed CDN download URL from GitHub API
    const assetRes = await fetch(targetAsset.url, {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/octet-stream',
        'User-Agent': 'Novi-Download-Proxy',
      },
      redirect: 'manual',
    });

    const cdnUrl = assetRes.headers.get('location');
    if (cdnUrl) {
      // 307 redirect directly to AWS CDN pre-signed link
      return NextResponse.redirect(cdnUrl, 307);
    }

    // If GitHub directly returned binary body
    if (assetRes.ok && assetRes.body) {
      return new NextResponse(assetRes.body, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${targetAsset.name}"`,
          'Content-Length': String(targetAsset.size),
        },
      });
    }

    return new NextResponse('Failed to retrieve download asset', { status: 502 });
  } catch (err: any) {
    return new NextResponse(err.message || 'Download error', { status: 500 });
  }
}

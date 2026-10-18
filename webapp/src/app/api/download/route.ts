import { NextResponse } from 'next/server';
import { GITHUB_REPO, newestWithAsset, publishedReleases, type ReleaseAsset } from '@/lib/github-releases';

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

    // 2. Identify the target asset. `wanted` decides whether a (lower-case) asset name is the
    // requested file, using the same rules for the latest release and for the fallback below.
    const wanted = (name: string) => {
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
        // Linux files are named per architecture (amd64/x86_64 or arm64); the plain names mean x64.
        case 'linux-deb':
        case 'deb':
          return name.endsWith('_amd64.deb');
        case 'linux-deb-arm64':
          return name.endsWith('_arm64.deb');
        case 'linux-appimage':
        case 'appimage':
          return name.endsWith('_x86_64.appimage');
        case 'linux-appimage-arm64':
          return name.endsWith('_arm64.appimage');
        case 'linux':
          return name.endsWith('_amd64.deb') || name.endsWith('_x86_64.appimage');
        default:
          return false;
      }
    };
    // If someone asked for "mac" and no specific chip matched, any .dmg will do.
    const anyMacDisk = (name: string) => assetType.includes('mac') && name.endsWith('.dmg');
    const pick = (list: ReleaseAsset[]) => list.find(a => wanted(String(a.name || '').toLowerCase())) || list.find(a => anyMacDisk(String(a.name || '').toLowerCase()));

    let targetAsset = pick(assets);

    // The newest release can be missing a system's files (for example when one build failed). Rather
    // than leave those users with nothing, serve the file from the newest release that has it.
    if (!targetAsset) {
      const releases = await publishedReleases(token);
      const found = newestWithAsset(releases, wanted) || newestWithAsset(releases, anyMacDisk);
      targetAsset = found?.asset;
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

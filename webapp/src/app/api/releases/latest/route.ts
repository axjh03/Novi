import { NextResponse } from 'next/server';
import fallbackReleaseInfo from '@/lib/release-info.json';
import { GITHUB_REPO, newestWithAsset, publishedReleases, updateManifestName, type Release } from '@/lib/github-releases';

export const revalidate = 0;

/**
 * Describes the newest Novi release for the website's download page and the desktop update check.
 *
 * Without parameters it reports GitHub's latest release (what the download page shows).
 * The desktop app adds `?platform=<process.platform>&arch=<process.arch>`: it then gets the newest
 * release that contains that system's update manifest (latest.yml, latest-mac.yml,
 * latest-linux.yml or latest-linux-arm64.yml). So if a release is missing one system's build,
 * those machines keep seeing the previous complete release instead of an update they can't install.
 */
export async function GET(req: Request) {
  const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json({
      success: true,
      live: false,
      data: fallbackReleaseInfo,
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const manifest = updateManifestName(searchParams.get('platform'), searchParams.get('arch'));
    let data: Release;
    if (manifest) {
      // A desktop update check: only a release that can update this machine counts.
      const found = newestWithAsset(await publishedReleases(token), name => name === manifest);
      if (!found) return NextResponse.json({ success: true, live: false, data: fallbackReleaseInfo });
      data = found.release;
    } else {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token.trim()}`,
          'User-Agent': 'Novi-Web',
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        return NextResponse.json({
          success: true,
          live: false,
          data: fallbackReleaseInfo,
        });
      }

      data = await res.json();
    }
    const tagName = String(data.tag_name || 'v0.1.2');
    const version = tagName.replace(/^v/, '');

    const publishedDate = data.published_at
      ? new Date(data.published_at).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : fallbackReleaseInfo.releaseDate;

    // Direct proxy download routes that work even for private repo
    const downloads = {
      macArm64: `/api/download?asset=mac-arm64`,
      macX64: `/api/download?asset=mac-x64`,
      windows: `/api/download?asset=windows`,
      linuxDeb: `/api/download?asset=linux-deb`,
      linuxAppImage: `/api/download?asset=linux-appimage`,
      linuxDebArm64: `/api/download?asset=linux-deb-arm64`,
      linuxAppImageArm64: `/api/download?asset=linux-appimage-arm64`,
    };

    const fileNames: Record<string, string> = { ...fallbackReleaseInfo.fileNames };

    if (Array.isArray(data.assets)) {
      for (const asset of data.assets) {
        const name = String(asset.name || '');
        if (name.endsWith('.dmg')) {
          if (name.includes('arm64')) fileNames.macArm64 = name;
          else fileNames.macX64 = name;
        } else if (name.endsWith('.exe')) {
          fileNames.windows = name;
        } else if (name.endsWith('.deb')) {
          if (name.endsWith('_arm64.deb')) fileNames.linuxDebArm64 = name;
          else fileNames.linuxDeb = name;
        } else if (name.endsWith('.AppImage')) {
          if (name.endsWith('_arm64.AppImage')) fileNames.linuxAppImageArm64 = name;
          else fileNames.linuxAppImage = name;
        }
      }
    }

    return NextResponse.json({
      success: true,
      live: true,
      data: {
        version,
        buildNumber: 3,
        releaseTag: tagName,
        releaseDate: publishedDate,
        updatedAt: data.published_at || new Date().toISOString(),
        repo: GITHUB_REPO,
        releaseNotes: data.body || '',
        downloads,
        fileNames,
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      live: false,
      data: fallbackReleaseInfo,
    });
  }
}

/**
 * Helpers for reading Novi's published GitHub releases.
 *
 * Why this exists: every system (Windows, macOS, Linux) is built by its own CI job. If one job fails,
 * a release can end up without that system's files (v4.0.23 was published with no Windows installer).
 * GitHub's "latest release" would then send Windows users to a release they can't install, so the
 * download and update routes use these helpers to find the newest release that really has the file.
 */

export const GITHUB_REPO = 'axjh03/Novi';

/** The parts of a GitHub release asset the routes use. `url` is the API URL used to download it. */
export interface ReleaseAsset { name: string; url: string; size: number }
/** The parts of a GitHub release the routes use. */
export interface Release { tag_name: string; draft: boolean; prerelease: boolean; published_at: string | null; body?: string | null; assets: ReleaseAsset[] }

/**
 * Lists the published releases (newest first), leaving out drafts and pre-releases.
 *
 * Only the most recent 20 releases are read; an older release is never a sensible thing to offer.
 * Drafts are excluded because a token with write access can see them, but users must never get them.
 *
 * @param token a GitHub token with read access to the repository.
 * @returns the releases, or [] when GitHub can't be reached or answers with an error.
 */
export async function publishedReleases(token: string): Promise<Release[]> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`, {
      headers: { Accept: 'application/vnd.github.v3+json', Authorization: `Bearer ${token.trim()}`, 'User-Agent': 'Novi-Web' },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const releases = await response.json() as Release[];
    if (!Array.isArray(releases)) return [];
    return releases
      .filter(release => !release.draft && !release.prerelease && Array.isArray(release.assets))
      .sort((a, b) => Date.parse(b.published_at || '') - Date.parse(a.published_at || ''));
  } catch {
    return [];
  }
}

/**
 * Names the update manifest (electron-builder's latest*.yml) for a desktop system and chip.
 * A release can update that machine only if it has this file, because the manifest holds the
 * installer's name, size and SHA-512 that Novi checks before installing.
 *
 * @param platform Node's process.platform as sent by the desktop app: 'win32', 'darwin' or 'linux'.
 * @param arch     Node's process.arch: 'x64' or 'arm64' (only Linux has a separate arm64 manifest).
 * @returns the manifest file name, or null for a system Novi doesn't build for.
 */
export function updateManifestName(platform: string | null, arch: string | null): string | null {
  if (platform === 'win32') return 'latest.yml';
  if (platform === 'darwin') return 'latest-mac.yml';
  if (platform === 'linux') return arch === 'arm64' ? 'latest-linux-arm64.yml' : 'latest-linux.yml';
  return null;
}

/**
 * Returns the newest release that contains an asset matching `matches`, together with that asset.
 *
 * @param releases releases sorted newest first (see publishedReleases).
 * @param matches  decides whether an asset is the one wanted (compare names in lower case).
 * @returns `{ release, asset }`, or null when no recent release has a matching asset.
 */
export function newestWithAsset(releases: Release[], matches: (name: string) => boolean): { release: Release; asset: ReleaseAsset } | null {
  for (const release of releases) {
    const asset = release.assets.find(item => matches(String(item.name || '').toLowerCase()));
    if (asset) return { release, asset };
  }
  return null;
}

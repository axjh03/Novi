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
 * Lists the published releases, highest version first, leaving out drafts and pre-releases.
 *
 * Sorted by version rather than publish time, so a release that happened to finish building
 * after a newer one never hides the newer one from update checks or the download page.
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
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name) || Date.parse(b.published_at || '') - Date.parse(a.published_at || ''));
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
 * @param releases releases sorted highest version first (see publishedReleases).
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

/**
 * The first Novi release built on Electron 44, which no longer runs on macOS 12 (Monterey).
 * Releases from this version on are only offered to Macs that report macOS 13 or later.
 * Change it only if the Electron 44 release ships under a different version number.
 */
export const MACOS_13_FROM = '4.0.26';

/** Compares "x.y.z" versions (a leading "v" is ignored); negative when a is older than b. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => value.replace(/^v/, '').split('.').map(part => parseInt(part, 10) || 0);
  const left = parse(a), right = parse(b);
  for (let i = 0; i < 3; i++) if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) - (right[i] ?? 0);
  return 0;
}

/**
 * Picks the release to offer a Mac, from the releases that contain the Mac update manifest.
 *
 * Novi 4.0.25 and later send the Mac's macOS version (`os`, for example "13.6.1"). Older Novi
 * versions send nothing, so the portal can't tell whether they run macOS 12; they get the newest
 * release before MACOS_13_FROM (4.0.25), which itself sends `os` from then on. Macs on macOS 13 or
 * later get the newest release; Macs on macOS 12 or older stay on the newest one before MACOS_13_FROM.
 *
 * @param releases releases sorted highest version first (see publishedReleases).
 * @param os       the `os` query parameter, or null when the app didn't send one.
 * @returns the release to offer (or null when none fits), and a notice for the app when a newer
 *   release exists that this Mac can't run.
 */
export function releaseForMac(releases: Release[], os: string | null): { release: Release | null; notice?: string } {
  // Highest version first, so the choice doesn't depend on which release happened to publish last.
  const candidates = releases
    .filter(release => release.assets.some(asset => String(asset.name || '').toLowerCase() === 'latest-mac.yml'))
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  if (parseInt(os ?? '', 10) >= 13) return { release: candidates[0] ?? null };
  const release = candidates.find(item => compareVersions(item.tag_name, MACOS_13_FROM) < 0) ?? null;
  // Only an app that sent its macOS version gets told why, since only those versions can show it.
  // `os` comes from the request, so only digits and dots of it are repeated back.
  const shown = (os ?? '').replace(/[^\d.]/g, '').slice(0, 20);
  const held = os !== null && candidates.some(item => compareVersions(item.tag_name, MACOS_13_FROM) >= 0);
  return held
    ? { release, notice: `Novi ${MACOS_13_FROM} and later need macOS 13 or later. This Mac runs macOS ${shown || 'an older version'}, so it stays on Novi ${release ? release.tag_name.replace(/^v/, '') : 'its current version'}.` }
    : { release };
}

/**
 * Release check, run on each CI runner right after electron-builder has packaged Novi.
 *
 * It proves that the files this runner built are exactly what Novi's in-app updater will ask for:
 * - every installer the updater can request on this system exists in dist/, under the exact name
 *   `releaseFile()` (src/main/services/updater.ts) builds;
 * - the update manifest for that system (latest.yml, latest-mac.yml, latest-linux*.yml) exists and
 *   lists that installer with the release version;
 * - the size and SHA-512 in the manifest match the file on disk, because the updater refuses any
 *   download whose size or checksum differs.
 *
 * It uses the updater's own `releaseFile()` and `manifestEntry()`, so a renamed artifact or a changed
 * manifest format fails here, before anything is published, instead of on users' machines.
 *
 * Usage: node --import tsx scripts/verify-release-files.ts [dist folder, default "dist"]
 * Exit code 0 when everything matches; 1 with a list of every problem otherwise.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { manifestEntry, releaseFile, type ReleaseFile } from '../src/main/services/updater';

const dist = process.argv[2] || 'dist';
const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;

/** Every installer the updater can request from a machine of this runner's system, one per chip and install type. */
function expectedFiles(platform: NodeJS.Platform): ReleaseFile[] {
  if (platform === 'win32') return [releaseFile(version, 'win32', 'x64')!];
  if (platform === 'darwin') return [releaseFile(version, 'darwin', 'arm64')!, releaseFile(version, 'darwin', 'x64')!];
  if (platform === 'linux') {
    return (['x64', 'arm64'] as const).flatMap(arch => [
      releaseFile(version, 'linux', arch, { kind: 'deb' })!,
      releaseFile(version, 'linux', arch, { kind: 'appimage', path: '' })!,
    ]);
  }
  throw new Error(`No release files are defined for ${platform}.`);
}

/** SHA-512 of a file in base64, the format electron-builder writes into latest*.yml. Streams, so large installers are fine. */
async function sha512(path: string): Promise<string> {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('base64');
}

/** Checks every expected file and exits 1 with the full list of problems, so one run shows everything wrong. */
async function main() {
  const problems: string[] = [];
  for (const file of expectedFiles(process.platform)) {
    const before = problems.length;
    const installer = join(dist, file.name);
    const manifest = join(dist, file.manifest);
    if (!existsSync(installer)) { problems.push(`${file.name} is missing from ${dist}.`); continue; }
    if (!existsSync(manifest)) { problems.push(`${file.manifest} is missing from ${dist}.`); continue; }
    const entry = manifestEntry(readFileSync(manifest, 'utf8'), file.name);
    if (!entry) { problems.push(`${file.manifest} has no complete entry for ${file.name}.`); continue; }
    if (entry.version !== version) problems.push(`${file.manifest} says version ${entry.version}, but this release is ${version}.`);
    const size = statSync(installer).size;
    if (entry.size !== size) problems.push(`${file.name} is ${size} bytes, but ${file.manifest} says ${entry.size}.`);
    if (entry.sha512 !== await sha512(installer)) problems.push(`${file.name} does not match the SHA-512 in ${file.manifest}.`);
    if (problems.length === before) console.log(`ok  ${file.name} (${size} bytes) matches ${file.manifest}`);
  }

  if (problems.length) {
    console.error(`Release files for ${version} on ${process.platform} are not ready to publish:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`All ${process.platform} release files for ${version} match their update manifests.`);
}

main().catch((error) => { console.error(error); process.exit(1); });

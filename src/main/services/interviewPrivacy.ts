import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

function inside(parent: string, child: string) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}
export function assertRemoteInterviewAccess(target: string, privateDirectory: string, archive = false) {
  const canonicalTarget = realpathSync(target);
  let canonicalPrivate: string;
  try { canonicalPrivate = realpathSync(privateDirectory); } catch { canonicalPrivate = resolve(privateDirectory); }
  if (inside(canonicalPrivate, canonicalTarget) || (archive && inside(canonicalTarget, canonicalPrivate))) {
    throw new Error('Local interview data is excluded from remote file access.');
  }
}

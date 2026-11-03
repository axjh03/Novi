import { mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Copies of screenshots in the user's Pictures folder (Pictures/Novi/Screenshots). Saving them is an
 * opt-in setting; the chat keeps its own copy of every screenshot either way.
 *
 * Layout: one folder per local day, one file per screenshot named by its local time, for example
 * 2026-11-02/15-04-05.png, then "15-04-05 (2).png" for a second screenshot in the same second.
 * Builds before this file made one folder per second in UTC:
 * 2026-11-02T20-04-05/Screen-<time>-<uuid>.png. Clear history removes both layouts.
 */

const pad = (value: number) => String(value).padStart(2, '0');
// The folders and files Novi writes. Deleting matches only these, so anything else a user keeps in
// the Screenshots folder is never touched.
const DAY_FOLDER = /^\d{4}-\d{2}-\d{2}$/;
const DAY_FILE = /^\d{2}-\d{2}-\d{2}(?: \(\d+\))?\.png$/;
const OLD_FOLDER = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
const OLD_FILE = /^Screen-.+\.png$/;

/**
 * Writes one screenshot into today's folder under `root` and returns the file's path.
 * Folders are private to the user (0700) and files 0600. Never overwrites: a name already taken gets
 * " (2)", " (3)" and so on.
 *
 * @param root the Screenshots folder, normally Pictures/Novi/Screenshots.
 * @param png  the screenshot as PNG bytes.
 * @param now  when the screenshot was taken; its local date and time name the folder and file.
 */
export function saveScreenshotCopy(root: string, png: Buffer, now = new Date()): string {
  const directory = join(root, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const base = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  for (let copy = 1; ; copy++) {
    const file = join(directory, copy === 1 ? `${base}.png` : `${base} (${copy}).png`);
    try {
      writeFileSync(file, png, { flag: 'wx', mode: 0o600 });
      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || copy >= 1000) throw error;
    }
  }
}

/**
 * Deletes the screenshot copies Novi saved under `root`, in both layouts, then removes the folders
 * that are left empty, up to and including root and its parent (Pictures/Novi). Other files, and the
 * folders that still hold them, stay. Symbolic links are never followed.
 *
 * @param root the Screenshots folder, normally Pictures/Novi/Screenshots.
 * @returns how many screenshots were deleted; 0 when the folder does not exist.
 */
export function deleteScreenshotCopies(root: string): number {
  let deleted = 0;
  let folders;
  try {
    folders = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const files = DAY_FOLDER.test(folder.name) ? DAY_FILE : OLD_FOLDER.test(folder.name) ? OLD_FILE : null;
    if (!files) continue;
    const directory = join(root, folder.name);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && files.test(entry.name)) { unlinkSync(join(directory, entry.name)); deleted++; }
    }
    removeIfEmpty(directory);
  }
  removeIfEmpty(root);
  removeIfEmpty(dirname(root));
  return deleted;
}

/** Removes a folder only when it is empty; a folder that still holds something is left as it is. */
function removeIfEmpty(directory: string) {
  try {
    rmdirSync(directory);
  } catch (error) {
    if (!['ENOTEMPTY', 'EEXIST', 'ENOENT', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
}

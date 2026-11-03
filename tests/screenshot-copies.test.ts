import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deleteScreenshotCopies, saveScreenshotCopy } from '../src/main/services/screenshotCopies';
import { Storage } from '../src/main/services/storage';
import { LocalAuthService } from '../src/main/services/auth';

const unix = { skip: process.platform === 'win32' };

/** A temp Pictures folder with Novi/Screenshots inside, removed after the test. */
function pictures(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'novi-pictures-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, root: join(directory, 'Novi', 'Screenshots') };
}

test('a copy goes into a folder for the local day, named by its local time, never overwriting', t => {
  const { root } = pictures(t);
  const when = new Date(2026, 10, 2, 9, 4, 5);
  const first = saveScreenshotCopy(root, Buffer.from('one'), when);
  const second = saveScreenshotCopy(root, Buffer.from('two'), when);
  const third = saveScreenshotCopy(root, Buffer.from('three'), when);
  assert.equal(first, join(root, '2026-11-02', '09-04-05.png'));
  assert.equal(second, join(root, '2026-11-02', '09-04-05 (2).png'));
  assert.equal(third, join(root, '2026-11-02', '09-04-05 (3).png'));
  assert.deepEqual([first, second, third].map(file => readFileSync(file, 'utf8')), ['one', 'two', 'three']);
  saveScreenshotCopy(root, Buffer.from('later'), new Date(2026, 10, 2, 23, 59, 59));
  saveScreenshotCopy(root, Buffer.from('next day'), new Date(2026, 10, 3, 0, 0, 1));
  assert.deepEqual(readdirSync(root).sort(), ['2026-11-02', '2026-11-03'], 'one folder per day');
});

test('copies are private to the user', unix, t => {
  const { root } = pictures(t);
  const file = saveScreenshotCopy(root, Buffer.from('png'), new Date(2026, 0, 1, 12, 0, 0));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(join(root, '2026-01-01')).mode & 0o777, 0o700);
});

test('clearing deletes only the screenshots Novi saved, in the new and the old layout', unix, t => {
  const { directory, root } = pictures(t);
  saveScreenshotCopy(root, Buffer.from('a'), new Date(2026, 10, 2, 9, 4, 5));
  saveScreenshotCopy(root, Buffer.from('b'), new Date(2026, 10, 2, 9, 4, 5));
  saveScreenshotCopy(root, Buffer.from('c'), new Date(2026, 10, 3, 10, 0, 0));
  // The layout builds before 4.x wrote: one folder per second, in UTC.
  const old = join(root, '2026-10-30T18-22-07');
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, 'Screen-2026-10-30T18-22-07-123Z-6f1c.png'), 'old');
  // Things a user put there, which must survive.
  const kept = join(root, '2026-11-03', 'my notes.txt');
  writeFileSync(kept, 'mine');
  mkdirSync(join(root, 'Holiday'));
  writeFileSync(join(root, 'Holiday', '09-04-05.png'), 'not from Novi');
  writeFileSync(join(root, '09-04-05.png'), 'loose file');
  // A link that looks like a day folder is not followed.
  const outside = join(directory, 'elsewhere');
  mkdirSync(outside);
  writeFileSync(join(outside, '01-02-03.png'), 'outside');
  symlinkSync(outside, join(root, '2026-12-01'));

  assert.equal(deleteScreenshotCopies(root), 4);
  assert(!existsSync(join(root, '2026-11-02')), 'a day folder left empty is removed');
  assert(!existsSync(old), 'the old per-second folder is removed');
  assert.equal(readFileSync(kept, 'utf8'), 'mine');
  assert.deepEqual(readdirSync(join(root, '2026-11-03')), ['my notes.txt']);
  assert.equal(readFileSync(join(root, 'Holiday', '09-04-05.png'), 'utf8'), 'not from Novi');
  assert.equal(readFileSync(join(root, '09-04-05.png'), 'utf8'), 'loose file');
  assert.equal(readFileSync(join(outside, '01-02-03.png'), 'utf8'), 'outside');
});

test('clearing removes the Screenshots and Novi folders once nothing else is in them', t => {
  const { directory, root } = pictures(t);
  saveScreenshotCopy(root, Buffer.from('a'), new Date(2026, 10, 2, 9, 4, 5));
  assert.equal(deleteScreenshotCopies(root), 1);
  assert.deepEqual(readdirSync(directory), [], 'Pictures/Novi is gone too');
  assert.equal(deleteScreenshotCopies(root), 0, 'a missing folder is nothing to delete');
});

test('the old always-on screenshot setting is dropped, so copies start off', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-screenshot-setting-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  await new LocalAuthService(storage).signUp('Test', 'screens@example.test', 'test-password');
  (storage.current().settings as { saveScreenshots?: boolean }).saveScreenshots = true;
  storage.save();
  assert.equal(JSON.parse(readFileSync(storage.file, 'utf8')).accounts[0].settings.saveScreenshots, true, 'stored the way older builds saved it');
  const reopened = new Storage(directory);
  assert(!('saveScreenshots' in reopened.current().settings));
  assert.notEqual(reopened.current().settings.saveScreenshotsToPictures, true);
});

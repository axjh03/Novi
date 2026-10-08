import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parentPath } from '../webapp/src/lib/remote-paths';

test('remote explorer parent navigation reaches POSIX and Windows roots but stops there', () => {
  assert.equal(parentPath('/Users/alok/Documents'), '/Users/alok');
  assert.equal(parentPath('/Users'), '/');
  assert.equal(parentPath('/'), null);
  assert.equal(parentPath('C:\\Users\\Alok\\Documents'), 'C:\\Users\\Alok');
  assert.equal(parentPath('C:\\Users'), 'C:\\');
  assert.equal(parentPath('C:\\'), null);
  assert.equal(parentPath(':root'), null);
});

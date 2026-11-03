import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from '../src/app/api/canada-prank/route';

test('the prank is switched off for every country and never shares a cached country decision', async () => {
  for (const country of ['CA', 'US', 'IN', '', 'Canada']) {
    const response = GET(new Request('https://novi.example/api/canada-prank', {
      headers: country ? { 'x-vercel-ip-country': country } : {},
    }));
    assert.deepEqual(await response.json(), { showPrank: false });
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});

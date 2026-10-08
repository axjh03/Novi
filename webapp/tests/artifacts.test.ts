import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listArtifacts, deleteArtifacts } from '../src/lib/github-artifacts';

test('artifact cleanup paginates, scopes requests, validates confirmation and reports partial failures', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_PAT;
  process.env.GITHUB_PAT = 'test-only-token';
  const calls: string[] = [];
  let failListing = false;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    calls.push(url);
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-only-token');
    assert.equal(options?.cache, 'no-store');
    assert.ok(url.startsWith('https://api.github.com/repos/axjh03/Novi/actions/artifacts'));
    assert.ok(options?.signal, 'Requests have a timeout');
    if (options?.method === 'DELETE') {
      if (url.endsWith('/3')) return new Response(null, { status: 403 });
      if (url.endsWith('/4')) throw new Error('Network failed');
      if (url.endsWith('/5')) return new Response(null, { status: 404 });
      return new Response(null, { status: 204 });
    }
    if (failListing) return new Response(null, { status: 403 });
    const page = new URL(url).searchParams.get('page');
    const headers: Record<string, string> = page === '1' ? { link: '<https://api.github.com/repos/axjh03/Novi/actions/artifacts?per_page=100&page=2>; rel="next"' } : {};
    return Response.json({ artifacts: [{ id: Number(page), name: `installer-${page}`, size_in_bytes: 2048, created_at: '2026-01-01T00:00:00Z' }] }, { headers });
  };
  try {
    const first = await listArtifacts(1);
    assert.equal(first.hasNext, true);
    assert.deepEqual(first.artifacts, [{ id: 1, name: 'installer-1', size: 2048, createdAt: '2026-01-01T00:00:00Z' }]);
    assert.equal((await listArtifacts(2)).hasNext, false);
    assert.ok(!JSON.stringify(first).includes('test-only-token'));
    const callCount = calls.length;
    for (const page of [0, -1, 1.5, NaN, 10001]) await assert.rejects(listArtifacts(page), /Invalid artifact page/);
    for (const body of [{ ids: [1] }, { confirm: 'delete-artifacts', ids: [] }, { confirm: 'delete-artifacts', ids: [1, 1] },
      { confirm: 'delete-artifacts', ids: ['1'] }, { confirm: 'delete-artifacts', ids: [-1] },
      { confirm: 'delete-artifacts', ids: [1, 2, 3, 4, 5, 6] }, { confirm: 'delete-artifacts', ids: ['../releases/1'] }]) {
      await assert.rejects(deleteArtifacts(body), /Confirm deletion/);
    }
    assert.equal(calls.length, callCount, 'Invalid input must not reach GitHub');
    const result = await deleteArtifacts({ confirm: 'delete-artifacts', ids: [1, 2, 3, 4, 5] });
    assert.deepEqual(result.results.filter(item => item.deleted).map(item => item.id), [1, 2]);
    assert.match(result.results[2].error!, /Actions read\/write/);
    assert.match(result.results[3].error!, /could not be confirmed/);
    assert.match(result.results[4].error!, /could not find/);
    assert.equal((await deleteArtifacts({ confirm: 'delete-artifacts', ids: [1] })).results[0].deleted, true);
    failListing = true;
    await assert.rejects(listArtifacts(1), /GitHub denied access/);
    assert.ok(calls.every(url => !url.includes('/releases/')), 'Release assets must never be deleted');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_PAT;
    else process.env.GITHUB_PAT = originalToken;
  }
});

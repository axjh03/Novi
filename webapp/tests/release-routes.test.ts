import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as latestRoute from '../src/app/api/releases/latest/route';
import * as downloadRoute from '../src/app/api/download/route';

// The situation from 17 Oct 2026: v4.0.23 was published by the Mac and Linux jobs while the Windows job
// failed, so it has no Windows installer and no latest.yml. v4.0.22 is complete. A newer draft exists
// (drafts are visible to the portal's token) and must never be offered.
const asset = (name: string) => ({ name, url: `https://api.github.com/assets/${name}`, size: 100 });
const macLinux = (v: string) => [`latest-mac.yml`, `latest-linux.yml`, `latest-linux-arm64.yml`, `Novi-${v}-arm64.dmg`, `Novi-${v}-x64.dmg`, `novi_${v}_amd64.deb`, `novi_${v}_arm64.deb`, `novi_${v}_x86_64.AppImage`, `novi_${v}_arm64.AppImage`];
const releases = [
  { tag_name: 'v4.0.24', draft: true, prerelease: false, published_at: null, body: '', assets: [...macLinux('4.0.24'), 'latest.yml', 'Novi-Setup-4.0.24.exe'].map(asset) },
  { tag_name: 'v4.0.23', draft: false, prerelease: false, published_at: '2026-10-17T22:59:12Z', body: '', assets: macLinux('4.0.23').map(asset) },
  { tag_name: 'v4.0.22', draft: false, prerelease: false, published_at: '2026-10-17T19:20:00Z', body: '', assets: [...macLinux('4.0.22'), 'latest.yml', 'Novi-Setup-4.0.22.exe'].map(asset) },
];

/** Answers GitHub API calls from the list above; asset downloads redirect to a fake CDN address naming the asset. */
function fakeGitHub() {
  process.env.GITHUB_PAT = 'test-token';
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith('/releases/latest')) return Response.json(releases[1]);
    if (url.includes('/releases?per_page=20')) return Response.json(releases);
    if (url.startsWith('https://api.github.com/assets/')) return new Response(null, { status: 302, headers: { location: `https://cdn.test/${url.split('/').pop()}` } });
    return new Response('unexpected ' + url, { status: 500 });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; delete process.env.GITHUB_PAT; };
}

test('the update check only offers a release that has this system\'s update files', async () => {
  const restore = fakeGitHub();
  try {
    const version = async (query: string) => (await (await latestRoute.GET(new Request(`https://novi.test/api/releases/latest${query}`))).json()).data.version;
    assert.equal(await version('?platform=win32&arch=x64'), '4.0.22', 'Windows skips the release without a Windows build');
    assert.equal(await version('?platform=darwin&arch=arm64'), '4.0.23');
    assert.equal(await version('?platform=linux&arch=x64'), '4.0.23');
    assert.equal(await version('?platform=linux&arch=arm64'), '4.0.23');
    assert.equal(await version(''), '4.0.23', 'the download page still shows GitHub\'s latest release');
    assert.equal(await version('?platform=sunos&arch=x64'), '4.0.23', 'an unknown system falls back to the latest release');
  } finally { restore(); }
});

test('downloads come from the newest release that has the file, never from a draft', async () => {
  const restore = fakeGitHub();
  try {
    const target = async (query: string) => {
      const response = await downloadRoute.GET(new Request(`https://novi.test/api/download${query}`));
      return response.status === 307 ? response.headers.get('location') : `HTTP ${response.status}`;
    };
    assert.equal(await target('?asset=windows'), 'https://cdn.test/Novi-Setup-4.0.22.exe', 'the website Windows button works again');
    assert.equal(await target('?file=latest.yml'), 'https://cdn.test/latest.yml');
    assert.equal(await target('?file=Novi-Setup-4.0.22.exe'), 'https://cdn.test/Novi-Setup-4.0.22.exe');
    assert.equal(await target('?asset=mac-arm64'), 'https://cdn.test/Novi-4.0.23-arm64.dmg');
    assert.equal(await target('?asset=linux-deb'), 'https://cdn.test/novi_4.0.23_amd64.deb');
    assert.equal(await target('?file=Novi-Setup-4.0.24.exe'), 'HTTP 404', 'a draft\'s files are never served');
    assert.equal(await target('?asset=nothing'), 'HTTP 404');
  } finally { restore(); }
});

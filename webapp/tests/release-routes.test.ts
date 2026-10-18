import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as latestRoute from '../src/app/api/releases/latest/route';
import * as downloadRoute from '../src/app/api/download/route';
import { startReleaseBuild } from '../src/lib/release-manager';

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

/** Answers GitHub API calls from `list` (the releases above by default); asset downloads redirect to a fake CDN address naming the asset. */
function fakeGitHub(list = releases) {
  process.env.GITHUB_PAT = 'test-token';
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith('/releases/latest')) return Response.json(list.find(release => !release.draft));
    if (url.includes('/releases?per_page=20')) return Response.json(list);
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

// Electron 44 (Novi 4.0.26 and later) needs macOS 13. 4.0.26 is listed as published BEFORE 4.0.25 to
// show every choice follows version numbers, not publish order.
const all = (v: string) => [...macLinux(v), 'latest.yml', `Novi-Setup-${v}.exe`].map(asset);
const electron44 = [
  { tag_name: 'v4.0.25', draft: false, prerelease: false, published_at: '2026-10-20T12:00:00Z', body: 'Bridge', assets: all('4.0.25') },
  { tag_name: 'v4.0.26', draft: false, prerelease: false, published_at: '2026-10-20T11:00:00Z', body: 'Electron 44', assets: all('4.0.26') },
  { tag_name: 'v4.0.24', draft: false, prerelease: false, published_at: '2026-10-18T06:30:00Z', body: '', assets: all('4.0.24') },
];

test('Macs get Electron 44 releases only on macOS 13 or later, and older Novi versions get the bridge release first', async () => {
  const restore = fakeGitHub(electron44);
  try {
    const check = async (query: string) => (await (await latestRoute.GET(new Request(`https://novi.test/api/releases/latest${query}`))).json()).data;
    const old = await check('?platform=darwin&arch=arm64');
    assert.equal(old.version, '4.0.25', 'Novi 4.0.24 and older send no macOS version, so they get 4.0.25 first');
    assert.equal(old.notice, undefined, 'apps that send no macOS version cannot show a notice');
    const monterey = await check('?platform=darwin&arch=x64&os=12.7.6');
    assert.equal(monterey.version, '4.0.25');
    assert.equal(monterey.notice, 'Novi 4.0.26 and later need macOS 13 or later. This Mac runs macOS 12.7.6, so it stays on Novi 4.0.25.');
    assert.equal((await check('?platform=darwin&arch=arm64&os=13.6.1')).version, '4.0.26');
    assert.equal((await check('?platform=darwin&arch=arm64&os=15.1')).version, '4.0.26');
    assert.equal((await check('?platform=darwin&arch=arm64&os=15.1')).notice, undefined);
    const odd = await check('?platform=darwin&arch=arm64&os=%3Cscript%3E');
    assert.equal(odd.version, '4.0.25', 'an unreadable version is treated as an old Mac');
    assert.doesNotMatch(odd.notice, /</, 'only digits and dots of the sent version are repeated back');
    assert.equal((await check('?platform=win32&arch=x64')).version, '4.0.26', 'Windows gets the highest version, whatever order releases published in');
    assert.equal((await check('?platform=linux&arch=x64&os=12.0')).version, '4.0.26', 'Linux ignores os');
    assert.equal((await check('')).version, '4.0.25', 'the download page still names GitHub\'s "latest" release');
  } finally { restore(); }
});

test('the portal starts a release with its notes by workflow_dispatch, and refuses an existing tag', async () => {
  process.env.GITHUB_PAT = 'test-token';
  const original = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  let tagExists = false, dispatchStatus = 204;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/git/ref/tags/v4.0.25')) return new Response(tagExists ? '{}' : 'Not Found', { status: tagExists ? 200 : 404 });
    if (url.endsWith('/actions/workflows/build.yml/dispatches')) return new Response(dispatchStatus === 204 ? null : 'Resource not accessible by integration', { status: dispatchStatus });
    return new Response('unexpected ' + url, { status: 500 });
  }) as typeof fetch;
  try {
    const notes = "What's new\n• Run Get ready from session setup";
    const result = await startReleaseBuild('4.0.25', notes);
    assert.equal(result.tag, 'v4.0.25');
    const dispatch = calls.find(call => call.url.endsWith('/dispatches'))!;
    assert.deepEqual(dispatch.body, { ref: 'main', inputs: { tag_name: 'v4.0.25', release_notes: notes } }, 'the notes travel with the build');
    assert(!calls.some(call => call.method === 'POST' && call.url.includes('/git/refs')), 'no tag is created up front (that would start a build without notes)');

    dispatchStatus = 403;
    await assert.rejects(startReleaseBuild('4.0.25', ''), /did not start the release build \(status 403\)\. Resource not accessible/);
    tagExists = true; calls.length = 0;
    await assert.rejects(startReleaseBuild('4.0.25', notes), /v4\.0\.25 already exists\..*Re-run failed jobs/);
    assert(!calls.some(call => call.url.endsWith('/dispatches')), 'an existing tag is never rebuilt from today\'s main');
  } finally { globalThis.fetch = original; delete process.env.GITHUB_PAT; }
});

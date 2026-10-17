import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GET } from '../webapp/src/app/install.sh/route';

const unix = { skip: process.platform === 'win32' };

test('Unix installers parse and animation preserves command output and exit status without a terminal', unix, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-installer-check-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'install.sh');
  const served = await (await GET(new Request('https://novi.example/install.sh', { headers: { host: "novi.example'$(false)" } }))).text();
  for (const source of [served, ...['webapp/public/install.sh', 'webapp/public/install-linux.sh', 'scripts/install-mac.sh'].map(file => readFileSync(file, 'utf8'))]) {
    writeFileSync(file, source);
    assert.equal(spawnSync('bash', ['-n', file], { stdio: 'ignore', timeout: 5000 }).status, 0);
    const start = source.indexOf('pacman_run()');
    const end = source.indexOf('\n)\n', start) + 3;
    const helper = source.slice(start, end);
    const result = spawnSync('bash', ['-c', helper + '\npacman_run "Testing" bash -c \'echo diagnostic >&2; exit 17\''], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 17);
    assert.match(result.stderr, /diagnostic/);
    assert.doesNotMatch(result.stdout, /\x1b\[/);
  }
});

test('interactive animation restores the screen and cursor on failure', { skip: process.platform !== 'linux' }, () => {
  const source = readFileSync('webapp/public/install.sh', 'utf8');
  const start = source.indexOf('pacman_run()'), end = source.indexOf('\n)\n', start) + 3;
  const script = source.slice(start, end) + '\npacman_run "Testing" bash -c \'sleep 0.3; echo failed >&2; exit 17\'';
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  const result = spawnSync('script', ['-q', '-e', '-c', 'bash -c ' + quote(script), '/dev/null'], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, TERM: 'xterm', CI: '', NOVI_NO_ANIMATION: '' }, timeout: 5000,
  });
  assert.equal(result.status, 17, result.stderr);
  assert.match(result.stdout, /\x1b\[\?1049h/);
  assert.match(result.stdout, /NOVI  \/  INSTALLING/);
  assert.match(result.stdout, /\x1b\[\?25h\x1b\[\?1049l/);
  assert.match(result.stdout, /failed/);
});

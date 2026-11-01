import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GET } from '../webapp/src/app/install.sh/route';
import { generate } from '../scripts/sync-install-scripts.mjs';

const unix = { skip: process.platform === 'win32' };
const linux = { skip: process.platform !== 'linux' };
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

// The stage and everything it needs: the top of the script up to the end of the stage block.
const stage = (source: string) => source.slice(0, source.indexOf('# ---- novi stage end ----'));

// Runs a bash script in a pseudo-terminal of the given size with the animation enabled.
function inTerminal(script: string, cols: number, rows: number, env: Record<string, string> = {}) {
  return spawnSync('script', ['-q', '-e', '-c', 'bash -c ' + quote(`stty cols ${cols} rows ${rows}\n${script}`), '/dev/null'], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10000,
    env: { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8', CI: '', NOVI_NO_ANIMATION: '', NOVI_ASCII: '', ...env },
  });
}

test('every installer copy is generated from the two sources in webapp/public', () => {
  for (const [file, content] of Object.entries(generate())) assert.equal(readFileSync(file, 'utf8'), content, `${file} is stale: run node scripts/sync-install-scripts.mjs`);
});

test('Unix installers parse, and without a terminal the steps pass output and exit status through', unix, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-installer-check-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'install.sh');
  const served = await (await GET(new Request('https://novi.example/install.sh', { headers: { host: "novi.example'$(false)" } }))).text();
  assert.ok(served.includes("BASE_URL=${NOVI_BASE_URL:-'https://novi.example'\\''$(false)'}"), 'the served origin is a single-quoted literal');
  for (const source of [served, ...['webapp/public/install.sh', 'webapp/public/install-linux.sh', 'scripts/install-mac.sh'].map(name => readFileSync(name, 'utf8'))]) {
    writeFileSync(file, source);
    assert.equal(spawnSync('bash', ['-n', file], { stdio: 'ignore', timeout: 5000 }).status, 0);
    const script = stage(source) + '\nnovi_stage_start "Testing"\nnovi_step "Testing" bash -c \'echo diagnostic >&2; echo visible; exit 17\'';
    const result = spawnSync('bash', ['-c', script], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 17);
    assert.match(result.stderr, /diagnostic/);
    assert.match(result.stdout, /==> Testing\nvisible/);
    assert.doesNotMatch(result.stdout, /\x1b\[/, 'no escape codes without a terminal');
  }
});

test('the stage restores the screen when a step fails and prints what the step said', linux, () => {
  const source = readFileSync('webapp/public/install.sh', 'utf8');
  const script = stage(source) + '\ntrap \'novi_stage_stop $?\' EXIT\nnovi_stage_start "First" "Testing" "Later"\nnovi_step "First" true\nnovi_step "Testing" bash -c \'sleep 0.4; echo it broke >&2; exit 17\'\necho unreachable';
  const result = inTerminal(script, 100, 30);
  assert.equal(result.status, 17, result.stdout);
  assert.match(result.stdout, /\x1b\[\?1049h/);
  assert.match(result.stdout, /A quiet space to think\./);
  assert.match(result.stdout, /\x1b\[\?25h\x1b\[\?1049l/);
  assert.match(result.stdout, /Testing failed \(exit 17\)[\s\S]*it broke/);
  assert.doesNotMatch(result.stdout, /unreachable/);
});

test('Ctrl+C during a step restores the screen and names the interrupted step', linux, () => {
  const source = readFileSync('webapp/public/install.sh', 'utf8');
  const script = stage(source) + '\ntrap \'novi_stage_stop $?\' EXIT\ntrap \'exit 130\' INT\nnovi_stage_start "First" "Slow one"\nnovi_step "First" true\nnovi_step "Slow one" bash -c \'echo working; sleep 10\'\necho unreachable';
  const file = join(mkdtempSync(join(tmpdir(), 'novi-ctrlc-')), 'run.sh');
  writeFileSync(file, script);
  // Job control gives the run its own process group, so the interrupt reaches every process the way a real Ctrl+C does.
  const result = inTerminal(`set -m\nbash ${file} &\nsleep 1.2\nkill -INT -$!\nwait $!`, 90, 26);
  rmSync(join(file, '..'), { recursive: true, force: true });
  assert.equal(result.status, 130, result.stdout.slice(-500));
  assert.match(result.stdout, /\x1b\[\?25h\x1b\[\?1049l/);
  assert.match(result.stdout.slice(result.stdout.lastIndexOf('\x1b[?1049l') + 8), /Stopped during: Slow one[\s\S]*working/);
  assert.doesNotMatch(result.stdout, /unreachable/);
});

test('the stage ends with a receipt and leaves no escape sequences behind it', linux, () => {
  const source = readFileSync('webapp/public/install.sh', 'utf8');
  const script = stage(source) + '\nnovi_stage_start "Fetch" "Finish"\nnovi_step "Fetch" bash -c \'printf "%s %s %s\\n" 50 100 10 > "$NOVI_PROGRESS"; sleep 0.3; printf "%s %s %s\\n" 100 100 10 > "$NOVI_PROGRESS"; sleep 0.3\'\nnovi_step "Finish" true\nnovi_note "all set"\nnovi_stage_end\necho after';
  const result = inTerminal(script, 100, 30);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, / 50%/, 'the figures follow the progress file');
  assert.match(result.stdout, /Novi is ready\./, 'the finished card is held before leaving');
  const after = result.stdout.slice(result.stdout.lastIndexOf('\x1b[?1049l') + 8);
  assert.match(after, /✓.*Fetch.*100 B[\s\S]*✓.*Finish.*all set[\s\S]*after/);
  assert.doesNotMatch(after.replace(/\x1b\[[0-9;]*m/g, ''), /\x1b\[/, 'only colours remain after the stage');
});

test('the stage fits standard, medium, compact and ASCII terminals without clearing every frame', linux, () => {
  const source = readFileSync('webapp/public/install.sh', 'utf8');
  const script = stage(source) + '\nnovi_stage_start "Download Novi" "Open Novi"\nnovi_step "Download Novi" sleep 0.4\nnovi_step "Open Novi" true\nnovi_stage_end';
  for (const [cols, rows, env] of [[100, 30, {}], [80, 24, {}], [60, 16, {}], [28, 8, {}], [90, 26, { NOVI_ASCII: '1' }]] as const) {
    const result = inTerminal(script, cols, rows, env);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /\x1b\[\?25h\x1b\[\?1049l/);
    assert.equal((result.stdout.match(/\x1b\[2J/g) || []).length, 1, `${cols}x${rows}: clear once on entry, never each frame`);
    for (const match of result.stdout.matchAll(/\x1b\[(\d+);(\d+)H/g)) {
      assert(Number(match[1]) <= rows && Number(match[2]) <= cols, `drawing outside ${cols}x${rows} at ${match[0]}`);
    }
    const plain = result.stdout.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    if (rows >= 19 && cols >= 56) {
      assert.match(plain, /A quiet space to think\./, `${cols}x${rows} shows the full card`);
    } else if (rows >= 13 && cols >= 44) {
      assert.match(plain, /N O V I/, `${cols}x${rows} shows the medium card`);
      assert.doesNotMatch(plain, /A quiet space to think\./);
    } else {
      assert.match(plain, /NOVI . Download Novi/, `${cols}x${rows} shows the compact line`);
      assert.doesNotMatch(plain, /N O V I/);
    }
    if ('NOVI_ASCII' in env) {
      assert.doesNotMatch(result.stdout, /[^\x00-\x7f]/, 'ASCII mode draws nothing outside ASCII');
      assert.match(plain, /#/);
    } else {
      assert.match(result.stdout, /✓/);
    }
  }
});

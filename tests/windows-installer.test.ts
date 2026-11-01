import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '../webapp/src/app/install.ps1/route';

// Windows PowerShell on Windows; elsewhere PowerShell 7 when it is installed, or named by NOVI_PWSH.
const powershell = (() => {
  if (process.platform === 'win32') return 'powershell.exe';
  for (const candidate of [process.env.NOVI_PWSH, 'pwsh'].filter(Boolean) as string[]) {
    if (spawnSync(candidate, ['-NoLogo', '-NoProfile', '-Command', '1'], { stdio: 'ignore', timeout: 20000 }).status === 0) return candidate;
  }
  return '';
})();
const withPowerShell = { skip: powershell ? false : 'no PowerShell on this machine' };

// Mocks the network and the installer around the real script. The scenario decides which step fails.
const harness = String.raw`
$source = Get-Content -LiteralPath $args[0] -Raw
$script:scenario = $args[1]
$script:downloaded = $null
$script:launched = $false
$env:NOVI_BASE_URL = 'https://novi.example'
$env:NOVI_NO_ANIMATION = $args[2]
$env:LOCALAPPDATA = Join-Path $env:TEMP 'local-app-data'
$env:ProgramFiles = Join-Path $env:TEMP 'program-files'
function Get-CimInstance { [pscustomobject]@{ Caption = 'Microsoft Windows test' } }
function Invoke-WebRequest {
    param($Uri, $OutFile, [switch]$UseBasicParsing)
    if ($Uri -ne 'https://novi.example/api/download?asset=windows') { throw 'Wrong download URL' }
    $script:downloaded = $OutFile
    [IO.File]::WriteAllText($OutFile, 'test installer')
    if ($script:scenario -eq 'download-failure') { throw 'Download failed' }
    if (-not $env:NOVI_NO_ANIMATION) { Start-Sleep -Milliseconds 400 }
}
function Start-Process {
    param($FilePath, $ArgumentList, [switch]$PassThru, [switch]$Wait, $WorkingDirectory)
    if ($PassThru) {
        if ($ArgumentList -ne '/S' -or -not $Wait) { throw 'Wrong installer arguments' }
        if ($script:scenario -eq 'install-failure') { return [pscustomobject]@{ ExitCode = 123 } }
        $exe = Join-Path $env:LOCALAPPDATA 'Programs\novi\Novi.exe'
        [IO.Directory]::CreateDirectory((Split-Path $exe)) | Out-Null
        [IO.File]::WriteAllText($exe, 'installed')
        return [pscustomobject]@{ ExitCode = 0 }
    }
    if (-not (Test-Path -LiteralPath $FilePath)) { throw 'Wrong launch path' }
    $script:launched = $true
}
$ErrorActionPreference = 'Continue'
$failure = $null
try { $source | Invoke-Expression } catch { $failure = $_.Exception.Message }
if ($ErrorActionPreference -ne 'Continue') { throw 'Changed caller preferences' }
if (-not $script:downloaded) { throw 'Script failed before download (possibly parser error)' }
if (Test-Path -LiteralPath $script:downloaded) { throw 'Installer was not cleaned up' }
if ($script:scenario -eq 'success') {
    if ($failure -or -not $script:launched) { throw "Success path failed: $failure" }
} elseif (-not $failure -or $script:launched) { throw 'Failure was not propagated' }
if ($script:scenario -eq 'download-failure' -and $failure -notlike '*Failed to download installer from https://novi.example/api/download?asset=windows:*') { throw $failure }
if ($script:scenario -eq 'install-failure' -and $failure -notlike '*code 123*') { throw $failure }
`;

test('Windows installer endpoint emits uncached PowerShell with a literal origin', async () => {
  const response = await GET(new Request('https://novi.example/install.ps1', { headers: { host: "novi.example'$(boom)" } }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /text\/plain/);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const script = await response.text();
  assert.match(script, /Invoke-NoviStep \$downloadLabel \{/);
  assert.match(script, /Invoke-NoviStep \$stepLabel \{/);
  assert.match(script, /Stop-NoviStage -Finished/);
  assert.ok(script.includes("'https://novi.example''$(boom)'"));
  assert.ok(!script.includes('$downloadUrl:'));
  assert.doesNotMatch(script, /[^\x00-\x7f]/, 'the PowerShell source stays ASCII so no console encoding can mangle it');
});

test('static Windows installer matches the served script', async () => {
  const script = await (await GET(new Request('https://novi-virid.vercel.app/install.ps1'))).text();
  assert.equal(readFileSync('webapp/public/install.ps1', 'utf8'), script);
});

test('PowerShell parses and executes the piped installer, including failure cleanup', withPowerShell, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-install-check-'));
  try {
    const installer = join(directory, 'install.ps1');
    const check = join(directory, 'check.ps1');
    writeFileSync(installer, await (await GET(new Request('https://novi.example/install.ps1', { headers: { host: 'novi.example' } }))).text());
    writeFileSync(check, harness);
    for (const scenario of ['success', 'download-failure', 'install-failure']) {
      execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', check, installer, scenario, '1'], {
        env: { ...process.env, TEMP: directory, TMP: directory }, timeout: 60000, stdio: 'pipe',
      });
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the PowerShell stage draws the card in a terminal and restores it on success and failure', { skip: process.platform !== 'linux' || !powershell ? 'needs Linux and PowerShell' : false }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-install-stage-'));
  try {
    const installer = join(directory, 'install.ps1');
    const check = join(directory, 'check.ps1');
    writeFileSync(installer, readFileSync('webapp/public/install.ps1', 'utf8'));
    writeFileSync(check, harness);
    for (const scenario of ['success', 'install-failure']) {
      const command = `stty cols 100 rows 30; ${powershell} -NoProfile -NonInteractive -File '${check}' '${installer}' ${scenario} ''`;
      const result = spawnSync('script', ['-q', '-e', '-c', command, '/dev/null'], {
        stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 90000,
        env: { ...process.env, TEMP: directory, TMP: directory, TERM: 'xterm-256color', CI: '', NOVI_NO_ANIMATION: '' },
      });
      assert.equal(result.status, 0, `${scenario}: ${result.stdout.slice(-2000)}`);
      assert.match(result.stdout, /\x1b\[\?1049h/, scenario);
      assert.match(result.stdout, /A quiet space to think\./, scenario);
      assert.match(result.stdout, /\x1b\[\?25h\x1b\[\?1049l/, scenario);
      const after = result.stdout.slice(result.stdout.lastIndexOf('\x1b[?1049l') + 8);
      if (scenario === 'success') assert.match(after, /✓[\s\S]*Download Novi[\s\S]*✓[\s\S]*Open Novi/);
      else assert.match(after, /Run the installer failed/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

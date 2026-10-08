import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '../webapp/src/app/install.ps1/route';

test('Windows installer endpoint emits uncached PowerShell with a literal origin', async () => {
  const response = await GET(new Request('https://novi.example/install.ps1', { headers: { host: "novi.example'$(boom)" } }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /text\/plain/);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const script = await response.text();
  assert.ok(script.includes("'https://novi.example''$(boom)'"));
  assert.ok(!script.includes('$downloadUrl:'));
});

test('Windows PowerShell parses and executes piped installer, including failure cleanup', { skip: process.platform !== 'win32' }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-install-check-'));
  try {
    const installer = join(directory, 'install.ps1');
    const harness = join(directory, 'check.ps1');
    writeFileSync(installer, await (await GET(new Request('https://novi.example/install.ps1', { headers: { host: 'novi.example' } }))).text());
    writeFileSync(harness, `
$source = Get-Content -LiteralPath $args[0] -Raw
$script:scenario = $args[1]
$script:downloaded = $null
$script:launched = $false
$env:NOVI_BASE_URL = 'https://novi.example'
$env:LOCALAPPDATA = Join-Path $env:TEMP 'local-app-data'
$env:ProgramFiles = Join-Path $env:TEMP 'program-files'
function Get-CimInstance { [pscustomobject]@{ Caption = 'Windows test' } }
function Invoke-WebRequest {
    param($Uri, $OutFile, [switch]$UseBasicParsing)
    if ($Uri -ne 'https://novi.example/api/download?asset=windows') { throw 'Wrong download URL' }
    $script:downloaded = $OutFile
    [IO.File]::WriteAllText($OutFile, 'test installer')
    if ($script:scenario -eq 'download-failure') { throw 'Download failed' }
}
function Start-Process {
    param($FilePath, $ArgumentList, [switch]$PassThru, [switch]$Wait)
    if ($PassThru) {
        if ($ArgumentList -ne '/S' -or -not $Wait) { throw 'Wrong installer arguments' }
        if ($script:scenario -eq 'install-failure') { return [pscustomobject]@{ ExitCode = 123 } }
        $exe = Join-Path $env:LOCALAPPDATA 'Programs\\novi\\Novi.exe'
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
`);
    for (const scenario of ['success', 'download-failure', 'install-failure']) {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', harness, installer, scenario], {
        env: { ...process.env, TEMP: directory, TMP: directory }, timeout: 30000, stdio: 'pipe',
      });
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

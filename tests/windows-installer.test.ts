import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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

// Mocks the network, the installer and the running app around the real script. The scenario decides
// what happens: success, download-failure, install-failure, running (an open Novi is asked to stop
// before installing), allusers (an existing install in Program Files keeps that scope) and stall (the
// download never finishes, for Ctrl+C). Every call is logged in order in $script:events.
const harness = String.raw`
$source = Get-Content -LiteralPath $args[0] -Raw
$script:scenario = $args[1]
$script:downloaded = $null
$script:launched = $false
$script:open = $false
$script:events = @()
$env:NOVI_BASE_URL = 'https://novi.example'
$env:NOVI_NO_ANIMATION = $args[2]
$env:LOCALAPPDATA = Join-Path $env:TEMP 'local-app-data'
$env:ProgramFiles = Join-Path $env:TEMP 'program-files'
$env:ProgramW6432 = $env:ProgramFiles
Remove-Item -LiteralPath $env:LOCALAPPDATA, $env:ProgramFiles -Recurse -Force -ErrorAction SilentlyContinue
$userExe = Join-Path $env:LOCALAPPDATA 'Programs\novi\Novi.exe'
$allUsersExe = Join-Path $env:ProgramFiles 'Novi\Novi.exe'
function Install-Exe($exe) { [IO.Directory]::CreateDirectory((Split-Path $exe)) | Out-Null; [IO.File]::WriteAllText($exe, 'installed') }
if ($script:scenario -eq 'running') { Install-Exe $userExe; $script:open = $true }
if ($script:scenario -eq 'allusers') { Install-Exe $allUsersExe }
function Get-CimInstance { [pscustomobject]@{ Caption = 'Microsoft Windows test' } }
function Invoke-WebRequest {
    param($Uri, $OutFile, [switch]$UseBasicParsing)
    if ($Uri -ne 'https://novi.example/api/download?asset=windows') { throw 'Wrong download URL' }
    $script:downloaded = $OutFile
    [IO.File]::WriteAllText($OutFile, 'test installer')
    if ($script:scenario -eq 'download-failure') { throw 'Download failed' }
    if ($script:scenario -eq 'stall') { Start-Sleep -Seconds 60 }
    if (-not $env:NOVI_NO_ANIMATION) { Start-Sleep -Milliseconds 400 }
}
function Start-Process {
    param($FilePath, $ArgumentList, [switch]$PassThru, [switch]$Wait, $WorkingDirectory)
    if ($PassThru) {
        $scope = if ($script:scenario -eq 'allusers') { '/allusers' } else { '/currentuser' }
        if ((@($ArgumentList) -join ' ') -ne "/S $scope" -or -not $Wait) { throw "Wrong installer arguments: $ArgumentList" }
        $script:events += 'install'
        if ($script:scenario -eq 'install-failure') { return [pscustomobject]@{ ExitCode = 123 } }
        Install-Exe $(if ($script:scenario -eq 'allusers') { $allUsersExe } else { $userExe })
        return [pscustomobject]@{ ExitCode = 0 }
    }
    if (-not (Test-Path -LiteralPath $FilePath)) { throw 'Wrong launch path' }
    if ((@($ArgumentList) -join ' ') -eq 'stop') { $script:events += "stop $FilePath"; $script:open = $false; return }
    $script:events += "open $FilePath"
    $script:launched = $true
}
function Get-Process { [CmdletBinding()] param($Name) if ($Name -eq 'Novi' -and $script:open) { [pscustomobject]@{ Name = 'Novi' } } }
function Wait-Process { [CmdletBinding()] param($Name, $Timeout) $script:events += "wait $Name $Timeout" }
$ErrorActionPreference = 'Continue'
$failure = $null
try { $source | Invoke-Expression } catch { $failure = $_.Exception.Message }
if ($ErrorActionPreference -ne 'Continue') { throw 'Changed caller preferences' }
if (-not $script:downloaded) { throw 'Script failed before download (possibly parser error)' }
if (Test-Path -LiteralPath $script:downloaded) { throw 'Installer was not cleaned up' }
$log = $script:events -join ' | '
if ($script:scenario -in 'success', 'running', 'allusers') {
    if ($failure -or -not $script:launched) { throw "Success path failed: $failure" }
} elseif (-not $failure -or $script:launched) { throw 'Failure was not propagated' }
if ($script:scenario -eq 'success' -and $log -ne "install | open $userExe") { throw "Unexpected steps: $log" }
if ($script:scenario -eq 'running' -and $log -ne "stop $userExe | wait Novi 15 | install | open $userExe") { throw "Unexpected steps: $log" }
if ($script:scenario -eq 'allusers' -and $log -ne "install | open $allUsersExe") { throw "Unexpected steps: $log" }
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
    for (const scenario of ['success', 'download-failure', 'install-failure', 'running', 'allusers']) {
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

// Ctrl+C runs PowerShell's finally blocks but not its catch blocks. The installer runs inside the
// user's own PowerShell (irm | iex), so a stage left running would keep drawing over that window.
test('Ctrl+C during the download restores the PowerShell window and removes the partial installer', { skip: process.platform !== 'linux' || !powershell ? 'needs Linux and PowerShell' : false }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'novi-install-ctrlc-'));
  try {
    const installer = join(directory, 'install.ps1');
    const check = join(directory, 'check.ps1');
    const pid = join(directory, 'pid');
    writeFileSync(installer, readFileSync('webapp/public/install.ps1', 'utf8'));
    writeFileSync(check, harness);
    // PowerShell runs in the foreground of the terminal, as for a user; a helper sends it the SIGINT
    // that Ctrl+C would, once the card is up.
    const command = `stty cols 100 rows 30; (sleep 4; kill -INT $(cat '${pid}')) & sh -c 'echo $$ > "${pid}"; exec ${powershell} -NoProfile -NonInteractive -File "${check}" "${installer}" stall ""'; echo "finished $?"; sleep 1`;
    const result = spawnSync('script', ['-q', '-e', '-c', command, '/dev/null'], {
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 90000,
      env: { ...process.env, TEMP: directory, TMP: directory, TERM: 'xterm-256color', CI: '', NOVI_NO_ANIMATION: '' },
    });
    assert.match(result.stdout, /A quiet space to think\./, 'the card was drawn before the interrupt');
    const finished = result.stdout.lastIndexOf('finished');
    assert(finished > 0, result.stdout.slice(-2000));
    assert.match(result.stdout.slice(0, finished), /\x1b\[\?25h\x1b\[\?1049l/, 'the screen was restored');
    assert.doesNotMatch(result.stdout.slice(finished), /\x1b\[[0-9;]*H|Preparing|Download Novi/, 'nothing is drawn after PowerShell stops');
    assert.deepEqual(readdirSync(directory).filter(name => name.startsWith('Novi-Setup-')), [], 'the partial installer is removed');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

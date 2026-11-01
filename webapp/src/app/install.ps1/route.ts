export const dynamic = 'force-dynamic';

// The same script as webapp/public/install.ps1; only the default base URL is the host this request came in on.
export async function GET(req: Request) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'novi-virid.vercel.app';
  const proto = req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;

  const script = `# ==============================================================================
# Novi Windows Automated Provisioner (PowerShell)
# ==============================================================================

& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$animation = $null
# Bytes of a download, as people read them.
function Format-NoviBytes([long]$bytes) {
    if ($bytes -ge 1048576) { return ('{0:0.0} MB' -f ($bytes / 1048576)) }
    if ($bytes -ge 1024) { return ('{0} KB' -f [int][Math]::Floor($bytes / 1024)) }
    return "$bytes B"
}
# The size of the installer before it is fetched, so the bar can show a percentage. 0 when unknown.
function Get-NoviContentLength([string]$url) {
    try {
        $request = [Net.WebRequest]::Create($url)
        $request.Method = 'HEAD'; $request.AllowAutoRedirect = $true; $request.Timeout = 4000
        $response = $request.GetResponse()
        try { return [long]$response.ContentLength } finally { $response.Close() }
    } catch { return 0 }
}
# The version this site is serving, from its release endpoint; empty when it cannot be reached.
function Get-NoviLatestVersion([string]$baseUrl) {
    try {
        $request = [Net.WebRequest]::Create("$baseUrl/api/releases/latest")
        $request.Timeout = 6000
        $response = $request.GetResponse()
        try {
            $reader = New-Object IO.StreamReader($response.GetResponseStream())
            $json = $reader.ReadToEnd(); $reader.Close()
        } finally { $response.Close() }
        if ($json -match '"version"\\s*:\\s*"([^"]+)"') { return $Matches[1] }
    } catch { }
    return ''
}
# While a step runs, Pac-Man eats his way along the lane. Given the file being downloaded and its
# total size, he follows the download and the bar shows the percentage, the speed and the size.
# NOVI_DETAILS holds the lines of the installation sheet, separated by |, shown when there is room.
function Start-NoviAnimation([string]$label, [string]$progressFile = '', [long]$total = 0) {
    if ([Console]::IsOutputRedirected -or -not $Host.UI.SupportsVirtualTerminal -or $env:CI -or $env:NOVI_NO_ANIMATION) { return }
    $esc = [char]27
    $runner = [PowerShell]::Create()
    [void]$runner.AddScript({
        param($label, $progressFile, $total, $details)
        $esc = [char]27; $frame = 0; $lastSize = ''
        $clock = [Diagnostics.Stopwatch]::StartNew()
        $sample = [Diagnostics.Stopwatch]::StartNew(); $sampled = 0L; $speed = 0L; $done = 0L
        function Format-NoviBytes([long]$bytes) {
            if ($bytes -ge 1048576) { return ('{0:0.0} MB' -f ($bytes / 1048576)) }
            if ($bytes -ge 1024) { return ('{0} KB' -f [int][Math]::Floor($bytes / 1024)) }
            return "$bytes B"
        }
        while ($true) {
            $cols = [Console]::WindowWidth; $rows = [Console]::WindowHeight
            $width = [Math]::Min(64, $cols - 6)
            $elapsed = [int][Math]::Floor($clock.Elapsed.TotalSeconds)
            $spinner = @('|', '/', '-', '\\')[[int][Math]::Floor($frame / 2) % 4]
            $pct = -1
            if ($progressFile -and (Test-Path -LiteralPath $progressFile)) {
                try { $done = (Get-Item -LiteralPath $progressFile).Length } catch { $done = 0L }
                if ($sample.Elapsed.TotalSeconds -ge 1) { $speed = [long](($done - $sampled) / $sample.Elapsed.TotalSeconds); $sampled = $done; $sample.Restart() }
                if ($total -gt 0) { $pct = [Math]::Min(100, [int][Math]::Floor($done * 100 / $total)) }
            }
            $output = ''
            if ($lastSize -ne "$cols\`:$rows") { $output = "$esc[2J"; $lastSize = "$cols\`:$rows" }
            if ($width -ge 38 -and $rows -ge 14) {
                $height = 14; $lane = 4; $sheet = $false
                if ($width -ge 54 -and $rows -ge 24) { $height = 20; $lane = 10 }
                if ($width -ge 54 -and $rows -ge 30 -and $details) { $height = 26; $sheet = $true }
                $left = [int][Math]::Floor(($cols - $width) / 2) + 1
                $top = [int][Math]::Floor(($rows - $height) / 2) + 1
                $output += "$esc[$top;\${left}H$esc[2K$esc[0;1;36mNOVI  /  INSTALLING"
                if ($height -eq 20) {
                    $output += "$esc[$($top + 2);\${left}H$esc[2K  NN   N   OOO   V     V  III" +
                        "$esc[$($top + 3);\${left}H$esc[2K  N N  N  O   O   V   V    I " +
                        "$esc[$($top + 4);\${left}H$esc[2K  N  N N  O   O    V V     I " +
                        "$esc[$($top + 5);\${left}H$esc[2K  N   NN   OOO      V     III" +
                        "$esc[$($top + 7);\${left}H$esc[2K$esc[0;2mA quiet space to think. Almost yours."
                }
                $phases = if ($label -like '*Downloading*') { "$esc[1;36m01 DOWNLOAD$esc[0;2m / 02 INSTALL / 03 LAUNCH" }
                    else { "$esc[32m01 DOWNLOAD$esc[0m / $esc[1;36m02 INSTALL$esc[0;2m / 03 LAUNCH" }
                $inside = $width - 2
                $pos = if ($pct -ge 0) { [int][Math]::Floor(($inside - 6) * $pct / 100) } else { [int][Math]::Floor($frame / 2) % ($inside - 5) }
                $remaining = $inside - $pos - 6
                $prefix = ' ' * $pos; $suffix = ' ' * $remaining
                $pellets = ('.  ' * [int][Math]::Ceiling($remaining / 3)).Substring(0, $remaining)
                $mouth = if ($frame % 4 -lt 2) { '(   < ' } else { '(    )' }
                $border = '-' * $inside
                $shownLabel = $label.Substring(0, [Math]::Min($label.Length, $width - 18)).PadRight($width - 18)
                $elapsedLabel = '{0:00}:{1:00} elapsed' -f [int][Math]::Floor($elapsed / 60), ($elapsed % 60)
                $stats = ''; $barLine = "$esc[$($top + $lane + 5);\${left}H$esc[2K"
                if ($pct -ge 0) {
                    $filled = [int][Math]::Floor($inside * $pct / 100)
                    $barLine += "$esc[0;36m[" + ('#' * $filled) + "$esc[0;2m" + ('.' * ($inside - $filled)) + "$esc[0;36m]"
                    $stats = ('{0,3}%   {1}/s   {2} of {3}' -f $pct, (Format-NoviBytes $speed), (Format-NoviBytes $done), (Format-NoviBytes $total))
                    $stats = $stats.Substring(0, [Math]::Min($stats.Length, $width))
                }
                $output += "$esc[$($top + $lane - 2);\${left}H$esc[2K$phases$esc[0m" +
                    "$esc[$($top + $lane);\${left}H$esc[2K$esc[0;2;36m+$border+" +
                    "$esc[$($top + $lane + 1);\${left}H$esc[2K$esc[0;2;36m|$esc[0;1;33m$prefix .--. $suffix$esc[0;2;36m|" +
                    "$esc[$($top + $lane + 2);\${left}H$esc[2K$esc[0;2;36m|$esc[0;1;33m$prefix$mouth$esc[0;2;36m$pellets|" +
                    "$esc[$($top + $lane + 3);\${left}H$esc[2K$esc[0;2;36m|$esc[0;1;33m$prefix '--' $suffix$esc[0;2;36m|" +
                    "$esc[$($top + $lane + 4);\${left}H$esc[2K$esc[0;2;36m+$border+" + $barLine +
                    "$esc[$($top + $lane + 6);\${left}H$esc[2K$esc[0;36m$spinner$esc[0m  $shownLabel  $esc[2m$elapsedLabel" +
                    "$esc[$($top + $lane + 7);\${left}H$esc[2K$esc[0;1m$stats$esc[0m" +
                    "$esc[$($top + $lane + 8);\${left}H$esc[2K$esc[0;2mWorking on your setup.  Ctrl+C to cancel$esc[0m"
                if ($sheet) {
                    $row = $top + $lane + 10
                    foreach ($line in $details.Split('|')) {
                        if ($row -gt $top + $height - 1) { break }
                        $shown = $line.Substring(0, [Math]::Min($line.Length, $width))
                        $output += "$esc[$row;\${left}H$esc[2K$esc[0;2m$shown$esc[0m"
                        $row++
                    }
                }
            } else {
                $compact = if ($pct -ge 0) { "NOVI $spinner $label $pct% ($(Format-NoviBytes $speed)/s)" } else { "NOVI $spinner $label ($($elapsed)s)" }
                $compact = $compact.Substring(0, [Math]::Min($compact.Length, [Math]::Max(1, $cols - 1)))
                $output += "$esc[H$esc[2K$esc[1;36m$compact$esc[0m"
            }
            [Console]::Write($output)
            $frame++; Start-Sleep -Milliseconds 80
        }
    }).AddArgument($label).AddArgument($progressFile).AddArgument($total).AddArgument([string]$env:NOVI_DETAILS)
    try {
        [Console]::Write("$esc[?1049h$esc[?25l$esc[2J")
        $handle = $runner.BeginInvoke()
        Set-Variable -Name animation -Value $runner -Scope 1
    } catch {
        $runner.Dispose()
        [Console]::Write("$esc[0m$esc[?25h$esc[?1049l")
    }
}
function Stop-NoviAnimation {
    if ($animation) {
        try { $animation.Stop() } finally {
            $animation.Dispose()
            Set-Variable -Name animation -Value $null -Scope 1
            $esc = [char]27
            [Console]::Write("$esc[0m$esc[?25h$esc[?1049l")
        }
    }
}

Write-Host "==> Initializing Novi Windows Provisioner" -ForegroundColor Cyan
$osCaption = Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption
Write-Host "  -> Operating System: Microsoft Windows [$osCaption]" -ForegroundColor Gray

$baseUrl = if ($env:NOVI_BASE_URL) { $env:NOVI_BASE_URL } else { '${baseUrl.replace(/'/g, "''")}' }
$downloadUrl = "$baseUrl/api/download?asset=windows"
$tempPath = Join-Path $env:TEMP ("Novi-Setup-" + [Guid]::NewGuid().ToString('N') + ".exe")

# What this run does: install, update, or nothing when the installed copy is already the latest.
$installedExe = Join-Path $env:LOCALAPPDATA "Programs\\novi\\Novi.exe"
$installedVersion = ''
if (Test-Path -LiteralPath $installedExe) { try { $installedVersion = (Get-Item -LiteralPath $installedExe).VersionInfo.ProductVersion -replace '\\+.*$', '' } catch { $installedVersion = '' } }
$latestVersion = Get-NoviLatestVersion $baseUrl
$mode = 'install'
if ($installedVersion) {
    if ($latestVersion -and $installedVersion -eq $latestVersion -and -not $env:NOVI_FORCE) {
        Write-Host "==> Novi $installedVersion is already installed and is the latest version." -ForegroundColor Green
        Write-Host "  -> Nothing to do. Run again with \`$env:NOVI_FORCE = '1' to reinstall it." -ForegroundColor Gray
        return
    }
    $mode = 'update'
    Write-Host "==> Updating Novi $installedVersion to $(if ($latestVersion) { $latestVersion } else { 'the latest release' })..." -ForegroundColor Cyan
} else {
    Write-Host "==> Installing Novi $latestVersion..." -ForegroundColor Cyan
}
$action = if ($mode -eq 'update') { "Update    Novi $installedVersion to $(if ($latestVersion) { $latestVersion } else { 'the latest release' })" } else { "Install   Novi $latestVersion" }
$stepLabel = if ($mode -eq 'update') { 'Updating Novi' } else { 'Installing Novi' }
$env:NOVI_DETAILS = "$action|Package   Novi Setup for Windows x64 (.exe)|From      $baseUrl|Into      $env:LOCALAPPDATA\\Programs\\novi|System    $osCaption|Then      the installer runs silently and Novi opens"

Write-Host "==> Downloading application payload..." -ForegroundColor Cyan
Write-Host "  -> Endpoint: $downloadUrl" -ForegroundColor Gray
$total = Get-NoviContentLength $downloadUrl
if ($total -gt 0) { Write-Host "  -> Size: $(Format-NoviBytes $total)" -ForegroundColor Gray }

try {
    Start-NoviAnimation "Downloading Novi $latestVersion" $tempPath $total
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath -UseBasicParsing
} catch {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    throw "Failed to download installer from $($downloadUrl): $_"
} finally {
    Stop-NoviAnimation
}

if (-not (Test-Path $tempPath)) {
    throw "Downloaded installer payload not found at $tempPath"
}
Write-Host "  -> Received $(Format-NoviBytes (Get-Item -LiteralPath $tempPath).Length)" -ForegroundColor Gray

Write-Host "==> Executing silent installer ($stepLabel)..." -ForegroundColor Cyan
Write-Host "  -> Target binary: $tempPath /S" -ForegroundColor Gray

try {
    if ($mode -eq 'update') { Start-NoviAnimation 'Updating Novi' } else { Start-NoviAnimation 'Installing Novi' }
    $proc = Start-Process -FilePath $tempPath -ArgumentList "/S" -PassThru -Wait
    if ($proc.ExitCode -ne 0) {
        throw "Installer exited with code $($proc.ExitCode)."
    }
} catch {
    throw "Silent installation execution failed: $_"
} finally {
    Stop-NoviAnimation
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
}

Write-Host "==> $(if ($mode -eq 'update') { 'Update' } else { 'Installation' }) completed successfully." -ForegroundColor Green
Write-Host ''
Write-Host "  Novi is $(if ($mode -eq 'update') { "updated to $latestVersion" } else { 'installed' }) and opening now." -ForegroundColor White
Write-Host ''
Write-Host ('  {0,-12}{1}' -f 'Installed', "$env:LOCALAPPDATA\\Programs\\novi (Start menu: Novi)")
Write-Host ('  {0,-12}{1}' -f 'Sign in', 'Individuals: the username and password from your Novi account.')
Write-Host ('  {0,-12}{1}' -f '', 'Teams: the desktop login your organisation created for you.')
Write-Host ('  {0,-12}{1}' -f 'AI key', "Add a provider key once in your account: $baseUrl/api-keys")
Write-Host ('  {0,-12}{1}' -f 'Guide', "$baseUrl/how-it-works")
Write-Host ('  {0,-12}{1}' -f 'Plans', "$baseUrl/get-access")
Write-Host ('  {0,-12}{1}' -f 'Help', 'getnoviapp@outlook.com  -  Instagram @getnoviapp')
Write-Host ('  {0,-12}{1}' -f 'Remove', 'Settings, Apps, Novi, Uninstall')
Write-Host ''

$installLocations = @(
    (Join-Path $env:LOCALAPPDATA "Programs\\novi\\Novi.exe")
    (Join-Path $env:ProgramFiles "Novi\\Novi.exe")
    (Join-Path $env:LOCALAPPDATA "Novi\\Novi.exe")
)

$targetExe = $null
foreach ($loc in $installLocations) {
    if (Test-Path -LiteralPath $loc) {
        $targetExe = $loc
        break
    }
}

if ($targetExe) {
    Write-Host "==> Launching Novi ($targetExe)..." -ForegroundColor Cyan
    Start-Process -FilePath $targetExe -WorkingDirectory (Split-Path -LiteralPath $targetExe)
} else {
    Write-Host "==> Launching Novi via shortcut..." -ForegroundColor Cyan
    $desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Novi.lnk"
    if (Test-Path $desktopShortcut) {
        Invoke-Item $desktopShortcut
    }
}
}
`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

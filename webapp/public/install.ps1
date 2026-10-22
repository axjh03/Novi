# ==============================================================================
# Novi Windows Automated Provisioner (PowerShell)
# ==============================================================================

& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$animation = $null
function Start-NoviAnimation([string]$label) {
    if ([Console]::IsOutputRedirected -or -not $Host.UI.SupportsVirtualTerminal -or $env:CI -or $env:NOVI_NO_ANIMATION) { return }
    $esc = [char]27
    $runner = [PowerShell]::Create()
    [void]$runner.AddScript({
        param($label)
        $esc = [char]27; $frame = 0; $lastSize = ''
        $clock = [Diagnostics.Stopwatch]::StartNew()
        while ($true) {
            $cols = [Console]::WindowWidth; $rows = [Console]::WindowHeight
            $width = [Math]::Min(64, $cols - 6)
            $elapsed = [int][Math]::Floor($clock.Elapsed.TotalSeconds)
            $spinner = @('|', '/', '-', '\')[[int][Math]::Floor($frame / 2) % 4]
            $output = ''
            if ($lastSize -ne "$cols`:$rows") { $output = "$esc[2J"; $lastSize = "$cols`:$rows" }
            if ($width -ge 38 -and $rows -ge 14) {
                $height = 14; $lane = 4
                if ($width -ge 54 -and $rows -ge 24) { $height = 20; $lane = 10 }
                $left = [int][Math]::Floor(($cols - $width) / 2) + 1
                $top = [int][Math]::Floor(($rows - $height) / 2) + 1
                $output += "$esc[$top;${left}H$esc[2K$esc[0;1;36mNOVI  /  INSTALLING"
                if ($height -eq 20) {
                    $output += "$esc[$($top + 2);${left}H$esc[2K  NN   N   OOO   V     V  III" +
                        "$esc[$($top + 3);${left}H$esc[2K  N N  N  O   O   V   V    I " +
                        "$esc[$($top + 4);${left}H$esc[2K  N  N N  O   O    V V     I " +
                        "$esc[$($top + 5);${left}H$esc[2K  N   NN   OOO      V     III" +
                        "$esc[$($top + 7);${left}H$esc[2K$esc[0;2mA quiet space to think. Almost yours."
                }
                $phases = if ($label -like '*Downloading*') { "$esc[1;36m01 DOWNLOAD$esc[0;2m / 02 INSTALL / 03 LAUNCH" }
                    else { "$esc[32m01 DOWNLOAD$esc[0m / $esc[1;36m02 INSTALL$esc[0;2m / 03 LAUNCH" }
                $inside = $width - 2
                $pos = [int][Math]::Floor($frame / 2) % ($inside - 5)
                $remaining = $inside - $pos - 6
                $prefix = ' ' * $pos; $suffix = ' ' * $remaining
                $pellets = ('.  ' * [int][Math]::Ceiling($remaining / 3)).Substring(0, $remaining)
                $mouth = if ($frame % 4 -lt 2) { '(   < ' } else { '(    )' }
                $border = '-' * $inside
                $shownLabel = $label.Substring(0, [Math]::Min($label.Length, $width - 18)).PadRight($width - 18)
                $elapsedLabel = '{0:00}:{1:00} elapsed' -f [int][Math]::Floor($elapsed / 60), ($elapsed % 60)
                $output += "$esc[$($top + $lane - 2);${left}H$esc[2K$phases$esc[0m" +
                    "$esc[$($top + $lane);${left}H$esc[2K$esc[0;2;36m+$border+" +
                    "$esc[$($top + $lane + 1);${left}H$esc[2K$esc[0;2;36m|$esc[0;1;33m$prefix .--. $suffix$esc[0;2;36m|" +
                    "$esc[$($top + $lane + 2);${left}H$esc[2K$esc[0;2;36m|$esc[0;1;33m$prefix$mouth$esc[0;2;36m$pellets|" +
                    "$esc[$($top + $lane + 3);${left}H$esc[2K$esc[0;2;36m|$esc[0;1;33m$prefix '--' $suffix$esc[0;2;36m|" +
                    "$esc[$($top + $lane + 4);${left}H$esc[2K$esc[0;2;36m+$border+" +
                    "$esc[$($top + $lane + 6);${left}H$esc[2K$esc[0;36m$spinner$esc[0m  $shownLabel  $esc[2m$elapsedLabel" +
                    "$esc[$($top + $lane + 8);${left}H$esc[2K$esc[0;2mWorking on your setup.  Ctrl+C to cancel$esc[0m"
            } else {
                $compact = "NOVI $spinner $label ($($elapsed)s)"
                $compact = $compact.Substring(0, [Math]::Min($compact.Length, [Math]::Max(1, $cols - 1)))
                $output += "$esc[H$esc[2K$esc[1;36m$compact$esc[0m"
            }
            [Console]::Write($output)
            $frame++; Start-Sleep -Milliseconds 80
        }
    }).AddArgument($label)
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
Write-Host "  -> Operating System: Microsoft Windows [$(Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption)]" -ForegroundColor Gray

$baseUrl = if ($env:NOVI_BASE_URL) { $env:NOVI_BASE_URL } else { 'https://novi-virid.vercel.app' }
$downloadUrl = "$baseUrl/api/download?asset=windows"
$tempPath = Join-Path $env:TEMP ("Novi-Setup-" + [Guid]::NewGuid().ToString('N') + ".exe")

Write-Host "==> Downloading application payload..." -ForegroundColor Cyan
Write-Host "  -> Endpoint: $downloadUrl" -ForegroundColor Gray

try {
    Start-NoviAnimation 'Downloading Novi'
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

Write-Host "==> Executing silent installer..." -ForegroundColor Cyan
Write-Host "  -> Target binary: $tempPath /S" -ForegroundColor Gray

try {
    Start-NoviAnimation 'Installing Novi'
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

Write-Host "==> Installation completed successfully." -ForegroundColor Green

$installLocations = @(
    (Join-Path $env:LOCALAPPDATA "Programs\novi\Novi.exe")
    (Join-Path $env:ProgramFiles "Novi\Novi.exe")
    (Join-Path $env:LOCALAPPDATA "Novi\Novi.exe")
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

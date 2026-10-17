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
        $esc = [char]27
        $frame = 0
        while ($true) {
            $cols = [Console]::WindowWidth; $rows = [Console]::WindowHeight
            $width = [Math]::Min(54, $cols - 8)
            if ($width -ge 12 -and $rows -ge 12) {
                $left = [Math]::Max(1, [int](($cols - $width) / 2)); $top = [Math]::Max(1, [int](($rows - 9) / 2))
                $pos = $frame % ($width - 2)
                $mouth = if ($frame % 2 -eq 0) { 'C' } else { 'O' }
                $track = (' ' * $pos) + $mouth + ('.' * ($width - 3 - $pos))
                $border = '=' * $width
                [Console]::Write("$esc[H$esc[J$esc[$top;${left}H$esc[1;36mNOVI  /  INSTALLING" +
                    "$esc[$($top + 2);${left}H$border$esc[$($top + 3);${left}H$esc[33m|$track|" +
                    "$esc[$($top + 4);${left}H$esc[36m$border$esc[$($top + 6);${left}H$esc[0m$label" +
                    "$esc[$($top + 8);${left}HPlease wait...")
            }
            $frame++; Start-Sleep -Milliseconds 120
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

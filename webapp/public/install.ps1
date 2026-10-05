# ==============================================================================
# Novi Windows Automated Provisioner (PowerShell)
# ==============================================================================

$ErrorActionPreference = 'Stop'

Write-Host "==> Initializing Novi Windows Provisioner" -ForegroundColor Cyan
Write-Host "  -> Operating System: Microsoft Windows" -ForegroundColor Gray

$baseUrl = if ($env:NOVI_BASE_URL) { $env:NOVI_BASE_URL } else { "https://novi-virid.vercel.app" }
$downloadUrl = "$baseUrl/api/download?asset=windows"
$tempPath = Join-Path $env:TEMP "Novi-Setup.exe"

Write-Host "==> Downloading application payload..." -ForegroundColor Cyan
Write-Host "  -> Endpoint: $downloadUrl" -ForegroundColor Gray

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath -UseBasicParsing
} catch {
    Write-Error "Failed to download installer from $downloadUrl: $_"
    exit 1
}

if (-not (Test-Path $tempPath)) {
    Write-Error "Downloaded installer payload not found at $tempPath"
    exit 1
}

Write-Host "==> Executing silent installer..." -ForegroundColor Cyan
Write-Host "  -> Target binary: $tempPath /S" -ForegroundColor Gray

try {
    $proc = Start-Process -FilePath $tempPath -ArgumentList "/S" -PassThru -Wait
    Remove-Item -Path $tempPath -Force -ErrorAction SilentlyContinue
} catch {
    Write-Error "Silent installation execution failed: $_"
    exit 1
}

Write-Host "==> Installation completed successfully." -ForegroundColor Green

$installLocations = @(
    Join-Path $env:LOCALAPPDATA "Programs\novi\Novi.exe",
    Join-Path $env:ProgramFiles "Novi\Novi.exe",
    Join-Path $env:LOCALAPPDATA "Novi\Novi.exe"
)

$targetExe = $null
foreach ($loc in $installLocations) {
    if (Test-Path $loc) {
        $targetExe = $loc
        break
    }
}

if ($targetExe) {
    Write-Host "==> Launching Novi ($targetExe)..." -ForegroundColor Cyan
    Start-Process -FilePath $targetExe
} else {
    Write-Host "==> Launching Novi via shortcut..." -ForegroundColor Cyan
    $desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Novi.lnk"
    if (Test-Path $desktopShortcut) {
        Invoke-Item $desktopShortcut
    }
}

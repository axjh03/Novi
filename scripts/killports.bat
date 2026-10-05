@echo off
setlocal enabledelayedexpansion

set PORTS=%*
if "%PORTS%"=="" set PORTS=3000 5173

echo [novi] Checking for processes listening on ports: %PORTS%...

for %%P in (%PORTS%) do (
    set FOUND=0
    for /f "tokens=5" %%A in ('netstat -aon ^| findstr /r /c:":%%P  *.*LISTENING"') do (
        set PID=%%A
        if not "!PID!"=="0" (
            set FOUND=1
            echo [novi] Port %%P is occupied by PID !PID!. Terminating...
            taskkill /F /PID !PID! >nul 2>&1
            if !errorlevel! equ 0 (
                echo [novi] Successfully freed port %%P (PID !PID!).
            ) else (
                echo [novi] Could not terminate PID !PID! (may require administrator prompt).
            )
        )
    )
    if "!FOUND!"=="0" (
        echo [novi] Port %%P is already free.
    )
)

echo [novi] Port cleanup completed. You can now launch Novi.

@echo off
setlocal
cd /d "%~dp0\.."

node "scripts\release.mjs" %*
set "RELEASE_EXIT=%errorlevel%"

if not "%RELEASE_EXIT%"=="0" (
    echo.
    echo Release operation failed or was cancelled (Code: %RELEASE_EXIT%).
    pause
    exit /b %RELEASE_EXIT%
)
pause
exit /b 0

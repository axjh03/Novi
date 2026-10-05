@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo               NOVI DESKTOP RELEASE ASSISTANT
echo ========================================================
echo.

node "scripts\release.mjs" %*
set "RELEASE_EXIT=%errorlevel%"

if not "%RELEASE_EXIT%"=="0" (
    echo.
    echo Release operation failed or was cancelled (Code: %RELEASE_EXIT%).
    echo.
    pause
    exit /b %RELEASE_EXIT%
)

echo.
echo Process complete.
pause
exit /b 0

@echo off
setlocal
cd /d "%~dp0\.."

set "HOOK_PATH=.git\hooks\pre-push"

echo Creating pre-push git hook...

(
echo #!/usr/bin/env bash
echo # Pre-push git hook to ensure releases are properly tagged
echo exec ^< /dev/tty
echo.
echo echo "========================================================"
echo echo "  GIT PUSH DETECTED"
echo echo "========================================================"
echo read -p "Do you want to release with a new build number? [y/N]: " ans
echo if [[ "$ans" =~ ^[Yy]$ ]]; then
echo     echo "Launching release script..."
echo     node scripts/release.mjs
echo     # Exit 1 to abort the original untagged push since release.mjs pushes commit + tags
echo     exit 1
echo fi
echo exit 0
) > "%HOOK_PATH%"

echo Hook created at %HOOK_PATH%.
pause

@echo off
node "%~dp0run.mjs" dev --terminals
set "launch_exit=%errorlevel%"
if not "%launch_exit%"=="0" pause
exit /b %launch_exit%

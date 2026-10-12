@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Hearth.ps1" %*
set "HEARTH_EXIT=%ERRORLEVEL%"
echo.
if "%HEARTH_EXIT%"=="0" (
  echo Hearth is ready. You can close this window.
) else (
  echo Hearth did not start. Read the message above before trying again.
)
if not "%HEARTH_NO_PAUSE%"=="1" pause
exit /b %HEARTH_EXIT%

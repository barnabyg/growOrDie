@echo off
rem Start Grow or Die: installs dependencies if needed, builds, serves and opens the game.
rem Extra arguments (such as --no-open) are passed to scripts/play.js.
setlocal
cd /d "%~dp0"
where npm.cmd >NUL 2>NUL
if errorlevel 1 (
  echo Node.js 24 with npm is required: https://nodejs.org/
  pause
  exit /b 1
)
call npm.cmd run play -- %*
set "code=%errorlevel%"
if not "%code%"=="0" pause
exit /b %code%

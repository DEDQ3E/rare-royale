@echo off
title Rare Royale
cd /d "%~dp0"
rem Usage: play.bat          - play (builds the game first if there is no build yet)
rem        play.bat rebuild  - rebuild after changing the code, then play

if not exist "launcher\serve.ps1" (
  echo Cannot find launcher\serve.ps1 next to this file.
  pause
  exit /b 1
)
if /i "%~1"=="rebuild" goto build
if exist "docs\index.html" goto serve

:build
where npm >nul 2>nul
if errorlevel 1 (
  echo Building the game needs Node.js 22 or newer with npm: https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\@rarefriends\friendsdk" (
  echo Installing packages...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto failed
)
echo Building the game...
call npm run build
if errorlevel 1 goto failed

:serve
echo.
echo Starting the game server. Keep this window open while you play.
echo You need a browser wallet on Robinhood mainnet with a hardwired Generations Friend.
echo After changing the code, run: play.bat rebuild
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\serve.ps1"
if errorlevel 1 pause
exit /b 0

:failed
echo.
echo The build failed. See the messages above.
pause
exit /b 1

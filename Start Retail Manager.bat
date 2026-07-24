@echo off
title Retail Manager
cd /d "%~dp0backend"

echo ============================================
echo            RETAIL MANAGER
echo ============================================
echo.

REM --- Check that Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed yet.
  echo.
  echo  1. Go to https://nodejs.org
  echo  2. Download the LTS version for Windows and install it.
  echo  3. Then double-click this file again.
  echo.
  pause
  exit /b
)

REM --- First-time setup: install libraries if not done yet ---
if not exist "node_modules" (
  echo  First-time setup. This runs only once and may take a minute...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Setup ran into a problem. Please check your internet connection
    echo  and double-click this file again.
    echo.
    pause
    exit /b
  )
  echo.
  echo  Setup complete.
  echo.
)

REM --- Start the app (this window must stay open while you use it) ---
echo  Starting... your browser will open automatically in a moment.
echo  To stop the app later, just close this window.
echo.
set OPEN_BROWSER=1
call npm start

REM If the server stops for any reason, keep the window open to show why.
echo.
echo  The app has stopped.
pause

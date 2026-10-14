@echo off
rem Starts the PSEO Tracker database (PocketBase) on this PC: http://127.0.0.1:8090
rem Double-click this file (or the desktop shortcut). Keep the window open; closing it stops the database.
title PSEO Tracker Database
cd /d "%~dp0.."

netstat -ano | findstr /r /c:":8090 .*LISTENING" >nul
if not errorlevel 1 (
  echo The PSEO Tracker database is already running on http://127.0.0.1:8090
  echo Nothing to do. Dashboard: http://127.0.0.1:8090/_/
  echo.
  pause
  exit /b 0
)

echo Starting the PSEO Tracker database on http://127.0.0.1:8090
echo Dashboard: http://127.0.0.1:8090/_/
echo Keep this window open. Closing it stops the database.
echo.
"%~dp0pocketbase.exe" serve --dir "%~dp0pb_data" --http 127.0.0.1:8090
echo.
echo The database has stopped.
pause

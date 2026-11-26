@echo off
title SEAS AI
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
start "" http://localhost:4173
node server.js
pause

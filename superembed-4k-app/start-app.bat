@echo off
title SuperEmbed 4K App Launcher
color 0A

echo.
echo  ========================================
echo   SuperEmbed 4K Streaming Application
echo  ========================================
echo.

:: Kill any existing processes on ports 7860 and 3000
echo  Stopping any existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :7860 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak > nul

echo.
echo  Starting Backend Scraper (Port 7860)...
start "Backend Scraper - Port 7860" cmd /k "cd /d %~dp0backend && node scraper.js"

:: Wait 5 seconds for backend to initialize
echo  Waiting for backend to start...
timeout /t 5 /nobreak > nul

echo  Starting Frontend (Port 3000)...
start "Frontend - Port 3000" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo  ========================================
echo   Both servers are starting...
echo  ========================================
echo.
echo   Backend:  http://localhost:7860
echo   Frontend: http://localhost:3000
echo.
echo   Press any key to open the app in browser...
pause > nul

:: Open browser after user presses a key
start http://localhost:3000

echo.
echo  Browser opened! You can close this window.
echo.
pause

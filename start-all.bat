@echo off
cd /d "%~dp0"
start "EventSync backend" cmd /k start-backend.bat
timeout /t 8 >nul
start "EventSync frontend" cmd /k start-frontend.bat
echo Open http://localhost:3000 once the frontend says it is ready.

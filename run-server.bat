@echo off
cd /d "%~dp0"
echo ============================================
echo   5E integration-hub server  -  branch: integration-hub  -  port 8320
echo ============================================
echo Folder: %cd%
echo.
echo [git branch]
git rev-parse --abbrev-ref HEAD
echo [git status]
git status --short --branch
echo.
echo Opening http://localhost:8320/ in your browser ...
start "" "http://localhost:8320/"
echo.
echo Starting python http.server on port 8320.
echo Press Ctrl+C to stop the server.
echo.
python -m http.server 8320
echo.
echo Server stopped.
pause

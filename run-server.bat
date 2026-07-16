@echo off
cd /d "%~dp0"
echo ============================================
echo   5E critical-fix dev server  -  branch: fix/critical-audit-issues  -  port 8370
echo ============================================
echo Folder: %cd%
echo.
echo [git branch]
git rev-parse --abbrev-ref HEAD
echo [git status]
git status --short --branch
echo.
echo Opening http://localhost:8370/ in your browser ...
start "" "http://localhost:8370/"
echo.
echo Starting python http.server on port 8370.
echo Press Ctrl+C to stop the server.
echo.
python -m http.server 8370
echo.
echo Server stopped.
pause

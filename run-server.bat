@echo off
cd /d "%~dp0"
echo ============================================
echo   5E major-fix dev server  -  branch: fix/major-audit-issues  -  port 8380
echo ============================================
echo Folder: %cd%
echo.
echo [git branch]
git rev-parse --abbrev-ref HEAD
echo [git status]
git status --short --branch
echo.
echo Opening http://localhost:8380/ in your browser ...
start "" "http://localhost:8380/"
echo.
echo Starting python http.server on port 8380.
echo Press Ctrl+C to stop the server.
echo.
python -m http.server 8380
echo.
echo Server stopped.
pause

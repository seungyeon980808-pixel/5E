@echo off
cd /d "%~dp0"
echo ============================================
echo   5E graph-tool dev server  -  branch: feat/graph-tool  -  port 8198
echo ============================================
echo Folder: %cd%
echo.
echo [git branch]
git rev-parse --abbrev-ref HEAD
echo [git status]
git status --short --branch
echo.
echo Opening http://localhost:8198/ in your browser ...
start "" "http://localhost:8198/"
echo.
echo Starting python http.server on port 8198.
echo Press Ctrl+C to stop the server.
echo.
python -m http.server 8198
echo.
echo Server stopped.
pause

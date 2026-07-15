@echo off
cd /d "%~dp0"
echo ============================================
echo   5E curve-smoothing dev server  -  branch: feat/curve-smoothing  -  port 8340
echo ============================================
echo Folder: %cd%
echo.
echo [git branch]
git rev-parse --abbrev-ref HEAD
echo [git status]
git status --short --branch
echo.
echo Opening http://localhost:8340/ in your browser ...
start "" "http://localhost:8340/"
echo.
echo Starting python http.server on port 8340.
echo Press Ctrl+C to stop the server.
echo.
python -m http.server 8340
echo.
echo Server stopped.
pause

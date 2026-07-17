@echo off
cd /d "%~dp0"
echo ============================================
echo   5E image-drag fix dev server  -  branch: fix/image-native-drag  -  port 8360
echo ============================================
echo Folder: %cd%
echo.
echo [git branch]
git rev-parse --abbrev-ref HEAD
echo [git status]
git status --short --branch
echo.
echo Opening http://localhost:8360/ in your browser ...
start "" "http://localhost:8360/"
echo.
echo Starting python http.server on port 8360.
echo Press Ctrl+C to stop the server.
echo.
python -m http.server 8360
echo.
echo Server stopped.
pause

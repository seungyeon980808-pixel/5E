@echo off
chcp 65001 >nul
title 기출 그림 추출기
cd /d "%~dp0"

rem 필요한 라이브러리 확인 후 없으면 자동 설치
python -c "import pymupdf, numpy, openpyxl" 2>nul
if errorlevel 1 (
    echo 필요한 라이브러리를 설치합니다...
    python -m pip install --quiet pymupdf numpy openpyxl pillow tkinterdnd2
)

start "" pythonw "exam_figure_extractor.pyw"

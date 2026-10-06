@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 serve.py --open
  goto :done
)
where python >nul 2>nul
if not errorlevel 1 (
  python serve.py --open
  goto :done
)
echo Python이 없어도 index.html을 더블클릭하면 학습할 수 있습니다.
start "" "%~dp0index.html"
:done
if errorlevel 1 pause

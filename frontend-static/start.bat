@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=5173"
set "URL=http://127.0.0.1:%PORT%/"

rem --- 先确认 Python 3 可用，再决定用哪个命令启动服务 ---
py -3 -c "import sys" >nul 2>nul
if not errorlevel 1 goto :serve_py3

python -c "import sys" >nul 2>nul
if not errorlevel 1 goto :serve_python

python3 -c "import sys" >nul 2>nul
if not errorlevel 1 goto :serve_python3

echo [ERROR] Python 3 not found.
echo Install Python 3 from https://www.python.org/downloads/ and run this file again.
pause
exit /b 1

:serve_py3
call :banner
rem 服务先起，浏览器 2 秒后再开，避免首屏「无法连接」
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"
py -3 -m http.server %PORT% --bind 127.0.0.1
goto :done

:serve_python
call :banner
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"
python -m http.server %PORT% --bind 127.0.0.1
goto :done

:serve_python3
call :banner
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"
python3 -m http.server %PORT% --bind 127.0.0.1
goto :done

:banner
echo ============================================
echo  Directory : %CD%
echo  URL       : %URL%
echo  Keep this window open. Ctrl+C to stop.
echo ============================================
exit /b 0

:done
echo.
echo Server stopped.
pause

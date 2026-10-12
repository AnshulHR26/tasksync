@echo off
rem Double-click to start Daily Tasks and open it in your browser.
cd /d "%~dp0"

netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul
if %errorlevel%==0 (
    echo Daily Tasks is already running.
    start "" http://127.0.0.1:8000
    exit /b
)

echo Starting Daily Tasks on http://127.0.0.1:8000  (close this window to stop it)
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8000"
"venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause

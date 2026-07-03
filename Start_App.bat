@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   APPT Odisha 2026-27  -  Starting App
echo ============================================
echo.

REM --- find a working python command ---
set PYCMD=
where python >nul 2>nul
if %errorlevel%==0 (
    set PYCMD=python
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        set PYCMD=py
    )
)

if "%PYCMD%"=="" (
    echo [ERROR] Python was not found on this PC.
    echo Please install Python from https://www.python.org/downloads/
    echo IMPORTANT: during install, tick the box "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

echo Using: %PYCMD%
echo Installing/checking required packages...
%PYCMD% -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] Failed to install required packages. See message above.
    pause
    exit /b 1
)

echo.
echo Starting the server in a new window...
start "APPT Server - keep this window open" cmd /k "%PYCMD% app.py"

echo Waiting for the server to be ready...
set READY=0
for /L %%i in (1,1,20) do (
    if "!READY!"=="0" (
        %PYCMD% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5050/api/meta', timeout=1)" >nul 2>nul
        if not errorlevel 1 (
            set READY=1
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)

echo Opening the app in your browser...
start "" http://127.0.0.1:5050

echo.
echo If the browser shows a connection error, wait a few seconds and refresh.
echo The server window titled "APPT Server" must stay open while you use the app.
echo Closing that window stops the app.
echo.
pause

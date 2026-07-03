@echo off
TITLE PormsG Launcher
SETLOCAL

cd /d "%~dp0"

echo [PormsG] Initializing...

:: Check for node_modules
IF NOT EXIST "node_modules\" (
    echo [PormsG] node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed. Make sure Node.js is installed.
        pause
        exit /b %ERRORLEVEL%
    )
)

echo [PormsG] Starting Electron...
call npm start

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start application.
    pause
)

ENDLOCAL

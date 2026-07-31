@echo off
TITLE RegularGravity Launcher
SETLOCAL

cd /d "%~dp0"

echo [RegularGravity] Initializing...

:: Check for node_modules
IF NOT EXIST "node_modules\" (
    echo [RegularGravity] node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed. Make sure Node.js is installed.
        pause
        exit /b %ERRORLEVEL%
    )
)

echo [RegularGravity] Starting Electron...
call npm start

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start application.
    pause
)

ENDLOCAL

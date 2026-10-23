@echo off
chcp 65001 >nul
title LinguaFlow Local Server

echo ========================================================
echo Starting LinguaFlow Web Server...
echo ========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo Server exited with error code: %ERRORLEVEL%
)

pause

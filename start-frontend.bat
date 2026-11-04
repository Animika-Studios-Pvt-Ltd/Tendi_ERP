@echo off
title Lumos ERP - Frontend (Client)
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install || goto :error
)

if not exist "frontend\.env" copy "frontend\.env.example" "frontend\.env" >nul

echo Starting frontend on http://localhost:5173
call npm run dev:frontend
goto :eof

:error
echo.
echo Something went wrong. Check the messages above.
pause

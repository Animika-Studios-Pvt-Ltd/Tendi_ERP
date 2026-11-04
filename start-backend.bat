@echo off
title Lumos ERP - Backend (API)
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install || goto :error
)

if not exist "backend\.env" (
  echo backend\.env not found. Copying backend\.env.example - fill in MONGODB_URI and JWT_SECRET, then run again.
  copy "backend\.env.example" "backend\.env" >nul
  pause
  exit /b 1
)

echo Starting backend on http://localhost:5000/api/v1
call npm run dev:backend
goto :eof

:error
echo.
echo Something went wrong. Check the messages above.
pause

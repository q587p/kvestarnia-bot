@echo off
setlocal

cd /d "%~dp0"

echo.
echo Kvestarnia local bot launcher
echo =============================

if not exist package.json (
  echo package.json not found. Run this file from the repository root.
  exit /b 1
)

if not exist .env (
  if not exist .env.example (
    echo .env.example not found. Cannot create local .env.
    exit /b 1
  )

  copy .env.example .env >nul
  echo Created .env from .env.example.
  echo Edit .env and set BOT_TOKEN to run the real Telegram bot.
)

findstr /R /C:"^BOT_TOKEN=$" .env >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  echo.
  echo BOT_TOKEN is empty in .env.
  echo The app will validate config, but Telegram polling will not start.
  echo Add a BotFather token to .env when you want to run the real bot.
)

if not exist node_modules (
  echo.
  echo Installing npm dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)

echo.
echo Generating Prisma Client...
call npm.cmd run db:generate
if errorlevel 1 exit /b 1

echo.
echo Applying local SQLite migrations...
call npm.cmd run db:migrate
if errorlevel 1 exit /b 1

echo.
echo Starting local bot dev server...
call npm.cmd run dev

endlocal

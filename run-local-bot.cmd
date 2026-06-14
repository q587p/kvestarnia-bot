@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo.
echo Kvestarnia local bot launcher
echo =============================

if not exist package.json (
  echo package.json not found. Put this file into the repository root and run it there.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js 20 or 22 LTS first.
  pause
  exit /b 1
)

if not exist .env (
  if not exist .env.example (
    echo .env.example not found. Cannot create local .env.
    pause
    exit /b 1
  )
  copy .env.example .env >nul
  echo Created .env from .env.example.
  echo Edit .env and set BOT_TOKEN before expecting Telegram responses.
)

findstr /I /R /C:"^DATABASE_URL=.*file:.*dev\.db" .env >nul 2>nul
if errorlevel 1 (
  echo.
  echo WARNING: .env does not look like local SQLite dev.db.
  echo Expected something like:
  echo DATABASE_URL="file:./dev.db"
  echo.
  echo Refusing to run local reset/migrations against an unknown database.
  echo Fix .env and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo Installing npm dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Generating Prisma Client...
call npm.cmd run db:generate
if errorlevel 1 (
  echo Prisma generate failed.
  pause
  exit /b 1
)

echo.
echo Applying local SQLite migrations...
call npm.cmd run db:migrate
if errorlevel 1 (
  echo.
  echo Migration failed. This is often local SQLite drift after switching branches.
  echo The local dev database can be reset safely if you do not need local test progress.
  echo.
  choice /C YN /M "Reset LOCAL prisma\dev.db and reapply migrations?"
  if errorlevel 2 (
    echo Reset cancelled.
    pause
    exit /b 1
  )

  if not exist prisma (
    echo prisma directory not found.
    pause
    exit /b 1
  )

  if exist prisma\dev.db (
    if not exist prisma\backups mkdir prisma\backups
    for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
    copy prisma\dev.db "prisma\backups\dev-!TS!.db" >nul
    echo Backup saved to prisma\backups\dev-!TS!.db
  )

  echo.
  echo Resetting local Prisma SQLite database...
  call npx.cmd prisma migrate reset --force --skip-seed
  if errorlevel 1 (
    echo Prisma reset failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting local bot dev server...
call npm.cmd run dev

endlocal

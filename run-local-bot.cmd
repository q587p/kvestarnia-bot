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

set /a PRISMA_GENERATE_ATTEMPT=1
set /a PRISMA_GENERATE_MAX_ATTEMPTS=3

:prisma_generate_retry
echo.
if !PRISMA_GENERATE_ATTEMPT! EQU 1 (
  echo Generating Prisma Client...
) else (
  echo Retrying Prisma Client generation ^(attempt !PRISMA_GENERATE_ATTEMPT! of !PRISMA_GENERATE_MAX_ATTEMPTS!^)...
)

set "PRISMA_GENERATE_LOG=%TEMP%\kvestarnia-prisma-generate-%RANDOM%-%RANDOM%.log"
call npm.cmd run db:generate >"!PRISMA_GENERATE_LOG!" 2>&1
set "PRISMA_GENERATE_EXIT=!ERRORLEVEL!"
type "!PRISMA_GENERATE_LOG!"

if "!PRISMA_GENERATE_EXIT!"=="0" goto prisma_generate_ok

set "PRISMA_EPERM_ERROR="
set "PRISMA_ENGINE_ERROR="
findstr /I /C:"EPERM" "!PRISMA_GENERATE_LOG!" >nul 2>nul
if not errorlevel 1 set "PRISMA_EPERM_ERROR=1"
findstr /I /C:"query_engine-windows.dll.node" "!PRISMA_GENERATE_LOG!" >nul 2>nul
if not errorlevel 1 set "PRISMA_ENGINE_ERROR=1"

if not defined PRISMA_EPERM_ERROR goto prisma_generate_failed
if not defined PRISMA_ENGINE_ERROR goto prisma_generate_failed
if !PRISMA_GENERATE_ATTEMPT! GEQ !PRISMA_GENERATE_MAX_ATTEMPTS! goto prisma_generate_failed

echo.
echo Prisma engine is locked by a previous local Node process.
echo Attempting automatic recovery...
call :release_prisma_engine_lock
if errorlevel 1 echo Recovery reported a warning; Prisma generation will still be retried.

if exist "node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" (
  del /F /Q "node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" >nul 2>nul
)

if exist "!PRISMA_GENERATE_LOG!" del /Q "!PRISMA_GENERATE_LOG!" >nul 2>nul
set /a PRISMA_GENERATE_ATTEMPT+=1
timeout /T 2 /NOBREAK >nul
goto prisma_generate_retry

:prisma_generate_ok
if exist "!PRISMA_GENERATE_LOG!" del /Q "!PRISMA_GENERATE_LOG!" >nul 2>nul

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
set "BOT_EXIT=!ERRORLEVEL!"

endlocal & exit /b %BOT_EXIT%

:prisma_generate_failed
echo.
echo Prisma generate failed after !PRISMA_GENERATE_ATTEMPT! attempt^(s^).
echo Diagnostic log: !PRISMA_GENERATE_LOG!
echo No files were changed automatically outside node_modules\.prisma\client.
pause
exit /b 1

:release_prisma_engine_lock
set "PRISMA_RECOVERY_SCRIPT=%CD%\scripts\recover-prisma-client.ps1"

if not exist "!PRISMA_RECOVERY_SCRIPT!" (
  echo Prisma recovery helper not found: !PRISMA_RECOVERY_SCRIPT!
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "!PRISMA_RECOVERY_SCRIPT!" -RepositoryRoot "%CD%"
exit /b !ERRORLEVEL!

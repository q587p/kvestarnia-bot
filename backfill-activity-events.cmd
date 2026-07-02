@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Install Node.js 20 or newer first.
  pause
  exit /b 1
)

if /I "%~1"=="--local-runtime" (
  where node.exe >nul 2>nul
  if errorlevel 1 (
    echo node.exe was not found. Install Node.js 20 or newer first.
    pause
    exit /b 1
  )

  for /f "usebackq delims=" %%I in (`node.exe scripts\local-bot-runtime.cjs path --source-root "%CD%"`) do set "RUNTIME_PATH=%%I"
  if not defined RUNTIME_PATH (
    echo Could not resolve the isolated local bot runtime path.
    pause
    exit /b 1
  )

  set "RUNTIME_DB=%RUNTIME_PATH%\prisma\dev.db"
  set "RUNTIME_DB=%RUNTIME_DB:\=/%"
  set "DATABASE_URL=file:%RUNTIME_DB%"
  echo Using isolated local bot runtime database.
) else if not "%~1"=="" (
  set "DATABASE_URL=%~1"
  echo Using provided DATABASE_URL.
) else (
  if defined DATABASE_URL (
    echo Using existing DATABASE_URL from this shell.
  ) else (
    echo DATABASE_URL is not set in this shell; scripts will use .env.
  )
)

echo.
echo [1/3] Dry run: activity event archival backfill.
call npm.cmd run maintenance:backfill-activity-events
if errorlevel 1 goto failed

echo.
echo Review the dry-run counts above. Press any key to apply, or close this window to stop.
pause >nul

echo.
echo [2/3] Apply: activity event archival backfill.
call npm.cmd run maintenance:backfill-activity-events -- --apply
if errorlevel 1 goto failed

echo.
echo Review the applied counts above. Press any key to poll the feed ledger.
pause >nul

echo.
echo [3/3] Poll: latest public ActivityEvent rows.
call npm.cmd run maintenance:poll-activity-events -- --limit=13
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Done.
) else (
  echo Poll finished with exit code %EXIT_CODE%.
)
pause
endlocal & exit /b %EXIT_CODE%

:failed
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Backfill helper failed with exit code %EXIT_CODE%.
pause
endlocal & exit /b %EXIT_CODE%

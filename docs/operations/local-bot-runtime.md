# Isolated local bot runtime

## Why this exists

On Windows, a running Prisma Client can hold `query_engine-windows.dll.node` open. If the bot runs directly from the development checkout, `prisma generate` in that same checkout may fail with `EPERM`, and a coding agent may be forced to stop the bot before checks can continue.

The local launcher therefore runs the Telegram bot from a separate snapshot with its own:

- `node_modules`;
- generated Prisma Client;
- SQLite `prisma/dev.db`;
- copied `.env` with an isolated `DATABASE_URL`;
- source snapshot.

The default runtime path is under:

```text
%LOCALAPPDATA%\Kvestarnia\local-bot\<repository-name>-<path-hash>
```

Override it only when necessary:

```cmd
set KVESTARNIA_LOCAL_RUNTIME=C:\some\external\runtime
```

The override must remain outside the Git repository.

## First switch from the old launcher

Stop the currently running in-place bot once before the first isolated launch. Two polling processes cannot use the same Telegram bot token at the same time.

The isolated runtime intentionally starts with its own SQLite database. Existing manual-test state from the source checkout is not copied automatically because copying a live SQLite database can produce an inconsistent snapshot. Keep the old database as a backup or copy it only while every process using it is stopped.

After this one-time switch, ordinary Codex work no longer needs to stop the manual-test bot.

## Commands

### Start the current snapshot

```text
run-local-bot.cmd
```

This synchronizes the current source once, prepares the isolated dependencies and database, then runs `npm run dev` inside the runtime snapshot.

### Promote current repository changes and restart

```text
refresh-local-bot.cmd
```

Use this at a deliberate testing checkpoint. It stops only the managed isolated bot, copies the latest source snapshot, regenerates Prisma Client inside the runtime, applies migrations, and starts the bot again.

### Check whether the running snapshot is stale

```text
status-local-bot.cmd
```

The status reports the runtime path, managed PID, package version, and whether source files changed after the bot started.

### Stop the isolated bot

```text
stop-local-bot.cmd
```

This targets only the PID tree recorded for this repository's managed runtime. It never runs a global `taskkill node.exe`.

## Expected development workflow

1. Start `run-local-bot.cmd` and begin a manual Telegram test session.
2. Let Codex edit and test the main repository. The running bot remains on its stable snapshot.
3. Codex runs `npm run db:generate`, typecheck, build, and tests in the main checkout without touching the runtime Prisma DLL.
4. At a meaningful checkpoint, run `refresh-local-bot.cmd` to promote the latest working files for manual testing.
5. Repeat without restarting the bot for every intermediate Codex edit.

A restart is still required to test a new snapshot. Isolation makes that restart explicit and limited to the runtime bot instead of allowing arbitrary tooling to kill it during implementation.

## Snapshot contents

The manager copies the repository snapshot broadly enough to include future runtime assets, while excluding development-only or unsafe trees such as:

- `.git/`, `.agents/`, `.codex/`, `.github/`;
- `docs/`, `tests/`, `skills/`;
- `node_modules/`, `dist/`, `build/`, `coverage/`;
- Prisma runtime databases and backups;
- `.env*` files other than `.env.example`.

It then writes a sanitized runtime copy of `.env`. Deleted source files are also removed from the next snapshot. Runtime-only files such as dependencies, generated Prisma output, database files, backups, deployment markers, and manager metadata are preserved.

## Database behavior

The source `.env` must use a local SQLite URL ending in `dev.db`. The runtime copy always rewrites it to:

```text
DATABASE_URL="file:./dev.db"
```

That places the manual-testing database inside the isolated runtime rather than the development checkout.

If migrations detect drift, the launcher may offer to back up and reset only the isolated runtime database. It does not reset the source checkout's database.

## Running maintenance scripts against the isolated DB

Maintenance commands started from the repository read the repository `.env` by default. To repair or backfill data for the running local bot, point `DATABASE_URL` at the isolated runtime database first:

```powershell
$runtimePath = (node scripts\local-bot-runtime.cjs path --source-root (Get-Location)).Trim()
$runtimeDb = (Join-Path $runtimePath "prisma\dev.db").Replace("\", "/")
$env:DATABASE_URL = "file:$runtimeDb"
npm run maintenance:backfill-activity-events
npm run maintenance:backfill-activity-events -- --apply
npm run maintenance:poll-activity-events -- --limit=13
```

The first backfill command is a dry-run. The `-- --apply` form is required for npm to pass `--apply` to the script.

## Codex boundary

During ordinary implementation and review, Codex should:

- leave the isolated bot running;
- avoid `run-local-bot.cmd`, `refresh-local-bot.cmd`, and `stop-local-bot.cmd` unless the user asks;
- run validation commands in the main checkout;
- never kill all `node.exe` processes;
- mention that `refresh-local-bot.cmd` is ready when a new manual-test snapshot should be promoted.

The legacy Prisma lock recovery helper may remain as an in-place fallback, but the isolated launcher should make it unnecessary for normal work.

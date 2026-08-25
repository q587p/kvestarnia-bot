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

This synchronizes the current source once, prepares the isolated dependencies and database, builds the snapshot, then runs the compiled bot as the directly supervised child process. The manager restarts an unexpected exit up to three consecutive times with bounded backoff.

This direct-supervision and rotating-log contract shipped in PR `#189`. It
supersedes the old wrapper-watchdog/debug-log backlog; combat-state diagnostic
instrumentation remains deliberately deferred and must preserve privacy.

### Promote current repository changes and restart

```text
refresh-local-bot.cmd
```

Use this at a deliberate testing checkpoint. It stops only the managed isolated bot, copies the latest source snapshot, regenerates Prisma Client inside the runtime, applies migrations, and starts the bot again.

### Check whether the running snapshot is stale

```text
status-local-bot.cmd
```

The status prints the runtime state before the source comparison, then reports the manager PID, the actual bot PID, package version, restart count, retained log path, and whether source files changed after the bot started. It reports `degraded` instead of `running` if the manager exists but the bot child is missing. After a terminal failure it also reports the last exit and whether automatic restarts were exhausted.

On Windows, source-root ownership is case-insensitive: `D:\repo` and `d:\repo` identify the same managed runtime. `run`/`refresh` must therefore refuse a duplicate manager even when separate shells spell the drive letter differently.

### Stop the isolated bot

```text
stop-local-bot.cmd
```

This targets only the PID tree recorded for this repository's managed runtime. It never runs a global `taskkill node.exe`.

## Expected development workflow

1. Start `run-local-bot.cmd` and begin a manual Telegram test session.
2. Let Codex edit and test the main repository. The running bot remains on its stable snapshot.
3. Codex runs `npm run db:generate`, typecheck, build, and tests in the main checkout without touching the runtime Prisma DLL.
4. At the final validated and pushed gameplay/runtime checkpoint, Codex first
   confirms every task-specific variable exists in the source `.env` with the
   intended local value, then automatically runs `refresh-local-bot.cmd` to
   promote both the exact head and sanitized local environment for manual testing.
5. Run `status-local-bot.cmd` and verify the expected snapshot SHA. When a
   feature depends on a new flag, also verify that key in the runtime `.env`;
   the source `.env` alone does not change an already-running snapshot.
6. Repeat without restarting the bot for every intermediate Codex edit.

A restart is still required to test a new snapshot. Isolation makes that restart explicit and limited to the runtime bot instead of allowing arbitrary tooling to kill it during implementation.

## Snapshot contents

The manager copies the repository snapshot broadly enough to include future runtime assets, while excluding development-only or unsafe trees such as:

- `.git/`, `.agents/`, `.cache/`, `.codex/`, `.codex_tmp/`, `.codex-remote-attachments/`, `.github/`;
- `docs/`, `tests/`;
- `node_modules/`, `dist/`, `build/`, `coverage/`;
- Prisma runtime databases and backups;
- `.env*` files other than `.env.example`.

It then writes a sanitized runtime copy of `.env`. Deleted source files are also removed from the next snapshot. Runtime-only files such as dependencies, generated Prisma output, database files, backups, deployment markers, and manager metadata are preserved.

## Failure diagnostics and recovery

The active manager records the real compiled bot PID instead of an `npm` or `ts-node-dev` wrapper PID. Fatal database readiness or Telegram polling failures close the runtime so the manager can observe the exit and restart it. Rapid repeated failures stop after three restart attempts instead of looping forever.

`status-local-bot.cmd` always prints the retained log location. The default file is `.kvestarnia-runtime.log` inside the external runtime root; when it reaches 5 MiB, the next launch rotates it to `.kvestarnia-runtime.log.previous`. Runtime metadata never contains the bot token or database contents.

If Telegram stops responding, run `status-local-bot.cmd` first. A `restarting` state is self-healing; `not running` plus `Automatic restarts exhausted: yes` requires inspecting the retained log before a deliberate `refresh-local-bot.cmd`.

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

During ordinary interim implementation and review, Codex should:

- leave the isolated bot running;
- avoid `run-local-bot.cmd`, `refresh-local-bot.cmd`, and `stop-local-bot.cmd` for intermediate edits;
- run validation commands in the main checkout;
- never kill all `node.exe` processes;
- automatically refresh the isolated bot after the final validated gameplay/runtime head is pushed, unless the user explicitly opts out or a destructive isolated-database reset needs new authority;
- verify exact snapshot SHA, copied QA flags, manager/Bot PIDs, a fresh polling-ready log and `/ready` before reporting the local bot ready.

The legacy Prisma lock recovery helper may remain as an in-place fallback, but the isolated launcher should make it unnecessary for normal work.

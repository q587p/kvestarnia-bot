# Local runtime debug logging backlog

Status: deferred. This is not implementation permission for the current release.

## Problem

The isolated Windows local bot can leave the runtime manager and `ts-node-dev`
alive after the actual `src/bot.ts` child exits. The current launcher inherits a
console but does not retain a bounded startup/crash log, so a later diagnosis
may see a healthy manager PID without the exception that killed polling.

## Future task contract

- Persist stdout and stderr for every `run-local-bot.cmd` and
  `refresh-local-bot.cmd` launch under the isolated runtime directory.
- Keep logs bounded through rotation by run and total byte budget.
- Record the snapshot SHA, package version, manager PID, bot PID, start/exit
  timestamps and exit code without copying secrets or `.env` values.
- Make `status-local-bot.cmd` report the current log paths and the last bounded
  crash summary when the manager is alive but the bot child or healthcheck is
  gone.
- Preserve the existing one-runtime ownership check and target only the managed
  process tree.
- Keep production runtime, production tokens and the repository checkout DB out
  of scope.
- Cover clean start, child crash, respawn, stale metadata, rotation and
  redaction with focused launcher tests; run `node --check` for the manager.

## Current workaround

Redirect the isolated manager's stdout/stderr to a runtime-only log for the
specific manual QA session. Do not commit those logs.

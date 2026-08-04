# Local runtime debug logging backlog

Status: supervision and bounded rotating log retention shipped in PR `#189`;
privacy-safe combat transition instrumentation remains deferred.

## Problem

The isolated Windows runtime now builds the snapshot, supervises the compiled
bot directly, restarts boundedly after an unexpected exit, and retains a
bounded rotating runtime log outside the repository. `status-local-bot.cmd`
reports the worker/health state and retained log path.

## Shipped replacement

See [`local-bot-runtime.md`](../operations/local-bot-runtime.md). The old wrapper
watchdog and unbounded-console diagnosis contract is superseded; do not reopen
it as a new runtime task without evidence that the direct supervisor fails.

## Deferred boundary

Do not add production or local combat-state dumps as part of the shipped log.
A future privacy-safe combat debug contract may record only bounded categories
such as session/rules/turn/state and scheduler/CAS/settlement stage. It must not
retain tokens, Telegram ids, private text, callback payloads, SQL parameters,
raw state or raw exceptions. This note is not implementation permission.

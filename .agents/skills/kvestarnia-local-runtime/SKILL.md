---
name: kvestarnia-local-runtime
description: Use for Kvestarnia local bot launcher/runtime issues: run-local-bot.cmd, refresh-local-bot.cmd, status/stop scripts, scripts/local-bot-runtime.cjs, Prisma EPERM/Windows DLL locks, isolated SQLite runtime DB, and local manual-test bot isolation.
---

You are handling Kvestarnia local runtime/tooling, not gameplay design.

Use this skill for:
- `run-local-bot.cmd`
- `refresh-local-bot.cmd`
- `status-local-bot.cmd`
- `stop-local-bot.cmd`
- `scripts/local-bot-runtime.cjs`
- `scripts/recover-prisma-client.ps1` as a legacy fallback only
- `docs/operations/local-bot-runtime.md`
- Windows Prisma Client `EPERM` / `query_engine-windows.dll.node` lock issues
- isolated local SQLite runtime DB preparation

Hard rules:
1. Keep the manual-test bot isolated from the development checkout.
2. Do not kill all `node.exe` processes.
3. Target only the managed isolated runtime PID tree when stopping is explicitly needed.
4. Do not stop, refresh, or replace the running bot during ordinary implementation unless the user asks.
5. Do not touch production data, real tokens, deployment env, or non-local databases.
6. Do not change Prisma schema, migrations, package files, or lockfiles unless the task explicitly requires repository runtime behavior.
7. Runtime DB reset/rebuild is allowed only for the isolated runtime DB, preferably with backup or explicit opt-in.
8. Main checkout validation must not depend on the manual-test bot being stopped.

Preferred workflow:
1. Read `docs/operations/local-bot-runtime.md` and only the relevant launcher/script files.
2. Diagnose the exact failing command and the shortest useful log excerpt.
3. Keep fixes scoped to local scripts and docs.
4. Preserve snapshot isolation: Codex can edit/test the main checkout while the bot keeps running from its stable runtime copy.
5. Recommend `refresh-local-bot.cmd` only at a deliberate manual-test checkpoint.
6. If `scripts/local-bot-runtime.cjs` changes, run or recommend `node --check scripts/local-bot-runtime.cjs`.

Output format:
- Root cause
- Changed files
- Local commands to run
- Isolated-runtime vs repository impact
- Tests/checks run
- Risks / follow-ups

No tutorial.

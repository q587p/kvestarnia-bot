# Operations Docs

Use these docs when running, testing, smoking, debugging or reviewing Kvestarnia locally or in production-facing workflows.

## Setup and runtime

- [`../DEVELOPER_SETUP.md`](../DEVELOPER_SETUP.md) — local run, `.env`, Prisma, Render, scripts and troubleshooting.
- [`../LOCAL_BOT_RUNTIME.md`](../LOCAL_BOT_RUNTIME.md) — isolated local bot runtime and Windows/Prisma process-lock workflow.
- [`../PLAYTESTING.md`](../PLAYTESTING.md) — manual smoke test for the current playable loop.
- [`../PLAYTESTING-daily-korchma-rounds-addendum.md`](../PLAYTESTING-daily-korchma-rounds-addendum.md) — future manual QA addendum for daily Korchma rounds.

## Support jar and production-facing support

- [`../SUPPORT_JAR_BACKLOG.md`](../SUPPORT_JAR_BACKLOG.md) — support jar plan and no-advantage guardrails.
- [`../SUPPORT_JAR_LIVE_STATUS.md`](../SUPPORT_JAR_LIVE_STATUS.md) — future read-only live status design.

## Release and smoke records

- [`../PHASE1_CLOSEOUT_SMOKE.md`](../PHASE1_CLOSEOUT_SMOKE.md) — Phase 1 final smoke gate.
- [`../PHASE2_CLOSEOUT_SMOKE.md`](../PHASE2_CLOSEOUT_SMOKE.md) — Phase 2 MVP closeout smoke if present.
- [`../tasks/phase2-regression-smoke.md`](../tasks/phase2-regression-smoke.md) — read-only/manual Phase 2 regression gate.

## Guardrails

- Docs-only changes do not bump versions, update changelog/news, or create releases.
- Do not stop or refresh the isolated local bot unless the task or human asks.
- For runtime tasks, run targeted checks first; for docs-only tasks, `git diff --check` and link checks are usually enough.

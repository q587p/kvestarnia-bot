# Operations Docs

Use these docs when running, testing, smoking, debugging or reviewing Kvestarnia locally or in production-facing workflows.

## Setup and runtime

- [`developer-setup.md`](developer-setup.md) — local run, `.env`, Prisma, Render, scripts and troubleshooting.
- [`local-bot-runtime.md`](local-bot-runtime.md) — isolated local bot runtime and Windows/Prisma process-lock workflow.
- [`local-bot-runtime-db-prep.md`](local-bot-runtime-db-prep.md) — local bot runtime database preparation notes.
- [`playtesting.md`](playtesting.md) — manual smoke test for the current playable loop.

## QA entry points

- [`../qa/README.md`](../qa/README.md) — feature-specific manual QA and smoke packages.
- [`../history/evidence/manual-qa/`](../history/evidence/manual-qa/) — release-specific manual QA evidence and closed smoke packages.

## Support jar and production-facing support

- [`../backlog/support-jar-backlog.md`](../backlog/support-jar-backlog.md) — support jar plan and no-advantage guardrails.
- [`support-jar-live-status.md`](support-jar-live-status.md) — future read-only live status design.

## Release and smoke records

- [`release-state-ledger.md`](release-state-ledger.md) — current code/deploy/flag/automated/manual QA/kill-switch evidence; merged code alone is not player availability.
- [`../history/phase1/closeout-smoke.md`](../history/phase1/closeout-smoke.md) — Phase 1 final smoke gate.
- [`../history/phase2/closeout-smoke.md`](../history/phase2/closeout-smoke.md) — Phase 2 MVP closeout smoke if present.
- [`../history/evidence/manual-qa/release-smoke-evidence.md`](../history/evidence/manual-qa/release-smoke-evidence.md) — release-specific smoke sections removed from the active runbook.

## Guardrails

- Docs-only changes do not bump versions, update changelog/news, or create releases.
- Do not stop or refresh the isolated local bot unless the task or human asks.
- For runtime tasks, run targeted checks first; for docs-only tasks, `git diff --check` and link checks are usually enough.

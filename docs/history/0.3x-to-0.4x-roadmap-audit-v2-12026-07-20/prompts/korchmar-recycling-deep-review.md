# Korchmar Recycling deep review

```text
Use $kvestarnia-second-codex-readonly.

READ ONLY report only. Do not edit files.

PR: #<PR_NUMBER>
Base: main
Review mode: deep
Task doc: docs/tasks/0.4.11-korchmar-recycling.md

Extra focus:
- exact five-consumed/one-created accounting and exact-once batch identity;
- atomic sale/payout/pool intake and unique source-sale/line receipt;
- bounded per-trigger work, restart/resume and no infinite cheap-output loop;
- frozen ordering/fingerprints/rules/seed/outcome and blocked-no-candidate repair;
- separation from player MantokChestRun, LUCK, achievements and ownership;
- resale threshold/fingerprint/quarantine parity;
- concurrent sale/batch/repair behavior, migration/restore and economy rollback.

Report blockers, important findings, missing property/concurrency tests and
highest-risk Telegram/operational checks. No implementation or tutorial.
```

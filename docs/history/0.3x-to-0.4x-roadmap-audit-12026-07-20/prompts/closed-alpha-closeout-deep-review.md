# Closed alpha closeout deep read-only review

```text
Use $kvestarnia-second-codex-readonly.

PR: #<PR_NUMBER>
Base: main
Review mode: deep
Task doc: docs/tasks/0.3.16-closed-alpha-closeout.md

READ ONLY report only. Changed files only by default; inspect direct lifecycle,
lease, parser/repair and settlement dependencies where required.

Extra focus:
- authoritative restart/remort transaction boundaries for leader/nonleader;
- cascade/orphan/ghost-participant races;
- strict PartyBoss parser and one-corrupt-row scheduler isolation;
- Sated + Bard Inspiration release on repair;
- final-slot join, action/timeout and terminal exact-once races;
- support ability rollout parity or truthful disabled decision;
- no PII in aggregate telemetry and no fabricated rollout/manual QA evidence;
- docs/version/release-state truthfulness.

Report blockers, important issues, missing tests and key edge cases only. Do not
edit, commit, push, merge or deploy.
```

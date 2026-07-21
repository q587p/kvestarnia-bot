# Raid chat deep read-only review

```text
Use $kvestarnia-second-codex-readonly.

PR: #179
Base: main
Review mode: deep
Task doc: docs/tasks/0.3.15-raid-chat-mvp.md

READ ONLY report only. Changed files only by default; inspect direct state-machine
dependencies when needed to prove correctness.

Extra focus:
- stale render acknowledgement vs newer desired revision;
- privacy redaction vs in-flight render acknowledgement;
- same-life leave/rejoin generation and stale redaction;
- disabled/idle scheduler query cadence and retention recovery;
- exact 429, real grammY HttpError network retry, 403 send/edit/redaction and
  permanent/unclassified failure policy;
- async scheduler/gate shutdown before Prisma disconnect;
- callback acknowledgement outside the message throttle;
- migration/rollback and restart recovery;
- whether tests use real concurrency/fake timers rather than mocks that cannot
  prove the claim.

Report blockers, important issues, missing tests and key edge cases only. Do not
edit, commit, push, merge or deploy.
```

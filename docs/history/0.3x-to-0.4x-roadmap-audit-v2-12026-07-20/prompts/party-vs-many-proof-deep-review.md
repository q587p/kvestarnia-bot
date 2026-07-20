# Party vs many proof deep read-only review

```text
Use $kvestarnia-second-codex-readonly.

PR: #<PR_NUMBER>
Base: main
Review mode: deep
Task doc: docs/tasks/0.4.0-party-vs-many-proof.md

READ ONLY report only. Changed files only by default; inspect direct actor-action,
lease, timeout, parser/repair and participant-card dependencies as needed.

Extra focus:
- separate generic model vs accidental PartyBoss/FightService widening;
- strict versioned state and party/roster/target identity;
- start atomicity and partial lease cleanup;
- duplicate/last-action/action-vs-timeout CAS races;
- restart/remort/repair/orphan leases and timed-status release;
- current-turn-only queries, bounded state/recap/cards and 3x3 load proof;
- rewardless invariant and production/dev flag isolation;
- Telegram failures cannot affect combat state.

Report blockers, important issues, missing tests and key edge cases only. Do not
edit, commit, push, merge or deploy.
```

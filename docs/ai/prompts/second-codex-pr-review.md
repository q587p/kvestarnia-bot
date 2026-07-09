# Second Codex — PR Review Prompt

Use this for independent read-only review.

```text
Use $kvestarnia-second-codex-readonly.

PR: #<number>
Base: main
Review mode: short
Task doc: docs/tasks/<version>-<short-slug>.md

Extra focus:
<optional; delete if not needed>
```

Modes:
- `short` — everyday changed-files-only PR review.
- `default` — medium-risk, release-oriented, or multi-area runtime PR.
- `deep` — high-risk state, persistence, combat, raids, party sessions, routing, migrations, scheduler, economy, or balance.

Default scope:
Changed files only. Inspect direct dependencies only if needed for correctness.

Escalate with a second skill only when the PR needs it:
- `Use $kvestarnia-telegram-qa.` for full QA plans or release-critical Telegram flow changes.
- `Use $balance-review.` for balance, economy, progression, boss/raid rewards, cooldowns, or loot.
- `Use $ukrainian-rpg-content.` for substantial player-facing Ukrainian copy.
- `Use $kvestarnia-local-runtime.` for local launcher/runtime/Prisma/Windows issues.

# Kvestarnia Second Codex Review Modes

This is a reference fragment for `$kvestarnia-second-codex-readonly`.

Use a compact input block instead of pasting long review prompts:

```text
Use $kvestarnia-second-codex-readonly.

PR: #<number>
Base: main
Review mode: short
Task doc: docs/tasks/<version>-<short-slug>.md

Extra focus:
<optional; delete if not needed>
```

## Modes

- `short` — everyday changed-files-only review.
- `default` — medium-risk, release-oriented, or multi-area runtime PR.
- `deep` — high-risk state, persistence, combat, raids, party sessions, routing, migrations, scheduler, economy, or balance.

## Extra Skills

Use one main skill by default. Add another skill only when the PR materially needs it:

- `$kvestarnia-telegram-qa` for full QA plans or release-critical Telegram flow changes.
- `$balance-review` for balance, economy, progression, boss/raid rewards, cooldowns, or loot.
- `$ukrainian-rpg-content` for substantial player-facing Ukrainian copy.
- `$kvestarnia-local-runtime` for local launcher/runtime/Prisma/Windows issues.

Default scope remains: changed files only; inspect direct dependencies only if needed for correctness.

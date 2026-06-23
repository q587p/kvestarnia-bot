# Version Task Docs

Every future versioned implementation PR should have one short English task doc in this directory.

File name:

```text
docs/tasks/<version>-<short-slug>.md
```

Examples:

```text
docs/tasks/0.1.10-shynok-beer-exchange.md
docs/tasks/0.2.0-duel-invite-mvp.md
```

## Why

Task docs keep Codex prompts short and preserve decisions between threads.
The prompt should point to a task doc instead of repeating a long rule block.

## Main Codex prompt

Use `docs/ai/prompts/main-new-version-thread.md`.

## Second Codex prompt

Use `docs/ai/prompts/second-codex-pr-review.md`.
Second Codex reviews changed files only by default.

## Required sections for new task docs

- Goal
- Scope
- Non-goals
- Acceptance criteria
- Relevant files / search terms
- Focused tests
- Manual Telegram QA
- Release surfaces

Keep each task doc short. Link to canonical docs instead of copying long sections.

## Existing records

The shipped `0.0.x` and `0.1.x` versions have compact historical records generated from `CHANGELOG.md`.
They are not active tasks unless a human explicitly reopens a follow-up.

- [0.1.20-authored-quest-resolutions.md](0.1.20-authored-quest-resolutions.md) — authored quest methods for Adventure Choice, starter shawarma and cellar mouse.
- [0.1.21-combat-action-foundation.md](0.1.21-combat-action-foundation.md) — shared combat ability foundation, defend, unavailable-skill no-op and short solo/training turn deadlines.
- [0.1.22-monster-abilities-ai.md](0.1.22-monster-abilities-ai.md) — typed monster ability catalogs, frozen monster loadouts and pure monster AI.
- [0.1.23-encounter-preview-memory.md](0.1.23-encounter-preview-memory.md) — server-owned Nyz passage preview memory and ordinary fight anti-repeat selection.
- [0.1.24-shynok-drinks-and-mantok-sales.md](0.1.24-shynok-drinks-and-mantok-sales.md) — queued Shynok drinks, opt-in social beer rounds and safe manatka sales.
- [phase2-regression-smoke.md](phase2-regression-smoke.md) — read-only/manual regression gate before Phase 2 MVP closeout.
- [0.1.25-phase2-mvp-closeout.md](0.1.25-phase2-mvp-closeout.md) — docs/release/smoke closeout task for the `0.1.x` Phase 2 MVP line.
- [future-deploy-notification-visti.md](future-deploy-notification-visti.md) — future copy polish for deploy notifications as `вісти` with the first release paragraph.
- [0.2.0-safe-gifting-mvp.md](0.2.0-safe-gifting-mvp.md) — draft first `0.2.x` task for exactly-one-unit safe gifting after closeout.
- [0.2.x-mantok-equipment-rebalance.md](0.2.x-mantok-equipment-rebalance.md) — draft `0.2.x` task for expanded manatka equipment slots and a global item/equipment rebalance.

## Closeout

After a versioned task is done:

1. Use `$kvestarnia-release-checklist` if release-oriented.
2. Produce a compact handoff.
3. Start the next versioned task in a new Codex thread.

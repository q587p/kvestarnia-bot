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
If the task substantially changes player-facing Ukrainian copy, add `$ukrainian-rpg-content` rather than pasting the full style guide.

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

Active task:

- [0.2.10-active-cosmetic-title-selection.md](0.2.10-active-cosmetic-title-selection.md) — active cosmetic title browsing, selection, clearing and `/hero` display.

- [0.1.20-authored-quest-resolutions.md](0.1.20-authored-quest-resolutions.md) — authored quest methods for Adventure Choice, starter shawarma and cellar mouse.
- [0.1.21-combat-action-foundation.md](0.1.21-combat-action-foundation.md) — shared combat ability foundation, defend, unavailable-skill no-op and short solo/training turn deadlines.
- [0.1.22-monster-abilities-ai.md](0.1.22-monster-abilities-ai.md) — typed monster ability catalogs, frozen monster loadouts and pure monster AI.
- [0.1.23-encounter-preview-memory.md](0.1.23-encounter-preview-memory.md) — server-owned Nyz passage preview memory and ordinary fight anti-repeat selection.
- [0.1.24-shynok-drinks-and-mantok-sales.md](0.1.24-shynok-drinks-and-mantok-sales.md) — queued Shynok drinks, opt-in social beer rounds and safe manatka sales.
- [phase2-regression-smoke.md](phase2-regression-smoke.md) — read-only/manual regression gate before Phase 2 MVP closeout.
- [0.1.25-phase2-mvp-closeout.md](0.1.25-phase2-mvp-closeout.md) — docs/release/smoke closeout task for the `0.1.x` Phase 2 MVP line.
- [future-deploy-notification-visti.md](future-deploy-notification-visti.md) — future copy polish for deploy notifications as `вісти` with the first release paragraph.
- [0.2.0-safe-gifting-mvp.md](0.2.0-safe-gifting-mvp.md) — draft first `0.2.x` task for exactly-one-unit safe gifting after closeout.
- [0.2.1-multi-enemy-foundation.md](0.2.1-multi-enemy-foundation.md) — task for backward-compatible two-enemy combat state and dev-only two-enemy exposure.
- [0.2.2-architecture-stabilization.md](0.2.2-architecture-stabilization.md) — shipped behavior-preserving architecture stabilization before threat escalation.
- [0.2.3-threat-escalation.md](0.2.3-threat-escalation.md) — ordinary three-win threat escalation MVP using the existing two-enemy foundation.
- [0.2.4-item-tags-one-use-manatka.md](0.2.4-item-tags-one-use-manatka.md) — shipped narrow item tag contract, one-use bandage flow and Єгер bandage supply.
- [0.2.5-bard-performance-mvp.md](0.2.5-bard-performance-mvp.md) — shipped narrow Shynok Bard Performance slice with capped house gold and voluntary audience responses.
- [0.2.6-passage-search-mvp.md](0.2.6-passage-search-mvp.md) — shipped timed search for `Спуск до Низу` and first-tier Nyz passages.
- [0.2.7-player-abilities-mvp.md](0.2.7-player-abilities-mvp.md) — player class/race ability catalogs, race action buttons and group-ready solo combat fallback.
- [0.2.8-achievements-cosmetic-titles.md](0.2.8-achievements-cosmetic-titles.md) — rewardless achievement browsing, expanded seed unlock hooks, filters, recalculation and persisted cosmetic title grant records.
- [0.2.9-daily-korchma-rounds.md](0.2.9-daily-korchma-rounds.md) — shipped Daily `Корчмарський обхід` route backed by [../DAILY_KORCHMA_ROUNDS.md](../DAILY_KORCHMA_ROUNDS.md).
- [0.2.x-combat-application-decomposition.md](0.2.x-combat-application-decomposition.md) — conditional follow-up if `FightService` needs narrower combat workflow ownership before threat escalation.
- [0.2.x-raid-party-session-foundation.md](0.2.x-raid-party-session-foundation.md) — draft future prerequisite for party sessions; docs-only until explicitly activated.
- [0.2.x-party-vs-one-boss.md](0.2.x-party-vs-one-boss.md) — draft future bridge from temporary party sessions to real raids; docs-only until explicitly activated.
- [0.2.x-senior-barrel-brother-group-raid.md](0.2.x-senior-barrel-brother-group-raid.md) — draft future Senior Barrel Brother group raid task after temporary party and one-boss proof; docs-only until explicitly activated.
- [0.2.x-postal-mantok-delivery.md](0.2.x-postal-mantok-delivery.md) — draft future paid postal/courier delivery for sending one eligible manatka to a known non-nearby recipient.
- [0.2.x-shynok-resale-and-korchmar-recycling.md](0.2.x-shynok-resale-and-korchmar-recycling.md) — draft future Shynok resale and Korchmar recycling loop for sold manatky.
- [0.2.x-daily-korchma-rounds.md](0.2.x-daily-korchma-rounds.md) — archived draft for the shipped [0.2.9-daily-korchma-rounds.md](0.2.9-daily-korchma-rounds.md) route.
- [0.2.x-mantok-equipment-rebalance.md](0.2.x-mantok-equipment-rebalance.md) — draft `0.2.x` task for expanded manatka equipment slots and a global item/equipment rebalance.
- [0.2.x-bard-performance-mvp.md](0.2.x-bard-performance-mvp.md) — archived draft that was activated as `0.2.5`; future non-combat XP needs a separate task.

## Closeout

After a versioned task is done:

1. Use `$kvestarnia-release-checklist` if release-oriented.
2. Produce a compact handoff.
3. Start the next versioned task in a new Codex thread.

After `0.1.25`, do not keep adding ordinary feature slices to `0.1.x`; use `0.2.0-safe-gifting-mvp.md` unless an emergency hotfix explicitly reopens the line.

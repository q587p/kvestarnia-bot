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

Recently shipped:

- [0.2.30-mantok-ability-grants-foundation.md](0.2.30-mantok-ability-grants-foundation.md) — Mantok ability-grant foundation with persistent PvE gear actions, compact callbacks, visible bleed and additive high-level loot.
- [0.2.31-polish-bugfixes.md](0.2.31-polish-bugfixes.md) — narrow Mantok Ability Grants post-merge polish for first-use gear-action notification delivery in Big Barrel Brother raids and turn-based duels, plus silent callback, Barrel quest-marker, generated-price, remort PvE pressure, same-location quest-marker and stale table-game replay hardening.

Near-term next tasks:

- [0.2.32-charkokovalnia-item-upgrades.md](0.2.32-charkokovalnia-item-upgrades.md) — Charkokovalnia / Item Upgrades MVP with concrete `+N` item ids and replay-safe upgrade attempts.
- [0.2.33-turn-based-duel-tournaments-rewards.md](0.2.33-turn-based-duel-tournaments-rewards.md) — capped Korchma-funded rewards for resolved turn-based duel tournament periods.
- [0.2.x-turn-based-duel-journal.md](0.2.x-turn-based-duel-journal.md) — draft follow-up for a paginated `📜 Журнал дуелі` over resolved turn-based duel rounds without leaking unresolved private choices.
- [0.2.34-rogue-reputation-location-risk.md](0.2.34-rogue-reputation-location-risk.md) — private durable Rogue reputation and location-exposure consequences without public shame or item theft.
- [0.2.35-quest-overview-route.md](0.2.35-quest-overview-route.md) — compact `🗺️ Квести` overview/journal route without a new quest engine or rewards.

- [0.1.20-authored-quest-resolutions.md](0.1.20-authored-quest-resolutions.md) — authored quest methods for Adventure Choice, starter shawarma and cellar mouse.
- [0.1.21-combat-action-foundation.md](0.1.21-combat-action-foundation.md) — shared combat ability foundation, defend, unavailable-skill no-op and short solo/training turn deadlines.
- [0.1.22-monster-abilities-ai.md](0.1.22-monster-abilities-ai.md) — typed monster ability catalogs, frozen monster loadouts and pure monster AI.
- [0.1.23-encounter-preview-memory.md](0.1.23-encounter-preview-memory.md) — server-owned Nyz passage preview memory and ordinary fight anti-repeat selection.
- [0.1.24-shynok-drinks-and-mantok-sales.md](0.1.24-shynok-drinks-and-mantok-sales.md) — queued Shynok drinks, opt-in social beer rounds and safe manatka sales.
- [phase2-regression-smoke.md](phase2-regression-smoke.md) — read-only/manual regression gate before Phase 2 MVP closeout.
- [0.1.25-phase2-mvp-closeout.md](0.1.25-phase2-mvp-closeout.md) — docs/release/smoke closeout task for the `0.1.x` Phase 2 MVP line.
- [future-deploy-notification-visti.md](future-deploy-notification-visti.md) — shipped `0.2.19` copy polish for deploy notifications as `вісти` with the first release paragraph.
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
- [0.2.10-active-cosmetic-title-selection.md](0.2.10-active-cosmetic-title-selection.md) — shipped active cosmetic title browsing, selection, clearing and `/hero` display.
- [0.2.11-combat-balance-monster-signatures.md](0.2.11-combat-balance-monster-signatures.md) — shipped combat balance proof and presentation-only monster signature readability.
- [0.2.12-two-enemy-threat-simulation-outliers.md](0.2.12-two-enemy-threat-simulation-outliers.md) — shipped two-enemy threat simulation, backup pressure guard and targeted outlier tuning.
- [0.2.13-postal-mantok-delivery.md](0.2.13-postal-mantok-delivery.md) — shipped paid postal/courier delivery for bounded packages of eligible manatky to known recipients.
- [0.2.14-adventure-quest-readability-and-local-failure.md](0.2.14-adventure-quest-readability-and-local-failure.md) — selected Adventure Choice readability and narrow authored local no-reward failure.
- [0.2.15-party-session-foundation.md](0.2.15-party-session-foundation.md) — dev/flagged temporary party recruiting/session foundation with opaque links, nearby private invites and replay-safe leave/cancel/expiry.
- [0.2.16-party-vs-one-boss.md](0.2.16-party-vs-one-boss.md) — dev/flagged one-party one-boss proof with durable rounds, active combat leases, timeout defend fallback and no rewards.
- [0.2.17-big-barrel-brother-raid-mvp.md](0.2.17-big-barrel-brother-raid-mvp.md) — feature-flagged level 8+ Big Barrel Brother raid route, Big boss tuning, canonical Barrel success settlement and no runtime round cap.
- [0.2.18-lore-board-mvp.md](0.2.18-lore-board-mvp.md) — static `📖 Перекази` section on `Дошка корчми`, backed by typed lore entries and canonical reference validation.
- [0.2.19-monster-trophies-yeger-gates.md](0.2.19-monster-trophies-yeger-gates.md) — concrete trophy coverage for every active monster and locked Yeger bandage supplies until the first Yeger board is completed.
- [0.2.20-latest-events-feed.md](0.2.20-latest-events-feed.md) — lightweight `📜 Хроніки Квестарні` public activity feed for recent durable milestones.
- [0.2.21-tavern-social-games.md](0.2.21-tavern-social-games.md) — flagged Shynok table-games foundation with Tavlei, Kosti and table-game leaderboard/achievements.
- [0.2.22-dense-bandage-field-kit.md](0.2.22-dense-bandage-field-kit.md) — craftable `Щільний бинт` and `Польова аптечка` after the second Yeger board, level/luck craft savings, improved Ranger/Yeger medical supplies, narrow solo-combat item restrictions and rewardless first craft/use achievements.
- [0.2.23-mantok-equipment-slot-foundation.md](0.2.23-mantok-equipment-slot-foundation.md) — canonical manatka equipment slot foundation with explicit slot metadata, expanded inventory/equipment filters, legacy `armor` to `chest` compatibility and generated tool gear routed to the new `tool` slot.
- [0.2.24-mantok-balance-audit.md](0.2.24-mantok-balance-audit.md) — Mantok balance audit after the slot foundation, generated Loot Expansion v1 slot/effect tuning, cheap authored trophy-power guard, hand-rule tags and focused combat/equipment regressions.
- [0.2.25-class-noncombat-priest-rogue.md](0.2.25-class-noncombat-priest-rogue.md) — shipped class noncombat Priest/Rogue MVP with direct Priest heal/blessing, bounded same-location Rogue pickpocket, private notifications, rewardless achievements and Lore Board updates.
- [0.2.26-mantok-equipment-slot-coverage.md](0.2.26-mantok-equipment-slot-coverage.md) — authored mantok equipment-slot coverage, identity equip gates and generated logical slot/tag materialization without touching shops, rewards, sinks, Prisma schema or dice/Shynok work.
- [0.2.27-dice-poker-rework.md](0.2.27-dice-poker-rework.md) — replacement for confusing `🎲 Кості` with quick dice poker, 13-turn scorecard poker, compact rules, legacy Kosti refund handling and replay-safe bounded stake settlement.
- [0.2.28-mantok-set-synergies-foundation.md](0.2.28-mantok-set-synergies-foundation.md) — shipped Mantok set-synergy foundation with 13 stat-only set families, live set progress and additive high-level monster loot.
- [0.2.29-barrel-beer-tutorial.md](0.2.29-barrel-beer-tutorial.md) — level 2-5 Barrel/beer tutorial quest using existing quest, Barrel raid, Shynok beer and item systems.
- [0.2.x-combat-application-decomposition.md](0.2.x-combat-application-decomposition.md) — conditional follow-up if `FightService` needs narrower combat workflow ownership before threat escalation.
- [0.2.x-dice-poker-rework.md](0.2.x-dice-poker-rework.md) — archived draft activated as [0.2.27-dice-poker-rework.md](0.2.27-dice-poker-rework.md).
- [0.2.x-raid-party-session-foundation.md](0.2.x-raid-party-session-foundation.md) — draft future prerequisite for party sessions; docs-only until explicitly activated.
- [0.2.x-party-vs-one-boss.md](0.2.x-party-vs-one-boss.md) — draft future bridge from temporary party sessions to real raids; docs-only until explicitly activated.
- [0.2.x-big-barrel-brother-group-raid.md](0.2.x-big-barrel-brother-group-raid.md) — draft future Big Barrel Brother group raid task after temporary party and one-boss proof; docs-only until explicitly activated.
- [0.2.x-kharakternyk-ward-signs.md](0.2.x-kharakternyk-ward-signs.md) — draft future `class.kharakternyk` Big Barrel ward-sign support slice; docs-only until explicitly activated.
- [0.2.x-old-altar-blessings-mvp.md](0.2.x-old-altar-blessings-mvp.md) — draft future `🪨 Старий жертовник` MVP from the Korchma Yard: gold offerings create `Благовоління`, level 3+ Priests spend mana/favor on one short selected-stat blessing, and direct Priest aid remains unchanged.
- [0.2.x-old-altar-manatka-offerings.md](0.2.x-old-altar-manatka-offerings.md) — draft follow-up for safe irreversible manatka offerings at the Old Altar; docs-only and explicitly separate from the gold-only MVP.
- [0.2.x-old-root-grove-location.md](0.2.x-old-root-grove-location.md) — optional future location split if the altar needs its own `Тихий Корінь` / root-grove presence after playtest.
- [0.2.x-lore-board.md](0.2.x-lore-board.md) — draft future `Дошка корчми` / news-corner `📖 Перекази` section backed by current Kvestarnia canon seed content; docs-only until explicitly activated.
- [0.2.x-dense-bandage-field-kit.md](0.2.x-dense-bandage-field-kit.md) — archived draft activated as [0.2.22-dense-bandage-field-kit.md](0.2.22-dense-bandage-field-kit.md).
- [0.2.x-shynok-resale-and-korchmar-recycling.md](0.2.x-shynok-resale-and-korchmar-recycling.md) — draft future Shynok resale and Korchmar recycling loop for sold manatky.
- [0.2.x-daily-korchma-rounds.md](0.2.x-daily-korchma-rounds.md) — archived draft for the shipped [0.2.9-daily-korchma-rounds.md](0.2.9-daily-korchma-rounds.md) route.
- [0.2.x-mantok-equipment-rebalance.md](0.2.x-mantok-equipment-rebalance.md) — draft `0.2.x` task for expanded manatka equipment slots and a global item/equipment rebalance.
- [0.2.x-consumable-manatka-uses.md](0.2.x-consumable-manatka-uses.md) — draft follow-up for giving coffee/tea/beer-style consumable manatky real one-use actions, take-away purchase, and `Разові` visibility without implementing it in `0.2.31`.
- [0.2.x-bard-performance-mvp.md](0.2.x-bard-performance-mvp.md) — archived draft that was activated as `0.2.5`; future non-combat XP needs a separate task.

## Closeout

After a versioned task is done:

1. Use `$kvestarnia-release-checklist` if release-oriented.
2. Produce a compact handoff.
3. Start the next versioned task in a new Codex thread.

After `0.1.25`, do not keep adding ordinary feature slices to `0.1.x`; use `0.2.0-safe-gifting-mvp.md` unless an emergency hotfix explicitly reopens the line.

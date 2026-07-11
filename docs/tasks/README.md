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

## Planning packages

The imported [`0.3.x Alpha Roadmap and Canon audit`](../alpha-roadmap-and-canon/README.md) contains a proposed readiness board, inactive task drafts, checklists and prompts. Importing that snapshot does not activate its tasks; the current versioned task docs in this directory remain the implementation contracts.

## Existing records

The shipped `0.0.x` and `0.1.x` versions have compact historical records generated from `CHANGELOG.md`.
They are not active tasks unless a human explicitly reopens a follow-up.

Recently shipped:

- [0.2.30-mantok-ability-grants-foundation.md](0.2.30-mantok-ability-grants-foundation.md) — Mantok ability-grant foundation with persistent PvE gear actions, compact callbacks, visible bleed and additive high-level loot.
- [0.2.31-polish-bugfixes.md](0.2.31-polish-bugfixes.md) — narrow Mantok Ability Grants post-merge polish for first-use gear-action notification delivery in Big Barrel Brother raids and turn-based duels, plus silent callback, Barrel/Yeger quest-marker, generated-price, remort PvE pressure, same-location quest-marker, stale table-game replay, inventory sort and item-detail replacement hardening.
- [0.2.32-polish-rollup.md](0.2.32-polish-rollup.md) — consolidated combat and Korchma polish rollup for repeated flee chance, once-only Yeger count copy, Yeger remort pressure, Big Barrel reward cleanup, remort medical-craft unlock and future daily-round variant tracking.
- [0.3.0-charkokovalnia-item-upgrades.md](0.3.0-charkokovalnia-item-upgrades.md) — Charkokovalnia / Item Upgrades MVP from the Korchma yard Mage, with a field-kit unlock, concrete `+N` item ids, replay-safe upgrade attempts, equipped-row alignment, bounded pity/donor gates, weak/strong magic attunement timers, very rare generated `+N` drops, rare fight Iskrokamin replacement rewards, successful-upgrade Chronicles rows and local `Іскрокамінь`/attunement QA support.
- [0.3.1-turn-based-duel-tournaments-rewards.md](0.3.1-turn-based-duel-tournaments-rewards.md) — fixed daily/weekly/monthly turn-based duel tournaments with rules help, repeated-opponent downweighting, replay-safe Korchma-funded top-three prize chests, bounded unclaimed reward lookback, Holocene period display, combat-style turn-based duel cards, stored duel journals and Chronicles recognition for claims only.
- [0.3.2-kharakternyk-ward-signs.md](0.3.2-kharakternyk-ward-signs.md) — Kharakternyk Big Barrel Brother ward signs with replay-safe mana placement/support, count-only lobby support, final-roster freezing and one-time broad-hit mitigation.
- [0.3.3-quest-variety-risk-refresh.md](0.3.3-quest-variety-risk-refresh.md) — Adventure Choice risk-band readability, Daily Korchma Round scene expansion, and starter cellar mouse authored reply variety without new rewards, schema, combat or routes.
- [0.3.4-quest-overview-route.md](0.3.4-quest-overview-route.md) — compact read-only `🗺️ Квести` overview route over existing quest surfaces, keeping `/quest` and `Стіл зі справами` as the full Quest Hub.

Near-term next tasks:

- [0.3.x-bard-big-barrel-raid-support.md](0.3.x-bard-big-barrel-raid-support.md) — future narrow Bard Big Barrel Brother support/disruption action, added from the existing raid prep hint; includes the audit of other role promises that still need separate follow-up tasks.
- [0.2.x-player-monster-help.md](0.2.x-player-monster-help.md) — future opt-in help call from an active monster fight, capped at one owner plus one or two nearby helpers and kept separate from the Big Barrel raid.

Post-`0.3.0`, feature work continues on the `0.3.x` line. Any remaining draft `0.2.x` filenames below are placeholders only until a human explicitly retargets them.

- [0.3.5-performance-p0-hardening.md](0.3.5-performance-p0-hardening.md) — next P0 performance hardening task from the static audit: instrumentation, bounded `DailyAction` hot-path queries, Yeger bandage fast path, and Daily Korchma Round step-row narrowing before inviting more players.
- [0.3.6-bureaucramancer-personal-protocol-13b.md](0.3.6-bureaucramancer-personal-protocol-13b.md) — shipped narrow Bureaucramancer `📄 Форма 13-А` Big Barrel recruiting action that opens `Протокол 13-З`: one protocol per session, count-only signatures, and per-signer first personal boss attack protection.
- [0.3.x-bureaucramancer-personal-protocol.md](0.3.x-bureaucramancer-personal-protocol.md) — draft narrow Bureaucramancer personal-protocol raid-prep slice for Big Barrel Brother recruiting: one protocol per session, count-only signatures, and per-signer first personal boss attack protection without broad-attack mitigation.
- [0.3.x-warrior-raid-taunt.md](0.3.x-warrior-raid-taunt.md) — draft narrow Warrior Big Barrel Brother raid taunt slice: a living joined Warrior can spend their queued raid action to redirect personal and broad boss attacks into themselves for exactly three boss responses, with a five-turn cooldown and no generic threat system.
- [0.3.x-rogue-reputation-location-risk.md](0.3.x-rogue-reputation-location-risk.md) — private durable Rogue reputation and location-exposure consequences without public shame or item theft.
- [0.2.x-nearby-greeting-buff.md](0.2.x-nearby-greeting-buff.md) — draft `Хто поруч` social greeting that can give a tiny bounded target support bonus, starting from a 93-minute same actor-target repeat wait.

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
- [0.2.x-three-plus-enemy-combat.md](0.2.x-three-plus-enemy-combat.md) — priority future expansion from the shipped one-/two-enemy foundation to bounded 3+ enemy solo encounters, with explicit target selection and one encounter reward.
- [0.2.x-monster-escape.md](0.2.x-monster-escape.md) — future bounded PvE monster-escape attempts with explicit terminal reasons, multi-enemy continuation and no automatic victory reward.
- [0.2.x-monster-counter-matchups.md](0.2.x-monster-counter-matchups.md) — future soft race/class and action-family monster counters, including anti-magic/anti-technical profiles and bounded alternative paths.
- [0.2.x-cellar-napkin-exchange.md](0.2.x-cellar-napkin-exchange.md) — future cellar-only exchange of a configured napkin bundle, initially proposed as three mouse-diplomacy napkins for one authored cheese result.
- [0.2.2-architecture-stabilization.md](0.2.2-architecture-stabilization.md) — shipped behavior-preserving architecture stabilization before threat escalation.
- [0.2.3-threat-escalation.md](0.2.3-threat-escalation.md) — ordinary three-win threat escalation MVP using the existing two-enemy foundation.
- [0.2.4-item-tags-one-use-manatka.md](0.2.4-item-tags-one-use-manatka.md) — shipped narrow item tag contract, one-use bandage flow and Єгер bandage supply.
- [0.2.5-bard-performance-mvp.md](0.2.5-bard-performance-mvp.md) — shipped narrow Shynok Bard Performance slice with capped house gold and voluntary audience responses.
- [0.2.6-passage-search-mvp.md](0.2.6-passage-search-mvp.md) — shipped timed search for `Спуск до Низу` and first-tier Nyz passages.
- [0.2.7-player-abilities-mvp.md](0.2.7-player-abilities-mvp.md) — player class/race ability catalogs, race action buttons and group-ready solo combat fallback.
- [0.2.8-achievements-cosmetic-titles.md](0.2.8-achievements-cosmetic-titles.md) — rewardless achievement browsing, expanded seed unlock hooks, filters, recalculation and persisted cosmetic title grant records.
- [0.2.9-daily-korchma-rounds.md](0.2.9-daily-korchma-rounds.md) — shipped Daily `Корчмарський обхід` route backed by [../design/daily-korchma-rounds.md](../design/daily-korchma-rounds.md).
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
- [0.2.x-raid-in-game-chat.md](0.2.x-raid-in-game-chat.md) — draft future in-game raid chat for joined participants, scoped to one raid and guarded against non-participant reads, stale writes and reward abuse.
- [0.3.2-kharakternyk-ward-signs.md](0.3.2-kharakternyk-ward-signs.md) — activated from the former `0.2.x` Kharakternyk Big Barrel ward-sign draft.
- [0.2.x-old-altar-blessings-mvp.md](0.2.x-old-altar-blessings-mvp.md) — draft future `🪨 Старий жертовник` MVP from the Korchma Yard: gold offerings create `Благовоління`, level 3+ Priests spend mana/favor on one short selected-stat blessing, and direct Priest aid remains unchanged.
- [0.2.x-old-altar-manatka-offerings.md](0.2.x-old-altar-manatka-offerings.md) — draft follow-up for safe irreversible manatka offerings at the Old Altar; docs-only and explicitly separate from the gold-only MVP.
- [0.2.x-old-root-grove-location.md](0.2.x-old-root-grove-location.md) — optional future location split if the altar needs its own `Тихий Корінь` / root-grove presence after playtest.
- [0.2.x-lore-board.md](0.2.x-lore-board.md) — draft future `Дошка корчми` / news-corner `📖 Перекази` section backed by current Kvestarnia canon seed content; docs-only until explicitly activated.
- [future-durable-resource-recovery-notifications.md](future-durable-resource-recovery-notifications.md) — queued follow-up for server-initiated full-life recovery notifications that are not triggered by pressing `/hero`, `/fight` or other buttons.
- [0.2.x-dense-bandage-field-kit.md](0.2.x-dense-bandage-field-kit.md) — archived draft activated as [0.2.22-dense-bandage-field-kit.md](0.2.22-dense-bandage-field-kit.md).
- [0.2.x-shynok-resale-and-korchmar-recycling.md](0.2.x-shynok-resale-and-korchmar-recycling.md) — draft future Shynok resale and Korchmar recycling loop for sold manatky.
- [0.2.x-daily-korchma-rounds.md](0.2.x-daily-korchma-rounds.md) — archived draft for the shipped [0.2.9-daily-korchma-rounds.md](0.2.9-daily-korchma-rounds.md) route.
- [0.2.x-mantok-equipment-rebalance.md](0.2.x-mantok-equipment-rebalance.md) — draft `0.2.x` task for expanded manatka equipment slots and a global item/equipment rebalance.
- [0.2.x-consumable-manatka-uses.md](0.2.x-consumable-manatka-uses.md) — draft follow-up for coffee/tea/beer-style consumable manatky, immediate versus take-away purchase, reusable empty bottles and future Mage mana refills, without implementing it in `0.2.31`.
- [0.2.x-bard-performance-mvp.md](0.2.x-bard-performance-mvp.md) — archived draft that was activated as `0.2.5`; future non-combat XP needs a separate task.

## Closeout

After a versioned task is done:

1. Use `$kvestarnia-release-checklist` if release-oriented.
2. Produce a compact handoff.
3. Start the next versioned task in a new Codex thread.

After `0.1.25`, do not keep adding ordinary feature slices to `0.1.x`; use `0.2.0-safe-gifting-mvp.md` unless an emergency hotfix explicitly reopens the line.

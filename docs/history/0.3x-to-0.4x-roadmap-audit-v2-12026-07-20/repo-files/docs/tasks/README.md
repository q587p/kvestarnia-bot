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
- [0.2.31-polish-bugfixes.md](0.2.31-polish-bugfixes.md) — narrow Mantok Ability Grants post-merge polish for first-use gear-action notification delivery in Big Barrel Brother raids and turn-based duels, plus silent callback, Barrel/Yeger quest-marker, generated-price, remort PvE pressure, same-location quest-marker, stale table-game replay, inventory sort and item-detail replacement hardening.
- [0.2.32-polish-rollup.md](0.2.32-polish-rollup.md) — consolidated combat and Korchma polish rollup for repeated flee chance, once-only Yeger count copy, Yeger remort pressure, Big Barrel reward cleanup, remort medical-craft unlock and future daily-round variant tracking.
- [0.3.0-charkokovalnia-item-upgrades.md](0.3.0-charkokovalnia-item-upgrades.md) — Charkokovalnia / Item Upgrades MVP from the Korchma yard Mage, with a field-kit unlock, concrete `+N` item ids, replay-safe upgrade attempts, equipped-row alignment, bounded pity/donor gates, weak/strong magic attunement timers, very rare generated `+N` drops, rare fight Iskrokamin replacement rewards, successful-upgrade Chronicles rows and local `Іскрокамінь`/attunement QA support.
- [0.3.1-turn-based-duel-tournaments-rewards.md](0.3.1-turn-based-duel-tournaments-rewards.md) — fixed daily/weekly/monthly turn-based duel tournaments with rules help, repeated-opponent downweighting, replay-safe Korchma-funded top-three prize chests, bounded unclaimed reward lookback, Holocene period display, combat-style turn-based duel cards, stored duel journals and Chronicles recognition for claims only.
- [0.3.2-kharakternyk-ward-signs.md](0.3.2-kharakternyk-ward-signs.md) — Kharakternyk Big Barrel Brother ward signs with replay-safe mana placement/support, count-only lobby support, final-roster freezing and one-time broad-hit mitigation.
- [0.3.3-quest-variety-risk-refresh.md](0.3.3-quest-variety-risk-refresh.md) — Adventure Choice risk-band readability, Daily Korchma Round scene expansion, and starter cellar mouse authored reply variety without new rewards, schema, combat or routes.
- [0.3.4-quest-overview-route.md](0.3.4-quest-overview-route.md) — compact read-only `🗺️ Квести` overview route over existing quest surfaces, keeping `/quest` and `Стіл зі справами` as the full Quest Hub.
- [0.3.5-performance-p0-hardening.md](0.3.5-performance-p0-hardening.md) — shipped performance instrumentation and bounded DailyAction/Yeger/Korchma hot paths without player-facing balance changes.

## Active release candidate and planned sequence

`0.3.x` now has a closeout cutline. Do not activate an old `0.2.x-*` draft
verbatim. After the corrected raid-chat release candidate, complete one risk-led
closeout and start generic party-vs-many work on `0.4.x`.

- [0.3.6-bureaucramancer-personal-protocol-13b.md](0.3.6-bureaucramancer-personal-protocol-13b.md) — shipped Bureaucramancer `📄 Форма 13-А` Big Barrel recruiting action that opens `Протокол 13-З`; merge is proven by PR #158, while deployment and refreshed full manual QA remain separately unproven.
- [archive/0.3.x-bureaucramancer-personal-protocol.md](archive/0.3.x-bureaucramancer-personal-protocol.md) — superseded planning draft retained for history; do not implement.
- [0.3.7-warrior-raid-taunt.md](0.3.7-warrior-raid-taunt.md) — shipped by PR #162: the narrow Warrior Big Barrel Brother raid taunt slice plus its boss-first recruiting-card delivery repair. Any remaining targeted delivery QA belongs to 0.3.7 history rather than the 0.3.8 runtime scope.
- [0.3.8-measured-runtime-stability.md](0.3.8-measured-runtime-stability.md) — measured runtime follow-up from the sanitized `9b00adc` Render slow-tail window: privacy-safe terminal performance telemetry, deploy attribution and truthful database/Telegram polling readiness without gameplay or speculative route optimization.
- [0.3.9-quest-marker-snapshot-db-fanout-reduction.md](0.3.9-quest-marker-snapshot-db-fanout-reduction.md) — measured `main-menu.quest-markers` follow-up that groups Adventure and Fight marker reads, reduces primary service-source fan-out from ten to eight, and adds bounded slowest-source attribution without changing player-visible quest behavior.
- [0.3.10-fighting-corner-onboarding-quest.md](0.3.10-fighting-corner-onboarding-quest.md) — implemented once-per-remort-life level 3+ Fighting Corner onboarding quest covering Doppelganger training, quick duels and turn-based duels before a replay-safe Quest Table claim; production availability remains off by default pending rollout verification.
- [0.3.11-fight-turn-daily-korchma-read-path-reduction.md](0.3.11-fight-turn-daily-korchma-read-path-reduction.md) — implemented evidence-driven reduction of common-path Yeger reads on persistent Fight callbacks and the repeated full Fight overview inside Daily Korchma main-menu markers, with bounded attribution and no gameplay change.
- [0.3.12-varenyk-mancer-sated-support.md](0.3.12-varenyk-mancer-sated-support.md) — implemented level 3+ Varenyk-mancer self/nearby feeding with server-owned preview proof, automatic affordable rank selection, schema-free `😋 Ситий` lazy and stored-combat sustain, achievements and local QA reset; manual Telegram QA remains pending.
- [0.3.13-bugfix-release.md](0.3.13-bugfix-release.md) — patch-first fixes for Bard and quest-fight location preservation, complete duel quest progress, level/remort-aware quest encounters, Doppelganger block quotes and explicit barrel-beer instructions.
- [0.3.14-bard-inspiration-and-raid-lament.md](0.3.14-bard-inspiration-and-raid-lament.md) — Bard performances grant hybrid-duration Inspiration, while the existing Big Barrel surface lets one Bard commit a replay-safe Lament when its music slot is free.
- [0.3.x-test-suite-runtime-p0.md](0.3.x-test-suite-runtime-p0.md) — internal maintenance that removes measured content/date hot spots, bounds integration-file parallelism at two workers, and makes local/CI validation use the same named phases without reducing test coverage.
- [0.3.15-raid-chat-mvp.md](0.3.15-raid-chat-mvp.md) — release candidate; head `e223073a` hardened delivery CAS and same-life rejoin plus part of Telegram failure classification, while unconditional idle polling, non-draining stop, throttled callback acknowledgement and 403/real-network classification gaps still block closeout; manual Telegram QA remains required.
- [0.3.16-closed-alpha-closeout.md](0.3.16-closed-alpha-closeout.md) — proposed final `0.3.x` lifecycle/repair/race/rollout/docs closeout after the corrected raid chat lands.
- [0.4.0-party-vs-many-proof.md](0.4.0-party-vs-many-proof.md) — proposed default-off rewardless 2–3 player versus 2–3 enemy proof on a separate generic group-combat runtime.
- [0.4.1-group-combat-hardening.md](0.4.1-group-combat-hardening.md) — proposed ability/target/item/AI/repair/settlement hardening before rewards.
- [0.4.2-guild-foundation.md](0.4.2-guild-foundation.md) — proposed small guild identity, membership/roles/invites and ordinary party creation without bank, power or boss.
- [0.4.3-party-expedition-mvp.md](0.4.3-party-expedition-mvp.md) — proposed first production 2–3×2–3 expedition with capped per-player settlement.
- [0.4.4-guild-weekly-goal.md](0.4.4-guild-weekly-goal.md) — proposed optional weekly guild goal using ordinary party expeditions.
- [0.4.5-old-altar-blessings-mvp.md](0.4.5-old-altar-blessings-mvp.md) — proposed gold-only Old Altar MVP with an explicit canonical blessing-summary parity gate.
- [0.4.6-nearby-greeting-buff.md](0.4.6-nearby-greeting-buff.md) — proposed bounded nearby greeting after one effect/stacking decision.
- [0.4.7-shynok-food-buffs-mvp.md](0.4.7-shynok-food-buffs-mvp.md) — proposed one-active-buff Shynok food MVP; exact meal catalog/matrix must be accepted before implementation.
- [0.4.8-consumable-manatka-uses.md](0.4.8-consumable-manatka-uses.md) — proposed curated existing-stack uses; exact ids/effects and any one typed ItemUseOrder extension are an activation gate.
- [0.4.9-shynok-takeaway-consumables.md](0.4.9-shynok-takeaway-consumables.md) — proposed replay-safe take-away shelf for the accepted consumable catalog.
- [0.4.10-shynok-resale-listings.md](0.4.10-shynok-resale-listings.md) — proposed server-owned high-value resale stock, distinct from the shipped 42% player sale.
- [0.4.11-korchmar-recycling.md](0.4.11-korchmar-recycling.md) — proposed bounded neutral recycling after resale evidence and a frozen deterministic batch algorithm.
- [0.4.12-guild-cosmetic-progression.md](0.4.12-guild-cosmetic-progression.md) — proposed data-gated cosmetic guild XP/history after observed weekly participation, with no combat power or shared custody.
- [archive/0.2.x-raid-in-game-chat.md](archive/0.2.x-raid-in-game-chat.md) — superseded raid-chat planning draft retained for history; do not implement.
- [0.3.x-varenyk-mancer-sated-support.md](0.3.x-varenyk-mancer-sated-support.md) — superseded planning draft retained for history; `0.3.12` is the active implementation record.
- [0.3.x-rogue-reputation-location-risk.md](0.3.x-rogue-reputation-location-risk.md) — deferred private Rogue reputation/location-risk input; useful later, not a pre-0.4 blocker.
- [0.2.x-nearby-greeting-buff.md](0.2.x-nearby-greeting-buff.md) — source draft for `0.4.6`; its alternative effects are not a combined scope and must not be implemented verbatim.

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
- [0.2.29-barrel-beer-tutorial.md](0.2.29-barrel-beer-tutorial.md) — level 2-7 Barrel/beer tutorial quest using existing quest, Barrel raid, Shynok beer and item systems.
- [0.2.x-combat-application-decomposition.md](0.2.x-combat-application-decomposition.md) — conditional follow-up if `FightService` needs narrower combat workflow ownership before threat escalation.
- [0.2.x-dice-poker-rework.md](0.2.x-dice-poker-rework.md) — archived draft activated as [0.2.27-dice-poker-rework.md](0.2.27-dice-poker-rework.md).
- [0.2.x-raid-party-session-foundation.md](0.2.x-raid-party-session-foundation.md) — superseded by shipped `0.2.15`; archive, do not implement.
- [0.2.x-party-vs-one-boss.md](0.2.x-party-vs-one-boss.md) — superseded by shipped `0.2.16`; archive, do not implement.
- [0.2.x-big-barrel-brother-group-raid.md](0.2.x-big-barrel-brother-group-raid.md) — post-MVP Big Barrel input only; generic party-vs-many follows the `0.4.x` architecture plan.
- [0.3.2-kharakternyk-ward-signs.md](0.3.2-kharakternyk-ward-signs.md) — activated from the former `0.2.x` Kharakternyk Big Barrel ward-sign draft.
- [0.2.x-old-altar-blessings-mvp.md](0.2.x-old-altar-blessings-mvp.md) — source draft activated and hardened as `0.4.5`; use the new versioned task and its combat-summary truthfulness gate.
- [0.2.x-old-altar-manatka-offerings.md](0.2.x-old-altar-manatka-offerings.md) — draft follow-up for safe irreversible manatka offerings at the Old Altar; docs-only and explicitly separate from the gold-only MVP.
- [0.2.x-old-root-grove-location.md](0.2.x-old-root-grove-location.md) — optional future location split if the altar needs its own `Тихий Корінь` / root-grove presence after playtest.
- [0.2.x-lore-board.md](0.2.x-lore-board.md) — draft future `Дошка корчми` / news-corner `📖 Перекази` section backed by current Kvestarnia canon seed content; docs-only until explicitly activated.
- [future-durable-resource-recovery-notifications.md](future-durable-resource-recovery-notifications.md) — implemented by PR #159, but production rollout/copy/Telegram QA remains unresolved; rename/archive after the ledger decision.
- [0.2.x-dense-bandage-field-kit.md](0.2.x-dense-bandage-field-kit.md) — archived draft activated as [0.2.22-dense-bandage-field-kit.md](0.2.22-dense-bandage-field-kit.md).
- [0.2.x-shynok-resale-and-korchmar-recycling.md](0.2.x-shynok-resale-and-korchmar-recycling.md) — source draft split into `0.4.10` resale listings and `0.4.11` neutral recycling; do not combine them in one PR.
- [0.2.x-daily-korchma-rounds.md](0.2.x-daily-korchma-rounds.md) — archived draft for the shipped [0.2.9-daily-korchma-rounds.md](0.2.9-daily-korchma-rounds.md) route.
- [0.2.x-mantok-equipment-rebalance.md](0.2.x-mantok-equipment-rebalance.md) — draft `0.2.x` task for expanded manatka equipment slots and a global item/equipment rebalance.
- [0.2.x-consumable-manatka-uses.md](0.2.x-consumable-manatka-uses.md) — source draft split into `0.4.8` curated existing-item uses and `0.4.9` take-away purchases; legacy effect ids are not auto-activated.
- [0.2.x-bard-performance-mvp.md](0.2.x-bard-performance-mvp.md) — archived draft that was activated as `0.2.5`; future non-combat XP needs a separate task.

## Closeout

After a versioned task is done:

1. Use `$kvestarnia-release-checklist` if release-oriented.
2. Produce a compact handoff.
3. Start the next versioned task in a new Codex thread.

After `0.3.16`, do not keep adding ordinary thematic slices to `0.3.x`. Start
`0.4.0-party-vs-many-proof.md` in a fresh thread unless an evidence-backed
emergency hotfix explicitly reopens the line.

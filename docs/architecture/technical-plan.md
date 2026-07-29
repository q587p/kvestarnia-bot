# Technical Plan

## Архітектурна ідея
Bot-first, domain-driven, data-driven content.

Telegram — лише інтерфейс. Уся ігрова логіка має бути чистою, тестованою і незалежною від Telegram update payloads.

## Рекомендований стек
- TypeScript + Node.js.
- grammY для Telegram Bot API.
- SQLite для локального MVP; PostgreSQL лишається можливим hosted target після стабілізації схеми.
- Prisma або Drizzle для ORM/міграцій.
- Redis для rate limits, locks, cooldown cache.
- BullMQ для jobs: рейди, сезони, таймери, retries.
- Zod для конфігів і content validation.
- Vitest для тестів.
- Локальна SQLite БД через `DATABASE_URL=file:./dev.db`.

`0.1.0` is a release/docs/smoke closeout for Phase 1 plus a Phase 2 roadmap reset. It does not add a production dependency, schema migration, scheduler architecture, or new runtime gameplay system.

`0.1.1` adds Support Jar & Link Plumbing: optional `SUPPORT_JAR_URL`, secondary `/support`, `/start support_thanks`, and a public-site support block when the URL is configured. It does not add payment confirmation, donor state, schema migration, gameplay rewards, support rankings, or gated features.

`0.1.2` adds the first post-closeout presence/routing cleanup and the first runtime `/remort` slice. `location.korchma.bar` is treated as korchma interior for place gates, bot presence routing rules live in `src/bot/presence/presenceRouting.ts`, and remort state lives in narrow `character_remort_drafts` / `character_remorts` ledgers. This slice does not change public presence privacy, combat formulas, loot rewards, level cap, paid power or the broad economy.

`0.1.6` extends the problem quest wrapper without a schema migration. Stage issue/reward state uses existing `daily_actions` rows with `local_date = once`; stage progress excludes the training doppelganger monster id. `0.1.7` makes the first stage legacy-compatible: `13` can count old ordinary won solo fights until `quest.thirteen-small-problems` is claimed, while stages `23`, `42` and `93` still count only won ordinary `solo_combat_sessions` with `created_at > issue.created_at`. The first stage is also explicitly issued from Shynok and keeps the legacy reward key `quest.thirteen-small-problems` for compatibility; later stages use `quest.problem-chain.*` keys and are issued only after an explicit Shynok action after turn-in.

`0.1.9` adds `src/domain/combat/combatFlavor.ts` as a pure deterministic presentation helper. The first runtime use is `/spar` counter flavor after a doppelganger response. It does not alter `CombatState`, reward claims, problem-chain progress or schema; later monster tactics or duel cards can reuse the same intent shape only after their own scoped runtime PRs.

`0.1.10` adds the first rewardless duel invite ledger: `duel_challenges`, `/duel`, `v1:duel:*` callbacks, `/start duel_<token>` routing, generated Telegram links through optional `BOT_USERNAME`, accept/decline/cancel/expire transitions and replay-safe quick result cards. It deliberately adds no rewards, rating, wagers, item transfer, rematch automation or tournament state.

`0.1.11` adds manual duel result follow-ups on top of the same ledger: resolved cards can create a targeted rewardless rematch between the original participants or send a separate shareable result card. Rematch and share callbacks reuse stored server-side state and do not reroll results, grant rewards, notify other participants automatically or create tournament/rating state.

`0.1.18` adds `♟️ Покрокова дуель` on top of the duel ledger. It persists `DuelChallenge.mode`, adds one-to-one `duel_combat_sessions`, append-only resolved-round `duel_combat_actions`, active combat leases, optimistic round versioning and a durable 23-second timeout poller. Participant choices are queued privately in session state; participant-specific cards/action keyboards are private-chat-only, while group/shared cards render spectator-safe status. A round reveals and applies combat only after both choices arrive or the timeout fills missing choices with ordinary attacks. Turn-based duel actions use the shared pure combat primitive extracted from `src/domain/combat`, while Telegram notifications remain best-effort after committed DB state and are sent only from explicit transition results. Terminal turn-based results store small XP rewards in `result_json` and grant them once in the same transaction that resolves the parent challenge; quick duels remain XP-free. `👀 Хто поруч` also exposes a location-scoped targeted invite flow through `v1:nd:*` callbacks: the bot lists active same-location candidates, creates a normal targeted `DuelChallenge` in the selected mode and sends the target an in-game notification best-effort.

`0.1.24` adds Shynok drink and manatka-sale persistence. `CharacterDrinkState` owns the single current timed/queued drink. `KorchmaDrinkOrder` owns self-drink and round-preview tokens/results. `KorchmaRoundPurchase` remains the generosity ledger and gains nullable drink/snapshot/telemetry fields, while `KorchmaRoundRecipient` owns per-recipient opt-in offers. `KorchmaMantokSale` owns server-side sale drafts and replay summaries. Recovery remains in services/domain helpers; Telegram presenters only render committed state. Sale confirm recomputes eligibility inside the DB transaction from live inventory/equipment/reservation rows and static item content.

`0.2.4` adds item-use persistence through `item_use_orders`. A use order freezes character/remort/item identity, a content fingerprint, preview/result JSON, effect kind, reservation key and terminal timestamps. Preview creates a short-lived pending reservation only for explicit one-use items; confirm re-reads character, combat lease, inventory, equipment, content fingerprint and competing reservations in one transaction, settles passive recovery, consumes one unit, applies capped HP healing and stores the canonical result. Duplicate terminal callbacks replay the stored result. Remort cancels pending/processing use orders.

`0.2.5` adds Bard Performance as a narrow current-location non-combat event without a universal profession engine. `bard_performances` freezes performer character/remort/location, stable technique id, effective CHA/LUCK/level, rules version, grade, Shynok-only house payout, `roleActionXp: 0`, audience snapshot metadata, per-location cooldown, expiry and a nullable unique live guard for the current Bard/location. `bard_performance_reactions` owns one possible response per active same-location audience character. Shynok starts may have a zero-audience snapshot; non-Shynok starts without active same-location audience return without mutation. Start and response mutations live behind `BardPerformanceService` plus `PrismaBardPerformanceRepository`; Telegram callbacks carry compact reaction ids/actions only, while grade, payout, ownership, eligibility and wallet changes remain server-side. Tips debit/credit and reaction completion happen in one transaction, and notification sends are best-effort after committed state.

`0.2.6` adds Passage Search as a small timer/action ledger rather than a new location engine. `passage_search_actions` stores one tokenized search with character/remort, node key/kind, active guard, status, start/end timestamps, frozen search payload, optional Telegram completion chat target and terminal result JSON. The service starts safe descent searches only after a server-read current `Низ` presence, safe `Ярус I` searches only after a current `Сутерени Корчми` presence, risky passage searches only from the matching current passage plus frozen preview token, and safe passage-rest searches from a short `v1:search:start:ps:<passage>` callback with no encounter token or monster snapshot. Same-passage preview checks the latest consumed pending passage encounter, so a won passage fight opens the local 3-minute rest card instead of creating a new pending monster immediately. Stale starts fail before cooldown/action/encounter/combat mutation. Risky completion resolves with deterministic seeded danger/loot; safe descent, safe `Ярус I` and safe passage-rest snapshots set `safeAtStart=true`, so later preview changes cannot create danger. A lightweight passage-search completion scheduler polls due running rows, resolves them through the same replay-safe service path and sends a new best-effort terminal result message when a chat target was stored; manual `Перевірити` remains canonical fallback. Fresh Nyz keyboards read node cooldowns and hide `🔎 Пошукати` until the cooldown expires. Telegram owns only compact `v1:search:*` callbacks and presenter/keyboards; repository transactions own cooldown claims, terminal replay and gold/item grants. The dev-only `/dev_reset_passage_search` clears this narrow ledger/cooldown state for local QA.

Future Support Jar live status is documented in [SUPPORT_JAR_LIVE_STATUS.md](../operations/support-jar-live-status.md). It should be a separate read-only integration with Monobank `client-info`, server-side token handling, TTL cache, no DB donor state, no payment confirmation and no gameplay rewards. Do not treat manual `SUPPORT_JAR_CURRENT_UAH`/`SUPPORT_JAR_GOAL_UAH` values as the long-term status path after that slice lands.

Phase 2 planning now starts with social session primitives: duel invites, result/rematch cards, trading/gifting, item tags, remort-only advanced options, multi-enemy combat and later party/raid sessions. The first runtime implementation should add only the narrow tables/state it needs and must not treat the sketches below as already migrated schema.

## Структура репозиторію
```text
src/
  bot/
    commands/
    callbacks/
    keyboards/
    middleware/
    presenters/
  domain/
    combat/
    loot/
    progression/
    characters/
    guilds/
    raids/
  services/
    adventure-service.ts
    combat-service.ts
    inventory-service.ts
    raid-service.ts
  db/
    repositories/
    transactions/
  content/
    races.ts
    classes.ts
    monsters.ts
    items.ts
    text-templates.ts
  jobs/
  shared/
    errors.ts
    result.ts
    random.ts
    time.ts
  config/

tests/
  domain/
  services/
  bot/

docs/
```

## База даних — мінімальна схема

### users
- `id` UUID
- `telegram_user_id` bigint unique
- `username` nullable
- `display_name`
- `language_code` nullable
- `last_action_at` nullable
- `last_seen_location_id` nullable
- `current_raid_id` nullable
- `current_adventure_id` nullable
- `created_at`
- `updated_at`

### characters
- `id` UUID
- `user_id` FK
- `pronoun`
- `path`
- `race_id`
- `class_id`
- `level`
- `xp`
- `gold`
- `hp_current`
- `hp_max`
- `mana_current`
- `mana_max`
- `hp_regen_at`
- `mana_regen_at`
- `stats_json`
- `created_at`
- `updated_at`

### character_items
- `id` UUID
- `character_id` FK
- `item_id` content id
- `quantity`
- `created_at`
- `updated_at`
- unique (`character_id`, `item_id`)

Future equipment/trading notes:
- `0.0.13` adds preview-only equipment and item detail views without schema changes. It reuses `character_items` for ownership checks and content metadata for rarity/slot/value/description.
- `0.0.14` adds `character_equipment` as a separate persistent equipment shell. It stores content `item_id` per `character_id` + `slot`, while `character_items` remains the ownership/count table.
- Equipping validates current ownership and known equippable content before upserting a slot. Unknown content ids, trophies, consumables, cosmetics, and junk are not equippable in this shell.
- Current slot mapping: `weapon` → `weapon`, `armor` → `chest`, `accessory` → `accessory`. The repository slot vocabulary still allows `head` and `legs` for future compatibility, but the visible UI hides them until content/schema has real supported items.
- Known equipment debt: `character_equipment` stores content `item_id`, not a concrete `character_item.id`. Safe gifting, Shynok sale, item use, chest/barter and upgrade flows now work on aggregate stacks by protecting the whole equipped `item_id`, rechecking quantity/content and respecting reservations in their mutation transaction. That remains sufficient for bounded consumable, altar-offering and server-owned resale-stock slices. Revisit item instances only before a feature needs one concrete copy with mutable durability/rolls/attunement/provenance, split-stack equipment or two-sided trade custody.
- `0.0.22` adds small item effects to supported equippable content and routes them through `buildEffectiveCharacterStats(...)`: base character values + level growth + equipped item effects produce one `CharacterSummary` for `/hero`, `/equipment`, item detail, and persistent solo combat. Presenters format the resulting contributions; they do not calculate combat bonuses.
- Persistent fight sessions use effective HP/mana maxima when a new fight starts. During turns, weapon/armor/stat/spell bonuses are read from the same equipment-aware summary path, so swapping манатки can affect future turn calculations. Existing session HP/mana values remain the stored combat state and are not secretly healed or refilled by equipment changes.
- Item content metadata should eventually support `requiredLevel`, allowed `raceId`/`classId` lists, and optional hidden `path`/pronoun selectors for rare restricted манатки.
- Item content metadata includes `goldValue` for priced items or an explicit `priceless` marker for story trophies and special collectibles. Current code displays this in item detail, inventory total value, hero wallet context, Скриня Манаток eligibility, and Манчкін-скупник level exchange eligibility; it still does not provide a general sell/trade market. Скриня auto-pick excludes protected/priceless/story items, while manual selection can include them with an explicit warning; Манчкін still refuses them.
- `character_items` stays the ownership/count table. Actual equipment slots, temporary permission effects, cursed exceptions, attunement, respec/form-change state, and trade offers should be separate rows or state machines.
- Equipping must validate ownership, level, restrictions, and any active bypass in one domain/service path; callbacks should never trust button text or stale presenter state.
- `0.2.0` adds the first player-to-player gift path through `item_transfers`: one eligible stack unit, explicit recipient acceptance, sender cancel, terminal replay, audit/result JSON and a guarded transaction that decrements the sender and upserts the receiver exactly once.
- `0.0.29` adds a narrow Манчкін-скупник item/gold-to-level exchange. Confirm recomputes the auto-pick fingerprint inside a transaction, rejects stale preview tokens, ignores/rejects equipped/priceless/protected/zero-value items, consumes selected stacks with guarded decrements, requires at least `587` gold value from eligible manatky before wallet gold can fill the rest, grants exactly one allowed level, preserves XP carry, and records level milestones. It deliberately blocks the `12 → 13` exchange: 13 рівень має приходити тільки через бої.
- `0.0.30` hardens that exchange with `level_barter_exchanges`: repeated confirm for an already completed token returns replay/audit data instead of attempting a second spend or showing a misleading stale-selection error. Gold-heavy exchange is intentionally denied; at least `587` gold value from eligible manatky must be part of the exchange, while wallet gold may only fill the missing value. Level-barter callbacks are blocked during pending Barrel raids like other progression/spending actions.
- `0.1.0` does not widen this economy surface. `level_barter_exchanges` remains a narrow idempotency/audit table for the Munchkin barter path, not a general sale, trade, shop, or item-instance ledger.
- `0.1.24` adds a separate Shynok sale path instead of widening level barter. It sells only eligible priced, known, unequipped, unreserved and unprotected content stacks for a fixed basket-level 42% payout rounded up to whole gold. It does not add item instances, buyback, trading, player markets or sell-equipped overrides.
- `0.2.4` adds a separate item-use reservation path instead of widening sale/barter/chest/gift. Live pending/processing `item_use_orders` reserve the whole stack for the chosen `itemId` until completion, cancellation, expiry or remort cancellation, and other item-spending flows must treat that stack as unavailable.
- Follow-up debt: the exchange currently has safe auto-pick only. Manual selection should reuse or generalize the Скриня Манаток selector later and keep the same ledger/replay boundary. Before the next destructive item sink, consolidate a read-only eligibility/reservation contract across gift, mail, use, chest, barter, upgrade, group action, altar and resale paths. Item instances remain a separate gate for per-copy mutable identity or two-sided trade custody, not for aggregate server-owned stock.

### cooldowns
- `id` UUID
- `character_id` FK
- `key`
- `available_at`
- `updated_at`
- unique (`character_id`, `key`)

### daily_actions
- `id` UUID
- `character_id` FK
- `key`
- `local_date`
- `reward_xp`
- `reward_gold`
- `created_at`
- unique (`character_id`, `key`, `local_date`)

### achievement_definitions
Planned after `0.0.21 — Persistent Fight Sessions`.

- `id` stable content id
- `title`
- `criterion`
- `locked_hint`
- `category`
- `trigger_event`
- `metric`
- `target`
- `hidden`
- `grant_title`
- `enabled`
- `sort_order`
- timestamps

### player_achievements
Planned after `0.0.21 — Persistent Fight Sessions`.

- owner id (`player_id`/`user_id` or `character_id`, choose the smallest fit with current schema)
- `achievement_id`
- `unlocked_at`
- `notified_at` nullable
- `progress_current_snapshot` nullable
- unique owner + achievement

### achievement_progress
Planned after `0.0.21 — Persistent Fight Sessions`.

- owner id
- `achievement_id`
- `current`
- `target`
- `updated_at`

Achievement storage is rewardless in Phase 1: it tracks title-like unlocks and progress, not XP/gold/items or combat power. Existing canonical stats should be reused where possible instead of duplicated.

### solo_combat_sessions
Added in `0.0.21 — Persistent Fight Sessions` for the first solo `/fight` runtime.

- `id` UUID
- `character_id` FK
- `monster_id`
- `state_json`
- `status`: active/won/lost/fled/expired
- `expires_at`
- `reward_xp`, `reward_gold`, `reward_items_json`, `reward_claimed_at` nullable replay fields from `0.0.23`
- `created_at`
- `updated_at`

Rules:
- `state_json` stores the pure domain `CombatState`; Telegram callback payloads never become the source of truth.
- `turn` duplicates the current `CombatState.turn` as a normal integer column so callbacks can use a conditional DB update instead of JSON filtering.
- One active playable row per character is protected by an unmanaged SQLite partial unique index on `character_id WHERE status = 'active'`; the migration expires older duplicate active rows before installing the index.
- Callback data contains `sessionId`, `turn`, and `action`. The service rejects stale turns without mutating state, and turn resolution writes through a repository-level conditional update: only the still-active row with the expected turn may advance.
- In `0.0.21`, per-fight rewards were deliberately absent. `0.0.23` adds a small won-session reward path: `daily_actions` with key `combat.solo-fight.reward` and `local_date = solo_combat_sessions.id` remains the idempotent reward authority, while nullable reward fields on `solo_combat_sessions` store replay/audit details for repeated callbacks.
- The narrow problem-chain wrapper stays separate from per-session rewards. `quest.thirteen-small-problems` remains the first compatibility reward key; `0.1.6` adds explicit `quest.problem-chain.*.issued` issue keys for every stage, later `quest.problem-chain.*.reward` reward keys and no replacement of the per-session fight reward. `0.1.7` preserves old ordinary won solo fights only for the first `13`-problem paper; later stages keep fresh counters from issue time.
- Long-session cleanup expiry still happens when `/fight` or a fight callback touches an old active session. Per-turn player-facing deadlines are handled by durable turn state plus best-effort in-process schedulers; no Redis/job worker is required for the current slices.
- `0.1.18` ships the first durable per-round deadline for turn-based duels: around `23` seconds, persisted on the session row and consumed by expected turn/version. Player-action CAS requires `turn_expires_at > now`; timeout CAS requires `turn_expires_at <= now`, so callback-vs-timeout races have one database winner. The timeout path applies deterministic basic attacks for missing choices, reveals the resolved round, renders private cards best-effort and preserves idempotency. Ordinary monster fights and `/spar` can reuse the model later; long session expiry can remain a cleanup fallback, but it should not be the player-facing wait model for a stuck turn.
- `0.1.21` reuses the short-turn idea for solo/training fights without a combat-session schema column: active `CombatState` stores `turnExpiresAt` and the active Telegram card reference, new turns set the deadline to about `23` seconds, and an in-process scheduler scans due rows to commit the canonical basic auto-attack and best-effort edit the active card. Battle-surface restore/callback paths keep the same auto-attack as a restart/delivery/race fallback. Safe side-surface redirects after the deadline do not auto-attack for the hero if they win the overdue-turn CAS first; they commit a missed-turn skip where the monster still acts and the next turn opens. Repeated unattended turns keep resolving this canonical action until combat ends or hard session expiry is reached; auto-resolved victories may grant normal rewards. Long `expires_at` remains a session cleanup boundary, not the per-turn timer.
- `0.1.21` also stores persistent monster-fight context and bark state inside `CombatState`: `context` freezes the `Europe/Kyiv` world snapshot and applied trait effects at start, while `barks` stores deterministic line selection/emission state and turn summaries store `monsterBarkId`. Combat-state parser compatibility must keep old rows readable and preserve the new optional fields when present. The release additionally adds opt-in combat balance analytics tables through `20260621100000_add_combat_balance_analytics`; collection is disabled by default, and reports separate manual choices from timeout auto-actions.
- `0.2.1` extends `CombatState` with optional `enemies` for exactly one or two PvE enemies without a Prisma migration. Missing `enemies` means legacy one-enemy state. When present, `enemies[0]` must mirror the legacy `monster` identity and HP fields, `enemyId` values must be unique, malformed arrays parse as invalid state, and `solo_combat_sessions.monster_id` remains the repository/search boundary for the primary enemy. Turn summaries/logs may include per-enemy actions and HP snapshots; production start paths still omit `enemies` unless a future feature explicitly enables multi-enemy encounters.
- `0.2.2` keeps runtime behavior unchanged but moves production composition into `src/app/`: repository construction, service construction and runtime lifecycle are explicit factories. `src/bot/createBot.ts` is the ordered bot shell; cross-cutting combat-lock/presence/pending-raid policy lives in named middleware modules; command/callback registration is owned by real vertical modules under `src/bot/modules/`.
- `0.2.3` adds ordinary threat escalation without a Prisma migration. `FightService` reads bounded recent terminal `solo_combat_sessions` history, maps eligible normal one-enemy ordinary results into a pure policy, and freezes the decision at session creation. Escalated sessions store `CombatState.threat` with version, enemy count, reason, eligible win count and stable line id/version; one-enemy starts omit it. A stored escalated two-enemy terminal session is the cycle checkpoint, while dev-forced two-enemy rows without `threat` are ignored by the ordinary policy.

### duel_challenges
Shipped in `0.1.10` for the first rewardless Phase 2 social-combat slice.

- `id` UUID
- `challenger_character_id` FK
- `target_character_id` FK nullable for shareable/open invites
- `context_chat_id` nullable
- `invite_token` unique
- `mode`: `quick` or `turn-based`, default `quick`
- `status`: pending, active, declined, expired, forfeited, resolved, cancelled
- `expires_at`
- `resolved_at` nullable
- `result_json` nullable replay/audit payload
- `created_at`
- `updated_at`

Rules:
- Accept/decline/cancel/expire must be transactional and idempotent.
- Result replay is stored server-side; Telegram callbacks never recompute the result from button text.
- Targeted rematch invites must keep `target_character_id` set and accept only from that target; bystanders can view stable state but cannot hijack the rematch.
- Shareable result cards are presentation-only replies based on `result_json`; they must not create new ledger rows or reroll outcomes.
- Quick resolve may use level bracket, race, class, current title/earned identity, effective stats, equipment/item tags and a bounded seed.
- Turn-based accept freezes both participant snapshots and stores active combat state in `duel_combat_sessions`; damage/mana spend inside the session is ephemeral and must not be written back to `characters`.
- `active_combat_leases` is the narrow cross-combat guard for persistent turn-based duels and existing solo/training combat start paths.
- Pair/day caps and abuse logging matter as soon as turn-based XP exists; the current same-pair cap remains the narrow first guard, while later ranking rewards need a separate design.

### duel_combat_sessions and duel_combat_actions
Shipped in `0.1.18` for persistent turn-based player duels.

- `duel_challenge_id` unique FK
- `challenger_character_id`, `target_character_id`
- `status`: active, resolved, expired, forfeited
- `acting_character_id`
- `state_json` frozen participant/combat state, last action, outcome, rules version and balance version
- `turn`, `version`, `turn_expires_at`
- nullable Telegram message refs for each side
- append-only `duel_combat_actions` keyed by `(session_id, turn)` for action/audit idempotency

Rules:
- Callback payloads carry only compact token/action/expected turn/version. Mode, actor, damage, skill cost and result are always server-side.
- Terminal updates release both active leases idempotently, write one stored result to the parent challenge and grant stored XP rewards only when that terminal challenge update succeeds.
- Startup/lazy due-turn paths repair malformed active duel sessions to a non-rewarding expired state and remove orphan `turn-based-duel` leases whose referenced active session no longer owns the character.
- Telegram edit/send failures may fall back to a fresh message, but never roll back or duplicate gameplay state.

### item_transfers
Shipped first in `0.2.0` for safe one-unit gifts. This is not bilateral trade: callbacks carry only short action data and server-owned tokens, while the row freezes sender/receiver/item names, remort counts, item fingerprint, result data and terminal status. Sender item create callbacks include a compact server-derived selection guard for the exact `itemId` + item fingerprint rendered on the card; the create path recomputes live eligibility and must return `stale-selection` rather than falling through to a shifted index. Because inventory is still stack-based by `itemId`, one `processing` gift, or one `pending` gift with `expires_at > now`, reserves the sender's whole `itemId` stack until it completes, declines, cancels or expires. Shynok sale, Mantok Chest, Munchkin barter and future item sinks must use the same active-transfer reservation contract. Expired untouched `pending` rows may remain for callback replay, but they must no longer reserve inventory.

- `id` UUID
- `sender_character_id` FK
- `receiver_character_id` FK
- `status`: pending, accepted, declined, expired, completed, cancelled
- `offered_item_id`
- `offered_quantity`
- `requested_item_id` nullable
- `requested_quantity` nullable
- `audit_payload_json` nullable
- `expires_at`
- `completed_at` nullable
- `created_at`
- `updated_at`

Rules:
- Confirm rereads sender inventory/equipment inside the transaction.
- Equipped, priceless, protected, story and already-pending items are not eligible.
- The first transfer slice should move item units only; gold add-ons and markets are later.

### remort records
Added in `0.1.2` for explicit `/remort` at level 13.

- `character_remort_drafts`: `id`, `character_id`, unique `token`, `status`, `selected_identity_json`, `selected_items_json`, `expires_at`, `completed_at`, timestamps, indexes by (`character_id`, `status`) and `expires_at`.
- `character_remorts`: `id`, `character_id`, unique `token`, `remort_number`, previous level/XP/gold snapshots, `display_name_snapshot`, `preserved_payload_json`, `created_at`, unique (`character_id`, `remort_number`) and board index by (`remort_number`, `created_at`).

Rules:
- `/remort` must be explicit and unavailable below level 13.
- It is not `/restart`; it shows reset/preserve preview, can preserve up to 5 explicitly selected owned manatky, and must not create runaway veteran power.
- Confirm re-reads the character, draft, inventory and equipment in one transaction; repeated confirm for a completed token replays the remort instead of resetting twice.
- Current MVP preserves selected owned manatky at max 1 per item id. Equipped, effect-bearing, protected, story, quest and priceless items are selectable on purpose: remort is allowed to carry a few memorable or powerful things forward. Unknown item ids appear as visible fallback choices and count toward the same 5 selected item id limit; no hidden inventory preservation is allowed. If balance breaks, future patches should add explicit item tags, level gates, attunement or remort-only restrictions with player-facing preview.
- Remort confirm revalidates selected item ids against the current inventory snapshot. If a selected item disappeared or has zero quantity before confirm, the service returns `invalid-draft` and asks the player to reopen `/remort`; completed tokens still replay.
- Completed remort resets level/XP/gold/resources, clears equipment, expires active solo fights, cancels pending Mantok Chest / level-barter / remort previews, clears stale adventure/raid ids and clears only the explicit per-life daily-action keys needed for starter shawarma/fight and Korchmar problem-chain issue/reward rows.
- Legacy power is capped: memory rank is `min(remortNumber, 5)` and grants only small starting HP/mana bonuses.

### parties, Big Barrel and generic group combat

Implemented baseline:

- `PartySession` and `PartyParticipant` own temporary recruiting, membership,
  leader transfer, expiry and party identity.
- `PartyBossSession` and `PartyBossAction` own the shipped one-party/one-boss
  proof and the feature-flagged Big Barrel route.
- `ActiveCombatLease` is the global incompatible-combat exclusion primitive.
- Big Barrel state is intentionally specific: one `boss`, taunt, ward, protocol,
  music and Barrel settlement semantics. It is not the generic N×M engine.

The `0.4.0` proof builds on the transactional restart/remort guards, strict state
parsing/repair, orphan-lease recovery and race coverage completed in `0.3.16`.
Middleware redirects remain UX only and are not deletion or settlement
authority.

Generic group combat should add separate persistence:

- `GroupCombatSession`: party/encounter/rules identity, strict versioned state,
  status, turn, version, deadline and terminal result;
- `GroupCombatParticipant`: frozen actor snapshot, stable order, canonical
  Telegram card reference, contribution and settlement state;
- `GroupCombatAction`: unique session + turn + actor action with explicit target,
  server-owned payload and result;
- optional bounded `GroupCombatRound` rows when a complete journal is required.

Rules:

- reuse `PartySession`, actor-action/domain helpers, leases, CAS, deadlines and
  canonical participant-card convergence; do not reuse a whole solo, duel or
  PartyBoss orchestration layer;
- do not add generic group workflows to `FightService`; extract a narrow shared
  facade only when 0.4 acceptance proves it necessary;
- target identity and ally support are first-class; self-only solo behavior must
  not leak into group resolution;
- parsers reject malformed/rules-mismatched state and a repair pass releases
  recoverable locks without rewards before scheduler work;
- fetch current-turn actions separately; do not load every historical action on
  every submit/due scan;
- terminal rewards/resources are replay-safe per participant and can be retried
  independently; participant count alone never multiplies loot;
- the first supported bound is 2–3 players versus 2–3 enemies;
- Big Barrel stays on `PartyBossSession` until a later parity-tested migration.

Implemented in `0.4.0` behind the default-off, production-hard-disabled
`GROUP_COMBAT_PROOF_ENABLED` gate:

- one rewardless 2–3×2–3 encounter on the separate models above;
- an atomic same-life roster/resource/equipment/status freeze plus a central
  typed combat-lease owner registry;
- explicit enemy/self/ally targeting, unique actor/turn actions, deterministic
  timeout guard and optimistic session CAS;
- strict invalid-state repair, current-turn-only action reads, newest-five recap
  storage and canonical participant-card CAS convergence;
- measured query-event budgets of `30` statements for start, `16` for a queued
  action, `27` total for two concurrent duplicate resolving calls and `1` for a
  lean due-id scan. Active state is capped below `13,000` serialized characters
  in the 3×3/25-turn fixture and cards below Telegram's `4,096` limit.

This proof intentionally grants no XP, gold, items, quest/achievement/activity
progress or ordinary resource settlement. Production parity and rewards remain
future work; Big Barrel behavior is unchanged.

`0.4.2` adds the first production `group-combat.v3` consumer on the exact
left-passage reservation. `GroupCombatParticipant.snapshotJson` is the
independent strict start-time authority for immutable actor identity,
presentation, life/order, class/race/level, maxima, combat/support/base stats,
equipment, granted gear abilities and initial combat-item quantities;
`state_json` owns only bounded runtime HP/mana, cooldown, threat, flee/fumble and
canonically committed item-use changes. Production loot uses the code-owned
immutable v1 enemy/ability/effective-rarity catalog and resolver, never current
content catalogs or generic loot code during restart/settlement. Telegram flee
gameplay commits exactly once before delivery, but the notification contract is
durable at-least-once: a live claim retries database acknowledgement for the
returned Telegram message id without resending, while a crash after Bot API
acceptance and before acknowledgement leaves a bounded duplicate risk on stale
reclaim because `sendMessage` has no idempotency key. Delivery resolves current
navigation before restoring a reply keyboard; current presence/quest markers
build a free player's menu, and a newer combat durably supersedes the old
delivery instead of overwriting its battle UI.
Active GroupCombat card/reply-keyboard replacement uses the same per-character
durable publication owner as terminal/flee navigation fences. The exact
session/revision/token is atomically renewed before every Telegram
`sendMessage`, `editMessageText` and `deleteMessage`; each request is aborted at
13 seconds, below the 23-second stale boundary, and ownership loss suppresses
all later calls in that replacement. Only a reply keyboard actually attached
to a successfully sent private candidate may advance its
fingerprint/generation, and candidate-reference adoption records that
fingerprint in the same CAS. A later acknowledgement failure or scheduler tick
therefore edits the adopted canonical card instead of sending another
countdown copy. A supergroup/no-keyboard delivery acknowledges only the card.
The one-use reply button is rendered only when canonical validation finds at
least one useful owned item. Terminal, flee and
timeout mutations wait for a live publication fence without consuming their
bounded optimistic-conflict retries; elapsed wall time permits restart
takeover of a dead claim without changing canonical gameplay timestamps.
Telegram has no request idempotency key, so acceptance immediately before an
abort/network failure remains an honest external at-least-once ambiguity.
The separately persisted exit-navigation claim follows the same I/O rule for
the main-menu reply keyboard: current presence/quest markers are advisory until
an atomic pre-send renewal validates the exact claim token and exit-navigation
lease, and the send aborts at 13 seconds. A lost owner sends nothing; ordinary
failure releases to pending, while an acknowledgement-ambiguous live claim is
retained for stale recovery. Terminal result cards contain only inline
Journal/Statistics controls and never replace a newer reply keyboard.
Manual action acceptance and turn resolution are separate durable boundaries.
The first transaction validates and commits the queued/replaced action row.
Only then may a bounded resolver claim navigation fences and apply the turn.
Process death or a live UI fence therefore leaves a canonical action that a
duplicate submission, due timeout or another worker can adopt exactly once;
the local caller may return its accepted action state after bounded contention
instead of waiting indefinitely or reporting a false stale turn.

Canonical evolution plan:
[`party-combat-evolution-plan.md`](./party-combat-evolution-plan.md).

## Content IDs
Контентні id мають бути стабільними:
- `race.human-ish`
- `class.bureaucramancer`
- `monster.mimic-shawarma`
- `item.pan-of-persuasion`

Не використовувати назву як primary key, бо тексти змінюються.

## Randomness
У домені використовувати інтерфейс:

```ts
export interface RandomSource {
  nextFloat(): number; // [0, 1)
  nextInt(minInclusive: number, maxInclusive: number): number;
}
```

У тестах — seeded/fake RNG. У production — crypto або надійний PRNG, залежно від потреб.

## Hidden character paths
Character creation stores a hidden `path` derived from the visible pronoun choice. This is internal tavern/canonic bureaucracy metadata, not a player-facing doctrine:

- `he` → `sun`
- `she` → `moon`
- `they` → `boundary`

Use `getCharacterPath()`, `isSunPath()`, `isMoonPath()`, and `isBoundaryPath()` from the domain character helpers for future content gating.

Paths are not player-facing and must not add stat modifiers or gameplay bonuses. Future restrictions should use in-world explanations, not biological categories: tavern notes, weird permits, and short jokes like «Межа підписала пропуск заднім числом».

## Idempotency
Кожен callback, що може видати нагороду, повинен мати idempotency key:
- `combat:{combatId}:finish`
- `raid:{raidId}:reward:{characterId}`
- `daily:{characterId}:{yyyy-mm-dd}`
- `daily-action:{characterId}:{key}:{localDate}`

Повторний callback має повертати «вже зараховано», а не дублювати винагороду.

У `0.0.4` таблиця `daily_actions` використовується для двох idempotent reward keys:
- `tavern.friday-barrel-raid`
- `adventure.mimic-shawarma`

У `0.0.5` той самий механізм також використовується для першої безпечної combat probe:
- `combat.mimic-shawarma.probe`

У `0.0.6` той самий claim transaction може upsert/increment `character_items` тільки коли daily action створюється вперше:
- `tavern.friday-barrel-raid` → `item.wet-hero-ticket`
- `adventure.mimic-shawarma` → `item.suspicious-shawarma-wrapper` або `item.receipt-of-formal-suspicion`
- `combat.mimic-shawarma.probe` → `item.suspicious-shawarma-wrapper` або `item.receipt-of-formal-suspicion`

У `0.0.15` starter gear джерела лишаються тим самим idempotent claim mechanism:
- `combat.mimic-shawarma.probe` attack → `item.pan-of-persuasion`, receipt → `item.stamp-of-minor-authority`
- `cellar.mouse-errand` negotiate → `item.cork-ring-of-serious-business`
- `tavern.friday-barrel-raid` → `item.apron-of-foam-resistance` plus one deterministic rotating barrel junk trophy

Після `0.0.19` level gates starter weapon є reachable, але не гарантована: starter `/fight` працює тільки на рівнях 1-2, cellar errands — на 2-3, а Hunt Board відкривається з 3 рівня. Gates винесені в `src/domain/progression/activityGates.ts`, тому гравець може перескочити starter fight і не отримати `item.pan-of-persuasion` або `item.stamp-of-minor-authority`. Наступний combat engine має мати unarmed/basic fallback і не припускати зброю в руках у кожного героя.

У `0.0.17` той самий `daily_actions` path використовується для першої ротації монстрів із бестіарію:
- `combat.hunt-board.contract` → один `/hunt` контракт на київський годинний відтинок, `3-7 XP`, `0-3` золота й максимум один детермінований `monsterLoot` item.
- Вибір монстра детермінований від Kyiv-local `YYYY-MM-DDTHH` і character id; `monster.mimic-shawarma` і boss-tagged монстри не входять у перший Hunt Board MVP.
- Старий period id у `v1:hunt:act:{period}:*` повертає stale-period copy і не створює claim для поточної години.

У `0.0.18` Hunt Board callback-и отримують короткий deterministic contract token:
- token будується з Kyiv-local `YYYY-MM-DDTHH`, `character.id` і компактного reward/selection fingerprint-а монстра: `monster.id`, `level`, `tags`, `monsterLoot` ids;
- новий action callback має форму `v1:hunt:act:{period}:{token}:{action}`;
- якщо period stale, handler повертає stale-period copy до reward claim;
- якщо period поточний, але token не збігається з поточно перерахованим контрактом, handler повертає stale-contract/refresh copy і не створює `daily_actions` claim;
- legacy tokenless callback-и з `0.0.17` лишаються safe, включно з date-only форматом `YYYY-MM-DD`: view може оновити дошку, action без token не може зарахувати поточну винагороду.

У `0.0.19` Hunt Board отримує persisted ledger:
- `hunt_contracts` має один row на `character_id + local_period_id` і зберігає `monster_id`, `contract_token`, status, completed action, stored XP/gold і serialized item grants;
- перший view або action за period створює posted row, а наступні виклики використовують persisted monster/token як source of truth для identity;
- action callback валідується проти persisted row до `daily_actions.claimForTelegramUser`, тому content order/deploy drift не може перекинути стару кнопку на іншого монстра в тому самому period;
- після успішного `daily_actions` claim ledger позначається completed і зберігає reward summary для replay;
- repeated callback або existing `daily_actions` claim показує stored XP/gold/items із ledger, якщо вони доступні; якщо ledger completion колись не записався, fallback показує stored XP/gold із `daily_actions` і чесно не вигадує item details.
- Onboarding gates: starter shawarma/adventure and starter fight run only on levels 1-2 and retire from level 3; cellar errands run only on levels 2-3; Hunt Board opens from level 3. Перевірка Hunt Board стоїть у service path до `hunt_contracts` upsert і до `daily_actions.claimForTelegramUser`, щоб низькорівневий `/hunt` або stale action callback не створював ledger row і не рухав reward state.

`daily_actions` лишається reward-idempotency authority. `hunt_contracts` не має сам видавати XP/gold/items і не замінює encounter session. Це audit/replay layer для current one-shot Hunt Board.

У `0.0.23` persistent solo fights отримують перший small reward/loot path:
- `combat.solo-fight.reward` → один reward claim на `solo_combat_sessions.id`;
- reward amount рахується з рівня монстра, а item roll іде через pure `domain/loot` engine з injected RNG, rarity weights і bounded LUCK modifier;
- won session може видати XP/gold і максимум один controlled `monsterLoot` item;
- loss sessions створюють тільки малий consolation claim `1 XP`, без золота/items і без quest-win progress; flee/expired sessions не створюють reward claim;
- після успішного claim `solo_combat_sessions.reward_*` поля зберігають replay summary; repeated callback показує stored summary і не reroll-ить item.
- Якщо `daily_actions` claim уже створений, але запис replay payload у session не зберігся, terminal read має fallback-нутися на authoritative `daily_actions` record: показати stored XP/gold, не вигадувати item details і лишити `daily_actions` єдиним джерелом «чи вже видано».
- Якщо session уже `won`, але reward claim ще не встиг створитися, terminal read пробує той самий idempotent claim/recover path замість тихо лишати бій без винагороди.
- `daily_actions.local_date = solo_combat_sessions.id` у цьому path є generic idempotency bucket, а не календарна дата. Перед analytics/reporting pass це поле варто або перейменувати в майбутній схемі, або явно документувати як bucket id.

`0.0.23` не додає shops, selling, trading, crafting, consumables або широкий economy pass. Але новий fight loot збільшує item volume, тому `0.0.24` додає перший pressure valve: Дружня Скриня / Манатко-скриня recycle-ить 5 eligible манаток в 1 better-than-average output item із confirmation, транзакційністю й idempotent callback safety.

Mantok Chest implementation notes:
- `mantok_chest_runs` зберігає pending/completed audit row із token, input item counts, output item, average/minimum/output score.
- Preview не мутує inventory. Confirm перечитує inventory/equipment у транзакції, перевіряє stored input units, guarded-decrement-ить input stacks, upsert-ить output stack і завершує run.
- Inventory поки stack-based (`CharacterItem.itemId + quantity`), без item-instance ids. Через це `0.0.24` споживає 5 units зі stack-ів, а якщо `itemId` екіпірований, увесь stack захищений від Скрині.
- `priceless` і protected/story items не eligible. Locked/favorite/trade/mail/auction flags ще не існують, тому вони не застосовуються в цьому slice.
- `0.0.27` додає manual selection: кнопки `➕`/`➖` передають компактний індекс у відсортованому eligible list, а не `itemId`, щоб callback data лишалася короткою.
- Якщо inventory різко зміниться між показом manual selection screen і натисканням `➕`/`➖`, індекс теоретично може вказати на інший stack. Для stack-based MVP це прийнятно, бо перед остаточним confirm є preview зі списком конкретних манаток, а confirm має stale-input protection і не споживає зниклі або вже неeligible речі.
- `0.1.3` додає cleanup pending `mantok_chest_runs`: записи старші за TTL переходять у `expired`, не списують input items, не створюють output items і відповідають старим confirm callback-ам проханням відкрити Скриню ще раз.

Залишковий борг перед великим Hunt Board: ledger ще не є persistent combat/encounter state. Для групових полювань, wilderness sessions, collection progression, складного loot tracking або combat HP/mana потрібна окрема session model і ширший transaction boundary.

Phase 1 scope lock: Hunt Board ledger і `/bestiary` лишаються bridge/data foundation. `/bestiary` і `/monsters` gate-яться до 3 рівня, щоб read-only довідник не спойлерив starter encounters. Не будувати окремий bestiary collection/journal progression track, доки не закриті combat engine, equipment stat effects, loot engine і level 1-13 loop. Наступні bestiary-зміни мають або виправляти поточну safety/read-only поведінку, або прямо обслуговувати combat/loot.

Цей механізм поки не є повним cooldown system і не потребує Redis.

У `0.0.10` таблиця `character_cooldowns` використовується для першої repeatable активності:
- `cellar.mouse-errand` → 3-хвилинний cooldown для «Льохової справи».
- `0.0.29` повторно використовує цей самий repository contract для Єгерського сліду: `quest.yeger.unquiet-trial.tracking` зберігає коротке pending/ready очікування без XP/золота/items, а ready callback атомарно переводить row у наступний cooldown перед resolution roll.

Cooldown reward claim має бути transactional:
- якщо `available_at > now`, повернути cooldown без XP/золота/items;
- якщо cooldown відсутній або минув, conditionally створити/оновити row, видати маленьку винагороду й перерахувати level;
- concurrent callback-и не мають проходити як дві винагороди.
- Onboarding gate: Льохова справа відкривається з 2 рівня і закривається після 3 рівня. Перевірка стоїть до cooldown reward claim, а command/callback handlers не мають переносити presence в `location.korchma.cellar`, якщо герой ще locked. Якщо герой вже виріс із новачкової справи, hub може показати кнопку `🧹 У льох`, але route має вести в `cellar.grownup`, а не в стару мишачу винагороду.

У `0.0.24` рівень 4+ більше не отримує dead-end retired state у льосі. Старий `/cellar` route відкриває вузьку once-per-player справу `cellar.grownup`:
- `CellarGrownupQuestService` лишається vertical slice, не broad quest engine;
- `daily_actions` із local bucket `once` є idempotency authority для seal purchase audit, bottle grant і permanent completion;
- `character_items` тримає `item.cellar.cheese-seal` і `item.cellar.foamy-mirage-bottle`, а bottle grant має `maxOwnedQuantity: 1`;
- failed roleplay bypass пише cooldown `cellar.grownup.roleplay` у `character_cooldowns`, але не створює completion і не блокує paid seal route;
- видимий UX після bottle grant веде з льоху до `location.korchma.bar`; кнопка `Здати пляшку` живе в шинку й викликає `turn-in`, який ставить permanent completion claim;
- legacy `keep` callback може лишатися для старих повідомлень, але нові льохові екрани не мають закривати справу через `keep`. Repeated callback-и не дублюють XP, золото, items або cooldown/progress state.

Цей slice не додає schema migration: використано існуючі `daily_actions`, `character_items` і `character_cooldowns`. Перед майбутнім broad quest/session model варто не переузагальнювати це як універсальний контракт: це лише безпечний pattern для маленьких once-per-player справ.

Redis лишається майбутнім cache/job інструментом, не dependency для `0.0.10`.

Tavern raid timing in `0.0.11`/`0.0.15`/`0.0.16`:
- `v1:tavern:raid` створює lightweight pending action через годинний `CharacterCooldown` key з prefix `tavern.friday-barrel-raid.pending` і period id `YYYY-MM-DDTHH:23`, а не одразу видає reward. У `0.0.16` period id явно є Kyiv-local korchma bucket-ом, не серверним UTC bucket-ом і не user-facing timestamp-ом.
- У `0.0.19` wait range залежить від рівня героя: рівень 1 має `5-8` хвилин, кожен наступний рівень додає `30` секунд до можливого максимуму, мінімум лишається `5` хвилин.
- Новий raid period відкривається на 23-й хвилині кожної години за київським корчемним часом. З 03:00 до 07:00 за Києвом нові старти повертають audit-break copy про переоблік; уже pending рейди все ще можуть завершитись. О 07:00 рейд знову доступний у поточному period bucket, а далі лічильник перемикається за звичайним правилом 23-ї хвилини.
- Поки pending raid активний, handlers для `/quest`, `/adventure`, `/fight`, `/hunt`, `/cellar`, `🎒 Манчкін-скупник` і схожих progression/spending callback-ів відповідають блокувальним станом без видачі інших нагород або списань.
- Reward amount для завершення рейду у `0.0.19` рахується детерміновано від фактичної тривалості pending cooldown (`availableAt - updatedAt`): довший рейд дає більше XP/золота, а максимуми масштабуються разом із level-based wait ceiling. Фактичні значення записуються в `DailyAction.rewardXp/rewardGold`; existing claim повертає stored amount, а не перекидає reward.
- Завершення idempotent: після `available_at <= now` той самий callback завершує reward claim для period id старту; повторний callback показує completed/already-completed без дублювання XP/gold/items.
- Bot layer ставить in-process `setTimeout` notification після `pending-started`, а `completeFridayBarrelRaid(telegramUserId, periodId)` лишається джерелом правди для reward claim. У `0.1.3` notification state зберігається в `barrel_raid_notifications`: startup resume заново планує future rows, due rows проводить через той самий idempotent reward path, stale `processing` rows відновлює через lease, manual `already-completed` позначає як skipped, а notification-owned reward claim із failed/crashed delivery досилає completion-copy через `reward_claimed_at`.
- Manual fallback шукає pending raid у поточному й останніх 23 годинних period id, щоб завершення не губилося після restart або довгої паузи гравця. Старіші pending рейди потребують cleanup/migration або durable replay, бо поточний fallback не сканує безмежну історію.
- Для MVP це все ще solo Barrel placeholder без повної `raids` / `raid_participants` session model. Перед горизонтальним scaling або справжніми group raids треба перейти на ширший outbox/persistent jobs дизайн і не будувати групову логіку навколо cooldown-плейсхолдера.

Рішення й борги для raid timing:
- Pending-рейд на Бочку має переживати rollover годинного відтинку й видавати винагороду за period id старту. Поточний MVP зберігає period id у полі `daily_actions.local_date`; перед повним activity model це імʼя поля варто переглянути або задокументувати як generic idempotency bucket.
- Runtime callers мають віддавати перевагу `advanceFridayBarrelRaid`, бо він володіє flow start/pending/complete/already-completed. `completeFridayBarrelRaid` лишати public тільки для compatibility/tests, доки service API не буде прибраний.
- `completeFridayBarrelRaid` також має fallback на мінімальну тривалість, якщо pending data відсутня. У поточному runtime це не виглядає відкритою кнопкою для абʼюзу, бо bot flow іде через `advanceFridayBarrelRaid`, але наступні PR не мають будувати нову логіку навколо цього методу як навколо справжньої raid session model. Barrel solo placeholder лишається placeholder-ом до окремих `raids`/`raid_participants`.
- Поки рейд pending, stale scene callbacks на кшталт `v1:adv:mimic:*`, `v1:fight:mimic:*`, `v1:hunt:*` і `v1:cellar:*` не мають перезаписувати `last_seen_location_id`, `current_raid_id` або `current_adventure_id` до того, як pending guard їх заблокує. Безпечне гортання може оновлювати last action, але не має замінювати рейдову присутність біля Бочки без явного location transition rule.

## Presence MVP
`0.0.9` додає легку in-game присутність на рівні `users`, бо окремої session table ще немає:
- `last_action_at` оновлюється тільки від оброблених команд, reply-кнопок і callback-ів;
- `last_seen_location_id` тримає coarse місцину на кшталт `location.korchma.hall`, `location.korchma.quest_table`, `location.korchma.bar`, `location.korchma.cellar`, `location.korchma.barrel` або `location.korchma.news_corner`;
- `current_raid_id` і `current_adventure_id` тримають поточну сценову участь, доки немає справжніх raid/adventure session tables.

Пороги:
- active: до 5 хвилин від останньої обробленої дії;
- idle/recent: понад 5 і до 15 хвилин;
- inactive: старше 15 хвилин і не показується в `/online`.

Це не Telegram online tracking. Не показувати точні timestamp-и, не показувати глобальний список локацій і не робити background ticks джерелом присутності.

Важливий борг `0.0.9`/`0.0.10`: присутність place-based, але ще не session-based. Якщо гравець зайшов у залу корчми, до столу зі справами, льоху або іншої малої місцини, цей coarse place id може лишатися останньою відомою місциною до 15-хвилинного idle cutoff або до наступної location-changing команди/callback-а. Це прийнятно для MVP-присутності, але майбутні групові рейди, pending actions і справжні локації мають перейти на окремі session/raid rows.

Web presence у `0.0.9`:
- `GET /api/presence/locations` повертає тільки активні/притихлі місцини з лічильниками; публічні `players` за замовчуванням порожні, доки немає реального privacy UI або явно увімкненого future flag-а;
- `GET /presence` рендерить сторінку «Жива Квестарня» на тому самому HTTP server;
- приховані, secret або невідомі місцини не мають витікати у public endpoint як реальні назви чи ids; використовуй «Невідома місцина» або ховай їх повністю;
- майбутній `showInPublicPresence` має керувати публічністю імен, навіть якщо presence count лишається агрегованим;
- Telegram `/online`, `/look` і `👀 Хто поруч` можуть показувати імена в межах спільної місцини/сцени, бо це in-game visibility, не публічний веб-список.

`0.0.10` додає легку модель Корчми як набору місцин:
- `location.korchma.front` — Перед корчмою;
- `location.korchma.hall` — Зала корчми;
- `location.korchma.quest_table` — Стіл зі справами;
- `location.korchma.bar` — Шинок;
- `location.korchma.cellar` — Льох корчми;
- `location.korchma.barrel` — Біля Бочки Пінного Міражу;
- `location.korchma.news_corner` — Дошка вістей;
- `location.korchma.ranger_corner` — Єгерський куток;
- `location.korchma.fighting_corner` — Бійцівський куток для `/spar`, new duel challenges and rewardless duel winners board;
- `location.korchma.deep` — Глибка, відкладена dungeon-місцина для бойових справ; станом на `0.1.10` runtime place/callback є, але він показує closed stub і не стартує бій.

Legacy ids `location.tavern`, `location.shawarma-table` і `location.tavern-cellar` лишаються read aliases для старих rows, але нові writes мають використовувати `location.korchma.*`. `/quest` не позначає гравця біля столу зі справами на рівні глобальної кнопки; command handler спершу перевіряє поточну місцину, блокує квест надворі й лише тоді переводить героя до столу. Льох є відкритою aggregate-місциною для public `/presence`, але public web усе одно лишає `players` порожнім за замовчуванням.

Routing rule у `0.0.11`/`0.0.17`: `/quest`, `/adventure`, `/fight`, `/hunt` і `/cellar` не мають глобально телепортувати героя до Столу зі справами. Якщо остання відома місцина надворі або порожня, handler показує `Квести видають усередині.` і кнопку входу до корчми. Якщо герой уже всередині корчми, `/quest` відкриває hub і пише `location.korchma.quest_table`; direct focus commands `/adventure`, `/fight` і `/hunt` можуть показати свою starter scene тільки після такого interior gate. `/fight` для persistent problem chain у майбутньому може писати `location.korchma.deep`, бо Стіл зі справами є маршрутизатором, а не місцем бою. У `0.1.10` Глибка має neutral place callback і closed stub без старту бою. Quest-table list/archive callbacks лишаються neutral `{}` у middleware, а `sendQuestHub(...)` пише `location.korchma.quest_table` тільки після успішного Barrel/location/stale-button gate; place callbacks і quest/fight action callbacks мають таку саму модель neutral-before-handler. `0.1.6` додає `v1:quest:problem`: completion/turn-in для problem chain веде до Корчмаря в `location.korchma.bar`, приймає готовий етап `13/23/42/93` і видає наступний stage issue row з окремим fresh counter. `/hunt` у цьому MVP відкриває Єгерський куток, пише `location.korchma.ranger_corner` і `adventure.hunt-board.contract`, доки немає окремої wilderness/session model. `/cellar` лишається secondary fallback і пише `location.korchma.cellar` тільки після входу. `0.1.5` додає level 3+ `/spar`, `v1:spar:open` і `v1:spar:turn:{sessionId}:{turn}:{action}`; `0.1.10` тримає ці callbacks neutral `{}` у middleware, handler перевіряє pending Barrel, korchma interior і level gate, а тільки потім пише `location.korchma.fighting_corner` і `adventure.training-doppelganger`. `v1:duel:new` має той самий interior gate і пише `location.korchma.fighting_corner` тільки після успішного створення challenge. `v1:nd:*` nearby-duel callbacks are presence-neutral; they read the current location's active candidate list and create targeted pending duel challenges without moving either player before normal accept/start guards. Тренування використовує `solo_combat_sessions`, не створює PvP ledger, не видає золото/items/манатки, не дає problem-chain progress, але може видати малий XP; повторний старт блокується cooldown-ом відновлення допельґанґера, розрахованим від HP копії після бою.

`0.0.11` також додає `korchma_round_purchases` як малий журнал підтверджених частувань:
- `v1:tavern:round` тільки показує offer/statistics screen і не списує золото;
- `v1:tavern:round-simple` і `v1:tavern:round-fine` виконують repeatable spending після raid gate;
- рейтинги за добу, тиждень і місяць агрегуються з purchase log за `local_date`; для частувань це київська локальна дата за `Europe/Kyiv`, не UTC-день;
- leaderboard сортується за сумою витраченого золота, потім за кількістю частувань;
- майбутній tie-breaker має бути детермінованим: earliest purchase in period, потім stable `character_id`, якщо потрібно, щоб привітання за перше місце не стрибали між рівними rows;
- unlimited repeatable spending прийнятний для першого sink, бо кожна покупка вимагає явного підтвердження, але майбутній UX/anti-spam може додати soft cooldown або rate limit.
У `0.0.28` ці callback-и вважаються діями шинку: presence пишеться в `location.korchma.bar`, а зала веде туди через `v1:place:bar`.

## Telegram callback data
Callback data коротка, версіонована.

Поточні callback prefixes у `0.0.21`:
- `v1:onb:*`
- `v1:menu:hero`
- `v1:menu:help`
- `v1:menu:tavern`
- `v1:place:hall`
- `v1:place:front`
- `v1:place:arrivals`
- `v1:place:memorial`
- `v1:place:quest-table`
- `v1:place:bar`
- `v1:place:barrel`
- `v1:spar:open`
- `v1:place:cellar`
- `v1:place:news-corner`
- `v1:quest:adventure`
- `v1:quest:fight`
- `v1:quest:hunt`
- `v1:quest:cellar`
- planned `v1:ach:list:{category}:{page}` or shorter equivalent for a later rewardless achievements slice; generated achievement callbacks must stay <=64 bytes.
- `v1:news:list:{page}`
- `v1:news:entry:{entryIndex}:{listPage}`
- `v1:tavern:raid`
- `v1:duel:new`
- `v1:duel:new-t`
- `v1:duel:new-risk`
- `v1:duel:new-t-risk`
- `v1:duel:accept:{token}`
- `v1:duel:accept-risk:{token}`
- `v1:duel:decline:{token}`
- `v1:duel:cancel:{token}`
- `v1:duel:rematch:{token}`
- `v1:duel:rematch-risk:{token}`
- `v1:duel:share:{token}`
- `v1:duel:view:{token}`
- `v1:duel:t:{token}:{atk|def|skl|rac|ff}:{turn36}:{version36}`
- `v1:tavern:participants`
- `v1:tavern:ranger`
- `v1:tavern:round`
- `v1:tavern:round-simple`
- `v1:tavern:round-fine`
- `v1:adv:mimic:poke`
- `v1:adv:mimic:receipt`
- `v1:adv:mimic:flee`
- `v1:adv:mimic:participants`
- `v1:cellar:cheese-trap`
- `v1:cellar:sweep-bravely`
- `v1:cellar:negotiate`
- `v1:cellar:participants`
- `v1:item:inventory` або `v1:item:inventory:{page}`
- `v1:item:detail:{itemId}` або `v1:item:detail:{itemId}:{page}`
- `v1:equip:view`
- `v1:equip:item:{itemId}`
- `v1:equip:clear:{slot}`
- `v1:chest:open`
- `v1:chest:help`
- `v1:chest:auto`
- `v1:chest:confirm:{token}`
- `v1:chest:cancel:{token}`
- `v1:chest:inventory`
- `v1:fight:mimic:attack`
- `v1:fight:mimic:receipt`
- `v1:fight:mimic:flee`
- `v1:fight:turn:{sessionId}:{turn}:{action}` where current persistent actions are `attack`, `defend`, `skill`, `flee`
- `v1:hunt:view:{localPeriodId}:{contractToken}`
- `v1:hunt:act:{localPeriodId}:{contractToken}:strike`
- `v1:hunt:act:{localPeriodId}:{contractToken}:trick`
- `v1:hunt:act:{localPeriodId}:{contractToken}:retreat`

`participants` callback-и для бочки, шаурми й льоху лишаються валідними для старих Telegram-повідомлень, але нові scene keyboards не мають їх показувати. Поточна видима поверхня присутності — reply-кнопка `👀 Хто поруч`, яка викликає `/online`-еквівалент. Будь-який список імен у Telegram має мати cap на видимі рядки, truncation довгих імен і coarse status-и без timestamp-ів; якщо потрібні повні списки, додавати окрему пагінацію callback-ами.

Майбутній `activityType` / activity presence:
- зберігати короткий coarse тип поточної дії поруч із presence, не виводячи точний час;
- приклади: `waiting_barrel`, `talking_ranger`, `fighting_monster`, `claiming_reward`, `reading_bestiary`;
- presenter має перекладати це в українські короткі рядки на кшталт «чекає бочку» або «спілкується з єгерем»;
- не використовувати це як authoritative combat/session state; навіть після `0.0.21` authoritative fight state живе в `solo_combat_sessions`.
- `v1:bst:list:{page}`
- `v1:bst:mon:{monsterId}:{page}`
- `v1:devreset:confirm`
- `v1:devreset:cancel`
- `v1:restart:confirm`
- `v1:restart:cancel`

Заплановані приклади для майбутніх persistent systems:
- future shorter duel action callbacks only if result/rematch cards outgrow the current token payload shape;
- `v1:gift:offer:{token}` / `v1:gift:accept:{token}` / `v1:trade:confirm:{token}` or shorter equivalents for narrow item transfer flows;
- current remort callbacks use the compact `v1:rm:*` namespace (`v1:rm:open`, `v1:rm:pr:*`, `v1:rm:ra:*`, `v1:rm:cl:*`, `v1:rm:it:*`, `v1:rm:go:*`) for explicit level-13 remort confirmation;
- `v1:combat:*` або коротший equivalent для майбутніх group/PvP combats, якщо solo `v1:fight:turn:*` стане затісним;
- `v1:equip:wear:{itemId}` або коротший equivalent — future richer equipment mutation after the `0.0.14` shell, if slots, restrictions, or item instances need more data than content ids.

Валідація обов’язкова. Не довіряти даним з callback: `v1:item:detail:{itemId}` має перевірити, що item id валідний, content існує або має fallback, і герой реально володіє цією манаткою перед показом деталей. `v1:equip:item:{itemId}` має додатково перевірити ownership і equippable content metadata; `v1:equip:clear:{slot}` має відхилити невідомий slot.

Regression guard: item/equipment callback parsers мають і надалі явно відхиляти payload-и довші за `TELEGRAM_CALLBACK_DATA_LIMIT`, навіть якщо generated callback-и зараз короткі.

### `/start` payloads and future deep links

`0.1.1` introduces the first explicit Telegram deep-link payload:

- `/start support_thanks` renders the Support Jar gratitude scene;
- it does not require an existing character;
- it does not confirm payment;
- it does not mutate XP, gold, items, equipment, titles, levels, rankings, donor state or feature access;
- unknown `/start <payload>` values fall back safely to normal onboarding/current-character behavior.

Deep-link payload hygiene for future Phase 2 invite flows:

- keep payloads short enough for Telegram links;
- validate charset and length before routing;
- do not expose raw internal UUIDs, secrets or mutable state in links;
- gameplay session links should use opaque tokens, expiry, consent checks and replay-safe service state;
- known payloads should route explicitly; unknown payloads should never throw or create rewards.

Майбутній UX-борг для `safeEditMessageText`:
- Перед редагуванням callback-повідомлення перевіряти, що це останнє актуальне повідомлення бота в цьому chat/user flow, або що конкретний екран явно дозволено редагувати старим `message_id`.
- Якщо після старого callback-повідомлення вже були нові повідомлення бота, не редагувати старе повідомлення високо в історії. Замість цього надіслати нове повідомлення, щоб гравець бачив зміну без скролу вгору.
- Для реалізації може знадобитись lightweight облік останнього bot `message_id` на chat/user/session або wrapper, який після `reply`/`edit` оновлює цей стан.
- Додати тести на stale callback: старе повідомлення з кнопкою натиснули після нового тексту, handler не ховає результат у старому edit, а надсилає нове повідомлення.

## Presenters
Domain result → presenter → Telegram text/buttons.

Наприклад:
- `CombatResult` не містить HTML/Markdown.
- `presentCombatTurn(result)` повертає `{ text, keyboard }`.

Це дозволяє тестувати domain окремо і міняти формат Telegram без переписування бою.

`0.0.20` додає pure domain combat engine у `src/domain/combat`:
- `combatState.ts` тримає serializable `CombatState`, actor stats, monster stats і summary останнього ходу.
- `combatEngine.ts` приймає action + state + stats + injected `RandomSource` і повертає новий state без Telegram payloads.
- `combatActions.ts` дає broad class-shaped skill profiles, не повні class kits.
- `monsterCombatStats.ts` derivation бере existing monster content без schema migration.
- `0.0.21` підключає runtime `/fight` для level 3+ через `solo_combat_sessions`, `v1:fight:turn:{sessionId}:{turn}:{action}`, ownership/turn validation і presenter layer. Persistent fight стартував без per-fight XP/gold/items, але має problem-chain wrapper, який у `0.1.6` став explicit `13 -> 23 -> 42 -> 93` stage flow через Корчмаря; `0.0.23` додає окремий small per-session reward/loot path із replay fields.
- `0.1.21` adds the first ability foundation on top of that engine: basic attack, basic defend, class skill and flee are represented as server-side actions; class cooldowns are keyed by ability id while legacy `cooldowns.skill` remains readable; unavailable skill attempts are no-ops that do not spend mana, advance turns, tick cooldowns, trigger monster actions or advance RNG.

## Progression helper
`0.0.4` вводить маленький deterministic helper для рівнів:
- `getLevelForXp(xp)`
- `getNextLevelThreshold(level)`
- `applyXpReward(currentXp, xpReward)`

Поточні Phase 1 alpha-пороги: `0`, `10`, `25`, `45`, `70`, `110`, `160`, `225`, `305`, `450`, `650`, `900`, `1300` XP для рівнів 1–13. Після 9 рівня крива навмисно крутіша, щоб верхні alpha-рівні не пролітали надто швидко. Tavern, adventure, fight, cellar, Hunt Board і raid rewards мають використовувати цей helper, щоб `/hero` відразу показував оновлений рівень. `summarizeCharacter(...)` також піднімає summary-рівень за stored XP, щоб персонажі, які вперлися у стару стелю, не лишалися під старим cap після розширення лінійки.

`0.0.7` додає derived effective stats без міграції схеми:
- stored `hpMax`, `manaMax` і `statsJson` залишаються level-1 базою;
- `summarizeCharacter(...)` рахує effective HP, ману й головну характеристику класу з урахуванням рівня;
- з `0.0.25` current HP і mana більше не дорівнюють effective max автоматично: persisted current values clamp-яться до effective max і відновлюються через lazy out-of-combat regeneration;
- fight preview бере ці effective значення через `CharacterSummary`, а не напряму з БД.

Resource-state note: effective max calculation must stay separate from persisted current resource state. `CharacterSummary` may derive max HP/mana from level/equipment, but current HP/mana comes from stored character resources plus lazy regeneration, then clamps to the effective max. Equipment or level changes must not silently full-heal or full-refill the character.

Формули alpha slice:
- HP max: `stored hpMax + (level - 1) * 4`.
- Mana max: `stored manaMax + (level - 1) * 2`.
- Stats: `stored statsJson + fixed derived path bonus + distributed level stats + equipment effects`.
- Distributed level stats keep the `level - 1` budget and allocate deterministically from class profile + race bonus + fixed path bonus weights.

`0.0.22` layers equipment effects on top of this helper instead of rewriting stored starter values. `0.1.16` also layers fixed path bonus and distributed level stats at read time. The stored `hpMax`/`manaMax`/`statsJson` remain the base; equipped item content contributes additional summary values at read time.

`0.0.25` adds `hp_regen_at` and `mana_regen_at` to `characters` and syncs passive resource recovery lazily on `/hero` and new persistent fight entry. Active fight turns do not naturally regenerate. Terminal persistent fights save actual remaining HP/mana back to `characters`; repeated terminal callbacks replay reward state without spending or restoring resources again.

Future progression pass:
- Revisit combat coefficients, event checks, and activity/content gates after distributed stats have playtest data.
- Keep the source of truth centralized in progression/effective-stat helpers; presenters, services, and combat/event logic should not each invent their own level math.
- Add tests around level breakpoints so raising level changes real outcomes, not only displayed summary numbers.
- Model levels `14-23` as an epic bracket with milestone unlocks for race/class abilities, inspired by Munchkin-style extra class/race tricks. Keep unlock definitions data-driven enough for tests and presenters to answer «what changed at this level?» without hard-coded string checks.

Future time-of-day combat modifiers:
- Derive a coarse local phase from the shared time helper: `morning`, `day`, `evening`, `night`.
- Store monster affinity as content tags or explicit modifiers, not presenter text: e.g. `night`, `dark`, `underground`, `sunlit`, `dawn`.
- Apply phase modifiers in the deterministic combat/effective-enemy helper before presenters render HP/attack previews.
- Test each phase with fixed clocks; never depend on wall-clock time directly in domain tests.
- Keep UI wording coarse and flavorful. Do not show exact server timestamps; say the night makes a tagged enemy bolder, not «+17% о 23:04».

Future korchma progression boards:
- Add a durable event/log source for first arrival and level-up milestones instead of deriving them from mutable current character state.
- Level-up records should be idempotent per `character_id` + reached `level`; repeated reward callbacks must not duplicate the same milestone.
- The front-of-korchma level board can show recent level-ups plus a ranking by highest reached level. Use deterministic tie-breakers: reached level desc, achieved time asc, then stable `character_id`.
- Level 13 already has a distinct level-up presenter branch; the future board needs a durable milestone type/event so it can highlight the same achievement without hard-coding string searches.
- Keep these boards as in-game Telegram surfaces near `location.korchma.front`; public web presence must still avoid exposing player names by default.

## Observability
Лоґи:
- Security/audit events may use `user_id`, `character_id` or `chat_id` only when investigation and retention rules require them.
- Performance telemetry must stay aggregate-safe: route, allowlisted state/counts, component timings, effective non-secret sampling configuration, deploy commit/instance and allowlisted error category; no player identifiers.
- action type.
- idempotency key.
- latency.
- помилки валідації.

Не лоґувати токени, приватні повідомлення повністю, callback data, SQL parameters, serialized state, raw exception details або персональні дані без потреби.

## Deployment MVP
Найпростіше:
- Render або інший PaaS із Node.js runtime.
- SQLite database file через persistent disk для поточного мінімального setup.
- Start command: `npm run db:deploy && npm run start`.
- `db:deploy` first repairs the known failed `0.0.25` migration record if Render has one, then continues with `prisma migrate deploy`.
- `/health` proves only process liveness; `/ready` stays fail-closed until the database probe and Telegram polling startup succeed and returns to `503` during shutdown.
- Redis не є обов’язковим, доки немає features для jobs/cache/cooldowns.

Для альфи polling простіший, але webhook краще для стабільності.

## Admin tools
Потрібні з MVP:
- `/admin_stats`
- `/admin_give_item <user> <item>` тільки для allowlist admin ids.
- `/admin_reload_content` якщо контент читається з файлів/БД.
- `/admin_broadcast` краще відкласти або зробити максимально обережно.

## Testing strategy
- Domain: 80%+ критичної логіки.
- Combat simulations для перевірки TTK і win-rate.
- Loot table tests: сума шансів, немає недосяжних предметів.
- Repository tests із test DB для транзакцій нагород.
- Bot handler tests із mocked context.

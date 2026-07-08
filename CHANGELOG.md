# Changelog

All notable project changes are documented here.

This project follows a simple pre-1.0 versioning policy:
- `0.0.x` for foundation and local playability slices.
- `0.x.0` for larger MVP milestones.
- Breaking changes may still happen before `1.0.0`, but they should be called out explicitly.

## [0.3.0] - 12026-07-08 - Charkokovalnia Item Upgrades MVP

### Added
- Added the `✨ Чароковальня` Telegram surface from `Задвірок корчми`, with the Mage NPC framing and no public `/upgrade` command or `Манатки` shortcut.
- Added a Charkokovalnia unlock gate: level `5+`, or remorted level `3+`, then one field kit turn-in that consumes `Польова аптечка`, grants dynamic XP and unlocks upgrade attempts.
- Added concrete authored upgrade variants for eligible manatky as `base.plus-1` through `base.plus-5`, while preserving existing generated Loot Expansion `-plus-N` ids and avoiding item-instance identity.
- Added deterministic upgrade cost, chance, pity and donor-bonus math with passive previews and stale snapshot checks for direct attempts.
- Added `Іскрокамінь` as the narrow material stack used by the upgrade loop, plus local `/dev_add_iskrokamin` QA support behind the existing non-production dev-grant gate.
- Added rewardless first upgrade success, first upgrade failure and first `+5` upgrade achievement hooks.
- Added focused domain, callback, presenter, Mantok semantics, dev-helper and Prisma transaction coverage for upgrade math, compact snapshot callbacks, equipped-row alignment, stale replay rejection and plus-id presentation.
- Added very rare generated Loot Expansion `+N` drop weighting, keeping plus variants possible without double-upgrading generated ids or turning plus drops into the normal loot path.

### Changed
- Successful upgrades now move exactly one owned stack unit from the current item id to the next concrete plus id and align equipped rows that pointed at the upgraded stack id.
- Failed attempts spend the chosen resources once and increment bounded pity once; replays with stale stack, level or pity snapshots reject before spending.
- Item detail, inventory, equipment, hero/effective-stat, Mantok set and Mantok ability-grant surfaces treat upgraded concrete ids as ordinary catalog ids with the expected `+N` display and preserved base semantics.
- Charkokovalnia previews describe costs, donor help and qualitative odds before commit without revealing exact hidden chances; exact committed result details can appear after an attempt.
- Updated task docs, developer setup notes, balance notes, achievement catalog, lore board, release notes and compact Codex context for the shipped `0.3.0` MVP.
- Bumped package metadata to `0.3.0`.

### Deferred
- No item-instance rewrite, Prisma migration, market, auction, player-to-player upgrade service, broad crafting/economy rewrite, new combat action, duel tournament, Rogue reputation system or Quest Overview redesign ships in this slice.

## [0.2.32] - 12026-07-08 - Combat and Korchma Polish Rollup

### Fixed
- Repeated persistent PvE flee attempts now ramp their success chance from the old first-attempt formula toward a bounded escape guarantee: attempt 5 succeeds at 93%, attempt 6 at 96.5%, and attempt 7 at 100%, with the attempt number replayed from the stored combat turn log and no schema change.
- The Korchma hall presence summary now shows the "Yeger does not count" joke only once per character remort life, using player hint receipts without changing presence counts, Yeger routing or schema.
- Yeger contracts now apply the existing combat-only remort-aware monster pressure one remort earlier than ordinary one-enemy PvE, so remort `3` hunt monsters no longer stay at base stats. Encounter level display, rewards, loot/drop odds, Yeger progress and Prisma schema are unchanged.
- Completed Big Barrel Brother result cards opened without a matching participant viewer now show the total raid XP, gold and item grants as `Загальна винагорода рейду` without assigning those rewards to a specific participant; participant cards still label the personal payout as `Ваша винагорода за рейд`.
- Big Barrel Brother victory settlement now grants each meaningful participant one deterministic Loot Expansion manatka using the frozen participant level/class/race/luck profile and a participant-specific seed, without requiring Barrel-specific loot tags or replaying the solo Barrel starter bundle (`Фартух`, `Квиток`, rotating Barrel keepsake) for everyone.
- Solo Barrel raids now grant the starter Barrel bundle only on the character's first Barrel completion ledger; later completions keep XP/gold but only have a bounded deterministic 23% chance to grant one profile-based Loot Expansion manatka from the character's current level/class/race/luck.

### Changed
- Added a future-task note for expanding `Корчмарський обхід` small-catastrophe scenes to 42 variants with anti-repeat selection.
- Dense-bandage and field-kit crafting from `Манатки` now also unlocks for remorted characters at level `3+` without requiring the second Yeger board, while Yeger free supplies and notch exchanges still require the Yeger quest line.
- Bumped package metadata to `0.2.32` for the consolidated polish rollup.

## [0.2.31] - 12026-07-07 - Mantok Ability Grants Polish

### Fixed
- Big Barrel Brother raid gear-action settlements now carry first-use achievement unlock notifications back to the acting participant and any refreshed participant cards, matching persistent PvE combat without changing raid damage, mana, cooldown, reward or replay behavior.
- Turn-based duel gear-action round resolution now carries first-use achievement unlock notifications back to the acting participant and the other participant's refreshed card, while stale, blocked, duplicate or queued-only callbacks still do not spend mana, advance turns, tick cooldowns, mutate RNG or unlock early.
- Unknown or stale Telegram callback payloads now answer with the existing invalid-button alert instead of leaving the client spinner blinking silently; the `Хто поруч` Rogue `Тиха кишеня` callback is covered as an active regression path.
- Active Barrel cards no longer mark `⬅️ До зали` as the next quest step when the only outstanding marker is the Barrel tutorial step already available on that same Barrel card.
- The `Бочка, або Туди і звідти` accept result now marks the direct `🛢️ До Бочки` route with the quest warning suffix, matching the hall and quest-table route markers after the note is taken.
- Shynok problem-paper issue results now rebuild quest markers after the paper is issued, so `⬅️ До зали` still points toward other available Korchma-location quests instead of showing stale unmarked navigation.
- Race- and class-personalized adventure problem titles and hooks now render identity forms without awkward capitalized quoted insertions, for example `Портрет раси ельфа` and `Іспит для злодія`.
- Generated Loot Expansion enhancement prices now use a soft economy cap, so high-base `+4`/`+5` manatky no longer inflate `goldValue`, Shynok sale payouts, Mantok Chest score or Munchkin exchange value into runaway five-digit ranges; combat stats, rarity, level gates and drop odds are unchanged.
- Persistent one-enemy PvE fights now apply combat-only remort-aware monster pressure after the third remort, including Yeger contracts, and active fight cards label the solo pressure as `Відплата за минулі пригоди` for Yeger sources or `Відлуння минулих пригод` elsewhere. Two-enemy threat backup monsters get a capped remort pressure guard while the primary enemy stays on its authored level. Encounter level display, rewards, loot/drop odds, Yeger progress and Prisma schema are unchanged.
- Ordinary Nyz two-enemy threat escalation now lowers its consecutive-win gate by current remort life: base-life characters still need three eligible wins, remort `1` needs two, and remort `2+` needs one. Losses, excluded routes, rewards, loot, Yeger fights, Adventure fights, dev-forced two-enemy rows and repeat escalated checkpoint rules stay unchanged.
- Korchmar problem-chain counters now count persistent fight wins only from the character's current remort life, so taking or checking `Тринадцять дрібних проблем` cannot auto-complete from stale pre-remort victories.
- `📜 Хроніки Квестарні` now records completed raid outcomes for solo Barrel raids and Big Barrel Brother group raids; `⚔️ Бої` includes both wins and losses, while `⭐ Важливе` only promotes group raid victories. New public level-up rows also include the character's remort life tag, such as `(р5)`, after the reached level.
- The `👤 Персонаж` card now includes a direct inline `🛡️ Спорядження` button above achievements/titles and recovery actions, opening the existing equipment screen without going through `🎒 Манатки`; the persistent main menu keeps its compact location/quest/inventory/nearby/help layout.
- Outside-Korchma quest gates no longer mark `🚪 Зайти в корчму` by default when no verified active quest marker exists, so a cooldown-only cellar errand cannot imply fresh quests inside; direct `/tavern` hall cards now resolve the same quest marker snapshot as place callbacks, while the hall `📋 Стіл зі справами` button no longer duplicates `⚠️` for quests already visible on final location buttons such as `🐭 Льох`.
- Quest Table cards now build their keyboard as the physical `📋 Стіл зі справами` location, so `🍺 До зали` does not duplicate `⚠️` for starter/problem quests already visible on the same table card.
- Yeger-corner `🛢️ До Бочки` return buttons now carry the quest marker when another available route sits beyond the hall at the quest table, Shynok or cellar, without marking from the visible Yeger quest itself.
- Old Shynok table-game links now replay stored Tavlei/Kosti/Dice Poker results when the table completed, or say that the table did not start and stakes were returned when it closed before play, instead of only saying the table is closed.
- `🎒 Манатки` list cards with more than one visible item now offer two compact sort toggles for received date and item name, preserving the chosen order through pagination, page prompts, item details and filtered views.
- Item detail replacement previews now include the currently equipped item's visible effect next to the `Замінить` name, so slot swaps show what the player is giving up before equipping.
- `📮 Пошта Квестарні` now allows several outgoing pending packages from the same sender when their reserved `itemId` lines do not overlap; trying to send an already reserved manatka still fails before charging a second fee.

### Changed
- Bumped package metadata to `0.2.31` for the narrow post-merge Mantok Ability Grants polish slice.
- Updated Mantok Ability Grants QA notes to distinguish automated notification coverage from still-pending live Telegram evidence.

## [0.2.30] - 12026-07-07 - Mantok Ability Grants Foundation

### Added
- Added a data-driven Mantok ability-grant registry with stable compact gear-action keys, uniqueness validation and additive high-level monster loot for the first authored grant set.
- Added the first epic/soulbound ability manatky in the level `9..13` band, including one new rapier item and grant metadata for existing Mantok set pieces.
- Added persistent PvE gear-action callbacks and fight buttons that seed grant ids at combat start, refresh current eligible gear actions during the active turn, spend mana/cooldowns through the combat engine and reject stale or currently unavailable callbacks without advancing combat.
- Added shared gear-action button wiring for persistent PvE fights, Big Barrel Brother raid turns and turn-based duels.
- Added equipment-sourced combat profiles for reinforced defense, small bleed strikes and weaker borrowed class/race-style actions that do not count as native class or race actions.
- Added a narrow visible bleed status family that ticks during committed hero activations and can settle combat without an extra monster response when the status itself defeats the final enemy.
- Added item-detail, equipment-surface and hero-card summaries for granted actions and service-perk markers.
- Added the rewardless first-use achievement `achievement.mantok.gear-action.first` for committed combat actions granted by manatky.
- Added `/lore` as a help-listed shortcut to the existing `📖 Перекази Квестарні` board without adding it to the Telegram side menu.
- Added focused registry, callback, combat-engine and presenter tests for compact keys, collision safety, cooldown/mana behavior, bleed settlement and visible grant copy.

### Changed
- Active fight keyboards can now show currently available gear actions after native attack/defend/class/race controls while preserving existing combat item and class/race cooldown behavior.
- Active fight keyboards now reflect mid-fight equipment changes for the current turn: newly equipped grant manatky can add gear buttons, and removed grant manatky stop working, without refilling stored combat HP/mana or granting an extra turn.
- Equipment and hero cards now show aggregate `Дія спорядження` lines so granted actions are visible on the character doll, not only inside individual item detail cards.
- Shared combat action/effect presenter helpers now format gear-action skill labels and support-effect rows for ordinary fights, Big Barrel Brother raids and turn-based duels instead of hand-rolling the same copy in each surface.
- Combat turn logs and fight cards can surface active bleed status notices alongside existing monster runtime effects.
- Updated docs, balance notes, playtesting notes and compact Codex context for the shipped Mantok ability-grant foundation.
- Updated `📖 Перекази` manatky lore so rare ability-granting manatky are described as visible `Дія спорядження`, not hidden procs.
- Bumped package metadata to `0.2.30` after `0.2.29` shipped from `main`.

### Fixed
- Persistent PvE gear-action callbacks now bypass the generic combat-lock redirect, so pressing a visible gear button during an active fight reaches the fight turn handler instead of answering `Спочатку завершіть бій`.
- Big Barrel Brother raid and turn-based duel gear-action callbacks now bypass the same active-combat redirect and resolve through the existing combat action engine instead of becoming dead visible buttons.
- Big Barrel Brother active cards now hide the `🎒 Одноразові манатки` shortcut when the participant has no currently useful one-use combat items; stale item-menu callbacks still return the empty-menu explanation without spending a turn.
- Hidden gear-action buttons while mana or cooldown gates block the action in persistent PvE, Big Barrel Brother raids and turn-based duels; the active fight text still shows cooldown/mana blockers, and the buttons return after real player turns clear the gate.
- Big Barrel Brother gear actions now apply their equipment support effects before boss retaliation, so shield and borrowed heal/guard actions reduce the incoming hit or restore HP instead of only starting cooldown; raid active cards and journal pages now show those support effects.
- Turn-based duel gear-action result cards now render readable Ukrainian equipment-action names and support effects in stored round replays.
- Turn-based duel gear-action achievements now emit only after the queued action commits in a resolved round, so pending gear choices cannot unlock the first-use achievement early.
- Party-boss gear callback notices now render readable Ukrainian copy for updated/duplicate actions and participant raid/result refresh notices.
- Refreshed eligible gear-action buttons on active fight overview cards as well as direct fight views and callbacks, so returning to an already active fight after changing equipment shows the current manatka actions.
- Preserved gear-action grant ids and bleed statuses when active persistent PvE fights reload from stored session JSON, so multi-enemy and later-turn fight cards keep the same equipment buttons and status ticks as freshly started fights.
- Added remort item pagination so eligible manatky after the first eight, including two-handed Mantok set weapons, remain selectable instead of being hidden by the inline keyboard.

### Deferred
- The Yeger cloak ordinary-bandage service perk is represented as a narrow documented service marker only; no Yeger board, dense-bandage, field-kit or service runtime change ships in this slice.
- Quick-duel gear expansion, generated ability loot, hidden procs, free extra turns, shops, markets, crafting and ability-granting set bonuses remain deferred.

## [0.2.29] - 12026-07-07 - Newbie Barrel Beer Tutorial

### Added
- Added the one-time level 2-5 newbie quest `Бочка, або Туди і звідти` at the quest table without replacing the existing `Льохова справа` option.
- Quest acceptance grants a replay-safe 39 gold travel/drink stipend once per character life, keyed through existing daily-action claim semantics.
- Added explicit quest progress flags for accepting, reaching `Бочка`, completing the beginner solo Barrel raid, offering a beer round after that route step, drinking beer and returning to the quest table with a timed active beer effect.
- Added the weak beginner accessory `Перстень Пивовладдя`, requiring level 2 and granting `+1 Luck`, as the completion keepsake.
- Added the rewardless first-completion achievement `achievement.quest.barrel-beer-tutorial`.
- Added focused service, callback-data, content, callback-route and quest-hub tests for level gating, stipend no-farm behavior, required route progress, mandatory post-raid beer round, active-beer turn-in, expired-beer retry and one-time XP/item reward.

### Changed
- Wired the existing Barrel place callback, solo Barrel raid completion, Shynok self-beer confirmation, Shynok round purchase, legacy Tavern round purchase and round acceptance flows into reusable quest progress hooks; self-drinks and accepted offers only satisfy the drink retry step, while buying a round satisfies the mandatory round step.
- Barrel tutorial turn-in now validates the character's existing location before any quest-table presence refresh, so stale direct callbacks cannot complete the quest from elsewhere.
- Quest markers can now point toward the Barrel tutorial's next step: quest table, Barrel or Shynok, depending on current progress.
- Scheduled pending Barrel raid completion notifications and local `/dev_raid_stop` now also mark the Barrel tutorial visit and beginner-raid progress, matching the ordinary raid completion callback for manual QA and timer-based raid completions.
- Fresh Big Barrel Brother victory settlements now also mark the Barrel tutorial visit and raid progress for matching participants, so remorted level 3-5 characters are not blocked when the Barrel escalates from the beginner solo raid; terminal replays and remort-mismatched settlements without a fresh Barrel success event do not mark tutorial progress.
- Bumped package metadata to `0.2.29`.

### Balance
- Completion grants small level-scaled XP, currently 6/8/10/16 XP for levels 2-5 before caps, and no completion gold because the quest already gives 39 gold up front. Accepted characters who level past 5 still use newbie-scale rewards, with a no-remort cap preventing the quest reward itself from advancing more than one level.
- Existing beer durations remain unchanged: simple beer lasts 23 minutes and fine beer lasts 42 minutes, which is enough time to return to the quest table without making this tutorial frustrating.
- The quest state resets on remort with the current character life, matching the project default for character-scoped tutorial progress.

## [0.2.28] - 12026-07-06 - Mantok Set Synergies Foundation

### Added
- Added 13 authored Mantok equipment set families with 47 set-piece items, covering paired weapons, armor families and cross-slot kits.
- Added stat-only set threshold definitions driven by equipped item ids, including arbitrary `2/2`, `2/3`, `3/3`, `2/4`, `3/4` and `4/4` style thresholds.
- Added set progress and active/next bonus summaries to item detail and equipment surfaces.
- Added active set stat bonuses as synthetic equipment contributions in the existing effective-stat path, so hero/combat/equipment summaries share the same numbers.
- Added rare set-piece loot additions to current level `9..13` monsters while preserving base, trophy/fallback and Mantok equipment coverage loot.
- Added focused content, set-bonus, effective-stat and presenter tests for set validation, threshold activation, simultaneous sets, replacement/removal behavior, loot merge safety and visible progress copy.

### Changed
- Updated `📖 Перекази` manatky lore to mention that some manatky recognize set relatives and push stats more confidently together.
- Documented the foundation balance posture and deferred ability/status/service ideas from the reference package for later slices.
- Tightened equipment slot-filter inventory QA: filtered empty bags now show the slot-specific empty card, and route tests cover slot-filter callbacks plus paginated offhand lists.
- Changed inventory pagination counter buttons like `1/4` into page-number prompts, so players can reply with a target page instead of pressing a no-op current-page callback.

### Fixed
- Kept inventory item-detail and equip callback payloads within Telegram's 64-byte limit for long authored Mantok/coverage item ids by using stable deterministic compact catalog keys when needed, with collision detection during callback map construction.
- Updated the `🪞 Допельґанґер` Dice Poker stake picker to show the player's current gold, and hid the Doppelganger's quick-dice hand until the terminal result card.
- Added remort item pagination so eligible manatky after the first eight, including two-handed Mantok set weapons, remain selectable instead of being hidden by the inline keyboard.

### Deferred
- Gear-action buttons, bleed/burn/status runtime, borrowed class/race actions, Yeger disguise/service perks, shops, markets, crafting and broad combat rebalance remain deferred.

## [0.2.27] - 12026-07-05 - Dice Poker Rework

### Added
- Added `src/domain/dicePoker.ts` with pure five-dice poker hand evaluation, tie-break tuples, deterministic fair d6 rolling, NPC reroll heuristic and scorecard scoring.
- Added `⚡ Швидкі кості` under the existing `🎲 Кості` entry point: player vs the existing Doppelganger fallback, five dice each, one optional player reroll, one deterministic NPC reroll and explicit result cards showing both dice hands plus the win/loss/draw reason.
- Added deciding quick-poker rounds for exact equal evaluated hands, capped at three repeated draw rounds before a safe stake refund and terminal close.
- Added `📜 Табличні кості`: solo 13-turn scorecard mode with up to three rolls per turn, selected-dice rerolls, 13 once-only boxes, preview scores for unused boxes, simplified full-house/poker rules and the upper-section `63+` bonus.
- Added compact `❔ Правила` copy for both dice-poker modes and compact callback payloads for create/toggle/reroll/score/cancel actions.
- Added local `/dev_reset_tavern_games` with the dice icon as a no-op compatibility QA check after table-create cooldown removal; player-facing command icon uniqueness still excludes dev-only commands.
- Added real social Dice Poker tables on the existing tavern-game session storage: `⚡ Швидкі кості` and `📜 Табличні кості` both open 2–8 player tables, and `🪞 Допельґанґер` remains an explicit fallback opponent.
- Added a separate Shynok `🪞 Допельґанґер` table-games branch that lets players choose quick dice, scorecard dice or Tavlei against him before choosing a stake.
- Added invite controls to waiting Tavlei, quick-dice and scorecard-dice tables: creators can generate rotating Ukrainian invite cards and share `/start game_...` deep links that join the same table.

### Changed
- Replaced the old cryptic Kosti style/sign rule menu with `🎲 Кості й покер`, showing quick/scorecard mode choice first and stake choice only after a mode is selected.
- `🎲 Ігри за столом` now shows the player's current gold and a short Doppelganger availability paragraph.
- Routed legacy `game-create` Kosti callbacks to quick dice poker for compatibility, while new keyboards no longer emit old Kosti style/sign choices.
- Kept Dice Poker on the existing tavern-game escrow model with `rulesVersion = dice-poker-v1`, `gameKey = kosti`, one active stake session per character and no Prisma schema migration.
- Bounded the economy: stake is reserved at session start; quick wins and high scorecard completions can pay back escrow; draws, draw-cap refunds, cancellation and expiry return reserved stake only; terminal sessions clear active stake keys and replayed completion callbacks do not pay again.
- Gave scorecard Dice Poker a longer per-action expiry window than quick poker; valid scorecard state changes refresh that deadline while preserving one-time expiry/cancel/settlement.
- Count completed Dice Poker outcomes in the tavern-games leaderboard from stored dice-poker session results.
- Dice Poker rules cards can return to the current active Dice Poker session when opened from that session.
- Quick result cards use spaced combat-like win/loss/draw markers and print the exact stake payout/loss/refund amount.
- Social Dice Poker stores per-participant dice/scorecard state in participant decisions, settles a shared pot once all active players finish, refunds tied tables safely and records all participant outcomes for the leaderboard.
- Waiting Dice Poker tables now show seated-player readiness and let players toggle `✅ Готовий` / `✅ Готова` / `✅ Готові`; when every seated player is ready and at least two are present, the table starts immediately.
- Quick social Dice Poker now arms a short auto-start window after the second player joins and auto-finishes unresolved quick hands as no-reroll hands after the action window, so multi-player quick tables do not trap seated players indefinitely.
- `🪞 Допельґанґер` fallback now follows the in-world schedule: from 23:00 until 07:00 Kyiv time he is available for Dice Poker in Shynok, while daytime keeps him in the Fighting Corner and hides the Shynok fallback buttons.
- Public Dice Poker stake pickers now use compact horizontal public-table stake rows; Doppelganger stake selection lives under his separate branch.
- Tavlei against the Doppelganger uses a single player stake in escrow: win returns it, draw refunds it, loss leaves it on the table, and replay/expiry settlement stays one-time.
- Completed table-game result cards now offer `🔁 Зіграти ще`: social games open a new same-stake table and privately invite previous opponents, while Doppelganger games start the matching fallback path directly.
- Removed the recent-create table cooldown; players can create another table immediately after the previous stake session closes, while the one-active-stake-session guard remains.
- Bumped package metadata to `0.2.27` after `0.2.26` shipped Mantok equipment slot coverage.

### Fixed
- Old incompatible active Kosti tables are hidden from the open-table hub and old decision/resolve callbacks fail closed through the existing safe refund/stale path with friendly Ukrainian copy.
- Direct old Kosti join callbacks also refund/fail closed before any new join stake can be reserved.
- Dice Poker social tables now start with viewer-specific cards for every participant, and expired `dice-poker-v1` tables refund before any legacy Kosti resolver can run.
- Scorecard no-op reroll callbacks with no selected dice no longer consume a roll.
- Stale, terminal, expired and duplicate dice-poker callbacks do not grant duplicate rewards or remove extra gold.
- Completed social Dice Poker result cards now notify other seated participants with the terminal table result, active titles and safe rematch/back controls instead of leaving old waiting cards or stale reroll buttons; scorecard result rows use readable blank-line blocks with bold names, scores and payout/refund amounts.
- Active games against `🪞 Допельґанґер` now count in `🎲 Ігри за столом` and appear in `👀 Хто поруч` as occupied tables without exposing join buttons.
- Completed Dice Poker games against `🪞 Допельґанґер` now replay their stored result and `🔁 Зіграти ще` starts the same fallback game instead of falling into old Kosti stale-copy.
- `🏆 Рейтинг` now counts `🪞 Допельґанґер` as a visible table-games opponent for Dice Poker and Tavlei fallback wins, draws and losses.
- Invite-link join failures now show `✅ Сісти за стіл` for non-participants on still-open tables instead of creator-only invite buttons, so a player can sell manatky for gold and retry the same table.
- `/start game_...` deep-link joins now notify already seated table participants just like inline Shynok joins, including viewer-specific quick Dice Poker controls and ready Tavlei tactic controls.
- `/start game_...` deep links opened from another current location now move the player into Shynok and retry the same table join instead of stopping on wrong-place copy.
- Invite-card view/rotate callbacks are now passive and creator-only: stale invite previews do not expire/refund/resolve the table, and seated non-creators no longer see or rotate invite controls.
- `🔁 Зіграти ще` on completed Doppelganger games now has explicit day/night behavior: it starts the fallback rematch only while the Doppelganger is in Shynok and otherwise shows the existing clear blocked message without reserving a stake.
- Open and ready Tavlei table cards now separate title, players, bank and next action with blank lines, and render seated character names in bold with active cosmetic titles.

### Deferred
- Turn-based duel tournaments, tournament day/week/month reward claims and broader casino/economy changes remain deferred to `0.2.28+` or later.

## [0.2.26] - 12026-07-05 - Mantok Equipment Slot Coverage

### Added
- Added `101` authored Mantok equipment coverage items across all seven canonical equipment slots: `weapon`, `offhand`, `head`, `chest`, `legs`, `accessory` and `tool`.
- Added exact coverage tests for slot counts `18/16/14/12/12/15/14`, slot spread `6`, and at least two class-, race- and title/path-bucket-restricted items for every current class, active race and Loot Expansion v1 title bucket.
- Added authored class/race/title-bucket equip-gate coverage for Mantok items, including explicit rejection/pass tests for preview and equip.
- Added `docs/balance/mantok-equipment-slot-coverage.md` and a `0.2.26` manual QA checklist for the coverage slice.
- Added local `/dev_add_random_item [count] slot=... tag=...` filters for equipment-slot and hand-tag QA.
- Added weighted monster-loot coverage for every authored Mantok coverage item, making them reachable through existing fight/Yeger reward paths while preserving candidate-based drops.

### Changed
- Equip preview/equip now enforces authored coverage class, race and title-bucket requirements alongside generated Loot Expansion v1 gates.
- `common_title` authored coverage gear now behaves as broad common-bucket gear instead of a dead title gate for current characters.
- Yeger/hunt item rewards now use deterministic weighted selection over loot candidates instead of flattening candidate weights to a uniform id list.
- Restricted authored Mantok coverage gear can still drop for mismatched characters as social trade/gift material; class/race/title requirements remain enforced at equip preview/equip time.
- Bestiary monster details now describe possible loot broadly instead of calling every reachable candidate a trophy.
- Generated Loot Expansion v1 materialization now uses slot/name/tag heuristics for head-like armor, leg/boot/pants gear, shield/buckler offhand gear, tool-like accessories and logical `offhand`/`twohand` hand tags.
- Bumped package metadata to `0.2.26` and updated the compact Codex context for the shipped Mantok coverage slice.

### Unchanged
- No Prisma schema or migration changes.
- No generated Loot Expansion v1 source-pack edits; existing `item.loot-v1-*` ids and generated counts stay stable.
- No shop, Mantok Chest, Shynok sale, transfer, remort, item-instance, one-use consumable or combat formula changes.
- No new achievements; existing equipment-slot achievements become more reachable through the broader catalog.

## [0.2.25] - 12026-07-05 - Class Noncombat Priest and Rogue Techniques

### Added
- Added level 3+ Priest direct aid outside combat: `✨ Жрецька поміч` opens from `Хто поруч`, supports self/active same-location targets, and can heal with mana or create a direct blessing without an accept/decline offer flow.
- Added the preserved Priest heal formula with no overheal, mana spend only after a successful durable mutation and no healing cooldown.
- Added a visible 13-minute Priest blessing status that grants a small `+1..+5 luck` bonus based on Priest intelligence and actor/target level difference, and stores that bonus on the blessing row.
- Added level 3+ Rogue `🗡️ Тиха кишеня` from `Хто поруч` for active same-location targets with target level protection, once-per-actor-target Kyiv-day replay, a 93-minute actor cooldown after every resolved attempt and stored deterministic outcomes.
- Added Rogue outcomes for clean success, noticed success, empty/no opportunity, noticed failure and caught badly. Caught badly sets Rogue HP to `0` through the character resource row and does not create an extra caught cooldown.
- Added private best-effort target notifications after successful Priest heal/blessing and relevant Rogue pickpocket outcomes.
- Added a two-button private retaliation path for noticed successful Rogue thefts: the target can launch either an instant or turn-based safe duel against the Rogue, with the Rogue auto-accepted and ordinary duel no-stakes/no-loss rules still applying.
- Added rewardless achievements for first Priest heal, first Priest blessing, first Rogue pickpocket attempt, first successful pickpocket and first caught-badly outcome.
- Added class noncombat callback, keyboard, presenter, service and repository slices with `v1:nc` callback routing.
- Added Prisma tables for Priest aid actions, Priest blessings and Rogue pickpocket attempts.
- Local `/dev_reset_priest_blessing`, `/dev_reset_quiet_pocket` and `/dev_reset_rogue` now clear Priest blessing/support and Rogue Quiet Pocket QA gates; `/dev_reset_quiet_pocket` keeps the narrow cooldown reset, `/dev_reset_rogue` also forgets the current Kyiv-day Rogue target-attempt rows, the Priest helper also expires active direct blessings and pair-target waits, and the dev-command rule now requires new player-facing cooldown/timer gates to ship with a helper or documented exception before PR-ready handoff.

### Changed
- Updated `docs/design/noncombat-techniques.md` to record that Priest aid is direct in this MVP and that bounded player-targeted Rogue gold theft is allowed in this narrow slice.
- Updated `📖 Перекази` class entries for Priest and Rogue to mention the new noncombat behavior.
- Updated `docs/ai/context.md`, the task index and the achievements catalog for the new shipped slice.
- Aligned class noncombat target discovery with mutation gates: action cards list exact normalized same-location targets, including explicit legacy aliases only when they normalize to the same actionable location.
- Kept starter quest-table and direct Yeger accept buttons free of available-task markers while preserving their native action icons such as `🌯 До підозрілої шаурми`, `⚔️ До сутички` and `🏹 Взяти справу`; Korchma location buttons keep place icons and markers such as `🐭 Льох ⚠️`, `🛢️ Бочка ⚠️` and barrel-result `🧥 Єгер ⚠️` routes for an offered Yeger quest.
- Kept Korchma hall/location quest markers resilient when only the cellar errand currently has a character-bearing ready state, so `🐭 Льох ⚠️` still appears when the mouse is the next affair.
- Swapped the pending Barrel fallback button icon from `🍺 Перевірити бочку` to `🔄 Перевірити бочку`, matching refresh-style action buttons.
- Marked `🍺 До зали` / `⬅️ До зали` routes, including Shynok and Fighting Corner return buttons, when another Korchma location currently has an available quest route, while hiding the quest-hub `🍺 До зали` self-return when the hub is already opened from `Стіл зі справами`.
- Hid the grownup cellar `🐭 Домовитись із мишею` action from unaffordable cheese-seal result screens while the mouse roleplay cooldown is still active, and adjusted the Korchmar copy to explain the wait.
- Restored the native `🪧 Обрати пригоду` action icon on quest-table adventure buttons and marked ready adventure-choice buttons with the available-task suffix.
- Marked currently equipped items in inventory keyboards with a left-side `✅` icon in both general and slot-filtered views.
- Lowercased equipment slot names after the equipped-status dash in item detail cards, for example `вдягнено — основна рука`.
- Added available-task markers to Korchma entry buttons and a first-entry hint explaining how the marker leads to current affairs.
- Displayed positive active tavern-game table counts on Shynok game buttons, for example `🎲 Ігри за столом (2)`, while omitting the count when none are active.
- Changed generated adventure method complication headlines from `⚠️` to `💥` and separated injury HP lines with visible heart icons.
- Removed the duplicate cellar movement notice when entering the cellar quest from the quest table.
- Removed the generated combo-title prefix from the starter shawarma scene while keeping its race/class flavor beat.
- Reordered the starter shawarma combat result to match the compact battle-result shape: battle heading, split HP rows, hero damage, Mimic counterattack damage, victory flavor, `Винагорода за бій`, then item grants.
- Added `Замовник`, `Проблема` and `Ціль` context rows to the starter cellar errand card before its method list.
- Shortened starter shawarma, starter cellar, regular Adventure method-choice cards and Daily Korchma Round scene cards so the message body stops duplicating method/action labels and the character prompt; action labels stay in buttons and method/help surfaces.
- Show active Priest blessing status on the hero card beside other timed status lines, clarified Priest blessing result copy and hid the redundant Priest target prompt when no active nearby targets exist.
- Active Priest blessing now appears as a visible `Вдача` bonus in the hero card stats and no longer uses technical stacking copy in player-facing text.
- Priest blessing result cards now separate status and mana beats with blank lines, bold both visible participant names, and include the blessing Priest's active cosmetic title in target notifications.
- Priest/Rogue class noncombat planning now uses canonical effective character summaries, so equipped manatky and active non-expired Priest blessing bonuses affect Priest heal amount, Priest blessing strength and Rogue pickpocket power/bonus consistently with the hero card.
- Stored Priest/Rogue noncombat stat snapshots now reflect the effective inputs actually used for planning, including equipped item ids/effects and active blessing metadata when present.
- Priest aid open cards now label the same-target blessing wait clearly, so it does not read like the active blessing duration.
- Marked completed Priest healing resource lines with `❤️` for HP gained and `💫` for mana spent.
- Scaled Priest direct-heal mana spending proportionally by actual HP restored, capped at 13 around a 42 HP heal, and scaled Priest blessing spending from 8 to 23 by the granted `+1..+5` luck bonus.
- Removed the noncombat Priest heal cooldown and actor-wide Priest blessing cooldown; direct healing is limited by missing HP and mana, while direct blessing is limited by mana and a 93-minute repeat wait only for the same actor-target pair.
- Removed the two-enemy Nyz threat backup HP shortcut: every threat monster now keeps its own full level-derived HP, and victory rewards/loot use the original encounter enemy level even after the primary enemy dies and the boosted backup becomes the active mirror.
- Fixed multi-enemy combat effect expiry so hero-targeted monster effects tick down after any hero action, including `defend` and combat-item turns, and the turn log no longer repeats expired accuracy-penalty notices.
- Multi-enemy combat journals now explicitly note when a backup enemy pauses on its softened-pressure cadence instead of making the second enemy look like it silently skipped by accident.
- Big Barrel raid journals now include dense-bandage cooldowns in `Кулдауни та ефекти`, and raid medical-item action lines show item icons for `Щільний бинт` and `Польова аптечка`.
- Big Barrel queued turn choices now let the latest selected action or combat item replace the earlier button before the round resolves, and overwritten combat items are not spent.
- Big Barrel active cards now open an owned one-use combat item menu instead of hard-wiring the ordinary bandage behind the renamed button.
- Big Barrel recruiting cards now let joined participants mark themselves `Готовий` / `Готова` / `Готові` or switch back to `Зачекайте`, showing `✅` / `⏳` beside names without blocking manual or automatic raid start.
- Cosmetic title selection now paginates the `🏷️ Титули` keyboard instead of rendering every earned title button at once.
- Extended local `/dev_two_enemies [N]` so manual QA can force `Натиск Низу` and boost the second enemy by `N` requested levels while keeping the dev fight excluded from ordinary threat history.
- Fixed Priest healing persistence to cap against the target's effective HP maximum, so level-derived max HP no longer truncates a valid heal at the stored base `hpMax`.
- Hid Priest target-heal buttons for full-HP nearby targets, switched Priest healing UI markers from bandage to `⚕️`, and added page controls for longer class noncombat target lists through a shared keyboard pagination helper.
- Rogue pickpocket result cards now bold the target name, separate target, outcome and next-attempt beats with blank lines, keep a refresh button under the result, italicize the next-attempt wait, and fresh Rogue target lists keep same-day attempted targets visible with a tomorrow-only marker before the active target prompt while omitting that prompt when no fresh pockets remain.
- Noticed-success Rogue theft notifications now state plainly that the theft succeeded but was seen, and attach private instant-duel and turn-based-duel retaliation buttons only to that fresh target notification.
- Rogue retaliation callbacks are now bound to the stored pickpocket attempt through a short opaque token and selected duel mode, expire after a short window and mark the attempt as used before creating the safe duel, so forged, stale or duplicate clicks cannot create unlimited forced duels.
- Active turn-based duel keyboards now use compact combat-style rows: attack/defend, class/race ability and surrender/refresh.
- Kept Priest action buttons under blocked no-op heal, same-target blessing wait and already-blessed blessing result cards so players can immediately choose another Priest action or refresh the list, with reason-specific headings for full HP, target wait and repeated blessing blockers.
- Hid the Priest self-heal button while the character is already at full HP, matching the inventory medical-item no-op behavior.
- Hid Priest/Rogue class noncombat action buttons while the actor is already busy in combat or raid, stopped treating scene/adventure presence as a blocker, and replaced the old generic protocol blocker copy with clearer stale-callback explanations.
- Added a `⚕️ Полікувати себе` shortcut to the hero card for eligible wounded Priests with mana, using the same guarded direct-heal callback.
- Added a `✨ Благословити себе` shortcut to the hero card for eligible Priests when mana is enough and no active self-blessing or same-target repeat wait blocks the action.
- Rendered the persistent main-menu quest button as `🗺️ Квести` without quest-marker suffixes; a future quest-overview route is tracked in `docs/backlog/QUEST_OVERVIEW_ROUTE.md`.
- Refreshed `📖 Перекази` class entries so every class names its combat ability, while Warrior, Bard, Rogue, Priest and Ranger also mention their shipped side class surfaces in separate paragraphs; race entries now also include their race combat ability as a second paragraph, and the manatky section now covers one-use combat/out-of-combat use plus narrow medical crafting.
- Kept underdog combat wins with `+5..+7` level advantage in general/combat `📜 Хроніки Квестарні` rows but removed them from `⭐ Важливе`; only `+8` and higher underdog wins stay important for now, including historical rows already stored with high severity.

### Safety
- Priest and Rogue actions recheck actor/target remort life, class, level, active same-location presence and blocking flows before mutation.
- Failed, no-op, full-HP, insufficient-mana, already-blessed, stale and blocked Priest attempts do not spend mana or start a same-target blessing wait; successful healing never starts cooldown.
- Priest/Rogue open cards and the hero self-heal shortcut now reuse the same active-flow block awareness as mutation-time gates, so busy actors do not receive misleading ready action buttons.
- Successful Priest healing and blessing now anchor mana regeneration at the action time, so an old regen marker cannot immediately refill spent mana on the next hero/card read.
- Active Priest blessing stat bonuses now use a shared helper for hero summaries and class noncombat planning; expired blessings do not affect stats and active blessings still do not stack.
- Rogue transfers debit target and credit actor in one transaction, cap stolen gold at `13` and target balance, never create gold, never steal items and never count as trade/gift/quest/hunt/combat progress.
- Rogue retaliation uses the existing safe duel flows after the durable pickpocket result; it skips resource warnings and the Rogue accept prompt by design, but still creates no stakes, gold or item loss.
- Duplicate Rogue callbacks replay the stored attempt without rerolling, double-transfer or double achievement tracking, even if live location/remort gates have drifted after the original stored attempt.
- Standard actor achievement notifications are sent only for fresh completed Priest heal/bless or Rogue attempts; blocked/no-op states and duplicate Rogue replays do not notify again.
- No public shame/latest-events row, PvP tournament, item theft, universal noncombat engine, combat ability rebalance or paid advantage ships here.
- Local `/dev_reset_priest_blessing`, `/dev_reset_quiet_pocket` and `/dev_reset_rogue` are non-production grant helpers; production config must not register, show or mutate through them, `/dev_reset_quiet_pocket` clears the actual current Rogue cooldown key, and `/dev_reset_rogue` clears both that cooldown family and same-day Rogue target memory for the current actor.

### Tests
- Added domain tests for Priest heal math and deterministic Rogue amount/outcome shaping.
- Added callback parser tests for `v1:nc` open/action payloads and stale-click remort counters.
- Added service tests for Priest heal/blessing planning, Priest heal no-cooldown behavior, scaled Priest blessing bonus, Rogue deterministic planning, duplicate replay and achievement hooks.
- Added service/hero coverage proving equipped manatky and active non-expired Priest blessing bonuses affect Priest/Rogue noncombat planning, target effective HP max uses the same source as the heal plan and expired blessings do not affect hero stats.
- Added presenter coverage that Daily Korchma Round scene cards keep local action labels out of the message body while help mode still shows action details.
- Added DevGrant coverage proving `/dev_reset_quiet_pocket` sends the current `noncombat.rogue.pickpocket` cooldown key, `/dev_reset_rogue` clears same-day Rogue target rows, and disabled dev grants still do not route.
- Added repository regression coverage for Priest healing above stored base HP when effective max HP is higher.
- Added repository regression coverage proving Priest healing does not create a cooldown row and Priest blessing waits are scoped to the same actor-target pair.
- Added keyboard coverage for Priest target-heal hiding, `⚕️` target labels and paginated class noncombat target lists.
- Added keyboard and command coverage for Shynok/Fighting Corner hall-return quest markers and the ready `🪧 Обрати пригоду ⚠️` button.
- Added presenter, keyboard, service and hero-command coverage for active-flow class noncombat blocking and hidden Priest self-heal shortcuts.
- Added hero-command and keyboard coverage for the Priest self-blessing hero-card shortcut.
- Added presenter coverage for empty Rogue pickpocket target lists.
- Added Prisma repository integration tests for exact normalized target listing, same-day Rogue target marking, atomic Rogue gold movement, target-balance capping, no-gold empty outcomes, duplicate replay after live drift and caught-badly HP mutation.
- Added class noncombat command tests for actor achievement notifications, blocked Priest keyboard preservation, duplicate Rogue replay silence and both instant/turn-based Rogue retaliation paths.
- Added callback, presenter and command coverage for noticed Rogue theft clarity, target-only retaliation buttons and automatic duel acceptance parameters.
- Added lore-board coverage for class combat ability references and separate side-surface paragraphs.
- Added online/presence routing tests for the `Хто поруч` discovery surface and neutral `v1:nc` callback presence.
- Added combat-engine regression coverage for expiring hero-targeted monster effects after `defend` in a two-enemy fight.
- Added combat-engine and presenter coverage for visible backup-enemy pressure pauses in multi-enemy journals.
- Added party-boss presenter coverage for dense-bandage raid cooldown rows and medical-item icons in raid action lines.
- Added activity-event publisher and repository coverage for the `⭐ Важливе` underdog threshold, including historical high-severity `+7` rows.

## [0.2.24] - 12026-07-03 - Mantok Balance Audit and Rebalance Pass

### Changed
- Rebalanced generated Loot Expansion v1 equipment effects so source package base stats and `+N` enhancement tiers produce visible stat differences instead of many higher-price variants repeating the same `+0` power.
- Generated weapons now scale from their source `damage` band, and crit-bearing generated weapons expose a small `luck` identity instead of being only expensive low-damage variants.
- Generated armor now declares the canonical `chest` equipment slot and scales armor/HP more clearly by enhancement.
- Generated accessories and tools keep visible utility-stat identity with monotonic enhancement growth and no hidden procs.
- Very cheap authored monster equipment now stays closer to trophy-scale power: `Клітинка відповідального болю` and `Пляма хоробрості на фартуху` keep small defensive identity without matching stronger chest gear at junk-tier prices.
- Hand-slot compatibility is now explicit: warriors can dual-wield ordinary weapons, other classes need an `offhand`-capable item, and `twohand` items occupy both hands while applying their combat effect only once.

### Added
- Added content tests that cap very cheap authored equipment power.
- Added Loot Expansion v1 tests requiring every generated equippable item to declare a canonical slot and every enhancement tier inside a practical family to cost more while gaining a visible stat without losing existing bonuses.
- Added an effective-stat regression proving tuned generated equipment bonuses reach the combat stat aggregation layer.
- Added rewardless equipment achievements for filling all seven canonical equipment slots and for a hidden long-term cumulative `93` successful-equips milestone.
- Added `/chronicles` as a help-listed command that opens the existing `📜 Хроніки Квестарні` / `📣 Останні події` feed without adding it to the Telegram side menu.
- Renamed the player-facing `weapon` equipment slot to `Основна рука` and moved both hand slots below body/tool slots in the equipment card and slot-filter buttons.
- Added `offhand` and `twohand` item tags, target-slot equip callbacks and confirmation keyboards for replacing a conflicting hand while leaving the cleared manatka in the bag.
- Added the `0.2.24` task doc with compact balance rationale, protected-flow checklist and deterministic combat probe summary.

### Fixed
- Concurrent duplicate same-item equip callbacks now rely on an atomic equipment write result before emitting the equipment achievement event, so rapid double taps cannot over-count the hidden `93` successful-equips progress.
- Confirmed twohand replacements now clear the conflicting hand and equip the target item inside one equipment repository transaction.
- Remort confirmation now emits the live `remort.completed` achievement hook and the new race/class identity hook exactly once, so remorted characters receive current-life race/class achievements without waiting for manual `🔎 Перевірити` recalculation.

### Safety
- Ordinary consumables and the `0.2.22` medical item behavior are unchanged.
- Equipped/protected item safety for Mantok Chest, Shynok sale, gift/postal transfer, remort preservation and Munchkin barter remains unchanged.
- No Prisma migration, item id rewrite, reward-table rewrite, shop change, hidden proc, class ability change or new equipment slot is included.

### Balance probe
- A deterministic 400-fight probe across level 3, 6 and 10 same-level ordinary fights showed tuned loadouts increasing win rate and reducing average fight duration, while sampled average turns stayed below the `> 6` balance-review red flag.

## [0.2.23] - 12026-07-03 - Mantok Equipment Slot Foundation

### Added
- Added the canonical manatka equipment slot foundation: `weapon`, `offhand`, `head`, `chest`, `legs`, `accessory` and `tool`.
- Added explicit equipment-slot content metadata and validation so equippable items can target a precise slot while junk, consumables and other non-equipment manatky cannot declare one.
- Added inventory and equipment UI coverage for the expanded slot set, including offhand and tool filters.
- Added item-detail preview copy that names the target equipment slot and, when applicable, the manatka that will be replaced.
- Added equip-result copy confirming that replaced manatky stay in the bag.
- Added generated Loot Expansion v1 tool-category gear support for the new `tool` equipment slot.

### Changed
- Starter and core equipment now declare explicit slot metadata while keeping existing ids, effects, values and descriptions.
- Stored legacy `armor` equipment rows now read through the canonical `chest` slot, and new chest equips clean up the old key before writing the canonical slot.
- `/equipment` now shows all seven foundation slots with compact empty-state copy.
- Occupied equipment slots now place their `Показати ...` and `Зняти ...` buttons on the same keyboard row for a shorter equipment menu.
- Offhand slot copy and filter icon now stay neutral instead of implying the second hand is only for shields.
- Equipment callback slot codes now cover every canonical slot while preserving safe parsing for supported slot filters.
- The Big Barrel raid quick-use button now says `🎒 1 разові манатки` instead of implying that only the ordinary bandage can use that combat item route.

### Safety
- No Prisma migration, item id rewrite, reward-table rebalance, shop change, transfer-rule change or remort-rule change is included in this slice.
- Existing equipped/protected item behavior remains item-id based; transfer, sale, Mantok Chest and remort safety paths continue to block equipped stacks as before.
- The new slot model grants no XP, gold, items, titles, achievements, combat power or paid advantage by itself.

### Unchanged
- Item stats, rarity, gold values, drop odds, shops, crafting, gifting/postal delivery, Shynok sales, Mantok Chest, Munchkin barter, combat formulas and global equipment balance remain unchanged.

## [0.2.22] - 12026-07-03 - Dense Bandage and Field Kit

### Added
- Added craftable `Щільний бинт` and `Польова аптечка` medical manatky, created from `Бинт відповідальної паніки` after the second Yeger `Неспокійні справи 2.0` board is completed.
- Added ordinary-bandage item-card craft actions for dense bandages at 8 ordinary bandages and field kits at 13 ordinary bandages, hidden while locked, in combat or below the required stack count.
- Added backend craft preview/confirm callbacks that recheck character ownership, second-board completion, active combat absence and current ordinary-bandage quantity before mutating inventory.
- Added solo-combat and Big Barrel raid use support for the crafted items: dense bandages heal up to 42 HP and set a five-own-turn battle cooldown after successful use; field kits raise HP to at least 93% of max HP and can succeed once per battle.
- Added improved Ranger/Yeger class supplies: after the first Yeger board, the free 93-minute claim grants 5 ordinary bandages; after the second board, Rangers can also claim 1 dense bandage every 93 minutes and 1 field kit every 24 hours.
- Added a Yeger notch exchange after the second board: one `Єгерська риска на дощечці` can be exchanged for a `Щільний бинт`, and two notches can be exchanged for a `Польова аптечка`.
- Added rewardless achievements for first dense-bandage craft/use, first field-kit craft/use and first medical item use in the Big Barrel raid.
- Added a `Разові` filter button to `Манатки`, reusing the inventory filter flow so one-use consumables can be listed without equipment or junk stacks.
- Added local `/dev_add_dense_bandage [count]`, `/dev_add_field_kit [count]` and `/dev_add_yeger_line [count]` helpers for faster dense-bandage, field-kit and Yeger notch exchange QA.
- Added local `/dev_yeger_first_done` and `/dev_yeger_second_done` helpers that fill the first and second Yeger boards with real terminal Yeger wins, while leaving normal turn-in rewards and achievements on the existing Yeger flow.

### Changed
- General item-use copy now refers to medical manatky instead of assuming every usable consumable is the ordinary bandage.
- Restore-to-full shortcuts remain fixed-heal only and ordinary-bandage-only in repeat-use UI.
- Party-boss / Big Barrel item use now accepts the same combat-usable medical manatky as solo combat, including dense-bandage cooldowns and field-kit once-per-battle limits.
- Combat medical item blockers now show reason-specific Telegram alerts for full HP, cooldown, once-per-battle limits, missing items and reserved/stale actions, while active fight cards show dense-bandage cooldowns beside ability cooldowns.
- Field-kit combat-use journal lines now report the resulting HP reached instead of only the healing delta, matching its heal-to-threshold role in solo combat and Big Barrel raids.
- Successful dense-bandage and field-kit crafting can save 1-5 ordinary bandages for Ranger/Yeger characters based on level and luck, while still requiring the full recipe stack before the craft starts; other classes spend the fixed recipe cost.
- Successful craft result cards now offer `Створити ще` when the remaining ordinary bandage stack can pay the same recipe again.
- Inventory list cards now keep the message body compact by removing per-item descriptions, while item buttons show stack quantity in parentheses when more than one unit is owned.
- Consumable item detail cards now describe non-equipping as applying the manatka rather than trying it on, and use consumable-specific fallback flavor instead of trophy/shelf wording.
- `Єгерська риска на дощечці` item detail copy now describes the mark as an exchangeable Yeger token instead of routing it through generic trophy/shelf fallback wording.
- The `⭐ Важливе` latest-events filter now leaves rare manatky to `🎒 Манатки` and keeps only epic manatky as important item drops.
- Yeger quest cards now stay separate from the `Єгерський куток` atmosphere card, return to the Yeger corner, and leave ordinary Yeger exits pointing back to the Barrel instead of the Korchma hall.
- Yeger corner entry no longer sends a separate movement notice before the Yeger card, and completed second-board turn-in cards can offer dense-bandage and field-kit craft shortcuts when the ordinary-bandage stack is sufficient.
- Full-HP medical item no-op cards now say treatment is not needed and offer a direct return to the source bandage/kit item detail for crafting or review.

### Safety
- Successful crafting atomically decrements the ordinary bandage stack and grants exactly one crafted item without adding a Prisma migration.
- Full-HP or above-threshold item uses are no-ops that do not consume items, set dense cooldowns or spend field-kit per-battle limits.
- Direct stale pre-unlock, active-combat and insufficient-count craft callbacks fail closed without inventory mutation.
- Yeger notch exchange callbacks carry the current notch-count snapshot, so duplicate/stale buttons fail closed instead of spending fresh notches.
- The new achievement records grant no XP, gold, items, titles, stats, combat power or paid advantage.
- Dense-bandage, field-kit and Yeger-board dev helpers remain non-production only and bypass active-combat locks like the existing local bandage helper.

### Unchanged
- Ordinary bandage healing, paid Yeger bandage purchases, shops, Social Games, Lore Board, Big Barrel rewards, titles, raids, trading and broad crafting are unchanged.

## [0.2.21] - 12026-07-03 - Tavern Social Games

### Added
- Added flagged `🎲 Ігри за столом` Shynok hub support, hidden by default behind `TAVERN_GAMES_ENABLED` plus per-game `TAVERN_GAME_TAVLEI_ENABLED` / `TAVERN_GAME_KOSTI_ENABLED`.
- Added a generic tavern game session engine with Prisma-backed sessions, participants, escrowed equal stakes, terminal statuses, replay-safe result storage and opportunistic expiry.
- Added `♟ Тавлеї`: 1v1 equal-stake table creation/joining, one tactic choice per player and deterministic automatic resolution with win or draw/refund outcomes.
- Added `🎲 Кості`: 2-7 player equal-stake tables, per-player style plus sign choices, deterministic 5d6 resolution, main/sign pool payout conservation and creator resolve-now support.
- Added `/games` as a feature-gated public command and Telegram side-menu entry for opening the table-games hub when tavern games are enabled.
- Added a `🏆 Рейтинг` table-games board with day, week and month win/draw/loss leaders across completed Tavlei and Kosti sessions.
- Added rewardless table-game achievements for first completed game, first draw, win milestones and loss milestones, with live unlock notifications and durable recalculation from completed table rows.
- Added config defaults for a 93-gold max stake and create cooldown; richer daily net-win enforcement remains follow-up, while the shipped hard runtime controls enforce max stake, one active stake session and create cooldown.
- Added focused domain, service, config and Shynok callback coverage for resolver invariants, feature flags and compact Telegram callback data.
- Added source task, design, balance, QA and Ukrainian copy docs under `docs/ai/tasks/`, `docs/design/`, `docs/balance/`, `docs/qa/` and `docs/content/`.

### Changed
- The Korchma bar text and keyboard can show the table-games corner only when the new feature flags are enabled; default production behavior remains unchanged.
- `👀 Хто поруч` in the Shynok now lists open tavern game tables and includes the same join callbacks when tavern games are enabled.
- Tavern game joins, decisions, resolves and safe refunds now send fresh private table cards to the other seated participants so Tavlei and Kosti cards do not stay stuck on stale waiting states.
- Tavern game create cooldown copy now explicitly says the player is waiting for a new-table creation pause, not an already-open table, and shows the remaining minutes when available.
- Tavlei cancel buttons now disappear once the table is no longer cancellable or the viewer is not the table creator, Kosti resolve-now buttons disappear after terminal table states, and the blocked-cancel copy explains that only a still-empty open table can be cancelled.
- Shynok callbacks now include compact `v1:sh:g*` game payloads for hub, rules, create, join, cancel, Tavlei tactics, Kosti style/sign decisions and resolve-now.
- Kosti tables stay joinable while open even after all currently seated players have submitted decisions; resolution starts only when the creator resolves, the table reaches cap and finishes decisions, or the join TTL expires with enough players.
- Per-game rollout flags now gate stale rules/create/join/decision/resolve/cancel callbacks consistently; disabled existing tables refund escrow instead of accepting new joins or trapping players in decision flows.

### Safety
- Stakes are debited only inside repository transactions, returned through payout/refund terminal paths and guarded by unique active stake keys.
- Duplicate joins, stale decisions, cancel/expire/resolve races and terminal replays are routed to current state or stored results instead of paying twice.
- Resolver invariant failures terminalize as `failed_safe_refund`, clear active stake keys and replay without double refunds.
- Combat lock, wrong-place and pending-raid checks reuse the same character/presence snapshot policy as Shynok money actions.
- Richer daily net-win enforcement and repeated-pair reporting remain a rollout follow-up; session/participant rows store per-table audit data in this slice.

### Unchanged
- Tavern Social Games ship disabled by default; no public table button appears without explicit flags.
- No NPC gamblers, tournaments, spectator betting, drink outcome modifiers, real board play, XP, items, paid power, PvP, trading, markets, crafting, guild systems or Mini App UI ship in this slice.

## [0.2.20] - 12026-07-02 - Latest Events Feed MVP

### Added
- Added durable `ActivityEvent` persistence with a Prisma migration, repository and service APIs for deduped `record`, best-effort `recordSafely` and bounded `listRecent` reads.
- Added the `📜 Хроніки Квестарні` feed with compact `v1:ev:*` callbacks, filters and pagination from the Korchma board/news surface.
- Added a dry-run-first `maintenance:backfill-activity-events` script for one-time archival feed rows that can be reconstructed from durable tables.
- Added a read-only `maintenance:poll-activity-events` script for checking/polling the latest public `ActivityEvent` rows from the current `DATABASE_URL`.
- Added public activity emission for new characters, configured level milestones, Big Barrel Brother terminal victories, rare/epic manatky and underdog combat victories.
- Added the rewardless `achievement.journey.latest-events-opened` achievement for first opening/reading `📜 Хроніки Квестарні`.
- Added focused service, callback, presenter, board routing, character creation, reward and Big Barrel Brother emission coverage.
- Added scoped `lint:scripts` and `typecheck:scripts` coverage for the latest-events maintenance scripts, and included both in `npm run check`.

### Changed
- `Дошка корчми` now includes `📣 Останні події` without replacing `/news`, `📰 Вісти`, `📖 Перекази`, gifts or postal entry points.
- Latest-events keyboards no longer show a manual `🔄 Оновити` button; opening the feed, switching filters and changing pages reread the current ledger.
- Feed rendering stores and uses event-time display snapshots, groups rows by Kyiv day and escapes/truncates dynamic player, item and monster names.
- Activity logging is best-effort at gameplay boundaries, so feed write failures do not roll back the successful primary action.
- Underdog combat activity now evaluates the frozen effective monster level from the persistent fight session, matching the level used by combat/reward settlement instead of the authored content level alone.
- Turning in `Неспокійні справи 2.0` now grants two `Єгерська риска на дощечці` keepsakes in addition to XP and gold.

### Fixed
- Quest-table browsing and daily-round overview inspection no longer auto-issue the daily `Корчмарський обхід`; locations only show route scenes after the player explicitly accepts the round with `🧾 Берусь за обхід`.
- Opening `Льохова справа` from the quest table now shows the Korchmar/mouse intro, then the cellar movement notice, then the action card instead of sending the movement notice after the quest card.
- Level 8 reached rows now count as important latest-events milestones, matching the enabled visible level achievement cadence.
- Active daily `Корчмарський обхід` scenes at `Стіл зі справами` now open with their action buttons from the physical table callback instead of dropping the player into the generic quest hub.
- Failed grownup cellar roleplay attempts now use the intended `93`-minute retry pause instead of the older `60`-minute wait.
- Party-boss / Big Barrel Brother inventory item-use callbacks now bypass the generic combat-lock redirect, so the combat-usable bandage button from the inventory reaches the raid action handler instead of reopening the combat-lock card.
- `/help` and the main `📖 Допомога` button now show the public command catalog again, while dev commands stay isolated in `/dev_help` and the `🧰 Адмінка` button.
- Onboarding race selection now disables `Домовик` and `Русалка сухопутна` for `Вони`, so the biography-filter note corresponds to visible unavailable options.
- The quest archive now keeps the completed first Yeger board `Неспокійні справи` visible while `Неспокійні справи 2.0` is active or completed.
- The quest archive now keeps completed or skipped starter `Підозріла шаурма` and `Новачкова сутичка` entries visible after players level into the regular adventure and Nyz flows, while active starter entries stay on the quest table.
- The Yeger corner no longer shows the closed quest-detail button after the current Yeger board is completed.
- `maintenance:poll-activity-events` now prints exact `db:deploy` / local `db:migrate` preflight commands when the current `DATABASE_URL` is missing the `ActivityEvent` table.
- Empty `maintenance:poll-activity-events` output now explains that existing characters/items are not read directly and points operators to the archival backfill dry-run/apply flow.
- Dry-run `maintenance:backfill-activity-events` output now shows the exact npm `-- --apply` command, and docs cover pointing `DATABASE_URL` at the isolated local bot database before backfilling local-bot-visible rows.
- `maintenance:backfill-activity-events` now scans source tables in bounded batches by default, avoiding production Node heap spikes during dry-run/apply backfills.

### Unchanged
- Filtering, paginating or pressing a stale legacy refresh-compatible callback can only replay the same one-time first-open record and grants no XP, gold, items, combat power, title power, separate refresh achievement or repeatable hidden progress.
- No public rows are emitted for losses, deaths, retreats, failed joins, failed drops, failed purchases, failed combat actions, Big Barrel Brother losses or attempt XP.
- No trophy weights, Yeger bandage gates, dense-bandage docs, deploy notification `вісти` copy, Big Barrel Brother combat rules, rewards, markets, crafting, PvP, ґільдії, Mini App UI or proactive channel auto-posting change in this slice.

## [0.2.19] - 12026-07-02 - Monster Trophies And Yeger Supply Gates

### Added
- Added `src/content/monsterTrophyCoverage.ts` with concrete low-value trophy manatky for every active monster that previously had no runtime monster loot mapping.
- Added content validation that every active monster id has at least one reachable runtime loot candidate and every monster loot item id exists in `items`.
- Added Bestiary presenter coverage proving possible trophy hints render from runtime `getLootCandidates` candidates instead of orphan hint text.
- Added Yeger service coverage for locked pre-completion paid bandage preview, paid confirm/cancel and Ranger free-bandage callbacks with no gold, item, cooldown or preview mutation.
- Added a `0.2.19` task record and manual QA checklist for monster trophy coverage plus Yeger supply gates.

### Changed
- Bestiary monster detail trophy hints now derive from the same runtime loot candidate path used by monster loot rolls.
- Concrete monster trophy candidates now use explicit loot weights with common non-trophy fallback candidates, targeting about `23%` trophy share among successful monster-specific item drops instead of making one-candidate trophies guaranteed.
- The Yeger corner hides `🩹 Бинти` until the first `5`-target unquiet board is completed and turned in.
- Turning in the first Yeger board now explicitly tells the player that ordinary Yeger bandages are available and points to the renamed second board, `Неспокійні справи 2.0`.
- The second `17`-target Yeger board now uses the distinct player-facing title `Неспокійні справи 2.0` across Yeger cards, quest rows, buttons and post-fight progress notices.
- Direct old Yeger bandage callbacks before first-board completion now return a short locked Ukrainian message instead of opening supplies.
- Existing paid Yeger bandage bundles, Ranger discount and Ranger free-bandage cooldown remain available after first-board completion.
- Future `Щільний бинт` / `Польова аптечка` docs now explicitly require the second `17`-target Yeger board before advanced supplies can appear.
- Updated the optional private deploy/update notification to use the shipped `вісти` language: `Остання вість із Дошки корчми`, `Архів вістей` and `Канал вістей`.
- The notification now renders the version in Telegram HTML bold text, keeps the latest `news.md` release title without its version/date prefix, and includes the first narrative paragraph from that release when available.
- Empty, missing or malformed latest news now falls back to a short Korchma-board note instead of showing generic news/archive wording.

### Unchanged
- No guaranteed trophy drops, collection ledger, Yeger tag-hunt UI, new quest stage, crafting, shop, trading, combat behavior, schema or migration ships in this slice.
- Exact drop odds remain hidden from player-facing Bestiary copy.
- `/news` remains the archive command, the Telegram channel URL is unchanged, and deploy marker/resend semantics plus blocked-user handling are unchanged.
- No Prisma schema, migration, command route, parser, archive data model, gameplay, reward, economy, combat or achievement change ships with the deploy notification wording polish.

## [0.2.18] - 12026-07-01 - Lore Board MVP

### Added
- Added static `📖 Перекази` navigation from `Дошка корчми`, with all MVP categories: `🏚 Про Квестарню`, `🪧 Місцини корчми`, `🧝 Раси пригодників`, `⚔️ Класи пригодників`, `🧌 Бестіарій`, `🎒 Манатки` and `📜 Звичаї й чутки`.
- Added typed lore entries in `src/content/loreBoard.ts`, seeded from the current lore-board docs and backed by `canonicalRefs` for live race, class, item and Korchma location ids, with coverage for every active race, class and current Korchma presence location.
- Added compact `🪧 Місцини корчми` subgroups for `Надвірʼя`, `Зала й шинок`, `Бочка й льох`, `Кутки` and `Низ`, keeping the place lore keyboard short without dropping any current place entry.
- Added an external Lore Board Bestiary category that opens the existing `v1:bst` Bestiary instead of duplicating a partial monster list.
- Added Bestiary first/last/random navigation plus special non-level records for `Бочка Пінного Міражу` and `Старший Брат Бочки` at the end of the existing Bestiary without adding them to the level-based combat monster roster.
- Added source-aware Bestiary callbacks so Bestiary opened from Lore Board keeps `⬅️ До переказів` / `🪧 До Дошки корчми` return navigation, while `/bestiary`, `/monsters`, Hunt Board and old callbacks keep `🏹 До дошки`.
- Added lore presenters, command helpers, compact `v1:lore:*` callback parsing, callback routing, category-random/global-random navigation and stale-id fallbacks.
- Added content validation plus focused callback, presenter, command, route, board keyboard, Bestiary bridge, active race/class/location coverage, presence and `/news` regression coverage.
- Added maintenance docs for adding lore entries and keeping `canonicalRefs` aligned with runtime content.

### Changed
- The Korchma board card now mentions that the board has readable перекази, and its keyboard opens the lore menu without replacing `📰 Вісти`, gifts or postal entry points.
- Lore callbacks route presence back to the Korchma news-corner surface, matching the existing board/news location behavior.
- Completed Big Barrel Brother result cards opened from party links now render terminal participant resource rows with character names instead of the viewer shorthand `Ви` and omit active-only cooldown rows, while preserving viewer-specific reward lookup and active-card `Ви` highlighting.

### Unchanged
- Lore reading grants no XP, gold, items, combat power, unlock progress, hidden reward or achievement in this MVP.
- No Prisma schema, migration, stored read ledger, admin UI, WebView, Mini App, combat, economy, remort, Big Barrel Brother combat/reward/session, party/raid mechanics, market or ґільдійний behavior changes ship in this slice.

## [0.2.17] - 12026-07-01 - Big Barrel Brother Raid MVP

### Added
- Added `BIG_BARREL_BROTHER_RAID_ENABLED` for the first feature-flagged Big Barrel Brother route.
- Added a Barrel route that creates/opens Big Barrel Brother recruiting parties from `/raid` or the explicit Barrel card action while the flag is enabled for non-remorted level `8+` characters and remorted level `3+` characters, reusing the existing `PartySession` token for deep links and nearby invites.
- Added Big party-boss state with `rulesVersion = big-barrel-brother-v1`, `bossKey = big-barrel-brother`, frozen roster/resources/period and a single shared boss target.
- Added Big Barrel Brother victory settlement through the canonical `tavern.friday-barrel-raid` key, so meaningful participants receive stored XP/gold/resource outcomes plus the existing Barrel item grant set exactly once.
- Added replay-safe Big Barrel Brother achievement hooks: victories feed the existing rewardless `barrel.raid.claimed` Barrel-result achievements, failures with applied attempt XP unlock the new rewardless `achievement.barrel.raid.first-loss`, and recalculation can prove both from stored daily-action / party-boss ledgers.
- Added a 3-minute Big Barrel Brother loss retry cooldown through `tavern.big-barrel-brother.loss-retry.cooldown`, so a character who just lost cannot start or join another Big Barrel Brother recruiting group until the short retry gate expires.
- Added focused Big reducer and repository coverage for no runtime round cap, 13-round simulation-horizon probes, canonical Barrel success settlement and replay-safe reward dedupe.
- Added local `/dev_raid_reset` to clear the current Barrel pending timer/completion gate for faster same-period raid QA without running reward settlement; it intentionally does not clear the Big Barrel Brother loss retry cooldown.
- Added local `/dev_raid_win` to set an active Big Barrel Brother boss to `0 HP` and let the next normal party-boss turn resolution settle the raid as a player victory, including boss-zero plus party-zero tie states.
- Added focused hardening coverage for Big participant eligibility, duplicate frozen-period success, remort-life drift, and production-vs-dev timeout resolution.
- Added a narrow Big Barrel Brother focus rule: ordinary retaliations first hit the party leader, then follow the previous round's top living damage contributor, while every fourth turn keeps a broad hit against all living participants until a future explicit threat/taunt system replaces it.
- Added automatic Big Barrel Brother recruiting start after the recruiting deadline, plus `👀 Хто поруч` listings/buttons for live Barrel recruiting groups.
- Added a forwardable Big Barrel Brother invite-card with 13 stable Ukrainian templates and `🎲 Інший текст` rotation for joined recruiting participants.
- Added the existing `Бинт відповідальної паніки` as a narrow Big Barrel Brother combat item action: it consumes one owned non-reserved bandage, heals the participant's frozen raid HP state, counts as that turn's action, and is reachable from both the raid card and the item-detail combat-use button.

### Changed
- Non-remorted level `1-7`, remorted level `1-2`, disabled-flag eligible characters, and pre-existing legacy pending Barrel rows remain on the legacy Barrel flow.
- Big Barrel Brother runtime inherits the party-boss one-action-per-turn, duplicate/stale callback no-op, deterministic timeout defend and active combat lease release contracts from `0.2.16`.
- Big Barrel Brother start now rejects the whole joined roster with a generic ineligible result when any participant is not currently eligible for the frozen Barrel period, and settlement rechecks the remort-aware level gate, remort life and existing Barrel success before granting XP/gold/items.
- Production `boss-timeout` callbacks now resolve only when the turn deadline is due; early force-timeout remains available only through dev-helper mode.
- Party recruiting cards now show a real `🛢️ Почати рейд` leader button for Big Barrel Brother parties without exposing dev proof controls.
- Plain Barrel place entry and current-location resume keep the familiar Barrel card first; eligible players opt into Big Barrel Brother with `🍺 У рейд на бочку` instead of being dropped straight into recruiting.
- Eligible Big Barrel Brother Barrel approach/start notices now use 13 stable Ukrainian templates to explain that the old light solo raid has become a group fight, while the main recruiting card no longer carries that intervention paragraph.
- Big Barrel Brother recruiting cards opened through `/raid` and the explicit Barrel raid action now receive the configured bot username, keep participant-visible invite/share controls while recruiting, and offer `📣 Запрошення на рейд` to send the separate forwardable card with the full `/start party_<token>` URL only when explicitly requested.
- Big Barrel Brother boss cards use production raid copy, show the whole party resource state to participants, mark the boss target on the participant row, and explain victory/failure with the boss HP that remained.
- Big Barrel Brother participant resource snapshots now use the hero's effective level/equipment HP and mana maxima, preserving real missing resources such as `13/50` instead of clamping raid cards to stored base maxima like `20/10`.
- Big Barrel Brother private action keyboards now use the same concrete class/race ability labels and availability rules as ordinary combat instead of generic `Вміння` / `Раса` placeholders.
- Big Barrel Brother active battle cards now follow the ordinary fight rhythm more closely: turn heading, boss HP first, party HP/mana rows, visible boss target marker, viewer-only cooldown lines under the resource block, concrete action buttons, `Останні дії:` summaries with named class/race abilities, named broad `Бочковий гуркіт` boss attacks, 23-second turn hint and no live journal button until terminal state.
- Big Barrel Brother starts now send a separate intervention intro card before the action card, and due active turns now resolve automatically through the runtime scheduler instead of requiring a manual timeout callback.
- Big Barrel Brother intervention intro cards now reuse the existing character-flavor `Порада дня` (`raid.prep-hint` / Barrel scene) per participant instead of a separate hard-coded raid tip.
- Big Barrel Brother battle journals now open only after terminal state, render one stored round per page, include action outcome descriptions and named broad boss attacks, record boss target/focus-switch information, use beginning/end pagination, and return to the terminal result card.
- Big Barrel Brother active cards and journals now suppress focus-switch lines when the boss is still targeting the same participant instead of claiming the attention "switched" to the current target again.
- Big Barrel Brother party deep links now open the active or completed boss card/result before falling back to recruiting join, so old invites replay the real raid outcome after battle.
- Big Barrel Brother terminal victory cards now replay the viewer's stored XP/gold/item grant summary with ordinary fight-style `🎉 Ви перемогли` / `Винагорода за бій` copy instead of a generic bookkeeping line.
- Big Barrel Brother recruiting join/leave now best-effort refreshes stored recruiting cards for other joined participants, including the leader's original card.
- Big Barrel Brother recruiting join/rejoin now rejects under-gate, already-completed-period, active-combat or loss-cooldown characters before mutating `PartyParticipant`, while showing the actor a specific Ukrainian blocker and keeping shared start/settlement checks fail-closed.
- Joining a selected Big Barrel Brother recruiting group now cancels the player's own solo Big Barrel recruiting group first, so `👀 Хто поруч` and deep-link joins can move from a personal one-person draft into another leader's raid without getting stuck on the old card.
- Big Barrel Brother now freezes boss level from the current party leader instead of the roster average, with large-party HP scaling tuned so lower-level joiners no longer soften a high-level starter's raid.
- Big balance tuning now uses 13 rounds only as a deterministic simulation/QA horizon: solo baseline `0/400` wins (`0%`), prepared 3-player entry party `181/400` wins (`45.25%`), full same-level level-8 party `350/400` wins (`87.5%`), full same-level level-13 party `345/400` wins (`86.25%`), and level-13 leader with seven lower-level joiners `0/400` wins (`0%`) in the checked matrix.
- The Big balance docs now explicitly remove the older round-7 terminal pressure proposal from the runtime contract.
- Inventory item detail cards now say combat-usable bandages can be used in active solo combat or outside combat when the fight action is available, matching the existing combat-use button instead of showing only out-of-combat wording.
- Local `/dev_heal` now also heals the active combat state for solo combat, party-boss/Big Barrel Brother raids and turn-based duels, with an explicit battle HP line in the dev response.
- Lazy `/hero` and `/fight` resource synchronization no longer displays the old delayed full-HP recovery notice; durable timely recovery notifications remain a separate future task.

### Unchanged
- No runtime round cap, round-7 final window, 13-round auto-loss, enrage timer or hidden terminal-by-turn rule ships in this slice.
- Failure grants no Barrel success, gold or items; meaningful participants may receive a small replay-safe XP attempt reward on loss, but timeout-only AFK does not count as meaningful participation and the next Big Barrel Brother attempt is blocked by the 3-minute loss retry cooldown.
- Affinity spotlight, first-win trophy, broader raid combat items/targetable manatky, targetable adds, ґільдії, matchmaking, permanent parties, market, trade and crafting remain deferred; Mini App is not a planned track for this release line.

## [0.2.16] - 12026-06-30 - Party Vs One Boss MVP

### Added
- Added a dev/flag-gated `🧪 Dev: бос-проба` start path from an existing recruiting temporary party.
- Added durable `party_boss_sessions` and `party_boss_actions` rows for one shared boss target, frozen participant state, per-turn action uniqueness and restart-safe replay.
- Added a pure party-boss reducer with one shared boss, compact participant actions (`attack`, `defend`, class skill, race action), deterministic timeout defend fallback and runtime terminal states based only on boss defeat, all participants being knocked out or explicit cancellation.
- Added active combat leases with `kind = "party-boss"` for every active participant, released on terminal proof completion or remort cancellation.
- Added combat-lock redirect support so active participants are returned to their party boss card from ordinary routes.
- Added focused reducer, callback parser, keyboard and repository integration coverage for timeout fallback, duplicate actions, terminal release, compact action payloads and no hidden runtime turn cap.
- Added deterministic 13-round simulation-horizon probes for the dev proof boss: a solo no-manatka/no-remort baseline stays at or below 13% wins, while the prepared proof party stays in the intended 35%-49% band.

### Changed
- Temporary party membership now treats `active` party sessions as live memberships, so participants cannot join or create another live party while a party-boss proof is active.
- Remort cleanup now explicitly cancels an active party-boss proof and clears party-boss leases/live membership keys instead of leaving unsupported combat locks.
- Party-boss start and resolved turns now best-effort push fresh private boss cards to other active participants, while party-boss refresh and journal callbacks bypass the active combat lock.
- Party-boss cards now include a compact `📜 Журнал` view backed by stored round logs, showing resolved round damage/actions without private HP/mana or Telegram ids.
- Party-boss runtime no longer loses only because a fixed proof turn cap was reached; turns keep incrementing while the boss and at least one participant remain alive.
- Party-boss `⏱️ Dev: добити хід` now force-resolves the current turn immediately for manual QA, filling missing active participants with timeout defend without waiting for the 23-second deadline.
- Knocked-out party-boss participants no longer receive action buttons, and stale action callbacks from them replay the canonical state without creating useful action rows.
- Party-boss journal action rows now show outcomes such as miss, cooldown, mana shortfall, critical fumble or support effect without direct damage, so race/support actions no longer look like unexplained `0` damage.
- Solo combat item use now clears the player's own active bandage-use preview, including stuck `processing` orders, before spending the bandage as a combat turn.
- Active fight cards now explain when a class or race combat action is hidden because it needs more mana after its cooldown has ended.
- Local `/dev_restore_mana` now bypasses the active combat lock for battle QA, matching `/dev_heal`.
- The compact Codex context, task index, roadmap, playtesting guide and security/fair-play notes now document the one-boss proof boundary.

### Unchanged
- This is not Big Barrel Brother and not the production raid route.
- No XP, gold, items, manatky, trophies, achievements, Barrel success, group loot table, guild, matchmaking, public roster, Mini App, market, trade or crafting ships in this slice.
- Existing solo combat, turn-based duels, postal delivery, Safe Gifting, Shynok, Adventure, Daily Korchma, Barrel legacy behavior and temporary party recruiting remain on their existing contracts.

## [0.2.15] - 12026-06-30 - Party Session Foundation

### Added
- Added dev/flagged temporary party recruiting through `/dev_party` and `PARTY_SESSION_FOUNDATION_ENABLED`.
- Added `party_sessions` and `party_participants` persistence with one opaque invite token, capacity `8`, minimum participant metadata `1`, one live leader session key and one live membership key per character.
- Added `/start party_<token>` deep-link joins plus compact `v1:party:` callbacks for join, refresh, leave, leader cancel and dev-helper expiry.
- Added nearby private party invites from `👀 Хто поруч` only when the inviter already has a live recruiting party.
- Added remort cleanup so live party memberships are left, leader remorts transfer leadership deterministically, and last-participant remort cancels the recruiting session.

### Changed
- Party join/rejoin, leave, cancel and passive expiry replay from canonical database rows instead of trusting callback payloads.
- Dev-helper expiry now force-expires live recruiting sessions before their natural TTL, clears live keys and is gated separately from the production smoke feature flag.
- Terminal party states clear all live leader/membership keys while preserving roster history for stale-card replay.
- The compact Codex context, task index, playtesting guide and security/fair-play notes now document the party-session foundation and privacy contract.

### Unchanged
- No boss combat, active rounds, HP/mana mutation, combat leases, rewards, XP, gold, items, achievements, Big Barrel Brother route or production Barrel replacement ships in this slice.
- Existing solo Barrel behavior, beer access, solo combat, two-enemy threat combat, gifting/postal delivery, Shynok, Daily Korchma and Adventure behavior remain unchanged.

## [0.2.14] - 12026-06-29 - Adventure Quest Readability and Local Failure

### Added
- Added explicit selected-card objective copy for every active level 3+ Adventure Choice problem: the card now renders `Замовник`, `Проблема` and `Ціль` before the method list.
- Added objective-copy coverage for all 24 general Adventure problems plus generated race survey/mug/portrait, class manual/uniform/exam and title problem families.
- Added `local-failure` as a method-owned quest consequence for a small authored slice of risky methods.
- Added focused tests for objective copy coverage, selected-card rendering, local-failure zero rewards, no item grants, no fight handoff and replay safety.

### Changed
- Selected Adventure Choice cards now explain the concrete problem and intended objective without exposing race/class/signature, grade, consequence names, exact odds or future rewards.
- The already-used Adventure period copy now says the attempt was used rather than assuming the affair was successfully closed, so it fits both successful and failed attempts.
- `local-failure` complications consume the existing 93-minute Adventure claim, persist through the existing result JSON path, grant 0 XP, 0 gold and no items, start no fight and do not apply HP injury.
- Local-failure result cards use `❌ Справу не закрито`, show the chosen method and explicit zero reward, and mention the next Adventure period after the attempt.
- Local-failure Adventure claims no longer advance resolved-affair achievements, and monster-complication Adventure achievements now count only stored fight handoffs.

### Unchanged
- No global failure roll was added; failure remains deterministic and owned by the selected authored method.
- Existing paid-method safety, HP injury behavior, fight handoff rollback, stale callback handling, reward envelope and starter/onboarding fallbacks are unchanged.
- This slice adds no new player action, durable milestone or resettable state beyond the existing Adventure claim, so no new achievement hook, `/dev_*` command, schema change or remort reset behavior ships here.

## [0.2.13] - 12026-06-29 - Postal Manatka Delivery MVP

### Added
- Added `📮 Пошта Квестарні`, a paid courier delivery flow for sending a bounded package of eligible manatky to a known recipient without requiring same-location presence.
- Added postal recipient discovery from completed item-transfer history, accepted duel history and explicit Bard performance reactions in either direction, without exposing recipient current location or online status.
- Added tokenized postal draft/package callbacks under `v1:post:` with add/remove/quantity/confirm controls and Telegram byte-limit parser coverage.
- Extended `item_transfers` with `transfer_kind`, `package_json` and `delivery_fee_gold` so Safe Gifting and postal delivery replay from explicit stored state.
- Added repository integration coverage for known-recipient discovery, five-line package acceptance, duplicate accept replay, insufficient sender fee gold at confirmation, in-transit/history overview rows and stale-line all-or-nothing rollback.
- Added keyboard coverage for contextual postal quantity controls so dead `×1`/internal-max buttons do not appear.

### Changed
- Postal packages allow 1 to 5 distinct `itemId` stack types, with 1 to 93 units per selected type, capped by currently owned eligible unreserved quantity.
- Postal confirm now moves selected quantities out of the sender inventory into postal custody, marks that custody in stored replay state, and returns items to the sender once on decline, cancel, expiry or receiver remort.
- Postal confirm keeps one live `postal:<sender>` reservation key for the package; other item-spending flows still read `package_json` lines as active item-transfer reservations.
- Postal manual package eligibility now allows explicitly selected owned, non-equipped, non-reserved stacks such as one-use/trade-blocked bandages; Safe Gifting keeps its stricter one-unit tag blocks.
- Delivery fee is charged from the sender immediately at confirmation/send time; if the sender lacks gold, the package stays a draft and is not sent. The internal tested fee formula is `5 + selected type count`, so package size by unit count does not inflate postage.
- Pending postal packages now use a one-week response window, and the postal overview includes packages in transit plus completed history with pagination.
- Sender remort is blocked while outgoing sender-debited postal custody is pending, so mailed items cannot survive a remort outside normal kept-item rules; draft postal rows do not block remort and cancel privately without moving items.
- The Korchma board and nearby social surfaces expose `📮 Пошта Квестарні` beside existing Safe Gifting, while Shynok no longer owns those buttons.
- Adventure Choice, starter shawarma and cellar mouse method-choice cards now show only compact method names up front, with qualitative risk/chance details moved behind a `💡 Підказка` callback that does not complete the scene; the detail screens italicize the explanatory lines and replace the hint button with `⬅️ Назад`. Daily Korchma round action scenes now also list the local actions in the compact card and show optional action descriptions behind `💡 Підказка` / `⬅️ Назад`. The cellar mouse start also splits the intro scene from the action card, the Korchma hall no longer repeats the title header before asking where to go, onboarding completion combines the created-title note with `🍺 Квестарня відчинена.` while suppressing the redundant outdoor movement notice, and the front-door Munchkin paragraph/button stays hidden until level 3.
- Active cosmetic title labels now resolve from an explicit short-title catalog instead of reusing full achievement names, with validation for coverage, duplicates, length, punctuation and reward/power wording.

### Unchanged
- Existing Safe Gifting remains a one-unit, same-location, explicit-accept flow.
- No item-for-item trade, player-to-player gold transfer, market, anonymous mailbox, public search, exact-location leak, XP, quest progress, power bonus, party/raid/guild/combat runtime or Mini App work ships here.
- Postal-specific achievements are deferred until the achievement catalog has explicit postal trigger keys; existing gift achievements are not overloaded.

## [0.2.12] - 12026-06-29 - Two-Enemy Threat Simulation and Outlier Tuning

### Added
- Extended `simulate:combat` with `--encounter one-enemy|two-enemy-threat`, `--races all|id,id` and `--threat-bonus N`, plus deterministic per-level/class/race aggregate summaries and two-enemy roster output.
- Added focused two-enemy simulator coverage and persistent two-enemy reward replay coverage so threat fights keep one terminal settlement and one stored reward.

### Changed
- Softened two-enemy threat pressure by applying a named backup-enemy HP guard, skipping backup actions on alternating pressure turns while both enemies live, and reducing backup response damage before it reaches the hero. The HP guard was later superseded in `0.2.25`; backup enemies now keep full level-derived HP.
- Tuned targeted 0.2.11 outliers without changing reward math: the zero-declaration tax dragon now uses controller/tiny-boss weighting, its two signature actions are standard-band, the siege iron varenyk loses the generic construct tag and its armored filling shield/counter loop is smaller, and Bisyny/Molfar Soul race guardrails are slightly stronger.
- The simulator now counts all stored `enemyActions` instead of only the primary monster response, so shields, heals, telegraphs and skills from two-enemy runs show up in summaries.

### Validation
- Final human-ish one-enemy aggressive same-level sweep over levels 3-13, all classes, 30 runs per matchup: 85.9% wins, 12.6% losses, 5.7 average turns.
- Final human-ish two-enemy threat same-level sweep over levels 3-13, all classes, 30 runs per matchup: 48.1% wins, 46.9% losses, 6.5 average turns. This is still intentionally dangerous, but no longer the near-zero death spiral seen before guards.
- Compact all-active-race two-enemy sweep over levels 3-13, all classes, 10 runs per matchup: level aggregates ranged from 31.7% to 64.7% wins, keeping hard matchups visible for later tuning.
- Direct targeted outlier probes moved `monster.zero-declaration-tax-dragon` from roughly 37.2% to 73.1% wins and `monster.siege-iron-varenyk` from roughly 49.7% to 78.0% wins in the focused same-level matrix.

### Unchanged
- Rewards, loot, XP/gold formulas, quest progress, threat-history persistence, Yeger/Shynok/gifting/remort/equipment/title-power semantics and schema are unchanged.
- This slice adds no new player-visible action, durable milestone or once-per-period gate, so it adds no achievement hook, remort reset handling or bot `/dev_*` command.

## [0.2.11] - 12026-06-29 - Combat Balance and Monster Signature Proof

### Added
- Added a small presentation-only monster signature proof pack for stored monster ability ids: selected monster skills and telegraphs now render short Ukrainian signature lines in active fight cards, multi-enemy responses and combat journal replay.
- Added focused presenter coverage for live, multi-enemy and journal replay of stored monster skill/telegraph ids.

### Changed
- Rebalanced generic monster combat stat derivation so levels after 5 grow in a bounded curve instead of outpacing character progression sharply at levels 6-13.
- Tuned a few player ability constants after simulation evidence: Warrior, Bureaucramancer, Rogue, Ranger and Priest action damage/cooldown profiles were tightened, and Priest's strict blessing now keeps a small direct-damage component.
- Guarded monster impact signature copy so stored missed/no-effect skills can still name the skill without inventing a consequence line; impact flavor now appears only when stored damage or effect text exists.
- Pinned the 0.2.11 class tuning constants and updated monster-stat regression expectations.

### Validation
- Baseline aggressive same-level simulation before tuning collapsed after level 5, with level 9-13 win rates roughly in the 0.7%-7.9% range on the human-ish sweep.
- Final 100-run human-ish aggressive same-level sweep over levels 3-13 ended at 84.2% overall wins and 5.7 average turns; level bands ranged from 74.1% to 93.9% wins.
- Final compact active-race sweep over all current active races ended at 80.3% overall wins and 6.1 average turns; known hard outliers remain visible, especially `monster.zero-declaration-tax-dragon`, `monster.siege-iron-varenyk` and softer race/class pairings.

### Unchanged
- Rewards, loot, XP/gold formulas, quest progress, Yeger/Shynok/gifting/remort/equipment/title-power semantics and persistence schema are unchanged.
- Balance/signature visibility does not add a durable player milestone, so no new achievement hook ships in this slice.

## [0.2.10] - 12026-06-28 - Active Cosmetic Title Selection MVP

### Added
- Added active cosmetic title selection from `/hero` through `🏷️ Титули`, backed by a nullable `characters.active_cosmetic_title_grant_id` pointer and a Prisma migration.
- Added title-list rendering for earned `CharacterCosmeticTitleGrant` records with active markers, source achievement provenance, empty state, archive-safe unknown rows and a clear action.
- Added compact `v1:ach:titles`, `v1:ach:tset:<life>:<grantRowId>` and `v1:ach:tclr:<life>` callbacks with Telegram byte-length coverage.
- Added server-authoritative ownership checks for selecting titles: callbacks select by owned grant row id, then store the selected cosmetic title grant id on the character.
- Added shared social display formatting for selected active cosmetic titles with HTML escaping and compact truncation support.
- Added optional active-title display snapshots to duel result JSON and turn-based duel state JSON, preserving replayed duel history while old rows remain valid.
- Added a rewardless first-title-selection achievement, `achievement.journey.cosmetic-title-selected`, without granting another title.

### Changed
- `/hero` now offers both `🏅 Ачівки` and `🏷️ Титули`.
- Character cards show a separate compact `Косметичний титул` line when an active cosmetic title is present. The generated race/class title remains separate for gameplay and flavor routing.
- Presence, nearby duel, gift target selection, Korchma arrival, duel invite/accept/result/share/rematch/terminal headers and duel-winner board rows now show selected active cosmetic titles where compact.
- Public/social surfaces resolve only enabled active cosmetic title ids; unknown or disabled active title ids are omitted outside owner title management.
- Duplicate select and clear callbacks replay canonical title state without duplicate rows, notifications, achievements or mutations.
- Old-life title mutation callbacks stale out via remort-count callback tokens while active cosmetic title state itself may survive remort.

### Unchanged
- Cosmetic titles grant no XP, gold, items, stats, combat power, loot odds, quest progress, Yeger/Shynok/remort progress, donor perks or paid advantage.
- Active cosmetic titles do not affect Adventure Choice, combat formulas, duel formulas, monster selection, rewards, hidden selectors, title abilities or title combat buttons.
- Active cosmetic titles do not affect presence eligibility, nearby targeting, duel score snapshots, leaderboard ordering, gift transactions, Shynok round rankings or Bard performance resolution.
- Remort preserves earned achievement and cosmetic title grant rows.

## [0.2.9] - 12026-06-28 - Daily Korchma Rounds

### Added
- Added `Корчмарський обхід` / `Ревізія здорового глузду`, a level 3+ once-per-Kyiv-day route with exactly three persisted authored incidents: one at `location.korchma.yard` / `Задвірок корчми` and two at distinct Korchma interior locations.
- Added the 13-scene v1 daily content pack. Each scene has exactly three authored actions and deterministic authored outcomes, with content validation for scene/action uniqueness and shape.
- Added a pure Kyiv day helper based on `Intl.DateTimeFormat(..., { timeZone: "Europe/Kyiv" }).formatToParts()` and focused tests for winter, summer, midnight rollover and both DST transition periods.
- Added compact `daily_actions` rows for offer, step and reward state. No Prisma schema or migration was needed.
- Added rewardless daily-round achievement hooks and definitions for 1, 7 and 13 completed `Корчмарський обхід` runs, using trigger `daily.korchma-round.completed` and not reusing Shynok beer-round ids.
- Added `location.korchma.yard` as a public outside presence location. It is not part of `KORCHMA_INTERIOR_LOCATION_IDS` and is not accepted by `isKorchmaInteriorLocation()`.
- Added local `/dev_reset_korchma_round` to clear the current Kyiv-day daily-round offer, step and reward rows for manual QA.

### Changed
- Quest Hub now surfaces the daily round when available, with qualitative pre-choice copy only. Exact reward appears after the explicit turn-in.
- The daily overview lists scene locations without direct scene-location teleport buttons. Players walk through ordinary Korchma navigation, and opening a location with an active unfinished daily scene shows that scene there.
- Turn-in-ready daily overview cards now route players back to the Quest Table instead of exposing a remote claim button. The actual `Здати обхід` claim remains on the Quest Table.
- Yeger Corner now groups paid bandage bundles and the ranger free bandage under a compact `🩹 Бинти` submenu while preserving old direct bandage callbacks for existing cards.
- The earned achievements tab now sorts newest unlocks first, while all/locked tabs keep catalog order.
- Pressed reply-keyboard location labels now send the movement notice before the destination card, so cellar/daily-location cards no longer appear above their arrival line.
- The Korchma yard now behaves as a real reply-keyboard current location, wrong-location daily step cards route to the required place, and daily step claims use a repository-level per-day prefix guard so double-taps cannot create more than two step rows.
- Final turn-in requires the Quest Table and grants a deterministic level-scaled XP/gold spread once per Kyiv day, with duplicate/restart replay returning the stored result.
- The level 4+ grownup cellar roleplay route cannot grant the bottle on the first attempt, and later attempts are capped at a 13% success chance. The cheese seal remains the guaranteed expensive route. Turning in the bottle now grants 40 XP + 180 gold, so it cannot skip a level 4 character straight to level 6.

### Unchanged
- Remort does not clear same-day daily-round progress or duplicate the final reward. Old-life mutating callbacks stale out through the compact life token.
- Active combat and pending Barrel state block daily-round mutations.
- The daily round has no streak, catch-up, reroll, item drop, stat roll, injuries, fight handoff, third-step bonus, scheduler, Mini App UI, shop, market, raid, party or new economy system.

## [0.2.8] - 12026-06-28 - Achievements and Cosmetic Title Records

### Added
- Added the first rewardless achievement catalog in `src/content/achievements.ts` with stable ids, categories, Ukrainian titles/descriptions, hidden locked hints, sort order, trigger metadata, progress targets, status flags and optional cosmetic title grant ids.
- Added validation coverage for unique achievement ids/sort order, hidden spoiler safety, disabled future triggers, stable cosmetic title grant ids and absence of XP/gold/item/stat/combat reward fields.
- Added Prisma persistence for `CharacterAchievement`, `CharacterAchievementProgress` and `CharacterCosmeticTitleGrant`, indexed by character and achievement/title ids.
- Added `AchievementService` and `PrismaAchievementRepository` for idempotent unlocks, monotonic progress and title-grant provenance tied to the source achievement.
- Added the `/hero` entry button `🏅 Ачівки`, achievement pagination callbacks, earned/locked/hidden rendering and grouped unlock notification copy.
- Added seed unlock hooks for existing successful boundaries: character creation, level reached, combat finished, problem quest turn-in, item received through existing reward claims and item equipped.
- Expanded the seed catalog from a starter handful to 106 enabled achievements plus 12 hidden disabled future placeholders, covering race/class identity collection, the achievement-list opener, level/remort milestones, starter quests, combat counts/outcomes, problem-chain stages through 93, Adventure/Yeger/starter ledgers, carried manatky totals, `Бинт відповідальної паніки` owned/used thresholds, equipped manatky counts, chest recycling, level barter, Doppleganger training wins, quick/turn-based duel participation/wins/defends, Barrel, Korchma rounds, gifts, manatka sales, Bard performances, Yeger free bandage claims, drinks, passage searches, hunt contracts, Adventure choices and Nyz threat pressure.
- Added all/earned/locked achievement filters and preserved the selected filter across pagination and recalculation.
- Added historical-date recalculation for provable old records where stored ledgers carry the original event time.
- Routed local dev level/item grant commands through the same achievement tracking/recalculation flow so QA grants can unlock level and item achievements.
- Added `docs/design/achievements-catalog.md` as the shipped achievement catalog, including secret entries and honest future ledger gaps for bestiary, news, memorial, nearby, location-history, Yeger trail and lifetime ability-use counters.
- Added `🔎 Перевірити` on the achievements page so existing characters can idempotently recalculate currently provable records from stored character, fight, problem, inventory and equipment rows.
- Added safe archive rendering for unknown stored achievements so future disabled/deleted definitions do not break old rows.
- Disabled the impossible current `achievement.level.23` row as a hidden future placeholder while the playable level cap remains 13, so it no longer appears in visible completion totals unless already stored as an archived earned row.
- Added a project rule that new player-facing gameplay functionality should add matching achievements/hooks for visible new actions, milestones and odd outcomes, or explicitly document why achievements are out of scope for that slice.
- Documented class/race ability-use achievements as the next counter-backed expansion path: future 42-use records should ship with durable ability-use counters instead of unverifiable placeholders.

### Changed
- Hero cards now include an inline `🏅 Ачівки` action; the existing restore-to-full shortcut remains available beneath it when applicable.
- Successful onboarding, combat rewards, problem turn-ins and equipment changes can send short grouped achievement notifications after their canonical result cards.
- Level achievement progress is stored as a monotonic snapshot and does not move backward on replay or lower-level events.
- Achievement progress can now be refreshed from persisted state without changing rewards, combat state or old reward ledgers; historical dates are used where the source rows can prove them.
- Non-level combat, problem-chain, inventory and equipment thresholds now unlock from the successful action that reaches the current persisted count instead of requiring a manual `🔎 Перевірити` press.
- Disabled future definitions are excluded from player list pages and completion totals; already-earned disabled/retired ids still render as safe archive entries.

### Unchanged
- Achievements and cosmetic title grants are records only: they grant no XP, gold, items, stats, loot odds, quest/Yeger/Shynok/remort progress, combat power, donor perks or paid advantage.
- Active title selection, active title abilities, title combat buttons, broad telemetry, automatic background backfill, party/raid runtime and bestiary collection remain future slices.
- Remort does not remove achievements or cosmetic title grants.

## [0.2.7] - 12026-06-28 - Player Abilities MVP

### Added
- Added typed player ability catalogs in `src/content/playerAbilities.ts` with stable class/race ids, Ukrainian labels, target scopes, recipes, costs, cooldowns and validation-oriented tags.
- Added one race ability for every active onboarding race: Людисько `ability.race.practical-improvisation` (0 mana, cooldown 3, single-target trick), Гном `ability.race.low-center-of-gravity` (0 mana, cooldown 4, self/all-ally guard fallback), Ельф `ability.race.offended-precision` (0 mana, cooldown 3, accurate single-target trick), Бісини `ability.race.margin-note` (1 mana, cooldown 4, all-enemy social/control), Дрантогор `ability.race.step-through-the-border` (1 mana, cooldown 4, single-target trick plus response mitigation), Домовик `ability.race.under-stove-stash` (0 mana, cooldown 4, lowest-HP ally/self heal and guard), Русалка сухопутна `ability.race.dry-tide` (2 mana, cooldown 4, all-enemy spell plus small self-heal), Орк-інтелігент `ability.race.peer-reviewed-smash` (0 mana, cooldown 4, stronger physical single target) and Мольфарська душа `ability.race.fog-amulet` (1 mana, cooldown 4, all-ally/self ward plus small non-recursive counter).
- Added the player `race` combat action for persistent fights, training doppelganger turns and turn-based duel turns, with callback parsing, compact keyboard buttons and Telegram-limit coverage.
- Added combat summaries for ability source, target scopes, per-target enemy results and ally/support results so journals and result cards replay stored group effects.
- Added Training Doppelganger battle journal callbacks and a local `/dev_reset_doppelganger` helper for cooldown QA.
- Added hidden critical fumbles for player class/race abilities in persistent fights, training and turn-based duels: each active combat/duel state tracks a deterministic 93-use cycle per ability, stores the fumble outcome in the turn summary and replays it without rerolling.
- Added focused catalog, callback, keyboard, presenter and combat-domain tests for race/class ability coverage, cooldown independence, support fallback, all-enemy race hits and refreshed labels.

### Changed
- Refreshed class abilities through the shared catalog: Warrior keeps `skill.forceful-strike` as a 0-mana single-target physical strike with cooldown 1; Mage `skill.hot-spell` is now all-enemies spell damage at 5 mana/cooldown 2; Varenyk-mancer `skill.boiling-filling` is all-enemies spell damage plus self-heal at 4 mana/cooldown 2 and preserves old hot-spell cooldown compatibility; Bureaucramancer `skill.form-thirteen-b` is all-enemies social/control at 4 mana/cooldown 3; Bard `skill.dangerous-couplet` is all-enemies social damage plus hero guard fallback at 4 mana/cooldown 3; Rogue `skill.shadow-cut` remains single-target trick damage with response mitigation at 0 mana/cooldown 2 and preserves old trick-shot cooldown compatibility; Ranger `skill.trick-shot` is now primary-plus-splash trick damage at 1 mana/cooldown 2; Priest `skill.strict-blessing` is support-first heal/guard with tiny smite fallback at 4 mana/cooldown 3; Kharakternyk class `skill.steppe-side-eye` is all-enemies trick/control at 2 mana/cooldown 2.
- Persistent fight, training and turn-based duel cards now show class and race ability buttons when available; cooldown notices name ability labels from the catalog.
- Class and race cooldowns now coexist in `state.cooldowns.abilities` keyed by ability id. Class skill cooldowns still mirror through `cooldowns.skill` for legacy JSON, old cards and existing class-skill checks; race cooldowns do not collide with class skills.
- One-enemy combat, two-enemy threat escalation, training doppelganger player actions and turn-based duel actions now share the same pure player ability resolver for direct damage, all-enemy damage, primary-plus-splash, self-heal, ally/self heal, all-ally/self guard, response mitigation and small non-recursive counters.
- Turn-based duel support abilities now apply their session-only healing/guard summaries instead of spending mana/cooldown for a zero-effect action, and duel JSON preserves race pending actions plus ability-keyed cooldowns.
- Player ability fumbles consume the committed action's normal mana and cooldown, do not advance on stale/unavailable/no-mana/cooldown attempts, cancel all normal ability damage/support/guard/response-mitigation/counter/direct-hit runtime effects, and map support fumbles to enemy healing while damage fumbles can hurt the actor.
- Turn-based duel replay parsing now round-trips stored `defended` and `critical-fumble` action outcomes; unknown current-version outcomes are treated as malformed/repairable state instead of being silently shown as misses.
- Training Doppelganger starts now include `Порада дня`, active cards use the monster-fight-style `Бій: N хід` header and 23-second action hint, and terminal result cards expose the stored battle journal when turns were recorded.
- Combat simulation and analytics reports now distinguish class usage, race usage, fumble counts, AoE hits and support counts while keeping fumbled support out of successful healing totals.
- Passive HP/mana sync now preserves effective resource maxima from remorts and equipped manatky instead of clamping healed/rested characters back to the stored base maxima.

### Unchanged
- Deprecated hidden `race.kharakternyk` intentionally has no race ability button; old characters rely on the active `class.kharakternyk` class ability.
- No party/raid runtime, quick-duel formula rewrite, wagers, ratings, tournaments, new monsters, loot/economy/Yeger changes, item expansion, Prisma migration or remort redesign ships in this slice.
- Critical fumble tracking is scoped to the stored active combat/turn-based-duel JSON in this PR; a durable per-character/per-ability lifetime counter remains a possible future hardening if the mechanic needs to span separate sessions.
- Doppels keep their existing copied skill AI; their frozen identity/debug state now records the copied class/race ability ids, but they do not use a new race-ability AI policy yet.

## [0.2.6] - 12026-06-27 - Passage Search MVP

### Added
- Added timed `🔎 Пошукати` actions for the `Спуск до Низу` surface, the `Ярус I: Сутерени Корчми` choice card and all three first-tier Nyz passages.
- Added durable `passage_search_actions` persistence with one running search per character, replay-safe terminal results, server-owned tokens and active-action locking.
- Added per-node search cooldowns through existing character cooldown storage, so searching one passage does not consume the cooldown for another passage or the descent surface.
- Added a small deterministic passage-search loot roll with gold and the existing `Бинт відповідальної паніки`; `Спуск до Низу` uses a separate tiny safe table.
- Added danger resolution for risky passage searches: if the stored monster reacts, the search grants no reward, starts the existing passage combat from the frozen encounter token and skips the first hero turn.
- Added safe passage-rest searches during the short monster-rest window: passage cards can offer `🔎 Пошукати` without creating or refreshing a pending monster preview, and the search stays danger-free even if a new monster would appear later.
- Defeating a pending passage monster now puts that same passage into the short 3-minute rest window instead of immediately creating a fresh monster preview on reopen.
- Added a passage-search completion scheduler: due searches with a stored chat target now resolve automatically and send a new terminal result message instead of requiring a manual `Перевірити` tap.
- Added `v1:search:*` callbacks, running/check/cancel keyboards, Ukrainian search result cards and local `/dev_reset_passage_search` for manual timer/cooldown QA.
- Added focused domain and callback tests for search constants, danger/loot behavior and callback parser limits.

### Changed
- Nyz passage preview cards now include `🔎 Пошукати` beside `⚔️ Атакувати`; the actual `Спуск до Низу` and `Ярус I: Сутерени Корчми` cards also offer safe search buttons.
- Search start callbacks now re-read current presence server-side: descent search only starts from `Низ`, the `Ярус I` safe search only starts from `Сутерени Корчми`, passage search only from the matching passage, and stale remote buttons do not spend cooldown, create search rows, refresh encounters or start combat.
- Active search now blocks old fight/place/reply-keyboard actions with a confirm-cancel card instead of letting stale buttons start movement or combat over the timer.
- Search buttons now disappear from fresh Nyz surface/passage cards while that node cooldown is still active.
- Passage-search danger handoffs now keep the normal new-fight intro before the active fight card, including threat escalation lines, `Натиск Низу`, full opponent names and the battle start tip even though the first hero turn is skipped; due dangerous searches resolved from current-location or place actions also send the canonical fight card immediately.
- Bandage reservation recovery now avoids false reserved-item blocks: duplicate restore-to-full races replay the canonical live confirmation card, ordinary one-bandage use plus restore-to-full can replace each other's own pending previews, older own pending bandage previews no longer make inventory or full-HP recovery say the item is reserved, and combat bandage use can replace the player's own pending item-use preview without replaying the previous combat turn as if it happened again.
- Inventory now lists one-use consumables before other carried items, and the restore-to-full button uses the roll icon on both the hero card and item-use result cards.
- Search cooldown is consumed at start and is not refunded by cancel, empty results or monster attacks.

### Unchanged
- No broad loot table, new item catalog, race/class/title search bonuses, party search, market, crafting, Mini App UI or new combat damage formula ships in this slice.
- Passage monsters still use existing pending passage encounter and persistent fight machinery; search does not introduce a second monster-state system.

## [0.2.5] - 12026-06-26 - Bard Performance MVP

### Added
- Added a narrow Bard-only non-combat performance for `class.bard` characters at level 3+ using stable technique id `technique.class.bard.shynok-performance`; it can start solo in Shynok or in any other current location with another active same-location character.
- Added persisted `bard_performances` and `bard_performance_reactions` rows with frozen effective CHA/LUCK/level snapshots, injected-RNG grade resolution, house payout replay data, a 93-minute per-location cooldown and a 13-minute audience response window.
- Added a small Shynok-only house gold faucet by grade (`1/3/5/13`) capped at 23 gold per Bard per Kyiv day; tips are separate voluntary player transfers and do not count toward the house cap.
- Added explicit same-location audience reactions: applause, decline, or voluntary tips of `1`, `3`, `5` or `13` gold, with one response per active audience character.
- Added Bard performance nearby/Shynok buttons, short Ukrainian result/audience/feedback cards, callback parsing under the Shynok namespace and local `/dev_reset_bard_performance` for manual cooldown/day-cap QA.
- Added focused domain, service, Prisma repository, bot callback/keyboard/help/presence and migration tests for the performance flow.

### Changed
- Shynok now shows the Bard performance action for eligible Bards even without live listeners; `👀 Хто поруч` still shows the action only with another active character in the same non-Shynok location.
- The tavern module keeps ownership of Bard performance callbacks and the dev helper, preserving the `0.2.2` vertical bot-module and composition-root boundaries.
- Audience responses now re-check the performer before mutation, so applause, declines and tips do not settle if the Bard left the performance location, entered combat, joined a pending Barrel raid or remorted after starting the performance.
- Insufficient-gold tip responses now report the selected tip amount while leaving the offered reaction unchanged for a different response.
- Bard performance cards now label audience count as the start snapshot, show the remaining response window separately from cooldown and clarify that new listeners join the next performance instead of being added mid-song.
- Bard performance starts now use a database live guard so concurrent start callbacks for the same Bard/location replay the live performance instead of creating duplicate rows or duplicate Shynok house payout.
- The Korchmar problem-chain paper is now server-gated to level 2+, so level 1 characters cannot take it through the Shynok button or old callbacks.
- Mantok Chest auto-pick now skips consumable/one-use manatky such as `Бинт відповідальної паніки`; manual selection can still explicitly feed them to the chest.
- The non-combat techniques docs now record this shipped MVP as a no-XP first implementation, overriding the older planning note that expected small role-action XP.

### Unchanged
- No XP, items, buffs, achievements, forced audience charges, instruments, Priest/Rogue runtime, generic profession engine, title-power mechanic, crafting, public feed or broad non-combat action catalog ships in this slice.
- Telegram delivery remains best effort only; database transactions are the authority for house payouts, tips and response completion.

## [0.2.4] - 12026-06-26 - Item Tags and One-use Bandages

### Added
- Added a narrow validated item tag contract for consumable/use/trade/duel/raid safety: `consumable`, `one-use`, `tradeable`, `trade-blocked`, `duel-blocked`, `raid-blocked`, `story`, `memory`, `sentimental` and `soulbound`.
- Added the first explicit one-use healing item, `Бинт відповідальної паніки`, with a capped out-of-combat `heal-hp` use effect.
- Added replay-safe `item_use_orders` persistence for item-use preview, reservation, confirmation, cancellation, expiry and terminal-result replay.
- Added item-use reservation checks to Shynok sales, safe gifting, Mantok Chest, Munchkin barter and remort cleanup so a live use order cannot race another item-spending flow.
- Added inventory item-detail use buttons, exact current heal previews, confirmation/cancel callbacks and result cards for usable one-use items.
- Added `До відновлення` shortcuts after out-of-combat bandage use and on the hero card when the remaining stack can fully restore HP; they consume exactly the number of bandages needed to reach full HP.
- Added a narrow Єгер supply path: any eligible hero can preview the exact bandage price/current gold, then confirm or cancel a tokenized purchase for 1, 5, 17 or 93 paid bandages, capped at 93 paid bandages per day; `class.ranger` gets a lower price and a replay-safe periodic free bandage claim.
- Added `Бинт відповідальної паніки` to the basement mouse authored loot list so ordinary monster loot can occasionally grant it through the existing persistent-fight loot path.
- Added a second Єгер unquiet board: after the first 5-monster board is completed, Єгер offers the next 17 unquiet targets with its own start/completion keys and replay-safe turn-in.
- Added local `/dev_reset_yeger_trail` to finish the pending Єгер trail wait for manual QA.
- Added local `/dev_add_bandage [count]` for manual bandage QA and allowed local `/dev_heal [HP]` during active combat.
- Added local `/dev_reset_yeger_bandage_day` to clear the Єгер paid-bandage purchase ledger for manual same-day purchase-limit QA.

### Changed
- Item content validation now rejects unknown or duplicate tags, contradictory `tradeable` + `trade-blocked`, contradictory `soulbound` + `tradeable`, `one-use` without `consumable`, and use effects that are not explicit one-use consumables.
- Safe Gifting now treats `trade-blocked` and `soulbound` as transfer-blocking tags while preserving legacy untagged priced item eligibility; gift fingerprints include tags so tag/content edits between preview and create/accept stale out safely.
- Bandage confirmation now settles HP/mana once through the canonical passive recovery math with Shynok recovery windows, then applies capped HP healing without wiping fractional mana recovery progress.
- Єгер paid bandage purchase now uses preview/confirm/cancel callbacks backed by the existing daily-action audit boundary, so duplicate confirms replay the same receipt instead of debiting/granting again; bundle buttons buy the selected quantity and cannot exceed 93 paid bandages for the day.
- The free class-ranger Єгер bandage button now remains available before the level-4 Єгер quest gate; the quest itself stays level-gated.
- Єгер paid bandage previews now say `Після купівлі` instead of `Здобуто`, so the receipt does not imply the item was granted before confirmation.
- Єгер paid bandage confirms that are too expensive now offer a tokenized smaller bundle for the maximum currently affordable quantity, respecting the class-ranger discount and the daily paid cap without spending gold until the player confirms that fallback.
- Out-of-combat item use blocks at full effective HP, on equipped/unknown/drifted/reserved stacks, across remort-life changes and after token expiry; active persistent PvE combat routes eligible one-use manatky through the turn-bound combat item-use path instead.
- Combat item-use now honors the active `solo-combat` lease when consuming a bandage, so healing applies during live persistent PvE turns instead of replaying the current turn card.
- Confirmation settles passive HP/mana recovery at confirmation time, consumes exactly one item unit, caps healing to the current effective max HP, stores the canonical result and replays duplicate/concurrent confirms without another consume.
- Remort cancels live pending/processing item-use orders without consuming their reserved stack.
- Remort resets all current-life daily-action rows, cooldowns, hunt contracts and Barrel raid notification rows, so paid Єгер bandage purchase counts, once-per-life Єгер boards and other current-life quest/cooldown gates start from zero after remort.
- The remort daily-action maintenance cleanup now defaults to all stale pre-remort daily-action rows while keeping `--yeger-only` as a narrow audit mode.
- Shynok manatka sales now round the basket-level 42% payout up to the nearest whole gold instead of truncating fractional gold down.
- Lost multi-enemy persistent fights now grant half of normal XP for each enemy defeated before the loss, while still granting no gold, no items and no quest progress for the failed fight.
- The task, roadmap, phase-2, balance, security, technical, playtesting and compact Codex context docs now distinguish this shipped bandage slice from broader shops, food, action catalogs, race abilities, achievements, titles and signature techniques.

### Unchanged
- No mana restore, damage item, buff/debuff item, broad action catalog, food, coffee, crafting, market, buyback, item-instance rewrite, duel item action, raid item action, race ability, achievement, title or signature-technique runtime ships in this slice.
- The bandage drop uses existing monster loot/reward machinery; no new broad loot weighting engine, reward multiplier or per-monster drop formula ships here.

## [0.2.3] - 12026-06-25 - Threat Escalation MVP

### Added
- Added ordinary threat escalation for normal persistent fights: after three consecutive eligible one-enemy ordinary wins, the next eligible ordinary start creates exactly two enemies.
- Added a pure threat policy with 13 stable Ukrainian escalation lines and stored `CombatState.threat` metadata so intro, restart, active and terminal replay cards reuse the same line.
- Added bounded durable combat-history lookup for recent terminal solo-combat sessions without a schema migration; the scan maps completion times before sorting by canonical `completedAt DESC`.
- Added focused policy, service, presenter, parser and Prisma repository tests for escalation, resets, excluded routes, passage attacks, two-enemy checkpoint behavior, stable copy, malformed/dropped threat metadata and history ordering.

### Changed
- Replaced the old eligible ordinary three-win monster-rest start denial with escalation for ordinary normal starts.
- Nyz passage attack callbacks now decide escalation at combat-session creation, keep the previewed monster as the primary enemy, freeze the same threat metadata/line as direct starts, and return the canonical consumed session on duplicate callbacks.
- Newly started Nyz passage fights now send the separate fight intro before the active combat card, so escalated passage starts show the warning line, full opponent roster and battle tip before later compact HP rows.
- Newly started ordinary fights now keep the separate fight intro even when the start comes from an edited callback, so the opponent roster and battle tip are not lost before the active combat card.
- Consumed Nyz passage survivor recovery no longer rebuilds stored multi-enemy/threat fights as a one-enemy continuation.
- Excluded Yeger, Adventure, training, duel, starter and dev-forced rows no longer consume the bounded ordinary threat streak window; malformed terminal rows and ordinary two-enemy rows without valid threat metadata fail safely back to base threat.
- Threat metadata now requires the current escalation line version and a known authored line id before it can count as an escalated checkpoint or grant repeat second-enemy level bonuses.
- Persistent fight state cards no longer repeat the full opponent roster after the intro; active and terminal cards keep compact HP rows with short monster labels.
- Persistent fight state cards now carry the current turn number in the heading as `N хід` and no longer spend a separate `Хід:` line.
- Passage fight callbacks no longer send an extra movement notice such as "Ви пішли у прямий прохід." after the battle card.
- Battle journal pages for two-enemy fights now show per-enemy HP rows and explicit zero-damage enemy misses instead of collapsing the turn to one generic monster row.
- Monster runtime effects now name the applied effect, use full `пунктів` wording for point deltas, show remaining actions/charges, split ongoing effect damage from the direct monster response, and persist active effect plus skill-cooldown notices into battle journal replay.
- Hero attack and class-skill turns now resolve the monster response after hero damage even when the target was defeated by that action. Same-turn final responses are persisted in turn summaries/journals, defeated responders are restricted to one offensive/basic response without self-heal/shield/support, final-enemy mutual KO resolves as a win, and hero 0 HP with another enemy still living resolves as a loss.
- Persistent fight state cards now announce newly defeated enemies, target switches and final defeated enemies with full monster names; multi-enemy response lines disambiguate colliding short monster labels with deterministic enemy numbers; the separate problem-chain progress ping reminds players that a two-enemy problem fight still counts as one problem.
- Loss, flee or expiry in an eligible one-enemy ordinary encounter breaks the streak.
- A lost, fled or expired escalated two-enemy terminal encounter resets the cycle back to one enemy.
- A won escalated two-enemy terminal encounter keeps the next ordinary start escalated immediately, even while won-fight settlement is still pending.
- Consecutive won escalated fights stack only the second enemy's requested effective-level bonus by +2 each time (`+2`, `+4`, `+6`, ...); the primary enemy stays at its normal selected level, the applied second-enemy level is capped at the current game ceiling `23`, and `CombatState.threat.pressure` preserves requested/applied bonus metadata for replay/presentation.

### Unchanged
- Rewards remain the existing single-encounter settlement contract for the whole two-enemy fight.
- Yeger, Adventure, training, duel, starter and dev-forced `/dev_two_enemies` sessions do not trigger or consume ordinary threat escalation.
- No Prisma schema, migration, reward scaling, increased XP/gold/manatka quantity or quality, Yeger escalation, Adventure escalation, target UI, three-or-more enemies, party combat or raid runtime ships in this slice.

## [0.2.2] - 12026-06-25 - Architecture Stabilization

### Changed
- Split bot assembly into explicit core, character, inventory, tavern, quest, combat and social modules while keeping command and callback behavior unchanged.
- Moved bot-facing `BotServices` and `BotOptions` into explicit typed contracts.
- Extracted combat-lock, presence and pending-raid guard middleware into named modules while preserving allow/block/redirect policy.
- Moved production repository and service construction into `src/app` factories.
- Added an explicit runtime lifecycle for health server, polling, schedulers, Telegram menu sync, deploy notifications and shutdown; shutdown is idempotent/concurrency-safe and still closes health plus disconnects Prisma if `bot.stop()` rejects.

### Added
- Added architecture tests for domain import boundaries, `createBot` orchestration, entry-point delegation, module-file inventory, command/alias inventory, callback namespace ownership and module import cycles.
- Added runtime lifecycle tests for BOT_TOKEN-missing mode, scheduler start/stop behavior, concurrent stop, stop-before-start, optional duel absence and `bot.stop()` rejection cleanup.

### Unchanged
- No gameplay feature, combat formula, reward, content, callback payload, stored combat JSON, Prisma schema or migration change ships in this release.
- Existing `0.2.1` multi-enemy foundation behavior remains one-enemy in production with dev-only two-enemy exposure.

## [0.2.1] - 12026-06-24 - Multi-Enemy Foundation

### Added
- Added a backward-compatible persistent combat `enemies` state shape for exactly one or two enemies while preserving the legacy primary `monster` mirror and `monsterId` repository boundary.
- Added deterministic primary-target behavior: attack and class skill hit the first living enemy, then the next living enemy becomes primary after the first is defeated.
- Added per-enemy enemy phase resolution so every living enemy gets its own action entry, while dead enemies never act.
- Added `/dev_two_enemies` as a local dev-reset-gated QA command that starts a controlled two-enemy ordinary persistent fight without exposing multi-enemy starts through production `/fight`, Yeger, Adventure, training or duel routes.
- Added parser tests for legacy one-enemy JSON, valid two-enemy JSON and malformed duplicate enemy identities.
- Added domain tests for primary targeting, primary advancement, separate living enemy actions and terminal win only after all enemies are defeated.

### Changed
- Persistent fight cards now show separate enemy HP rows when a stored fight has two enemies; one-enemy cards keep the existing compact shape.
- Persistent fight turn logs can store per-enemy HP snapshots and per-enemy action summaries for replay.
- Timeout and stale callback recovery rebuild all stored enemy combat stats from session JSON before resolving a turn.

### Unchanged
- Existing production fight entry points remain one-enemy by default.
- Two-enemy foundation fights grant at most the existing single encounter reward contract; there is no per-enemy XP, gold or loot multiplication.
- No Prisma migration, threat streaks, Yeger escalation, location encounter pools, target-selection UI, party combat, raids, PvP or reward scaling ship in this slice.

## [0.2.0] - 12026-06-24 - Safe Gifting MVP

### Added
- Added `🎁 Подарувати манатку` from `👀 Хто поруч` and the Shynok/bar surface for offering exactly one eligible manatka stack unit to an active same-location player.
- Added recipient accept/decline and sender cancel callbacks backed by short server-owned transfer tokens.
- Added `ItemTransfer` persistence with frozen sender, receiver, item, quantity, result and terminal-state audit data.
- Added pending Barrel raid shortcuts to the generosity rating and news archive, with both routes returning to the raid card.
- Added focused domain, callback, presenter, schema and Prisma transaction tests for eligibility, duplicate accept replay, stale content, terminal race replay and competing reservations.

### Changed
- Completed Barrel raid cards now link directly to the current Shynok social-round previews instead of the older fixed-price Korchma round flow.
- Shynok sale, Mantok Chest and Munchkin level barter eligibility now treat pending/processing gift transfers as active whole-`itemId` stack reservations.
- Remort cleanup cancels pending/processing gifts for either participant so old life-boundary reservations do not survive into the next life.

### Fixed
- Gift accept rereads ownership, equipment, content fingerprint, active combat leases, remort counts, location state and competing reservations inside the transaction before moving the unit.
- Duplicate gift creates for the same sender and `itemId` now serialize on the sender stack and converge to one live pending reservation plus one controlled stale result.
- Duplicate accept replays the completed gift instead of moving another unit.
- Decline, cancel and expiry race losers now replay the canonical stored transfer state instead of reporting the originally requested terminal action.
- Decline, cancel and expiry leave the sender item untouched and release the gift reservation.
- Sender cancel and recipient decline now send a best-effort terminal gift notice to the other side only on the actual state transition.
- Gift flow and terminal result cards now return to the actor's current location instead of always sending them to the Shynok.
- Pending Barrel raid rating and news shortcuts now bypass the pending-raid blocker, so waiting players can actually read them from the raid card.
- Shynok social-round cards keep the generosity rating visible even when the player cannot afford the frozen round price.
- Stale Shynok fallback cards now send `До Шинку` through the bar place route instead of replaying an old Shynok callback from the Barrel.
- Shynok social rounds now send best-effort private drink offer cards to recipients on the real completed purchase, and small-group launch prices are capped at 93/193 instead of using those numbers as the minimum.
- Active persistent fights found with hero combat HP at `0` now terminalize as canonical losses through the existing settlement path, so `/fight` and old attack callbacks cannot keep an active attack surface or stuck lease.
- Active pepper-vodka buff copy now says it waits for a monster fight and shows the risk as `+13%` damage instead of technical `PvE` / `×1.13` notation; duels remain excluded from drink power.
- Completed Barrel raid drink buttons now move into the current Shynok round preview instead of being rejected as stale Shynok checks while the player is still marked near the Barrel.
- Simple and fine beer recovery bonuses now match the visible tavern numbers: `+23%` and `+42%`, and recipient offer copy no longer uses unclear wording.
- Zero-HP rest guidance no longer points players at raw commands and instead says plainly that combat reopens after at least `1 HP`.

## [0.1.25] - 12026-06-24 - Phase 2 MVP Closeout

### Added
- Added canonical Phase 2 MVP release notes in `docs/history/phase2/mvp-release-notes.md`.
- Added closeout status for the accepted two-account regression/manual QA after merged and deployed `0.1.24`.
- Added explicit branch/task disposition for superseded, absorbed, deferred and future-input Phase 2 work.

### Changed
- Marked the `0.1.x` Phase 2 Social Combat MVP line closed after this release unless an emergency hotfix is needed.
- Moved safe gifting, later trading, multi-enemy combat, item tags/equipment, party/raids, tournament work, food, coffee and achievements into `0.2.x` or later planning.
- Kept `docs/ai/prompts/safe-gifting-main-codex.md` as the next implementation prompt and `docs/tasks/0.2.0-safe-gifting-mvp.md` as the next versioned task.
- Bumped the package and lockfile version to `0.1.25` so `/version`, changelog and news agree.

### Unchanged
- No gameplay runtime, Prisma schema, migration, formula, balance, economy, trading/gifting, multi-enemy, party, raid, tournament, food, coffee or achievements implementation ships in this closeout.
- Phase 1 remains closed by `0.1.0`.

## [0.1.24] - 12026-06-24 - Shynok Drinks and Mantok Sales

### Added
- Added Shynok self-drinks: `drink.thyme-tea` for 17 gold and 42 minutes of 1.13x out-of-combat recovery, `drink.simple-beer` for 13 gold and 23 minutes of 1.25x recovery with -5 pp PvE accuracy, `drink.fine-beer` for 42 gold and 42 minutes of 1.50x recovery with -10 pp PvE accuracy, and `drink.pepper-vodka` for 42 gold as a queued 23-minute next-eligible-PvE-fight modifier with 1.13x outgoing and incoming damage.
- Added one current drink slot per character with server-owned pending order tokens, explicit replacement preview, atomic confirm, lazy expiry and replay-safe completed callbacks.
- Added Shynok round-recipient offers for `Всім пива`: confirmed rounds store a frozen recipient snapshot, exact dynamic price, offer expiry, per-recipient accept/decline status and aggregate telemetry while preserving the existing generosity leaderboard purchase row.
- Added `💰 Продати манатки` in the Shynok with server-owned sale drafts, one/several/all eligible-unit selection, pagination, basket-level 42% payout preview, explicit confirm/cancel and completed replay.
- Added Prisma persistence for current drink state, self/round drink orders, round recipient offers and manatka sale drafts/results.
- Added focused tests for drink definitions, sale eligibility/payout, callback encoding, segmented recovery, combat drink modifiers and Shynok schema coverage.

### Changed
- Tea and beer now segment normal passive HP/mana recovery at drink start/end, so recovery bonuses are forward-only and never retroactive.
- Eligible persistent solo PvE fights now freeze beer accuracy penalties into `CombatState`; non-expired queued pepper vodka is consumed at fight start and freezes its damage modifiers into that stored state.
- `Всім пива` now previews launch prices from the frozen recipient count: simple `min(93, 13 * recipient_count)` and fine `min(193, 42 * recipient_count)`.
- Shynok callbacks revalidate place and active gameplay locks before mutating drink, round or sale state.

### Fixed
- Manatka sale confirm now rereads inventory, equipment and reservations inside the DB transaction, recomputes eligibility/fingerprint/value/payout and returns `stale-selection` without mutation when the basket drifted.
- Social round confirm now uses the stored order recipient snapshot rather than a fresh presence list, so duplicate or delayed confirmation cannot silently change the price or recipients.
- Social round offer accept now requires a second stale-safe replacement confirmation when the recipient already has a live timed or queued drink; the first `Випити` preview does not mutate the offer, drink state or telemetry.
- Self-drink, social-round and manatka-sale confirmations now use guarded status claims before destructive mutations, so duplicate confirms replay canonical completed state instead of spending, creating purchases or consuming inventory again.
- Mantok sale confirmation now rolls back the whole transaction if any guarded item decrement fails after the sale is claimed.
- Combat drink modifiers now round-trip through persisted solo combat JSON, direct/Yeger/Adventure/passage starts use the same verified drink snapshot, queued pepper vodka is consumed in the same transaction as solo session and lease creation, and exact drink-state IDs prevent replacement races from consuming a newer vodka.
- Timed drink recovery now keeps historical replacement/expiry windows for lazy resource sync and uses weighted integer regeneration, so sub-point progress is not lost at drink start/end boundaries.
- Completed Shynok manatka sale callbacks now reach repository replay instead of being pre-rejected as invalid, and sale selection updates lazily expire old drafts before mutating selection state.
- Round recipient accept/decline/expiry transitions now CAS from `offered`, and round telemetry is refreshed from recipient rows instead of read-modify-write counters.
- Ready Yeger trail checks now ignore the ordinary Nyz monster-rest gate and can start the targeted unquiet fight immediately, while unrelated active fights still block the trail.
- Targeted duel declines now send the challenger a best-effort notice only on the actual decline transition, so repeated old decline callbacks do not duplicate notifications.

### Unchanged
- Coffee, food buffs, PvP drink power, item instances, buyback, general shops, auctions, markets, trading and broad inventory rewrites are still out of scope.
- Starter fights, training doppelgangers, quick duels and turn-based PvP do not receive drink modifiers.

## [0.1.23] - 12026-06-23 - Encounter Preview Memory and Anti-Repetition

### Added
- Added durable `pending_passage_encounters` storage for ordinary Nyz passage previews. Each pending row stores a server-owned token, character ownership, passage/origin, difficulty, frozen monster ID, frozen base/effective levels, rules version, seed metadata, expiry and consumed combat-session link.
- Added a nullable unique active key so one character can keep one live pending preview per passage while consumed/expired rows remain historical.
- Added focused service coverage for same-passage sticky previews, expired-token refresh, exact frozen monster consumption and ordinary anti-repeat fallback order.
- Added remort detail buttons on the memorial board so visible `Реморти Тринадцятки` groups can open a remort-specific level-first board.
- Added Prisma-backed pending encounter repository coverage for same-passage reuse, distinct passages, consume/expiry races, wrong-owner and stale-version rejection, active-lease conflicts, wounded re-attack relinking, and full-health survivor relinking.
- Added bounded-history repository coverage proving ordinary anti-repeat scans past newer active, Yeger and adventure sessions instead of starving on the first page.

### Changed
- Nyz passage `Атакувати` buttons now carry compact opaque server tokens instead of Telegram-returned encounter seeds.
- Reopening the same passage before preview expiry returns the same monster and effective level; opening another passage can keep its own pending preview.
- Passage previews now stay reusable for 93 minutes when not attacked, then expire into a fresh server-owned preview instead of leaving the same monster parked for hours or days.
- If an ordinary Nyz passage monster survives a lost, fled or expired fight, the same consumed preview token can show that same survivor again until the original 93-minute trail expires, even when the player dealt no damage; re-attacking starts a fresh combat session at the monster's recovered HP.
- Nyz passage preview copy now includes the shown monster's level before the player commits to attacking.
- Wounded passage previews now show the monster's current recovered HP while it is below full health, so fast player recovery can matter before the wound closes.
- Pressing an expired, stale or catalog-invalid preview button now refreshes the preview with a short explanation instead of silently starting a different monster.
- Consuming a pending preview atomically links it to at most one persistent solo combat session; duplicate attack callbacks recover the linked session when available.
- Pending preview expiry and consumption now use guarded status/version transitions. Stale callers reread the current row instead of overwriting consumed session links or turning duplicate races into new fights.
- Consumed survivor-trail re-attacks now validate the prior linked terminal non-win session in the same transaction before relinking a fresh combat session.
- Ordinary Nyz monster selection now checks bounded recent ordinary fight history before choosing: it avoids the immediately previous monster when alternatives exist, avoids the last three distinct monsters when the legal pool is large enough, and falls back to the original deterministic pool for small candidate sets.
- Legacy seed-shaped passage callbacks no longer select or start a client-chosen monster; they refresh a current server-owned preview instead.
- Nyz passage preview copy now avoids monster gender pronouns and accusative-name wording until monster grammar metadata is added.
- Cellar start combo flavor now separates the title-in-cellar sentence from the following race/class beat with a blank line.
- Remort-specific memorial details now treat `Реморт N` as the life after remort N: level 1 comes from that remort ledger start, level rows ignore base-life milestones before it, and level 13 can be derived from the next remort completion when milestone rows are not available.

### Fixed
- Terminal ordinary and training fight settlement now stores durable resource/training substeps before final completion, so crash/replay recovery can finish rewards without spending HP/mana recovery anchors or training cooldowns twice.
- Post-remort level milestones now use remort-specific daily-action keys instead of reusing base-life `milestone.level.N` keys, so remort detail boards can show levels 2-13 reached in the current life.
- Memorial-board backfill now writes missing current-life remort milestones separately from base-life milestones, so already-remorted characters who have climbed again are no longer stuck showing only the remort's level 1 row.
- Memorial-board remort detail rows now infer missing historic levels 2-12 from the next completed remort, so older lives that already reached level 13 no longer disappear from intermediate level rows.
- Memorial-board remort detail rows now deduplicate legacy and backfilled milestone rows for the same character/level, preferring real recorded rows and preserving provenance in `daily_actions.resultJson`.
- Location-changing place callbacks now send a short movement line with the updated persistent keyboard before rendering the new place card, so the main place button catches up without a debug-like `📍 Тепер:` status message.
- Passage attack callbacks are now bound to the server-owned encounter and the player's current passage location; old buttons from another passage refresh the current place instead of moving presence or starting combat.
- Active persistent fight cards now repeat the fight header, opponent name and monster level, and show the start tip on the card that keeps the combat buttons.
- Successful remort during active solo or training combat now canonically expires the old session, releases the active combat lease and cancels live pending/consumed passage trails without granting combat rewards or overwriting the new-life starter HP/mana; unsupported turn-based duel leases still block remort without mutation.
- Ordinary fight, training and Adventure entry points now preserve unsupported active combat leases as blockers instead of treating them as no fight; terminal pending sessions remain recoverable even after wall-clock expiry.

### Unchanged
- Yeger targeted encounters, adventure handoff fights, training doppelgangers, starter fights, monster ability loadouts, timeout auto-defend and reward/Yeger progression rules are unchanged.

## [0.1.22] - 12026-06-22 - Monster Abilities, Titles & Battle Journal

### Added
- Added typed monster ability and combat profile catalogs: 132 stable monster ability definitions and 93 monster loadout profiles are now validated against the current roster.
- Added a backward-compatible `monsterRuntime` block in combat state for newly started ordinary monster fights. It freezes selected ability IDs, AI profile, cooldowns, once-per-fight use, telegraphs, shields and short-lived runtime effects.
- Added a pure monster AI/effect resolver for ordinary PvE monsters. It supports basic attacks, monster defend, content-driven abilities, actor-local cooldowns, once-per-fight abilities, class-skill locks, shields, self-heals, simple marks, burn/bleed ticks, mana pressure and telegraphed heavy actions.
- Added compact active-fight presentation for named monster abilities, telegraph warnings and one concise effect consequence.
- Added monster action-mix and ability-usage metrics to the production combat simulator, with default coverage through level 23.
- Added authored combo-title triples for all 54 currently selectable race/class pairs, so active onboarding combinations no longer fall back to generic local-significance titles.
- Added distinct class skill identities for Varenyk-mancer (`skill.boiling-filling`, `🥟 Кипляча начинка`) and Rogue (`skill.shadow-cut`, `🌘 Тіньовий різ`) while preserving their previous numeric combat profiles.
- Added durable persistent-fight `turnLog` entries in combat state JSON plus terminal `📜 Журнал бою` paging with first/previous/next/last navigation and a return to the result card.
- Added separate presence locations for the Nyz left, straight and right passages.
- Added Nyz passage pre-fight previews: selecting a passage now shows the spotted monster and starts combat only after `Атакувати`, with the preview encounter seed carried into the created fight.
- Added focused coverage for content totals, loadout gates, frozen runtime state, legacy no-runtime fights, ordinary anti-spam, telegraph impact, shields/effects and Prisma JSON round-trip.
- Added an explicit per-component monster ability execution plan used by validation, AI legality and resolution. Components now record their source parameter, target actor, condition, duration/charges, direct-hit requirement and applied-result key.
- Added an explicit runtime-effect polarity/removability/source contract in combat-state JSON, with safe derivation for old effect rows that lack the new metadata.

### Changed
- New ordinary monster fights now freeze authored ability loadouts at encounter start. Explicit authored IDs fill identity slots first; deterministic fallback can fill only missing legal slots created by effective-level scaling.
- Ordinary monsters cannot use an ability immediately after a monster ability. Boss profiles may chain at most two different abilities, never repeat the same ability consecutively, then owe a basic attack or defend.
- Failed flee responses and timeout auto-defend recovery now call the same monster AI path as manual combat turns.
- The existing `first-ability` bark trigger now fires from real ordinary-monster ability use, while stored bark IDs still replay deterministically.
- Group-ready target scopes degrade safely to the current one-hero, one-monster runtime; no party, raid or multi-enemy runtime was added.
- Mage and Ranger keep their existing `skill.hot-spell` and `skill.trick-shot` identities; Varenyk-mancer and Rogue now render their own class action labels in persistent fights, training doppelganger fights and turn-based duels.
- Persistent PvE timeout recovery now commits `defend` with `timeout-auto-defend` instead of a basic attack; legacy `timeout-auto-attack` JSON/debug values remain readable.
- Nyz passage buttons now enter `Лівий прохід`, `Прямий прохід` or `Правий прохід` as separate locations; `Хто поруч`, nearby duel validation and post-fight `Новий бій` preserve the selected passage.
- `Хто поруч` now hides the `Кинути виклик присутнім` button when the current location has no other active duel target.
- Active fight cards now place the 23-second timeout note directly under the named `що робимо?` prompt instead of above it or after an empty spacer.
- Active persistent fight and training cards now keep `Вдарити` and `Захищатися` in one compact first button row.
- The persistent reply keyboard now labels its place button with the current known location where possible; location-changing inline callbacks no longer send standalone `📍 <location>` refresh messages, and location reply buttons reopen the current place/actions instead of always jumping to the generic korchma entry.
- Active persistent fight cards no longer show the service-note `Хід записано` or an `Остання дія` heading, skill cooldown rows name the exact skill, and basic monster counterattacks say what they attacked in response to.
- Monster skill summaries now include visible mechanical consequences: damage, effect text, or an explicit no-direct-damage line.
- Monster ability parameters now compile through a central runtime audit. Unsupported, invalid, effectless or semantically contradictory parameters fail validation instead of silently becoming flavor-only fields.
- Optional self-heals no longer make the whole ability illegal when the monster is healthy; other actionable components such as shields, self-buffs, damage and eligible purge riders still resolve normally.
- Low-HP damage parameters now apply as additive bonuses to the base multiplier instead of replacing the multiplier.
- Turn-cycle riders now resolve only the selected branch for the current persisted monster activation count; unselected fire, shield and potency-down riders no longer leak into each other.
- Direct-hit marks and next-attack bonuses now use the same basic/ability pipeline and are consumed only by a real landed direct monster hit after defend evasion is known.
- Repeated-action prediction now tracks eligible committed hero misses and defense, ignores rejected/no-op skills and expires by activation duration even if the player avoids repeating the action.
- Runtime monster shields now report only HP damage actually applied after absorption and no longer heal/revive the monster while accounting shield points.
- Runtime basic attacks now use the same defend stance contract as legacy basic monster attacks, including evasion, mitigation fatigue and bounded counters; runtime ability mitigation applies defend once.
- Runtime monster evasion now affects the hero hit roll only; it no longer also reduces damage after a successful hit.
- Runtime support/control abilities now skip state-less cases such as equal-or-stronger shields, empty cleanses, missing cooldown targets, missing positive effects and missing expired effects.
- Authored turn parity/cycle riders, repeated-action prediction, expired-effect reapply, copied potency, shield-survival setup bonuses, status-resistance solo fallback and counter-chance parameters now resolve through persisted runtime state instead of inert validation-only fields.
- Monster ability resolution now applies compiled plan components through shared handlers for immediate support/control effects, so legality and execution use the same target/condition decisions for heal, shield, mana drain, cleanse, purge, cooldown pressure, reapply-expired and runtime effects.
- `statusResistancePp` now resolves as an explicit non-removable `status-resistance` monster effect fallback instead of being stored as an unrelated incoming-damage modifier.
- Zero-damage monster support abilities that actually change state now persist a successful monster outcome in `lastTurn`, `turnLog`, journal replay and analytics rather than being inferred as misses from damage alone.
- Direct-hit-required monster components now require a real landed direct hit before applying or consuming their rider effects.
- Monster ability components now carry an explicit trigger classification, so equivalent hostile riders such as chill, burn and outgoing-damage reductions follow the same landed-hit rule while setup/support branches stay on-cast.
- Runtime effect consumers now use the polarity contract for debuff checks, accuracy/evasion/flee penalties, slow/confusion/repeat penalties, marks and next-hit bonuses instead of treating every matching target/kind as harmful.
- Deferred next-hit bonuses now arm only from their real trigger: surviving authored shields or copied persisted direct hero damage. Neutral value-1 placeholders no longer make abilities look actionable, block later bonuses or consume charges.
- `counterChance` now uses an explicit probabilistic counter runtime effect with injected RNG and damage derived from the authored source/current monster attack, while flat reflect remains deterministic and separate.
- Monster defend, telegraph and retained timeout-skip paths now preserve resolver outcomes instead of classifying every zero-damage monster action as a miss.

### Fixed
- Old active combat JSON without `monsterRuntime` remains readable and keeps legacy basic-attack behavior until that fight ends.
- Old active cooldown JSON that still contains Varenyk-mancer `skill.hot-spell` or Rogue `skill.trick-shot` cooldowns remains authoritative until the cooldown naturally ticks away; future class skill use stores only the renamed IDs.
- Fixed two corrupted monster context cue lines that could render as `????`, and added content coverage against placeholder mojibake in context cues.
- Battle journal buttons now appear only on terminal/result cards, include a terminal `lastTurn` page when older state has not stored it in `turnLog`, and return with `↩️ До результатів`.
- Timeout auto-turn recovery refreshes the current combat row before committing, so stale scheduler due records do not overwrite a newer active-card message reference.
- Training doppelganger fights keep the copied class-skill behavior from `0.1.21` instead of being silently converted into ordinary-monster AI.
- Monster class-skill locks are server-authoritative no-ops: pressing a locked/unavailable class skill does not spend mana, advance the turn, tick cooldowns, trigger monster AI, select a bark or advance RNG.
- Telegraphs persist the promised ability before impact; if the monster dies first, the pending impact never resolves.
- One-charge marks survive committed hero actions and are consumed only when a later direct monster hit uses them; reflect charges are consumed only when actual reflected HP damage occurs.
- One-charge marks can now be consumed by the ordinary forced basic attack after a setup ability, while missed basics and non-damaging monster actions leave the mark intact.
- Mixed-scope monster buffs now route by parameter intent: `monster.mountain-on-installments` marks the hero, buffs the monster's outgoing damage and never grants the hero a positive outgoing-damage multiplier.
- Race-source ability locks now use a safe solo fallback instead of disabling the class skill; class-source locks still block the current class action as before.
- Applied-result text is now generated only from components that changed state, so purge, cooldown, heal, shield, cleanse and reapply claims do not appear when nothing happened.
- Monster cleanse now removes only harmful removable effects on the monster, so beneficial monster shields, evasion, outgoing-damage buffs, next-hit bonuses, reflect and status resistance survive cleanup.
- Monster purge now removes only real removable beneficial hero effects. Direct-damage abilities such as Archive Chew keep dealing damage when no purge target exists and do not claim a purge that did not happen.
- Damaging bleed/burn/control riders no longer apply after ordinary misses, defend evasion, telegraph announcements, monster defend, support-only actions or zero-damage outcomes.
- `bonusAgainstDebuffedTargets` now counts only active harmful hero effects; beneficial hero buffs, neutral effects, monster self-effects and expired/zero-charge rows do not trigger the bonus.
- Multiple next-hit bonus sources now use source/trigger identity, so copied-potency and shield-survival bonuses can coexist without duplicate same-source shield charges or accidental shadowing.
- Legacy eventless terminal journals now synthesize one final `terminal:*` entry when an old same-turn log row has a different summary, while semantically identical old rows still avoid duplicates.
- Reactive reflect/counter/shield-break damage now resolves before the early victory return; if it drops the hero to zero HP, the combat is recorded as a loss even when the same hit also drops the monster to zero.
- Terminal persistent combat journal entries now carry stable `terminal:*` event IDs, so `won`, `lost`, `fled` and hard `expired` results appear exactly once after repository round-trip and repeated journal opens.
- Target accuracy/evasion penalties now affect later target rolls instead of being accidentally folded into the monster's current ability accuracy.
- Positive monster accuracy context now raises current runtime ability hit chance instead of lowering it.
- Persistent fight turn callbacks, result replays, journal views and combat-lock redirects now restore the stored fight passage/location instead of stamping the quest table.
- Night Munchkin level-barter cards now return to `Спуск до Низу` instead of sending the player outside to the front door.
- Deterministic fallback loadouts now skip unsupported recipes and avoid low-level strong/ultimate fallback picks.

### Guardrails
- No player race/signature/title ability catalog, item active ability, multi-enemy runtime, Yeger rule change, reward/economy/loot rebalance, timeout cap, participation gate, auto-victory reward suppression or new analytics migration was added.
- The imported proposal values are normalized centrally in the monster ability resolver; unsafe effects such as gold/item destruction, permanent stat loss and punitive reward changes are not implemented.

## [0.1.21] - 12026-06-21 - Combat Action Foundation

### Added
- Added the first shared combat ability foundation around existing actions: basic attack, basic defend, class skill and flee now resolve through a server-authoritative action/availability contract instead of presenter-only button assumptions.
- Added `🛡 Захищатися` to persistent solo fights, training doppelganger fights and turn-based duels.
- Added ability-keyed cooldown state for combat skills while keeping legacy `cooldowns.skill` combat states readable and normalizing them on the next committed action.
- Added 23-second turn deadlines to active persistent solo/training combat state plus an in-process combat turn timeout scheduler. Scheduled overdue turns keep committing the canonical basic auto-attack, while skip-mode lazy fallbacks keep committing the existing skipped hero action.
- Added persistent-fight monster context snapshots: combat start now freezes a `Europe/Kyiv` world context, applies at most two small capped monster traits, stores the context in combat state and reuses it on resume/replay.
- Added persistent-fight origin tracking in combat state, so non-Низ fight handoffs can return to the place where the fight started.
- Expanded the monster roster to 93 entries from the contextual monster package, keeping the current `MonsterContent` shape and existing reward/eligibility rules.
- Added deterministic monster barks for the full 93-monster roster: every monster has five authored Ukrainian lines, and stored turn summaries render bark ids without rerolling old cards.
- Added focused domain, service, repository, scheduler, callback, keyboard and presenter coverage for defend, unavailable skill no-op behavior, legacy cooldown loading, repeated timeout handling and active-card message tracking.
- Added a separate persistent-fight intro card for newly started monster fights; the active card below it now carries the buttons and updates each turn.
- Added opt-in PvE combat balance analytics behind `COMBAT_BALANCE_ANALYTICS_ENABLED`: completed solo/training combats can write one idempotent battle summary plus ability usage rows for class/remort, monster/source and ability reports through the `20260621100000_add_combat_balance_analytics` Prisma migration.
- Added `npm run report:combat-balance` with class, mob, ability and data-quality views, defaulting to levels 10-15; ability reports default to manual choices and can include timeout auto-actions with `--ability-actions all`.

### Changed
- Pressing a class action without enough mana, or while that action is still cooling down, no longer spends mana, advances the turn, ticks cooldowns, triggers a monster response or advances RNG.
- Existing class skill labels and approximate damage remain in place, but cooldowns now last for one subsequent own committed action in this foundation slice instead of using the older hidden `3..5` non-mana skill roll.
- Defend reduces incoming damage for the current round and can produce a small PvE counter, with repeated defend attempts fatiguing the stance so it cannot become an infinite best action.
- Turn-based duel defend choices stay hidden like other round choices and apply deterministic same-round incoming damage reduction when the round resolves.
- Opening safe side surfaces such as hero/inventory/manatky uses the same overdue solo/training combat ladder as battle callbacks and the scheduler, so one old turn can still commit at most once.
- Post-fight `Новий бій` now appears only for fights that started in `Низ`; adventure and Yeger handoff fights return to their origin surface instead of showing `До Низу`.
- Contextual monster traits affect only combat texture and small stat modifiers. They do not change encounter eligibility, Yeger matching/progress, XP, gold, loot, authored monster level or stored rewards.
- The contextual-monster package was adapted into the current content/runtime shape; the monster ability/loadout extension remains out of scope.
- Active persistent monster fight cards now show HP/mana, turn number and the visible 23-second timeout rule directly on the button message, and active solo/training cards store their Telegram message reference for scheduled edits.
- Active persistent monster fight cards now leave a visual gap before the 23-second timeout note, address the character by name before the next-action prompt and show whether the previous overdue turn became an auto-attack or a skipped hero action.
- Persistent monster barks now render as Telegram blockquotes after the `🗣️ Монстр` marker.
- Fight and hunt result cards no longer append generic `Наступний крок` command prompts.
- Combat state now carries a compact analytics accumulator when the feature flag is enabled; old in-flight combats without an analytics snapshot remain readable and are skipped by the collector instead of being backfilled with guessed totals.

### Fixed
- Hardened persisted solo/training combat state parsing so current runtime JSON fields round-trip through Prisma mapping, including origin, defend streaks, skipped-turn summaries, monster debug/equipment traces, ability cooldowns, context and bark state.
- Turn-based duels now carry each participant's defend streak into the shared combat resolver, so repeated hidden-round defend choices use the next fatigue tier and non-defend actions clear the streak.
- Failed flee attempts now count the monster response for deterministic bark state and can store the mandatory early bark by the second committed monster action; successful flee still ends combat without a monster action.
- Combat timeout handling now preserves the stored Telegram battle-card reference through real resolver/service transitions, records replacement card references after edit fallback, avoids refreshing hard session expiry from scheduler/lazy timeout actions, and paginates due-session discovery so legacy, future or other-kind active rows cannot starve due fights.
- Terminal persistent fight cards rendered from `/fight` or scheduler edit fallback now replace the stored canonical Telegram card reference, so stale callbacks and timeout recovery do not keep targeting an older active-card message.
- Training combat-lock redirects now surface a refreshed terminal training result after expiry instead of falling back to generic active-training copy and action buttons.
- Scheduled and lazy training doppelganger timeout wins/losses now claim the same XP reward and recovery cooldown as manual terminal turns, persist that reward on the combat session, and replay it idempotently without duplicating XP or cooldowns. Hard expiry remains non-rewarding.
- Combat analytics now stores action origin (`manual`, `timeout-auto-attack` or `timeout-skip`) before accumulation, separates manual and automatic action counts in battle rows, and avoids presenting timeout basic attacks as player-selected ability usage in default reports.

### Guardrails
- No race ability catalog, signature/title ability catalog, monster ability catalog, item/consumable actions, reward formula change, economy change, wager, rating, tournament or broad combat coefficient rewrite was added. The only schema migration in this release is the opt-in combat balance analytics tables.
- Combat analytics stores no Telegram ids, usernames, display names, chat ids or message ids in report rows, and analytics write failures are logged without blocking combat resolution, rewards or resource persistence.
- Telegram callbacks still carry only compact action keys; mana, cooldowns, damage, mitigation and terminal results remain server-side.
- The combat timeout scheduler is best-effort and in-process: persisted combat state remains canonical, repeated unattended turns keep resolving the canonical auto-action until combat ends or hard session expiry is reached, and no Redis/BullMQ dependency or proactive notification table was added.

## [0.1.20] - 12026-06-20 - Authored Quest Resolutions

### Added
- Added a pure quest-resolution content/domain layer for authored methods, technique tags, reward profiles, deterministic bounded checks, grade bands and method slot selection.
- Added authored method/outcome content for every current level 3+ Adventure Choice general problem, plus generated race, class and title problem families.
- Added the same resolution contract to the starter mimic-shawarma adventure and level 2-3 cellar mouse errand, including character-shaped method buttons.
- Added compact `v2` problem and method callbacks for Adventure Choice plus compact method callbacks for mimic-shawarma and cellar mouse buttons, while preserving old starter/cellar callbacks and old Adventure Choice `safe/flair/risky` callbacks as stale-refresh only.
- Added `spent_gold` and optional `result_json` audit payloads to `daily_actions` so quest method, grade, consequence, cost and check data are stored at claim time.
- Added paid cellar/adventure method support with pre-claim affordability checks and atomic net gold updates.
- Added authored direct HP injury consequences with deterministic bounded loss, persisted HP audit payloads and replay-safe result lines.
- Added scene-specific persistent-fight handoff targets for authored Adventure complications, reusing the existing fight pipeline.
- Added nullable `character_cooldowns.result_json` persistence so cooldown-backed cellar completions can store exact result, item and HP audit payloads for audit and duplicate safety.
- Added repository-level optimistic HP mutation retries so two different accepted daily/cooldown claims cannot overwrite one another's committed injuries.
- Added small deterministic post-resolution XP/gold variance for level 3+ authored Adventure Choice rewards, plus a low LUCK-influenced chance for one eligible manatka on non-fight results; paid methods never return gold as reward and instead get a slightly higher manatka chance.
- Added `/dev_help` for local QA so available dev commands can be listed without mixing them into the main player help screen.
- Added canonical design docs for authored quest resolution variety, skill/check math and content seeds, plus the `0.1.20` task doc.

### Changed
- Replaced the level 3+ global `safe / flair / risky` choice ladder with 5-7 scene-action methods whose checks/outcomes can still reflect race, class and signature/title.
- Removed universal active filler methods from authored quest content; every active general problem and generated family now supplies enough scene-native affordances for the 5-7 resolver.
- Adventure and cellar selected-result screens now show authored grade-specific Ukrainian outcome copy and qualitative method hints without exact future reward amounts or percentage odds.
- Successful personalized result copy now avoids generic meta-lines such as “Обраний підхід...” and keeps the sentence anchored to the scene action.
- Authored quest result cards now separate the scene, method and reward blocks more clearly, omit internal race/class/signature method labels and show `Винагорода за справу` before XP/gold.
- Authored quest result cards now show the chosen method immediately after the scene title, while the resolved outcome paragraph avoids repeating the full button label.
- Authored quest method hints now avoid repeated reliability wording and generated scene outcomes use grammar-neutral copy for singular/plural problem titles.
- Authored result bodies are now composed per concrete method and grade, so bribery, negotiation, deception, force, ritual and trap outcomes no longer share one scene-level strong/success/failure paragraph.
- Authored result bodies now avoid the last intent-wide noun-substitution templates and use grammar-neutral method beats or explicit scene text for active methods.
- Active authored methods no longer use the remaining intent-wide outcome fallback; every runtime-visible method now carries complete four-grade authored or family-specific outcome beats, and content tests reject the old shared fallback paragraphs plus common mojibake markers.
- Active authored methods now fail fast during content construction when a method lacks complete outcome beats; tests also reject sliced-label focus markers and old template sentences.
- Personalized race/class/signature variants now preserve scene-specific risk hints, including qualitative injury and fight/summoning warnings.
- Personalized starter and Adventure result flavor now uses technique-specific complete sentences instead of sliced button-label fragments or one universal identity paragraph everywhere.
- Generated race/class/title problem families now use scene-native method sets for анкета/кухоль/портрет/підручник/форма/іспит/титул instead of one universal generated template.
- Race, class and signature methods now bind to concrete scene affordances instead of blind profile-noun substitution, while visible labels/buttons keep only the scene action; the same hero gets different verbs/outcomes across unrelated problems and malformed forms such as doubled object suffixes are covered by tests.
- Race, class and signature variants now use distinct scene-action labels and affordance ids, so the authoritative visible-method resolver can actually surface character-shaped methods instead of deduplicating them behind scene-native base methods.
- Race, class and signature variants no longer append reusable technique suffixes such as `у ритм`, `через ревізію`, `точним рухом` or `по-домашньому`; player-visible influence now comes from which concrete scene affordance enters the 5-7 set.
- Authored outcome copy for the latest top-up/generated regression set was tightened so methods such as oily boots, chimney soot, unionized candle wicks, plotting teapots, secretive rugs and summoning bells describe their own action and consequence instead of sharing one quoted-fragment skeleton.
- Remaining generated-family, general-scene and top-up outcome copy now removes quoted object-fragment skeletons such as `Ремісничий підхід до «…»`, `Домовленість «…»` and `Сліди «…»`; content tests now normalize case and detect repeated long sentence skeletons across unrelated scenes.
- Adventure complications can now resolve to full reward, reduced reward, XP-only, cosmetic mess, paid success or existing persistent-fight handoff where authored.
- Adventure and starter/cellar complications can now include method-owned minor/serious injury where allowed; direct quest injury is applied atomically with claim/cost/reward/item/cooldown mutations and clamped to leave at least `1 HP`.
- Failed or blocked Adventure fight handoff now rolls back claim, spent gold, rewards, item grants and HP mutation together; replay cannot spawn a second fight.
- HP loss audits now use the canonical effective max supplied by the resolver, so level and equipment HP bonuses are reflected in stored and presented injury results.
- Player-facing HP result lines now use the returned post-claim character summary for current `HP/max HP`, while the stored audit retains the damage-time effective max.
- Daily/cooldown HP mutation now records the actual committed before/lost/after values from fresh transactional state; rollback compensates only the committed loss instead of restoring a stale absolute HP value.
- Daily-action rollback now uses guarded retry updates for XP, level, gold, HP and item quantities, preserving later rewards, healing/injury and same-item gains while removing only the original claim delta.
- Daily-action HP rollback now treats the stored injury audit as a guard: HP is restored only when the character is still at the original post-claim HP, so later damage or healing is not silently changed by a failed fight-handoff rollback.
- Daily-action audits now persist the exact applied item grants after max-owned caps, and rollback uses that applied list so capped grants and later same-item gains are preserved.
- Adventure fight handoffs now persist the actual eligible encounter id selected for the hero and pass that same id into the persistent-fight pipeline; any non-new handoff state, including unrelated active, training or terminal fights, rolls the quest claim back instead of consuming it.
- Newly started Adventure fight handoffs now stamp canonical solo-fight presence instead of leaving the hero marked at the quest table, while rollback branches preserve canonical persistent/training/rest routing instead of stamping a false quest-table state.
- Adventure handoff rollback now uses the original claim identity and a freshly calculated current effective HP maximum, compensating HP without reducing later healing or max-HP changes.
- Starter shawarma and cellar mouse keep their level gates, item grants, idempotency and replay behavior while routing new visible buttons through stable authored method ids.
- Adventure, starter shawarma and cellar mouse completions now validate current callbacks against the deterministic visible method set before claim/cost/cooldown/reward mutation; hidden authored scene methods cannot be invoked just because their ids exist in content.
- The cellar mouse paid bribe is reachable through the centralized visible-method resolver without dropping personalized check/outcome influence.
- Starter shawarma and the starter combat probe now each grant `75%` of the level 1-to-2 XP gap rounded up, using the remort-adjusted XP curve, so doing both starter activities guarantees level 2.
- The quest archive now shows completed starter shawarma alongside the completed starter combat probe instead of losing the first half of the starter chain.
- Legacy `v1` starter and cellar callbacks continue to replay safely; old Adventure Choice `safe/flair/risky` callbacks no longer reinterpret into new methods.
- Starter shawarma and cellar mouse legacy actions now resolve through explicit canonical alias maps, so duplicated legacy labels such as `flee` or `negotiate` no longer depend on method list order.
- Quest checks now use the same effective stat snapshot as the summary card, including equipped manatky/item effects, instead of resolving against base-only stats.
- Cellar mouse rewards stay deliberately conservative, and stale/unknown current-version method ids no longer claim, charge, start cooldowns or grant rewards.
- `🎒 Манчкін-скупник` now requires at least `587` gold value from eligible manatky before wallet gold can fill the rest of the level-barter cost.
- `🎒 Манчкін-скупник` now follows a Kyiv local night schedule: during the day he remains outside by the korchma front door, and at night his paragraph/button moves to `Спуск до Низу`.
- Training and duel result return buttons now say `↩️ Повернутися до кутка`, making the Fighting Corner navigation distinct from challenge actions.
- The korchma hall now hides the `🥊 Бійцівський куток` button before level 3, matching the early `Спуск до Низу` button gate while keeping stable hall prose, and blocks stale direct corner/duel-board callbacks with a short level-gate card.
- Local `/dev_raid_stop` now sends the ordinary separate level-up celebration when its completed raid reward crosses a level threshold.
- Local `/dev_add_level` now documents and tests its optional amount parameter: no argument grants one level, while `/dev_add_level N` grants `N` levels.

### Guardrails
- No broad quest engine, shops, crafting, guilds, markets, Mini App UI, combat damage rewrite, mana spending or new production dependency was added.
- Existing grown-up cellar bottle flow was not broadened.
- Exact check odds and future reward amounts remain hidden from player-facing pre-commit choice copy.

## [0.1.19] - 12026-06-19 - Nyz Passage Balance Polish

### Changed
- Retuned `Низ` passage difficulty so the right/easy passage now prefers available monsters `3-5` levels below the character, with safe fallback/clamping when the pool cannot satisfy that range.
- Lowered easy-passage payout pressure: easy XP now rolls `0.5x-0.75x` character level with a small bounded LUCK bias toward the top of the range and downward rounding.
- Kept the left/hard passage above the center XP reward while trimming earlier overpayment: hard XP now rolls `1.25x-1.5x` character level with the same bounded LUCK bias and a floor of center-route baseline XP for the same base monster plus one.
- Made persistent fight gold variable instead of stable by passage or monster level for ordinary, Yeger and adventure fight wins: victory gold now rolls from `0` to current character level; a `0` gold roll boosts item drop chance to `93%`, then interpolates back to the difficulty-adjusted configured item drop chance at max gold.
- Restored the previous side-passage loot endpoints while layering the zero-gold interpolation over them: easy uses the lower `0.65` drop multiplier and `-1` loot power offset, center remains neutral, and hard uses the higher `1.35` drop multiplier and `+1` loot power offset.
- Softened the first Yeger quest turn-in XP so low-level characters receive a level-scaled reward capped at the old `80 XP` high-level value, while stored old completions replay their original amount.
- Preserved stored reward replay semantics: already completed fight rewards continue to replay their stored XP, gold and item grants without recomputing under the new balance.

### Guardrails
- Adventure turn-in rewards and Yeger gold/item turn-in rewards remain unchanged; the variable-gold rule applies only to persistent fight victories.
- No XP curve, loot-table, duel, training, nearby invite, combat-lock, monster-rest, schema or migration changes were added.
- Passage choice copy remains qualitative and does not show exact future rewards before commitment.

## [0.1.18] - 12026-06-19 - Turn-Based Player Duels

### Added
- Added `♟️ Покрокова дуель` beside `⚡ Миттєва дуель` in the Fighting Corner, using `duel_turnbased_<token>` deep links and the existing 13 invite templates with a turn-based mode line.
- Added persistent turn-based duel state with `duel_combat_sessions`, action audit rows, optimistic turn versioning, stored initiative, frozen participant snapshots, rules/balance versions and terminal replay data.
- Added active combat leases so a character cannot start or accept a persistent turn-based duel while already in a persistent/training/starter fight or another active duel.
- Added durable 23-second turn deadlines through persisted `turnExpiresAt`, startup polling and idempotent timeout auto-attacks.
- Added recoverable two-player battle cards, per-participant action keyboards, hidden queued choices, surrender and mode-preserving rematches.
- Added `🥊 Кинути виклик присутнім` from `👀 Хто поруч`: challengers can page through active players in the same location, pick a target, choose quick or turn-based mode and send an in-game targeted invite.

### Changed
- `DuelChallenge.mode` is now stored server-side with a default of `quick`; legacy `duel_<token>` links remain quick and crafted prefixes cannot switch an existing challenge mode.
- PvE and PvP turn resolution now share a pure `resolveActorCombatAction` primitive for basic attacks, class skills, mana, cooldowns, armor/resist/equipment effects, HP clamping and summaries.
- Turn-based duel rounds now store a participant's chosen action without revealing damage or spending session HP/mana until both players have chosen or the durable timer resolves missing choices as ordinary attacks.
- Terminal turn-based duel paths, including surrender and timeout resolution, now store an explicit terminal reason, resolve the parent challenge as `resolved`, and replay the canonical result card with rematch/share controls.
- Same-round turn callback races now retry one safe merge after an optimistic version loss when the actor has not yet chosen and the round has not advanced.
- Same-round older-version turn callbacks now also merge safely after the other participant has already queued from the same original card, as long as the round has not advanced, the actor has not chosen and the deadline has not passed.
- Turn updates now enforce `turnExpiresAt` in the repository CAS: player actions require an unexpired turn, while timeout auto-attacks require an expired turn.
- Turn-based duel card delivery now records successful edits, falls back to fresh messages after edit failures, and keeps committed gameplay state independent from Telegram delivery.
- Participant-specific turn-based cards and action keyboards are now private-chat-only; group cards stay spectator-safe and never show hidden queued choices.
- Malformed active turn-based sessions and orphan `turn-based-duel` leases now repair to a non-rewarding expired state instead of leaving players permanently combat-locked.
- Turn-based duel cards now mirror persistent monster fights by hiding unavailable class actions while mana/cooldown rules make them unavailable and showing the viewer's active skill cooldown.
- Turn-based duel damage now uses the normalized effective combat level from duel balancing while visible participant levels remain real, and defensive class-skill mitigation reduces incoming same-round PvP damage.
- Turn-based duel terminal results now grant small replay-safe XP: `1 XP` for a loss, `2-5 XP` for a draw and `4-8 XP` for a win with a small luck-biased upside; quick duels remain XP-free.
- Targeted duel invite recipients now receive a best-effort in-game notice when the challenger cancels before acceptance.
- Quick duel participants now receive a best-effort result card immediately after the other side accepts, instead of needing to refresh an old invite card.
- Pending duel cards re-rendered from decline paths now preserve configured invite-link state instead of falsely warning that the bot username is missing.
- Active turn-based duel cards now show only duel actions and refresh, removing the Fighting Corner navigation button that was blocked by the active combat lock anyway.
- Duel result cards now return to the Fighting Corner instead of the quest table or hall.
- The central combat lock now treats active turn-based duels as active combat and redirects normal navigation back to the canonical duel card.
- Restart/remort routes remain available during ordinary combat according to the existing side-surface policy, but redirect back to an active turn-based duel until that duel is durably terminal.
- Quick duel behavior remains instant, rewardless and replay-safe, while old quick result JSON still renders as `⚡ Миттєва дуель`.

### Guardrails
- Turn-based duel HP/mana are ephemeral session resources and do not damage, heal or refill persistent `Character` resources.
- No gold, items, quest progress, item loss, wagers, ranking rewards, tournaments, spectator betting or broad cross-location player discovery were added; the only new progression reward is the small terminal XP for completed turn-based duels.
- Telegram sends/edits are best-effort after committed state; notification failures do not roll back gameplay state.

## [0.1.17] - 12026-06-19 - Instant Duel Polish

### Added
- Added 13 stable forwardable invite variants for `⚡ Миттєва дуель`, each with the same deep link, an instant-result mode line and a qualitative fairness line.
- Added owner-only `🎲 Інший текст` invite rotation that edits only the forwardable invite message, keeps the same challenge token/URL/expiry, avoids immediate repeats and does not write duel state.
- Added `instant-duel-v2` balance/audit metadata for new resolved duel results, including participant snapshots, progression normalization fields, readiness penalty and prepared scores.
- Added pure duel balance helpers that can be reused by a later turn-based duel mode without adding turn-based runtime in this slice.

### Changed
- Renamed the current quick duel in player-facing copy to `⚡ Миттєва дуель` and clarified that the result appears immediately after consent.
- Duel create, rematch and accept flows now synchronize HP/mana through the same canonical lazy resource path as `/hero` and `/fight`, including persistence and optimistic conflict fallback.
- Accept now reloads and syncs both participants at the same logical time before confirmation or resolution; resource warnings are based on the warned participant's fresh snapshot.
- Instant duel scoring now temporarily normalizes only progression-derived level/remort budget. Race, class, title, current build, equipped manatky and equipment effects remain personal.
- Current HP/mana now matter through a small capped readiness penalty after sync and normalization: tired participants are disadvantaged, but not automatically defeated.
- Resolved cards and share cards prefer stored participant snapshots for new results, so later rename, remort, level-up or equipment changes do not silently rewrite the replay-facing card.
- Duel leaderboard names prefer stored result snapshots for new rows while old rows continue to read live character snapshots.

### Guardrails
- No XP, gold, items, quest progress, item loss, wagers, tournaments, rating power or turn-based PvP runtime was added.
- No schema migration was added; replay/audit expansion stays backward-compatible inside `resultJson`.
- Hidden formulas and exact readiness/progression values are not shown in Telegram copy or `news.md`.

## [0.1.16] - 12026-06-19 - Character Stats Growth Rework

### Added
- Added fixed hidden-path stat bonuses through the shared effective-stats pipeline, so existing characters inherit the derived layer without a schema migration or `statsJson` backfill.
- Added deterministic distributed level stat growth: the level budget remains `level - 1`, HP remains `+4` per gained level and mana remains `+2`, while class profile, race bonus and hidden path bias which stat receives each level point.
- Added per-stat remort memory for previous distributed level growth, preserving 23% of the previous race/path-aware level-growth contribution per stat while excluding old fixed race/class/path identity bonuses.
- Added local `/dev_raid_stop` to finish an active pending Barrel raid through the normal completion path for manual QA.

### Changed
- Normalized `Людисько` to the active `+3` race budget (`+1 STR`, `+1 DEX`, `+1 CHA`) and refreshed its flavor so it no longer promises “a bit of everything.”
- `/hero` now shows `Зміна:` as a next-level forecast instead of showing cumulative current level growth as `Ріст:`.
- Level-up and remort presentation can render multiple stat deltas when growth or memory spans more than one stat.
- Reward level-up celebrations now use the same race/path-aware next-level delta as `/hero`, including Barrel raid, training and fight reward paths.
- Fixed `Низ` passage rewards so persistent fight XP, gold and broad loot profile power follow the effective monster level selected by the passage; XP anti-farm compression still checks the stored pre-intervention base monster level, so genuinely weak targets remain compressed without penalizing the deliberately easier right passage.
- Combat simulation tooling now accepts the hidden path and applies the same race/path-aware effective stat math as live character summaries.
- `/help` now points to future shops, crafting and guilds instead of implying loot and combat bookkeeping are still missing.
- Active combat now allows safe side surfaces again, including `/inventory`, item detail/equipment callbacks, hero/profile, nearby-player views, restart/remort and support, so manatky can be inspected during a fight.
- The front-door outdoor surface no longer shows a completed/inactive Yeger shortcut or a Barrel-side Yeger explainer; active trails still use the outdoor `До полювання` action.
- Selected Adventure Choice problem messages no longer print the safe/medium/risky reward ladder; the approach buttons stay available without the extra body copy.

### Guardrails
- No XP curve, schema, migration, production dependency or onboarding/remort mechanical preview was added.
- Hidden path ids remain internal and are not shown in player-facing copy.

## [0.1.15] - 12026-06-18 - Combat Lock and Battle Flow Polish

### Added
- Added a central active-combat lock that redirects normal commands and callbacks back to unfinished persistent or training fights until they reach terminal state.
- Hardened the lock for registered reply-keyboard main-menu text (`Корчма`, `Квести`, `Персонаж`, `Манатки`, `Хто поруч`) while keeping Help, `/help`, `/version`, and real persistent/training/starter combat callbacks allowed.
- Newly started persistent battles now show the existing `Порада дня` line once at battle intro.
- Added deterministic `3..5` hero-turn cooldowns for successful zero-mana class skills, based on the relevant skill stat with a small luck effect.
- Added a three-minute monster-rest block after three consecutive eligible ordinary `Низ` fights, measured from the stored terminal completion time of the third fight so later reward/replay writes do not extend the rest.
- Level 3+ ordinary/problem fight entry moved to `Низ`; fight routes now open `Спуск до Низу`, then `Спуститися` moves to the first tier, `Ярус I: Сутерени Корчми`, where the passage/difficulty choice lives.
- Added a short HP recovery notice when passive out-of-combat regeneration first brings a character back to full health during `/hero` or `/fight` flow.

### Changed
- Current-turn hidden/forged magic callbacks without enough mana now waste the hero turn, run the monster phase, advance the turn and persist the updated combat state.
- Current-turn hidden/forged non-mana skill callbacks while on cooldown use the same failed-turn semantics.
- Combat-lock redirects now show a visible explanation before the active fight or training screen, so blocked navigation is clear even when a callback toast is missed.
- Persistent and training fight keyboards recompute action availability every render, hiding magic without enough current mana and hiding non-mana skills while on cooldown.
- Combat and pending-raid guards now run before destination presence writes; blocked routes refresh combat-appropriate presence instead of stamping tavern/news/Yeger destinations first.
- Terminal and lazily expired persistent `/fight` restores now render the canonical terminal/reward replay screen before normal navigation returns.
- Active training doppelganger keyboards now show only combat actions and no normal-navigation escape buttons.
- Stale old quest-table fight callbacks open a fresh `Спуск до Низу` surface instead of starting from the old table message; passage selection and active fights use the separate `location.korchma.deep.level1` presence location.
- `Спуск до Низу` now shows `⬆️ Повернутися до зали` above `⬇️ Спуститися`, matching the upward navigation icon used deeper in `Низ`.
- The three-adventure offer screen now shows each problem as a compact title plus italic short line; full problem hooks stay on the selected-problem screen.
- Selected problem-fight passage callbacks now preserve the selected difficulty when moving the player into `Низ`, so the fight starts instead of redisplaying the passage choice.
- Outside direct activity gates now show only the `Зайти в корчму` button instead of the full front-door action keyboard.
- Yeger quest selection, target help, and turn-in stay at the Barrel-side Yeger corner, while active trail taking/checking moves to the outdoor hunt surface; front-door routing now shows `До полювання` for active Yeger quests and Yeger progress still matches eligible monster type/tag source-agnostically.
- Yeger progress now uses fight completion time rather than mutable session update time, so late reward/replay updates on older wins cannot jump a newly started trail forward.
- On the front-door surface, active Yeger `До полювання` now renders as the final row below the Munchkin barter entry.
- Outdoor Yeger trail screens now return to the base `Надворі біля корчми` surface instead of showing an indoor-only `До Єгеря` button.
- The existing `raid.prep-hint` tip pool was expanded and reused for battle intros instead of adding a second combat-only tip system.

### Guardrails
- Adventure Choice MVP stays intact: three-problem offers, level 1-2 starter mimic-shawarma, adventure complication handoff through persistent combat, `/dev_adventure_reset`, qualitative pre-choice copy and stable icons remain in place.
- Adventure complication handoff rollback still avoids consuming the period if persistent combat cannot start, including monster-rest blocks.
- Completed starter mimic-shawarma lookups still do not create actionable starter presence/buttons.
- Monster rest excludes adventure handoffs, training doppelganger fights and legacy/unmarked sessions.
- HP recovery notices use the existing lazy resource regeneration path; no durable background scheduler or proactive chat notification table was added.
- No threat streaks, multi-enemy fights, mana-restoring manatky/items, combat items, duel-combat runtime, migrations, schema changes or new production dependencies were added.

## [0.1.14] - 12026-06-18 - Adventure Choice MVP

### Added
- `/adventure` now opens a compact level 3+ tavern problem offer instead of the old one-scene adventure.
- Each 93-minute adventure period generates three deterministic, distinct choices per character until the period is resolved or locally reset.
- Each problem has three resolution approaches: safe, class-flavored clever/social/magical, and risky, with conservative ascending XP/gold rewards and complication chances.
- The tavern problem pool now combines the 24 general tavern problems with personalized race, class and current-title problems; matching offers guarantee at least one personalized candidate when available.
- The starter mimic-shawarma adventure remains available for levels 1-2 from `/adventure` and Quest Hub before the level 3 choice loop opens.
- Complications record the adventure claim with no reward and hand the player into the existing persistent solo fight path instead of creating a second combat engine.
- Added `v1:adv:p:{period}:{problem}` and `v1:adv:a:{period}:{problem}:{approach}` callbacks with stale-token handling and callback-length coverage.
- Added `/dev_adventure_reset` for non-production QA to clear the current 93-minute adventure claim for the current player and reroll the current-period offer seed.

### Guardrails
- Adventure claims use the existing daily-action reward ledger under `adventure.choice-mvp`, so duplicate presses and replay reads do not grant a second reward.
- Pre-choice adventure copy now uses qualitative risk/reward labels instead of showing exact XP, gold or complication percentages before the player commits.
- Quest Hub checks the starter mimic-shawarma claim directly, so a completed starter shawarma no longer stays visible as an active adventure row or button.
- Quest Hub Korchmar problem rows now use a distinct paperwork icon from the table surface, and selected adventure approaches/results have clearer paragraph spacing.
- Adventure offer rows and problem-choice buttons now show stable per-problem icons while keeping callback data compact.
- Quest Hub no longer advertises the separate Fighting Corner in the quest-table intro or offers a direct Fighting Corner shortcut from the table.
- Local adventure resets store zero-reward reroll markers in the existing daily-action ledger, so reset offers change immediately and old callbacks become stale without a migration.
- Personalized adventure copy now declines race and class names in generated problem titles/hooks, avoiding nominative quoted-name insertions like `для «Злодій»`.
- No migrations, schema changes, new production dependencies, shops, crafting, trading or broad loot economy changes were added.
- No-character, level-gate, active-fight, stale-callback and legacy shawarma callbacks now land on safe adventure states; active fights take priority over stale adventure callback checks, and starter shawarma callback replays remain idempotent.
- Failed complication handoffs no longer consume the current adventure claim if the persistent fight path says the character must rest or cannot start combat.
- Completed starter shawarma lookups no longer stamp the player as being on an actionable starter adventure.
- Remort reset clears the new adventure claim/reroll keys, Yeger once-per-life quest keys, and other per-life daily action keys.
- Added a Yeger-only maintenance mode for the remort daily-action cleanup script to repair stale pre-remort Yeger rows for already affected characters.

## [0.1.13] - 12026-06-18 - Problem Fight Difficulty Choice

### Added
- Level 3+ ordinary problem fights now show a compact difficulty choice before starting when no active persistent fight exists.
- Added `v1:quest:fight-easy`, `v1:quest:fight-normal` and `v1:quest:fight-hard` callbacks with Telegram callback-length coverage.
- The Quest Hub `Розвʼязати проблему`, `/fight`, and post-fight `Новий бій` routes now open the same difficulty choice instead of surprise-starting a fresh persistent fight.
- Easy fights lower the effective monster level around character level -3 with reduced XP, gold and drop opportunity; ordinary fights keep current behavior; hard fights raise the effective level around character level +2 with conservative reward boosts.
- Selected difficulty is stored in combat state debug trace so turn resolution, terminal recovery and reward replay keep the effective monster level without a migration.

### Guardrails
- Active fight, stale turn, pending-raid, no-character, level-gate, rest-gate and training-doppelganger protections remain on the existing paths.
- Rewards still flow through the persistent solo combat session reward key and remain idempotent on duplicate terminal/replay reads.
- No shops, selling, crafting, trading, migrations, broad economy changes, problem quest counter changes or cooldown changes were added.

## [0.1.12] - 12026-06-18 - Doppelganger Variation, Spawn Factory and Skill Replies

### Added
- Added a categorized Ukrainian doppelganger line pool with deterministic selection, placeholder interpolation and recent-line anti-repeat.
- `/spar` intro and counter flavor now use the doppelganger line pool instead of one fixed intro/counter text path.
- `/spar` now opens with a target choice before training starts: copy the current hero, mirror a random adventurer build, or copy an available distinct duel champion for day/week/month boards.
- Added doppelganger spawn plumbing for `COPY_TARGET`, `RANDOM_BUILD`, champion fallback and `WEIGHTED_RANDOM`; service-level callers still default to `COPY_TARGET` when no explicit mode is provided.
- Added random-build generation for valid pronoun/race/class/level combos with combat-only passive gear selected from current item content.
- Training doppelganger combat state now stores the copy's combat identity, passive copied-equipment summary, applied effect keys and debug trace.
- Doppelganger monsters can answer with class-shaped skill replies and record the selected ability in turn debug trace.
- Added focused tests for doppelganger lines, spawn modes, start choices, passive equipment copy summaries, random builds, champion options, state restoration, monster skill replies and presenter output.

### Guardrails
- No champion snapshot table, migration or new persistence was added; champion options reuse already available resolved duel character/equipment records and appear only when they differ from the current hero and already listed champion choices.
- No persistent inventory items are created for copied or random doppelganger equipment, and source player inventory is not mutated.
- Existing `/spar` reward rules remain XP-only: no gold, manatky, drops, wagers, ratings, quest progress or PvP ledger changes.
- Active equipment abilities are not faked; this release uses the existing passive item-effect pipeline only.

### Fixed
- `/start` now keeps existing characters at their saved presence location instead of moving them back to the front of the korchma.
- Training doppelganger counter flavor, champion intro copy and terminal wording now use the stored selected copy identity instead of leaking the current hero's class/action into random or champion mirrors.

## [0.1.11] - 12026-06-18 - Duel Rematch and Shareable Result Cards

### Added
- Resolved duel result cards now offer `🔁 Реванш` and `📣 Картка`.
- Rematches create a fresh targeted duel invite between the original participants only, with the same level 3+ and resource-warning gates as ordinary duel invites.
- Shareable result cards send a separate forwardable Telegram message that reuses the stored duel payload instead of rerolling or mutating the original challenge.
- Duel result final lines now use a larger stable flavor pool: universal lines plus winner and loser class/race variants.
- Fresh duel and rematch invites now stay open for 13 minutes, matching Kvestarnia's preferred odd little tavern numbers.
- Added server-side targeted invite creation for the duel repository and callback coverage for `v1:duel:rematch:{token}`, `v1:duel:rematch-risk:{token}` and `v1:duel:share:{token}`.
- Added `npm run maintenance:cleanup-remort-daily-actions` as a dry-run-first production cleanup for stale pre-remort starter/problem-chain `daily_actions` rows.

### Fixed
- Remort confirm now clears the per-life daily-action keys for starter shawarma, starter fights and the Korchmar problem-chain issue/reward rows, so a new life can see the correct early quests again.
- The cleanup script only matches rows created before the character's latest remort, so legitimate new-life rows created after a deploy are not removed.

### Guardrails
- Duel rematches remain opt-in, rewardless, replay-safe and level 3+; no XP, gold, manatky, rating points, wagers, item loss, quest progress, tournaments or automatic rematch spam were added.
- Targeted rematch accepts are checked server-side: bystanders cannot take over a rematch meant for another participant.
- Shareable result cards are presentation-only and do not notify the other participant or create extra duel ledger rows.

## [0.1.10] - 12026-06-18 - First Duel Invite Ledger and Gear Slot Context

### Added
- Added the first Phase 2 duel invite MVP: `/duel`, `v1:duel:*` callbacks, open invite creation, accept, cancel, decline, expiry and replay-safe quick result cards.
- Split `🥊 Бійцівський куток` out from the Quest Hub/table flow: Korchma hall now has a dedicated fighting-corner location for `/spar`, new duel challenges and a rewardless duel winners board for day/week/month.
- Added the closed `🕳️ Глибка` Korchma location stub for the future move of Korchmar monster fights out of the table flow.
- Added a persistent `duel_challenges` ledger with Prisma schema, migration, repository, service and pure resolver coverage.
- Added `/start duel_<token>` deep-link routing so generated invites can be opened from a configured bot username.
- Added optional `BOT_USERNAME` config for generated Telegram deep links, with validation and `.env.example` docs for dev/prod bot separation.
- Added resource-state warnings for duel accepts: partial HP or mana shows a warning first, and the player can still explicitly accept.
- Added current-slot context to filtered equipment inventory views: weapon, chest and accessory lists now show what is currently equipped and its effect before replacement candidates.
- Added focused domain, service, callback, start-payload and config tests for the first duel path.

### Guardrails
- Duel invites and the winners board are level 3+, opt-in, rewardless and replay-safe: no gold, XP, items, rating, wagers, durability loss, quest progress, rematch automation or tournament state.
- Invite recipients without a character get gentle onboarding copy instead of a hard failure, because duels need a few minutes of basic game context and some starter manatky.
- Old invite buttons replay state or report the stable terminal state instead of resolving the same challenge twice.

## [0.1.9] - 12026-06-17 - Doppelganger Learns Your Tricks

### Added
- Added a pure combat flavor intent module for future combat presentation: doppelganger counters, later monster signature moves and later duel result cards can share the same small intent/line shape.
- Training doppelganger turn cards now show a short escaped italic counter-flavor line after the last turn when the copy answers with damage.
- Added class-aware doppelganger counter lines for warrior, mage, varenyk-mancer, bureaucramancer, bard, rogue, ranger, priest and kharakternyk, plus small race fallback hooks.
- Added focused domain and presenter tests for the combat flavor layer and `/spar` counter presentation.

### Guardrails
- No schema migration, reward/economy change, problem-chain rule change, quest counter change, `/spar` level-gate change, PvP runtime, duel ledger or group fight.
- `/spar` remains XP-only: no gold, items, manatky or problem-chain progress.

## [0.1.8] - 12026-06-17 - Problem Quest Shynok Recovery Buttons

### Fixed
- After taking the first Korchmar problem paper with already recovered legacy progress, the Shynok message now shows the actual old journal counter instead of saying the counter starts from zero.
- If the recovered first paper is already complete, the same Shynok screen now offers `📋 Здати справу` immediately, so players do not have to leave and re-enter the location to discover the next action.
- Shynok and Quest Hub now read problem-chain progress through a separate FightService lookup, so an active training doppelganger can block ordinary `/fight` without hiding Korchmar paper actions.
- Loot Expansion v1 now normalizes generated class/race/title ids to current playable Kvestarnia ids, so generated manatky no longer require orphan titles such as `Боргомант` or unreachable legacy ids.
- Expansion loot generation now filters candidates through the same equip-requirement check used by item detail and `/equip`, so ordinary rolls should not offer generated gear the current character cannot equip.

### Guardrails
- Active training or ordinary fights can still block starting another fight; this patch only clarifies the recovered problem-paper handoff.
- No reward formula, quest counter, doppelganger combat, schema migration or new loot table was added.

## [0.1.7] - 12026-06-17 - Problem Quest First Paper Recovery

### Fixed
- Restored legacy-compatible progress for the first Korchmar problem stage: old ordinary won solo fights toward `Тринадцять дрібних проблем` are visible again even before the first explicit Shynok paper is taken.
- Taking the first Shynok paper no longer resets safe old `13`-stage progress, so over-complete players can recover the paper and then turn in the stage through the normal Korchmar flow.
- Unissued first-stage progress cannot be turned in through a stale direct callback; the player must take the paper first, preserving the explicit issue/turn-in path.

### Guardrails
- Already-claimed `quest.thirteen-small-problems` rewards still do not duplicate; they only allow the player to take the next `23`-problem paper.
- Stages `23`, `42` and `93` still use fresh counters from their own issue timestamps.
- No schema migration, broad quest engine, duel/PvP behavior, donor/payment state or repeatable reward farm.

## [0.1.6] - 12026-06-17 - Korchmar Problem Quest Chain

### Added
- Extended the persistent fight wrapper into a Korchmar/Shynok quest chain: `13 -> 23 -> 42 -> 93` won ordinary solo fights, each with a separate one-time reward and cosmetic proof item.
- Added explicit Shynok handoff for problem stages: the Quest Hub routes to `🍻 Шинок`, where taking the first stage, stage turn-in and taking the next stage are separate player actions instead of automatic fight/turn-in side effects.
- Added fresh per-stage counting based on the stage issue timestamp: new stages count only won ordinary solo fights created after that stage was issued.
- Added a separate post-fight problem-chain progress ping after newly won ordinary solo fights, keeping the main combat result short while showing the current stage counter immediately.
- Extended the post-fight progress ping to combine multiple moved quest counters, including active Yeger unquiet progress when the defeated monster qualifies.
- Added a level 6 Yeger-eligible ordinary monster, `Акт закриття, який не закрився`, so the unquiet target ladder stays covered without making the salted pretzel count as undead paperwork.
- Added `docs/references/problem-quest-chain.md` to document the safe allusion layer for 13, 23, 42 and 93 without making player news spell out every reward.
- Added opt-in local `/dev_heal [HP]` for playtesting HP recovery without changing XP, gold or items.

### Guardrails
- Training doppelganger sessions remain excluded from the problem chain and do not grant Korchmar quest progress.
- Lost, fled and expired fights still do not count toward problem stages.
- `Крендель солоної обіцянки` is no longer tagged as `unquiet`, so it does not count toward the Yeger unquiet quest.
- Existing `quest.thirteen-small-problems` completions remain compatible: players who already claimed the old 13-problem reward can take the 23-problem stage without duplicating the old reward.

### Fixed
- Item detail and equip denial copy now name concrete generated-loot requirements and no longer claim a blocked item can be equipped.

### Not Included
- No new schema migration, production dependency, duel invites, PvP ledger, donor/payment state, group raid, broad quest engine or repeatable reward farm.

## [0.1.5] - 12026-06-17 - Pre-duel Training Doppelganger Prep

### Added
- Added `/spar` and a Quest Hub `🥊 Бійцівський куток` entry for a level 3+ turn-based training fight against the `Сумлінний Допельґанґер`.
- Added a training combat path that mirrors the current hero summary/equipment into a doppelganger enemy, uses `solo_combat_sessions` for turns and keeps PvP state out of scope.
- Added `v1:spar:open` and `v1:spar:turn:{sessionId}:{turn}:{action}` callback parsing, presenter/keyboards and neutral-before-handler presence routing; successful training writes `location.korchma.quest_table` / `adventure.training-doppelganger` only after Barrel, interior and level gates pass.

### Guardrails
- Pending Barrel raids block the training surface before any training fight starts.
- Level 1-2 heroes see a friendly `/spar` gate and cannot create or continue training sessions; level 3 is the shared minimum planned for future duel prep unless a later PR changes it explicitly.
- Training can grant XP only: `1 XP` on loss, level-scaled win XP at roughly half of a similar-level monster reward with small luck/random upside, and no gold, items, manatky or quest progress.
- Repeat training is gated by a doppelganger recovery cooldown derived from the copy's remaining HP after the fight, not by a once-per-day card.

### Changed
- Mantok Chest auto-pick remains conservative, but manual selection can now explicitly include protected/priceless/story manatky with a visible `ручне переконання` warning and final confirmation; equipped stacks remain protected.

### Not Included
- No real duel invites, target player selection, wagers, gold/items/manatky rewards, new loot tables, group raids, trading, shops, crafting, Mini App work, schema changes or durable PvP ledger.

## [0.1.4] - 12026-06-17 - Hlybka Routing & Fight/Quest Navigation Cleanup

### Fixed
- Clarified Quest Hub navigation around `Стіл зі справами`: active fights, terminal fight records, archive, hunt, cellar and hall routes now use more explicit button labels and return paths.
- Kept Quest Hub list/archive callbacks neutral in middleware; successful Quest Hub handlers write quest-table presence only after Barrel, location and stale-button gates pass.
- Aligned Hlybka/Глибка docs with current runtime scope: Глибка remains deferred, and this release does not add a dungeon route.

### Not Included
- No new rewards, combat formulas, loot tables, item effects, shops, trading, crafting, duels, doppelganger runtime, group raids, web client, non-Telegram adapters, schema changes, remort rules or Phase 2 runtime.

## [0.1.3] - 12026-06-17 - Durable Barrel Notifications & Chest Cleanup

### Added
- Added `barrel_raid_notifications` as a durable notification ledger for pending `Бочка Пінного Міражу` raid completion messages.
- Added startup resume for pending Barrel completion notifications: future rows are rescheduled and due rows run through the existing idempotent Barrel reward path.
- Added processing lease recovery and `reward_claimed_at` tracking so crashed or failed notification delivery can resume after the reward claim without suppressing the completion message.

### Fixed
- Manual Barrel completion remains the fallback; later durable notifications now skip already-completed raids instead of sending a confusing duplicate completion message.
- Telegram send failure after a notification-owned reward claim now leaves the row retryable and can resend the existing reward summary instead of turning into a skipped notification.
- `Дружня Скриня` pending runs older than the cleanup TTL now expire safely and old confirm callbacks ask the player to reopen the chest instead of touching inventory.

### Not Included
- No reward changes, loot changes, combat formula changes, remort rule changes, Support Jar runtime, group raids, shops, trading, crafting, or Phase 2 runtime.

## [0.1.2] - 12026-06-17 - Remort at Level 13 & Presence Cleanup

### Added
- Added `/remort` as an explicit level-13 prestige loop: preview, identity rebuild, selected manatky preservation, confirmation and idempotent replay.
- Added `character_remort_drafts` and `character_remorts` ledger tables for remort drafts, completed remort history and the front-door memorial board.
- Added a `🕯️ Реморти Тринадцятки` block to the Propamiatna Doshka, showing the first remorts by remort number.
- Added local-only dev helper commands for playtesting: `/dev_add_level`, `/dev_add_xp`, `/dev_add_gold` and `/dev_add_random_item`.

### Fixed
- `Шинок` now counts as korchma interior for quest/fight/hunt/cellar gates that check the hero's current place.

### Changed
- Extracted bot presence routing rules from `createBot.ts` into a small tested `presenceRouting` module.
- Added table-driven regression tests for callback, command and main-menu presence routing, preserving the distinction between no-op presence updates and unknown callbacks.
- Level-13 capstone copy now points to `/remort` rather than treating `/restart` as the main next step.
- `/hero` can show `Памʼять минулих пригод` after a character has remorted, without duplicating remort count or exposing a public `x/5` scale.
- Remort memory now preserves 23% of the previous life’s level-growth HP, mana and primary-stat bonus, rounded up, instead of the old flat `+2 HP` / `+1` mana placeholder.
- Hardened remort confirmation: pending Barrel raids block remort actions, selected items must still exist at confirm time, archived/unknown items are visible instead of silently carried, and preserved stacks keep one unit per selected item id.
- Remort count now raises future XP thresholds proportionally, making the next climb to level 13 longer without changing the 1-13 cap.

### Not Included Yet
- Rename flow during remort, remort-only races/classes, paid power, 14+ levels, broad prestige economy, Durable Barrel completion notifications, Mantok Chest pending cleanup, or public presence privacy changes.

## [0.1.1] - 12026-06-16 - Support Jar & Link Plumbing

### Added
- Added optional `SUPPORT_JAR_URL` config for the voluntary Support Jar, validated as an absolute `https://send.monobank.ua/jar/...` URL.
- Added optional manual read-only Support Jar status fields for current amount, goal and short manual update date.
- Added secondary `/support` bot command with configured-link and missing-link fallback copy.
- Added `/start support_thanks` gratitude deep link that does not require a character and does not mutate gameplay state.
- Added a secondary public homepage support block that renders only when the support URL is configured.
- Added small `/start` payload parsing guardrails for future invite-style deep links.

### Guardrails
- No payment confirmation, donor state, webhook, donor table, gameplay reward, title, rank, gated feature, premium status, or hardcoded real Monobank URL.
- Support copy explicitly says it gives no XP, gold, loot, manatky, levels, combat power, progress, or gameplay advantage.

### Tests
- Added focused config, presenter, bot-command, start-payload and public-site coverage for configured/missing URL behavior, `support_thanks`, regular `/start`, unknown start payloads, and no broken support links.

## [0.1.0] - 12026-06-16 - Phase 1 Closeout & Phase 2 Roadmap

### Milestone
- Closed the `0.0.x` Phase 1 build line as a playable solo MVP loop and opened the `0.1.x` stabilization/playtest line.
- Reset Phase 2 around Social Combat & Interactions: duel invites first, then result/rematch/tournament cards, trading/gifting, combat variety, `/remort`, multi-enemy combat, and later party combat / real raids.
- Added the canonical Phase 1 release notes, docs index, Phase 2 planning docs, and aligned README, roadmap, backlog, smoke, balance, technical, changelog, and player-facing news surfaces.

### Phase 1 runtime now includes
- Onboarding and `/hero` for creating and reading a persistent adventurer.
- Korchma navigation, Quest Hub routing, light presence, public site/news/presence surfaces, and service commands.
- Persistent solo fights for level 3+ heroes with HP/mana state, attack/special/flee actions, stale-turn protection, loss/flee handling, and reward replay.
- Equipment effects through shared effective stats used by hero, equipment, item detail, and combat paths.
- Controlled fight loot, idempotent XP/gold/item rewards, visible level 1-13 progression, inventory, item details, and the Mantok Chest auto/manual item-volume sink.
- Yeger unquiet quest tracking and the outside-korchma Munchkin level barter path.

### Stabilized before closeout
- Munchkin barter safety from `0.0.30`: `level_barter_exchanges` replay/audit rows, no gold-only exchange, protected/equipped/priceless exclusions, `12 -> 13` refusal, and pending Barrel guards.
- Phase 1 smoke documentation now covers new-player flow, persistent fight, HP/mana recovery, equipment effects, Mantok Chest auto/manual, Yeger tracking, Munchkin barter safety, Barrel/Shynok/presence, and public health/news/presence surfaces.

### Known debts moved to 0.1.x
- Playtest bugfixes, copy polish, small UX papercuts, and balance/reliability work.
- Durable Barrel completion notifications or Mantok Chest pending cleanup, depending on observed pain.
- Hlybka routing or fight/quest navigation cleanup if playtest shows the current routing is confusing.
- First Phase 2 duel invite slice only after the core loop remains stable; rewardless achievements and other side tracks stay secondary.

### Not Included Yet
- No achievements runtime, duel/PvP runtime, trading/gifting runtime, remort-only advanced options, food/coffee buffs, NPC ranking runtime, expanded equipment, battle interventions, manual Munchkin selection, shops, selling, crafting, item-instance inventory, group raids, guilds, Mini App, or broad combat rewrite.

## [0.0.30] - 12026-06-16 - Level Barter Safety & Closeout Alignment

### Added
- Added a narrow `level_barter_exchanges` audit ledger so repeated `🎒 Манчкін-скупник` confirm callbacks replay the completed exchange instead of becoming a misleading stale-selection error.
- Added focused tests for level-barter replay, gold-only refusal, pending Barrel blocking, and the Yeger ready-trail/non-Yeger-active-fight edge.
- Added Phase 1 smoke/docs alignment for the shipped Munchkin Barter path before the separate `0.1.0` closeout PR.

### Changed
- `🎒 Манчкін-скупник` now requires at least one eligible priced манатка; wallet gold may fill the missing value but cannot buy a level by itself.
- Level-barter callbacks are blocked while a Barrel raid is pending, matching other progression/spending actions.
- Docs now describe `0.0.29` as the broader Yeger + Munchkin Barter runtime that actually shipped, with `0.1.0` still reserved for closeout/release alignment.

### Not Included Yet
- Manual Munchkin item selection, shops, selling, trading, crafting, item-instance inventory, achievements runtime, or `0.1.0` release closure.

## [0.0.29] - 12026-06-16 - Yeger Tracking Search & Munchkin Barter

### Added
- Added a timed Yeger tracking step before `Неспокійні справи` starts an unquiet persistent fight.
- Added persisted tracking state through existing `character_cooldowns`: `👣 Вийти на слід` starts a short wait, `/hunt` shows pending/ready state, and `🔎 Перевірити слід` resolves the trail.
- Added deterministic tracking outcome logic with class/stat-aware modifiers, tested without exposing exact chances in player-facing text.
- Added no-fight tracking outcomes so a resolved trail can miss without changing quest progress or granting rewards.
- Added the outside-korchma `🎒 Манчкін-скупник` exchange: eligible манатки plus missing wallet gold can be previewed and confirmed for exactly `+1` level.
- Added a hard refusal for Манчкін exchange into level 13; that milestone remains battle-only.
- Added tests for pending cooldown reuse, ready success/failure, ranger advantage caps, Yeger keyboard states, and callback rendering.
- Added tests for level-barter auto-pick, wallet gold fill, XP carry, stale token handling, and callback hardening.

### Changed
- Yeger tracking no longer starts the fight immediately on first click; it now requires a ready trail check.
- Existing active non-Yeger fights still block Yeger tracking flavor instead of being mislabeled as unquiet targets.
- The `Пропамʼятна дошка` level board now shows the full known milestone range down to level 2 instead of only the six highest levels.
- The `Шинок` generosity leaderboard now records beer-round dates by Kyiv korchma time instead of UTC.
- Game-design, technical-plan, roadmap, and backlog docs now describe the two-step Yeger trail loop and the Манчкін-скупник exchange scope.

### Not Included Yet
- Background auto-resolution, bait/lure/ambush tables, surprise opening turns, Yeger reputation, daily samples, shops, trading, crafting, item-instance inventory, manual Манчкін item selection, or a broad combat formula rewrite.

## [0.0.28] - 12026-06-15 - Yeger Trial: Unquiet Hunt Quest

### Added
- Added the first Єгер quest, `Неспокійні справи`, unlocked at level 4.
- Added a narrow Yeger quest service that uses existing `daily_actions` for start/completion and counts won saved combat rows after quest start.
- Added targeted fight start for Yeger tracking, selecting ordinary non-boss monsters with `undead`, `ghost`, `cursed`, or `unquiet` tags when no active fight exists.
- Added short `v1:ygr:*` callback data, Yeger presenter/keyboards, and tests for quest states, callback hardening, turn-in rewards, Quest Hub rows, and targeted fight selection.
- Added `Єгерська риска на дощечці` as a protected cosmetic keepsake reward.
- Added the separate front-door `Пропамʼятна дошка` / `Видатні жителі` level milestone board, showing the first three known characters to reach recorded levels.
- Added `Шинок` as a distinct korchma location for beer rounds and future korchmar turn-ins.

### Changed
- `/hunt` and the Quest Hub now point to Єгер's quest surface instead of the old hourly Hunt Board reward faucet.
- Old `v1:hunt:*` callbacks now safely refresh the Yeger corner instead of claiming combatless hourly rewards.
- Quest Hub now shows Yeger rows for locked/offered/in-progress/turn-in/completed states.
- Level-up reward paths now write idempotent milestone records for newly reached levels, with a best-effort backfill from current character levels.
- The hall `🍻 Всім пива` button is now `🍻 Шинок`; beer spending happens inside `Шинок` and presence is tracked there.
- Playtesting and game-design docs now frame the hourly Hunt Board as legacy and the Yeger trial as the current player-facing hunt loop.

### Not Included Yet
- Bait/lure/ambush tables, surprise opening turns, Yeger reputation, daily samples, shops, trading, crafting, item-instance inventory, or a broad combat formula rewrite.

## [0.0.27] - 12026-06-15 - Manual Mantok Chest Selection

### Added
- Added manual input selection for the Дружня Скриня / Манатко-скриня inventory sink.
- Added a paginated chest selection screen with an `x/5` counter, one-unit add/remove controls for eligible stacks, and a final confirmation screen.
- Added short callback forms based on run token + page/index so long generated item ids never enter Telegram callback data.
- Added tests for manual selection callbacks, pagination, selection counters, below-5 preview denial, idempotent confirm replay, stale selected inputs, and protected item exclusion.

### Changed
- The Mantok Chest overview now offers both the existing auto-pick path and the new manual path.
- Mantok Chest help copy now describes manual choice instead of saying it will arrive later.
- Manual confirmation reuses the existing transactional run ledger and output rules, preserving the auto-pick safety model.

### Not Included Yet
- Item-instance identity, shops, selling, trading, crafting, social recycling, daily samples, consumable item actions, or new loot/equipment balance.

## [0.0.26] - 12026-06-15 - Phase 1 Recovery & Balance Polish

### Added
- Added a small Phase 1 smoke/balance pass around persistent HP/mana recovery and the ordinary monster ladder after `0.0.25`.
- Added clearer zero-HP rest guidance in `/hero`, quest hub fight rows, and persistent-fight terminal copy so the player sees that recovery is the next step.
- Added docs updates for the 3, 4, 8, and 13 level smoke band, along with the current balance/playtest follow-up order.
- Added a one-time technical-apology gift campaign foundation, three non-power apology keepsakes, and `npm run grant:gift` for dry-run/apply grants through existing `daily_actions` and `character_items`.
- Added supported combat effects to the handcrafted monster trophies and generated utility loot that can be equipped, so most visible gear now has a real battle hook instead of a blank effect line.

### Changed
- Tuned the ordinary monster derivation curve downward at the top end so level 8 and 13 monsters stop looking like impossible math mistakes while keeping the ladder meaningfully stronger than the hero baseline.
- Persistent-fight and quest-hub wording now points exhausted heroes back to `/hero` before `/fight`.
- Item detail screens now omit the no-effect warning for true junk/cosmetic keepsakes, while equippable items are covered by content tests that require an explicit effect.
- Persistent-fight losses now grant a one-time `1 XP` attempt reward, while victories over much weaker monsters now pay `2-3 XP` instead of dropping to `1 XP`.

### Not Included Yet
- Potions, temple healing, paid healing, combat-time regeneration, daily free samples, Telegram gift broadcasts, manual Mantok Chest selection, item-instance inventory, shops, trading, crafting, or broader combat rewrites.

## [0.0.25] - 12026-06-15 - Persistent HP/Mana & Loot Expansion

### Added
- Added persisted HP/mana attrition for level 3+ persistent solo fights: new fights now start from the character's current resources instead of silently restoring to full.
- Added passive out-of-combat HP/mana regeneration with lazy sync on profile/fight entry, deterministic formulas, and class/race/title/stat modifiers within safe caps.
- Added `hp_regen_at` and `mana_regen_at` timestamps to `characters` so SQLite can track resource recovery without Redis or background jobs.
- Added visible recovery context to `/hero` and a no-fight rest state when a hero has 0 HP.
- Added Loot Expansion v1 as a content-backed persistent-fight loot pool: `120` base item families, `500` generated `item.loot-v1-*` variants, `+1...+5` enhancement gates, soft affinity weights, and hard equip requirement checks.
- Added handcrafted loot coverage for the ordinary level 4-13 monster ladder so each higher-level monster has at least one stable content trophy.
- Added `npm run sample:loot` for deterministic local loot sampling across levels and profile archetypes.
- Added tests for resource regeneration, non-refill effective stats, fight start sync, zero-HP denial, and terminal fight resource persistence.
- Added a larger Korchmar greeting bank for fallback, class, race, pronoun/path, and combo reactions so the korchma hall stops repeating one class-specific line.

### Changed
- Effective character stats now clamp stored current HP/mana to effective maximums instead of setting current resources to maximum on every summary.
- Persistent fight terminal states now save the actual remaining HP/mana back to the character and start recovery from that point.
- Passive HP/mana regeneration sync now avoids full-resource timestamp churn and guards stale read-path writes from overwriting fresher resource rows.
- Fight result screens now show the post-fight HP/mana snapshot.
- Persistent fight loot now can include weighted Loot Expansion v1 items while preserving existing idempotent reward replay.
- Persistent fight last-turn summaries now use short separate lines instead of stacking multiple colons in one sentence.
- Korchma round prompts that are blocked by an active Barrel raid now include a direct button to the Barrel.
- Hunt Board contracts now select ordinary non-boss monsters close to the hero level and shrink XP to `1` when the target is more than 2 levels below the hero.
- Mantok Chest results now include a direct item-detail button for the newly produced манатка.
- Quest Hub now hints that level 4+ heroes have `Справа не до миші` in the cellar and keeps the cellar button available after the novice errand retires.
- Quest Hub now uses a distinct `🧾 До проблем` button icon instead of repeating the `📋 Стіл зі справами` header icon.
- The main reply keyboard now labels the quest hub as `🗺️ Квести`, while still accepting the previous `🗺️ Квест` text from older Telegram keyboards.
- Korchma hall greetings now use a weighted rotating selector across combo, class, race, pronoun/path, and fallback buckets instead of strict best-tier selection.

### Not Included Yet
- Potions, temple healing, paid healing, consumable item use, combat-time regeneration, full death penalties, resource-management манатки, full effect processors for every loot effect id, shops, trading, crafting, or item-instance inventory.

## [0.0.24] - 12026-06-15 - Level Cap 13 & Grownup Cellar Quest

### Added
- Added the first level 4+ cellar follow-up, `Справа не до миші`, which replaces the retired mouse errand when an older hero tries the old cellar route.
- Added a narrow `CellarGrownupQuestService` and repository path that use existing `daily_actions`, `character_items`, and `character_cooldowns` instead of introducing a broad quest engine.
- Added `Сирна пломба Корчмаря`, `Кльовий шмат сиру`, and `Пляшка Пінного Міражу` content items as the first post-mouse cellar objects.
- Added idempotent paths for buying the seal, trying a roleplay bypass, receiving the bottle once, and choosing the final ending.
- Added the runtime MVP for `Дружня Скриня`: inventory entry point, auto-pick of 5 cheapest eligible манатки, confirmation, transactional recycling, idempotent replay, and one better-than-average output item.
- Added a `mantok_chest_runs` ledger for pending/completed chest runs with stored input/output audit data.

### Changed
- Raised the current alpha level cap from 10 to 13 with a steeper post-level-9 XP curve: `450`, `650`, `900`, and `1300` total XP for levels 10-13.
- Moved the level-cap celebration and `/restart` suggestion from level 10 to level 13.
- Updated combat simulation defaults and progression docs to treat levels 1-13 as the current alpha range.
- Moved the future epic-level planning bracket from `11-20` to `14-23`.
- The old repeatable mouse cellar errand remains for levels 2-3; level 4+ heroes now get the new once-per-player cellar quest instead of a dead retired state.
- Persistent solo fights now prefer monsters closer to the hero level; when content has no same-band monster yet, the selector uses the highest eligible lower-level monster instead of random level 1-2 filler.
- Persistent solo fight XP is capped to `1` when the defeated monster is more than 2 levels below the hero.
- The Mantok Chest MVP treats inventory as stack-based: it consumes 5 units, protects entire equipped `itemId` stacks, excludes priceless/story items, and defers manual selection until item-instance identity or a larger selection UI exists.

### Not Included Yet
- Epic-level abilities, level 14+ progression, broad quest engine, shops, trading, crafting, achievements runtime, manual chest selection, item-instance inventory, or combat rebalance.

## [0.0.23] - 12026-06-15 - Loot Engine & Reward Replay

### Added
- Added a pure loot domain engine with rarity weights, deterministic/injected RNG, bounded LUCK influence, monster loot candidates from content, and safe no-loot fallback.
- Added reward replay fields to `solo_combat_sessions` so won persistent fight rewards can be shown again without rerolling loot.
- Added a small per-session reward path for won persistent solo fights: XP, gold, and at most one controlled monster loot item.
- Added idempotent reward claiming for persistent fight victories through `daily_actions` using the solo combat session id as the reward bucket.
- Added tests for loot selection, bounded LUCK, no eligible loot fallback, persistent fight reward claim/replay, no rewards for flee/expired outcomes, presenter copy, and schema shape.

### Changed
- Persistent fight victory screens now show the fight reward and replay the same reward summary on repeated callbacks instead of implying a second payout.
- The `Тринадцять дрібних проблем` wrapper reward remains a separate one-time reward and still does not replace the per-session fight reward.

### Not Included Yet
- Shops, selling, trading, crafting, item-to-level exchange, consumable item actions, achievements runtime, group/PvP combat, Redis/jobs, Mini App UI, broad quest engine, or bestiary collection progression.

## [0.0.22] - 12026-06-15 - Equipment Stat Effects

### Added
- Added small optional item effect metadata for supported equippable items: HP, mana, core stats, armor, resist, weapon damage, and spell power.
- Added equipment effect aggregation through the shared effective-stats path, combining base character stats, level growth, and currently equipped item effects.
- Added visible effect lines to `/equipment`, item details, and `/hero`, including equipment contribution rows for HP, stats, armor, weapon damage, and spell power.
- Wired equipped item effects into persistent solo combat start and turn resolution for level 3+ fights.
- Added tests for content effect validation, no accidental power on junk/cosmetic items, effective stat aggregation, hero/equipment/item-detail presentation, and persistent fight equipment integration.

### Changed
- Starter equippable items now have small transparent effects: the pan adds weapon damage, the stamp adds weapon damage and intelligence, the apron adds armor and HP, the pot helmet adds armor, and the cork ring adds luck.
- Persistent fight basic attacks treat `weaponDamage` as a bonus on top of the unarmed/basic fallback, so heroes without equipped weapons still fight.
- `/help` now describes equipment as an active bonus surface instead of a preview-only shell.

### Not Included Yet
- Per-fight XP/gold/items, random loot tables, shops, selling, trading, crafting, consumable item actions, group fights, PvP, Redis/jobs, Mini App UI, or broad combat rebalance.

## [0.0.21] - 12026-06-15 - Persistent Fight Sessions

### Added
- Added persistent solo combat sessions for level 3+ `/fight`, backed by a new `solo_combat_sessions` table that stores serializable combat state JSON, monster id, status, and lazy expiry.
- Added FightService session flow that starts or resumes exactly one active solo fight per character and resolves attack, class skill, and flee turns through the pure combat domain engine.
- Added versioned persistent fight callbacks shaped as `v1:fight:turn:{sessionId}:{turn}:{action}`, with turn validation so stale buttons show current state instead of applying damage twice.
- Added Telegram fight screens for persistent combat with hero HP/mana, monster HP, current turn, last-turn summary, terminal states, and class-shaped skill labels.
- Added the first tiny persistent fight quest wrapper, `Тринадцять дрібних проблем`, tracking 13 won level 3+ solo fights and granting one fixed completion reward once.
- Added `item.badge-of-thirteen-small-problems` as a non-power cosmetic/junk-style proof that the корчмар can count to thirteen under pressure.
- Added tests for schema/migration shape, callback parsing, service start/resume/expiry, stale-turn safety, no-mana non-mutation, presenter escaping, command output, keyboard callbacks, and pending-raid presence protection.

### Changed
- `/fight` keeps the starter Mimic Shawarma probe for levels 1-2, then switches to persistent solo combat from level 3 onward.
- The quest hub now reads fight overview without starting a session, and shows whether a real solo fight is ready or already in progress.
- Persistent fight screens now frame the loop as the first korchma contract: progress is derived from won solo combat sessions, while the one-time reward claim uses `daily_actions` with a stable `once` bucket.
- Persistent fight presence uses `adventure.solo-fight` while still staying at the Korchma quest table; pending Barrel raid still blocks fight callbacks before any scene movement.

### Not Included Yet
- Per-fight XP/gold/items for persistent fight victories, loot rolls, equipment stat effects, persistent HP/mana outside the session, group combat, PvP, shops, trading, crafting, Redis/jobs, or bestiary collection progression.

## [0.0.20] - 12026-06-14 - Combat Domain Engine

### Added
- Added a pure TypeScript combat domain engine with serializable combat state, hero/monster HP, mana, turn count, and statuses for active, won, lost, fled, and expired fights.
- Added deterministic action resolution for basic attack, class-shaped skill, and flee actions using injected `RandomSource` instead of `Math.random()`.
- Added broad MVP skill profiles for warrior, mage, bard, rogue/ranger, priest, bureaucramancer, varenyk-mancer, kharakternyk, and fallback classes.
- Added monster combat stat derivation from existing monster content ids, levels, and tags without changing the content schema.
- Added unarmed/basic attack fallback so the future combat runtime does not assume every hero owns a starter weapon.
- Added domain tests for valid state creation, win, loss, flee, mana spending, not-enough-mana non-mutation, inactive combat guard, deterministic RNG, 2-5 turn sanity, and current bestiary stat derivation.

### Changed
- Exported the new combat domain modules from `src/domain/combat` and `src/domain`.
- Documented that `0.0.20` is the under-the-hood combat engine slice; Telegram `/fight` still uses the existing probe until the next persistent-session PR.
- Moved visible presence access from scattered scene inline keyboards into the persistent `👀 Хто поруч` reply-keyboard button, backed by the existing `/online` snapshot with capped Telegram name lists.

### Not Included Yet
- Telegram command/callback changes, Prisma combat sessions, persistent HP/mana loss, loot grants, equipment stat effects, item-use actions, shops, trading, crafting, PvP, group combat, Redis/jobs, Mini App UI, or bestiary collection UI.

## [0.0.19] - 12026-06-14 - Hunt Contract Ledger & Reward Replay

### Added
- Added persistent `hunt_contracts` ledger rows keyed by character and Kyiv-local hour period, storing the posted monster id, contract token, status, completed action, stored XP/gold, and item-grant replay data.
- Added a Hunt Contract repository plus Prisma implementation for posting, loading, and completing Hunt Board ledger rows.
- Repeated completed Hunt Board callbacks can now replay the original XP/gold and item summary from the ledger without issuing duplicate rewards.
- Added a safe missing-monster state for persisted contracts whose content id no longer exists after a future deploy.
- Added light onboarding gates: starter shawarma and fight run only on levels 1-2, cellar errands run only on levels 2-3, and Hunt Board contracts unlock from level 3.
- Added broader character-aware starter flavor for the first shawarma quest and its fight probe, including race/class pools and combo coverage for available onboarding combinations.
- Added broader character-aware cellar mouse flavor, including race/class pools, combo coverage, and action-specific outcome lines for basement interactions.
- Raised the current level progression cap to level 10 using the Phase 1 XP curve, with a special level-cap celebration message.
- Added `/inventory` pagination after 8 item stacks, including page-aware item-detail/back callbacks.
- Added tests for schema/migration shape, ledger JSON serialization, posted-row creation, persisted contract reuse, token mismatch safety, legacy callback safety, missing-monster fallback, and replay presenter escaping.

### Changed
- `/hunt` now uses the persisted ledger row as the contract identity source after the first view/claim in a period, instead of recomputing the active monster from content every time.
- Hunt action callbacks validate against the persisted period/token/monster record before attempting the existing `daily_actions` reward claim.
- The quest hub now shows locked/retired starter rows without showing their action buttons; `/bestiary` and `/monsters` remain read-only and available immediately.
- Starter shawarma and fight action buttons can now use character-aware labels while keeping the same validated callback payloads and reward math.
- Cellar mouse action buttons can now use character-aware labels while keeping the same validated callback payloads, cooldown, and reward math.
- The first fight screen now avoids naming the monster before the player acts; the reveal stays in the resolved outcome.
- Character summaries now lift old capped characters upward from stored XP if they already earned enough for the expanded progression curve.
- Barrel raid wait now scales by hero level: level 1 keeps the old 5-8 minute range, each later level adds 30 seconds to the possible maximum, and XP/gold are deterministic from the stored wait duration instead of a period/user roll.
- Documented future usable-item metadata and item-driven quest/combat dialogue buttons as itemization debt, not part of the current reward math.
- `daily_actions` remains the authoritative idempotency boundary for XP/gold/items; `hunt_contracts` is an audit/replay ledger, not a second reward source.

### Not Included Yet
- Full combat engine, persistent encounter sessions, HP/mana loss, equipment stat effects, random loot table engine, shops, selling, trading, crafting, bestiary collection rewards, group hunts/raids, PvP, Redis/jobs, public web bestiary, or wilderness location sessions.

## [0.0.18] - 12026-06-14 - Hunt Contract Hardening & Bestiary Notes

### Added
- Added short deterministic Hunt Board contract tokens to current `/hunt` view/action callbacks, derived from the Kyiv-local hour period, character id, monster id, level, tags, and known loot ids.
- Added safe handling for legacy tokenless Hunt Board callbacks, including the real `0.0.17` date-only payloads: they can refresh the board, but cannot claim the current hourly reward.
- Added a read-only Telegram bestiary through `/bestiary` and `/monsters`, listed as secondary help commands without adding them to the Telegram side command menu.
- Added paginated monster notes, monster detail screens, safe field notes, and “known trophy” hints phrased as notes rather than guaranteed drops.
- Added a `📖 Запис у бестіарії` button from the Hunt Board to the current target’s monster detail.
- Added tests for contract tokens, reward-relevant token drift, token mismatch safety, legacy callbacks, bestiary callback limits, pagination, HTML escaping, command aliases, and presence-neutral bestiary callbacks.

### Changed
- Hunt action callbacks now validate the period, action, token shape, Telegram callback size, current Kyiv hour, and current contract token before attempting the idempotent reward claim.
- Current-hour token mismatch returns a refresh/stale-contract state and never creates a `daily_actions` claim.
- Hunt stale-period refresh now routes through the Hunt Board instead of accepting old action payloads.

### Not Included Yet
- Full combat engine, persistent combat sessions, HP/mana loss, equipment stat effects, random loot table engine, shops, selling, trading, crafting, monster collection tracking, group hunts/raids, Redis/jobs, public web bestiary, schema migrations, or reward replay for already-completed hunt callbacks.

## [0.0.17] - 12026-06-14 - Hunt Board Monster Rotation MVP

### Added
- Added `/hunt` as a separate `Дошка полювання` surface instead of the old `/fight` alias.
- Added deterministic hourly hunt contracts selected from the existing bestiary by Kyiv-local hour period and character id, excluding the starter Mimic Shawarma and boss-tagged monsters for this MVP.
- Added hunt action callbacks for striking, tricking, and closing the posted problem with paperwork, with stale-date validation so old buttons cannot claim today's hunt.
- Added small once-per-hour hunt rewards through the existing `daily_actions` idempotency path: `3-7 XP`, `0-3` gold, and at most one deterministic monster loot item.
- Added hunt presence under the quest table/current adventure context after routing and pending-raid guards pass.
- Added focused tests for selection, Kyiv-local dates, stale callbacks, idempotent rewards, callback validation, Telegram HTML escaping, quest hub reachability, and pending raid presence protection.

### Changed
- `/fight` now remains the Mimic Shawarma combat probe, while `/hunt` opens the rotating Hunt Board.
- The quest hub can point to the Hunt Board as a separate starter action when the current hour's hunt is still open.
- Help text now lists `/fight` and `/hunt` separately.
- Hunt action callbacks now re-check korchma interior presence before claiming the hourly reward, so stale in-korchma buttons cannot complete after the player leaves.
- Hunt callback date validation now rejects impossible calendar dates, not only malformed strings.
- The third Hunt Board action is framed as closing the matter with paperwork, not a full-reward flee button.

### Not Included Yet
- Full combat for the whole bestiary, persistent HP/mana loss, equipment stat effects, random loot table engine, wilderness locations, group hunts, shops, selling, trading, Redis/jobs, or schema migrations.

## [0.0.16] - 12026-06-14 - Barrel Raid Reliability, Public Site & Bestiary

### Added
- Added a public Ukrainian landing page on `/` with Kvestarnia identity, pitch, vision, tone, current playable slice, latest public news and a privacy-preserving public presence summary.
- Added `/news` as a public news archive rendered from `news.md`, with selected entries, archive navigation and small safe markdown rendering for headings, paragraphs, bullets, slash commands and inline code.
- Added tests for `/`, `/news`, `/health`, news parsing/rendering and the existing public presence privacy behavior.
- Expanded the content bestiary to exactly 20 monsters, keeping the current simple monster schema and stable `monster.mimic-shawarma` id.
- Added monster loot item definitions and a data-only `monsterLoot` map for future loot integration without enabling random drop rolls.
- Added `monsterFlavor` content hooks and deterministic selection for combo, class, race, path/pronoun and fallback monster reactions.
- Added bestiary, monster loot and monster flavor routing docs plus tests for monster coverage, loot references, hidden path safety and selector priority.

### Changed
- Barrel raid period ids are now explicitly Kyiv-local korchma buckets that flip on the 23rd minute. The audit break blocks new starts from 03:00 to 07:00 Kyiv time.
- Player-facing audit-break wording now names the Kyiv korchma time basis and avoids tiny second-level boundary copy.
- Barrel raid rewards now roll deterministic per-period/per-player amounts: `18-26 XP` and `8-14 gold`, so the hourly wait pays better than one basement mouse errand without letting repeated callbacks reroll the result. Superseded in `0.0.19` by deterministic duration-based rewards.
- Barrel raid completion notifications now go through a small scheduler helper with one timer per `chatId + telegramUserId + periodId`, while the service reward claim remains the source of truth.
- Kept `/health` as the text/plain Render healthcheck while moving the public project surface to `/`.

### Fixed
- Pending raids that started in an older recent period can still complete after a period rollover without claiming the current period.
- Already completed, still pending, audit-break, and no-character completion attempts no longer send misleading scheduled completion messages.
- Stale pending rows outside the recent lookup window no longer block starting the current period.
- Beer round gating is covered as current-period-only: finishing one period does not unlock drinks in the next period until that period's Barrel raid is completed.

### Not Included Yet
- Durable job replay after bot restart/deploy, Redis/BullMQ, horizontal-worker coordination, Mini App UI, public player names, exact presence timestamps, hidden location names, group raids, PvP, random loot table engine, shops, selling, trading, crafting, item instance logic, or equipment stat effects.

## [0.0.15] - 12026-06-14 - Starter Gear Sources

### Added
- Added three starter gear items with stable content ids, Ukrainian names/descriptions, rarity, slot metadata, and display-only gold values: `item.stamp-of-minor-authority`, `item.apron-of-foam-resistance`, and `item.cork-ring-of-serious-business`.
- `/fight` receipt handling can now grant `item.stamp-of-minor-authority` alongside the formal receipt trophy.
- The cellar negotiation route can now grant `item.cork-ring-of-serious-business` alongside the mouse diplomacy napkin.
- The Barrel raid completion can now grant `item.apron-of-foam-resistance` alongside the wet adventurer ticket.
- Barrel raid results can now include one deterministic rotating junk trophy: `item.barrel-splinter-of-optimism`, `item.foam-cork-of-accounting`, or `item.mirage-foam-sample`.
- Pending Barrel raids now schedule an in-process Telegram completion notification, so the player can wait without manually polling the button.
- Tests cover new item ids, value/priceless metadata, no stat/effect fields, deterministic item grants, equipment mapping for reachable weapon/armor/accessory gear, item detail wording, equipment slots, and inventory valuation.
- Added a front-door `📜 Табличка прибулих` button that shows recent adventurers known to the korchma from existing presence records.

### Changed
- Item detail flavor now gives armor and accessories their own tiny equipment-preview jokes instead of sharing one generic non-weapon line.
- The current deterministic starter loop now reaches weapon, armor, and accessory examples without seeded/dev inventory.
- Barrel raids are now gated by hourly Kyiv-local raid periods that flip on the 23rd minute instead of by one daily claim. New starts pause from 03:00 to 07:00 Kyiv time for korchma accounting.
- The front-of-korchma screen now lists the main interior destinations and includes a `/tavern` fallback line in case Telegram hides an old inline button.
- The front-of-korchma screen now points to the arrivals plaque; the full first-arrival log remains future scope until there is a durable event source.
- Character profile resource line now marks HP and mana with `❤️` and `🔮` icons for faster scanning.
- Character profile gold now uses `👛` as a wallet marker instead of a generic coin icon.
- Korchma hall presence now says `поки тільки ви` only when the player is truly the sole active person inside, otherwise it summarizes active and idle adventurers across interior korchma zones.
- Korchma round results now separate the toast, beer description, and ranger reaction with blank lines for easier Telegram reading.
- Barrel scene and active raid messages now separate paragraphs; active raids also show one rotating character-aware or universal advice line before the return timer and use a larger class/race-aware pool for the hooded ranger’s action line.
- Rechecking an active Barrel raid can now rotate the ranger action and raid advice text instead of repeating the same period-seeded flavor until completion.
- Starting a Barrel raid keeps the first ranger/advice flavor stable for that start; later checks use the current check time to rotate into other relevant lines.
- Cellar, fight, shawarma, equipment, and active-raid advice messages now add blank lines between narrative beats; reward XP and gold now render as compact separate lines instead of one `XP · gold` line.
- Adventure and cellar action prompts now bold the adventurer name before `що робимо?`.
- Character wealth line now uses separate jokes for empty gold, empty inventory value, and truly empty pockets while still showing both numbers.
- Korchma scene headers now render the adventurer name in bold and the title in italics.

### Not Included Yet
- Stat effects, HP/mana/combat/XP/gold math changes, random loot tables, shops, selling, trading, crafting, item-to-level exchange, or item instance logic.

## [0.0.14] - 12026-06-13 - Persistent Equipment Shell

### Added
- Added persistent `character_equipment` rows with one equipped content item per character slot.
- Added equip and unequip callbacks for owned preview-equippable items: weapons map to `weapon`, armor maps to `chest`, and accessories map to `accessory`.
- Added an equipment service and repository path that validates character ownership and item metadata before changing equipment state.
- Equipment and item detail screens now show real equipped state, including `Зняти` affordances for occupied slots and `🧥 Екіпірувати` only for owned equippable items.
- Added a second tiny preview-equippable armor item for the shell and tests: `item.pot-helmet-of-early-access`.
- Inventory and hero screens now show the total gold value of carried priced манатки without selling, spending, or converting them.
- `item.pan-of-persuasion` is now reachable through the normal `/fight` attack reward path so equipment can be tested without seed/dev data.
- Added three tiny deterministic cellar loot items and more mouse quote/outcome variants for the basement errand, including action-specific race/class/pronoun reactions.
- Tests cover schema/migration shape, empty equipment slots, owned equip, armor-to-chest mapping, non-equippable trophies, unowned item rejection, slot replacement, empty-slot unequip, cellar item grants, presenter escaping, no-character navigation, inventory value totals, callback hardening, and content staying free of stat/effect fields.

### Changed
- `/equipment`, `/gear`, `/equip`, item detail, and inventory navigation now read from persisted equipment state instead of previewing the first owned item per slot.
- Callback validation now rejects invalid equipment slots, invalid content ids, and over-64-byte payloads for item/equipment callback paths.
- Equipment UI only presents currently supported visible slots: weapon, chest, and accessory. Head/legs remain future slot vocabulary until content/schema can honestly support them.
- No-character inventory, item detail, and equipment screens no longer render inline navigation loops; they keep the visible `/start` CTA in text.

### Not Included Yet
- Stat effects, hero stat changes, combat preview changes, XP/gold reward math changes, persistent HP/mana changes, random loot tables, item selling, trading, crafting, shops, or full equipment restrictions.

## [0.0.13] - 12026-06-13 - Equipment Preview & Item Details

### Added
- Added item inspection callbacks from the inventory surface: owned манатки now have a detail view with rarity, category, value/priceless marker, quantity, description, and equippable-vs-trophy wording.
- Added preview-only equipment commands `/equipment`, `/gear`, and `/equip`, plus an inline `🧥 Спорядження` button from `/inventory`.
- Added the first equipment preview surface with weapon, head, chest, legs, and accessory slots.
- Added callback validation for `v1:item:*` and `v1:equip:*`, including ownership checks before item detail rendering.
- Tests cover item callback parsing, inventory/equipment keyboards, item detail escaping, equipment preview wording, ownership checks, value/priceless metadata, and content remaining free of stat/effect fields.

### Changed
- Inventory replies now use inline item/detail buttons so players can inspect манатки without command arguments.
- Help lists equipment aliases as secondary commands without adding them to the Telegram side command menu.

### Not Included Yet
- Persistent equipped items, stat effects, combat changes, reward changes, random loot tables, shops, trading, crafting, item selling, or schema changes.

## [0.0.12] - 12026-06-13 - Character Impact Loop

### Added
- Added the first character impact loop: race, class, hidden path, pronoun, title, and authored combo flavor can now affect korchma greetings, starter quest text, action outcomes, and barrel raid prep hints without changing rewards.
- Added a hooded human-ish ranger NPC near the barrel with biography-aware reactions and korchma round flavor.
- Added character flavor authoring docs for korchma greetings, quest routing, raid role hints, and future content review.
- Added future backlog notes for character-facing progression: stronger level impact, level-gated and race/class-specific items, front-of-korchma community boards, epic levels, time-of-day encounter modifiers, fair-play lootbox wording, Donjons and Dragons flavor, party-gathering flavor, and item-to-level sinks.

### Changed
- Updated scene and menu buttons with clearer icons and back navigation where the player naturally expects a return path.
- Kept release news spoiler-light: joke timing and hidden monster reveals stay in the game rather than being explained in news copy.
- Hid the mimic identity from quest-hub fight preview text before the player reaches the scene.

### Not Included Yet
- Stat bonuses from race/class flavor, new rewards, equipment effects, persistent combat state, group raids, or schema changes.

## [0.0.11] - 12026-06-13 - Korchma Quest Hub, Barrel Timing & First Gold Sink

### Added
- Added a compact `Стіл зі справами` quest hub for `/quest`, the `🗺️ Квести` reply button, and the korchma quest-table place callback.
- Added quest-hub buttons for the daily shawarma adventure, daily mimic fight probe, repeatable cellar errand, and return to the korchma hall.
- Added `v1:quest:*` callback parsing for hub action routing.
- Added secondary `/cellar` command as a fallback surface without adding it to the Telegram side command menu or persistent reply keyboard.
- Added pending barrel raid timing: `🍺 У рейд на бочку` now starts a 5-8 minute wait before rewards are claimed, while the korchmar still promises «Дві-три хвилини. Максимум».
- Added `🍻 Всім пива` as the first tiny korchma gold sink gated by today’s barrel raid: it shows explicit 100-gold and 10-gold choices, then spends only after the player confirms a quality.
- Added a persistent korchma round purchase log and generosity leaderboard for day, week, and month rankings.
- Tests cover quest hub rendering, outside gates, `/fight` and `/cellar` routing, quest callback parsing, and presence middleware behavior.

### Changed
- `/quest` now opens the quest hub inside the korchma instead of immediately jumping into shawarma or cellar scenes.
- `/adventure`, `/fight`, `/hunt`, and `/cellar` no longer teleport outside players to the quest table; outside players get `Квести видають усередині.` with an enter-korchma button.
- `/fight` and `/hunt` update quest-table presence only after the player is inside the korchma.
- The hub keeps the repeatable cellar errand visible after daily shawarma and fight actions are spent.
- While the barrel raid is pending, `/quest`, `/adventure`, `/fight`, `/hunt`, `/cellar`, and related action callbacks are blocked with a short in-world message.
- Place and quest callbacks continue clearing stale raid/adventure ids when moving between korchma places.
- Tavern participant views now include a back button to return to the previous scene.

### Not Included Yet
- Persistent combat state, equipment effects, random loot tables, group raids, Redis, market/economy/crafting, Mini App UI, or a full activity-service refactor.

## [0.0.10] - 12026-06-13 - Repeatable Cellar Errands

### Added
- Added the first repeatable low-stakes activity: `Підвальна справа`, a korchma-cellar mouse errand reached from `/quest` after the daily shawarma quest and fight probe are spent.
- Added three cellar errand callbacks: cheese trap, brave sweeping, and mouse negotiation.
- Added persistent `character_cooldowns` storage for repeatable activity cooldowns without Redis.
- Added canonical korchma place ids for new presence writes: `location.korchma.front`, `location.korchma.hall`, `location.korchma.quest_table`, `location.korchma.bar`, `location.korchma.cellar`, `location.korchma.barrel`, and `location.korchma.news_corner`.
- Added cellar presence via `location.korchma.cellar` and `adventure.cellar.mouse-errand`, including public web presence counts without public player names.
- Tests cover cellar callback parsing, presenter output, cooldown reward idempotency, `/quest` fallback, presence integration, and Prisma schema shape.

### Changed
- Main player-facing hub wording is now `Корчма`: the hero starts `Перед корчмою`, the main menu says `🍺 Корчма`, and `/tavern` opens `Зала корчми`.
- `/quest` is not available outside the korchma; inside, it routes through `Стіл зі справами`, then falls through to the repeatable cellar errand once the daily shawarma quest is complete and `/fight` is no longer available for today.
- Public web presence treats the cellar as a normal public aggregate location card while keeping `players` empty by default.

### Not Included Yet
- Persistent combat state, equipment effects, group raids, Redis cooldowns, full activity refactor, `/cellar` command, or a broad quest hub.

## [0.0.9] - 12026-06-13 - Presence & Online MVP

### Added
- Added lightweight in-game presence fields on users: last action, last seen location, current raid, and current adventure.
- Added `/online` with total in-game presence, current-location presence, and current raid/adventure presence without exposing global location lists.
- Added `/look` with a compact local presence line.
- Added a compact tavern «За столами» presence block to show who was recently seen there.
- Added `👥 Учасники` callbacks for the tavern barrel raid and suspicious shawarma adventure.
- Added public web presence: `GET /api/presence/locations` plus the `/presence` page for «Жива Квестарня».
- Added active/idle threshold logic: active within 5 minutes, idle within 15 minutes, inactive hidden.
- Tests cover presence updates, thresholds, local filtering, raid/adventure filtering, web location grouping, secret-location masking, `/online`, `/look`, participants, and absence of exact timestamps.

### Changed
- `/help` now lists `/online` and `/look`.
- Tavern and adventure inline keyboards now include a participants view separate from reward actions.
- Public web presence hides player names by default, hides secret/unknown location details behind «Невідома місцина», and prepares for a future public-presence privacy flag.
- `/look` remains command-only so the persistent reply keyboard does not promise an extra visible `Озирнутися` button.
- Documented the scene-based presence debt: a last known scene can remain attached until the 15-minute cutoff or the next location-changing action.
- Documented the Kvestarnia spelling rule for `міт`, `мітичний`, `мітологія`, and `мітологічний`, and updated the matching news text.
- Documented future tavern raid timing: a pending raid state should block other adventure-like actions until completion.
- Telegram deploy notifications and `/news` now render news titles in bold with HTML escaping.

### Not Included Yet
- Exact location history, Telegram online tracking, global player location lists, privacy settings, real raid session tables, background presence ticks, or full group raid mechanics.

## [0.0.8] - 12026-06-12 - Hidden Paths & Character Content

### Added
- Characters now persist a hidden `path` metadata field derived from the visible pronoun choice.
- New characters receive `sun`, `moon`, or `boundary` internally, and the migration backfills existing local rows.
- Added the active `Бісини` and `Дрантогор` races.
- Added the `Характерник` class while keeping the old `race.kharakternyk` only as a compatibility fallback.
- Added a broader set of authored race/class combo titles for character creation summaries.
- Tests cover hidden path helpers, onboarding validation, Prisma schema shape, active race content, combo titles, and presenter visibility.

### Changed
- Character creation docs now describe hidden paths as internal tavern-bureaucracy metadata, not player-facing doctrine.
- Race/class availability is now driven by active content tables so deprecated races do not appear in new onboarding.

### Not Included Yet
- Player-facing path names, path bonuses, path-specific quests, achievements, dreams, seasonal gates, guilds, PvP, jobs, Redis cooldowns, payments, and Mini App UI.

## [0.0.7] - 12026-06-12 - Level Growth & Bigger Numbers

### Added
- Character summaries now derive effective HP, mana, and class primary stats from stored base values plus current level.
- `/hero` now shows next-level XP progress or the current alpha cap.
- `/hero` now shows a concise level-growth line when level bonuses are active.
- Tavern, adventure, and fight reward results now explain which numbers improved when a reward causes a level-up.
- Tests cover effective stats, character summaries, level-up reward text, and fight previews using higher-level effective stats.

### Changed
- Fight previews now use effective HP and stats through the shared character summary path.
- Existing stored characters benefit from level scaling without a database migration or manual row repair.

### Not Included Yet
- Persistent combat state, persistent HP loss, healing/rest, equipment effects, item usage, random loot tables, crafting, guilds, PvP, jobs, Redis cooldowns, payments, and Mini App UI.

## [0.0.6] - 12026-06-12 - First Inventory & Loot

### Added
- `/inventory`, `/items`, and `/bag` now show persistent character items from SQLite.
- Tavern, adventure, and fight first completions can grant deterministic item rewards in the same daily-action transaction as XP and gold.
- Added `character_items` persistence with one row per character/content item and quantity increments for repeated item types.
- The main menu now includes `🎒 Манатки`.
- Tests cover inventory service states, inventory presenter output, new item content IDs, Prisma schema shape, menu callback parsing, and once-per-date item grant behavior.

### Changed
- `/help` now lists inventory commands as available instead of placeholders.
- Tavern/adventure/fight reward presenters show granted items only when a new item is actually granted.
- README and design/technical docs now describe the first tiny inventory slice.

### Not Included Yet
- Equipment effects, random loot tables, item rarity rolls, selling/buying, crafting, consumables, trading, full combat state, group raids, guilds, PvP, jobs, Redis cooldowns, payments, and Mini App UI.

## [0.0.5] - 12026-06-12 - First Combat Probe

### Added
- `/fight` now opens the first tiny combat probe: `Сутичка з Міміком-шаурмою`.
- `/hunt` now aliases `/fight` instead of returning a placeholder.
- The mimic shawarma combat probe has three validated callback actions: attack, confuse with a receipt, or flee gracefully.
- A deterministic domain combat probe calculates preview damage and HP without Telegram imports, randomness, persistent HP loss, or a combat state machine.
- Fight rewards use one shared `combat.mimic-shawarma.probe` daily action key, so only one reward can be claimed per stored date regardless of selected option.
- Tests cover fight callbacks, deterministic combat math, presenter output, service idempotency, cross-action duplicate prevention, and help text.

### Changed
- `/help` now lists `/fight` and `/hunt` as available commands.
- README and design/technical docs now describe the combat probe boundary and explicitly keep full turn-based combat out of scope.

### Not Included Yet
- Persistent combat state, real death/failure, inventory persistence, item loot, equipment, group raids, guilds, PvP, jobs, Redis cooldowns, payments, and Mini App UI.

## [0.0.4] - 12026-06-12 - First Mimic Shawarma Adventure

### Added
- `/adventure` now opens the first tiny solo scene: `Перевірка підозрілої шаурми`.
- `/quest` now aliases the current adventure path instead of using a placeholder reply.
- `/restart` now lets a player delete their current character after confirmation and start over with `/start`.
- `/version` now reports the running bot version from `package.json`.
- `/news` now reads the latest release news from `news.md` and exposes an inline archive of older entries.
- Optional deploy notifications can message known users once per version when `DEPLOY_NOTIFICATIONS_ENABLED=true`.
- The `Мімік-шаурма` scene has three validated callback actions: poke, ask for a receipt, or flee.
- Adventure rewards use one shared `adventure.mimic-shawarma` daily action key, so only one reward can be claimed per stored date regardless of selected option.
- A deterministic level progression helper maps XP to levels 1-5 and reports level-up state for presenters.
- Tavern rewards now use the same level-up path, so `/hero` can show updated levels after tavern or adventure rewards.
- Tests cover adventure callbacks, presenter text, service idempotency, progression thresholds, and tavern level-up behavior.

### Changed
- `/help` now lists `/adventure` and `/quest` as available commands.
- `/hunt`, `/inventory`, and `/guild` remain friendly placeholders.
- Tavern and adventure NPC speech now uses Telegram HTML blockquotes instead of raw Markdown quote markers.
- README and design/technical docs now describe the first adventure slice and simple progression.

### Not Included Yet
- Turn-based combat, inventory persistence, item loot, equipment, group raids, guilds, PvP, jobs, Redis cooldowns, payments, and Mini App UI.

## [0.0.3] - 12026-06-12 - Friday Tavern Raid

### Added
- `/tavern` and `/raid` now open the first tiny playable event: `П’ятничний рейд на Бочку Пінного Міражу`.
- `/quest`, `/hunt`, `/inventory`, and `/guild` now return short Ukrainian placeholder responses instead of staying silent.
- The tavern screen shows the current hero, short event scene, and buttons for the barrel raid, hero summary, and help.
- `DailyAction` persistence records once-per-day local rewards with a unique character/key/date constraint.
- The tavern raid grants `+7 XP` and `+5 gold` once per stored reward date, then returns an already-completed result on repeated taps.
- Tests cover tavern callback parsing, presenter output, no-character handling, idempotent service rewards, and Prisma daily-action uniqueness.

### Changed
- The existing `🍺 До корчми` menu button now opens the real korchma screen instead of a placeholder.
- Help text now lists `/tavern` and `/raid` as available local commands.

### Not Included Yet
- Full combat, inventory, item loot, group raids, guilds, PvP, jobs, payments, and Mini App UI.

## [0.0.2] - 12026-06-12 - Character Creation Options

### Added
- Character creation now starts with a lightweight pronoun selection step: `Він`, `Вона`, or `Вони`.
- Race and class choices now use content-driven availability rules with short Ukrainian unavailable-reason messages.
- Character creation now includes a confirmation screen with pronoun, race, class, and a combo title before persistence.
- Characters persist the selected pronoun through a safe Prisma migration with a default for existing rows.
- Hero/profile summaries now show the selected pronoun label and combo title.
- Tests cover callback parsing, unavailable choices, direct callback bypass rejection, confirmation/back navigation, presenter output, and content validation for the expanded options.

### Changed
- Onboarding callback data now uses compact race/class keys to stay within Telegram callback data limits.
- `/start` now sends new players to pronoun selection before race and class selection.

### Not Included Yet
- Combat, adventure loop, loot, inventory, raids, guilds, PvP, jobs, payments, and Mini App UI.

## [0.0.1] - 12026-06-12 - Local Playability Foundation

### Added
- Initial TypeScript + Node.js Telegram bot foundation using grammY, Prisma, Zod, Vitest, and npm scripts.
- Local SQLite development database setup with Prisma migrations and `DATABASE_URL=file:./dev.db`.
- `/start` onboarding with race and class selection through versioned Telegram callback data.
- Persistent `User` and `Character` models with starter stats, race/class content IDs, HP, mana, XP, and gold.
- `/hero`, `/profile`, `/me`, `/help`, and dev-only `/dev_reset_me` commands for local playthrough testing.
- Main menu callbacks for hero, help, and tavern placeholder actions.
- Safe Telegram message editing that ignores repeated-button `message is not modified` responses.
- Unit tests for content validation, callback parsing, starter stats, onboarding idempotency, presenters, dev reset behavior, config parsing, and the domain/Telegram boundary.
- GitHub Actions CI for linting, typechecking, tests, Prisma validation, and build.

### Changed
- Local development no longer requires Docker, pnpm, or a running PostgreSQL server.
- Project workflow is npm-only.
- Documentation now points local maintainers toward SQLite-backed setup and `npm run check` for PR verification.

### Removed
- Docker Compose local development dependency.
- Stale pnpm workflow references.

### Not Included Yet
- Combat, adventure loop, loot, inventory, raids, guilds, PvP, jobs, payments, and Mini App UI.

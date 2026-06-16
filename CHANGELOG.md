# Changelog

All notable project changes are documented here.

This project follows a simple pre-1.0 versioning policy:
- `0.0.x` for foundation and local playability slices.
- `0.x.0` for larger MVP milestones.
- Breaking changes may still happen before `1.0.0`, but they should be called out explicitly.

## [0.1.2] - 12026-06-16 - Remort at Level 13 & Presence Cleanup

### Added
- Added `/remort` as an explicit level-13 prestige loop: preview, identity rebuild, selected manatky preservation, confirmation and idempotent replay.
- Added `character_remort_drafts` and `character_remorts` ledger tables for remort drafts, completed remort history and the front-door memorial board.
- Added a `🕯️ Реморти Тринадцятки` block to the Propamiatna Doshka, showing the first remorts by remort number.

### Fixed
- `Шинок` now counts as korchma interior for quest/fight/hunt/cellar gates that check the hero's current place.

### Changed
- Extracted bot presence routing rules from `createBot.ts` into a small tested `presenceRouting` module.
- Added table-driven regression tests for callback, command and main-menu presence routing, preserving the distinction between no-op presence updates and unknown callbacks.
- Level-13 capstone copy now points to `/remort` rather than treating `/restart` as the main next step.
- `/hero` can show remort count and capped memory rank after a character has remorted.
- Hardened remort confirmation: pending Barrel raids block remort actions, selected items must still exist at confirm time, archived/unknown items are visible instead of silently carried, and preserved stacks keep one unit per selected item id.

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

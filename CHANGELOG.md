# Changelog

All notable project changes are documented here.

This project follows a simple pre-1.0 versioning policy:
- `0.0.x` for foundation and local playability slices.
- `0.x.0` for larger MVP milestones.
- Breaking changes may still happen before `1.0.0`, but they should be called out explicitly.

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
- Added future backlog notes for character-facing progression: stronger level impact, level-gated and race/class-specific items, front-of-korchma community boards, epic levels `11-20`, time-of-day encounter modifiers, fair-play lootbox wording, Donjons and Dragons flavor, party-gathering flavor, and item-to-level sinks.

### Changed
- Updated scene and menu buttons with clearer icons and back navigation where the player naturally expects a return path.
- Kept release news spoiler-light: joke timing and hidden monster reveals stay in the game rather than being explained in news copy.
- Hid the mimic identity from quest-hub fight preview text before the player reaches the scene.

### Not Included Yet
- Stat bonuses from race/class flavor, new rewards, equipment effects, persistent combat state, group raids, or schema changes.

## [0.0.11] - 12026-06-13 - Korchma Quest Hub, Barrel Timing & First Gold Sink

### Added
- Added a compact `Стіл зі справами` quest hub for `/quest`, the `🗺️ Квест` reply button, and the korchma quest-table place callback.
- Added quest-hub buttons for the daily shawarma adventure, daily mimic fight probe, repeatable cellar errand, and return to the korchma hall.
- Added `v1:quest:*` callback parsing for hub action routing.
- Added secondary `/cellar` command as a fallback surface without adding it to the Telegram side command menu or persistent reply keyboard.
- Added pending barrel raid timing: `🍺 У рейд на бочку` now starts a 5-8 minute wait before rewards are claimed, while the korchmar still promises «Дві-три хвилини. Максимум».
- Added `🍻 Всім пива` as the first tiny korchma hall gold sink gated by today’s barrel raid: it shows explicit 100-gold and 10-gold choices, then spends only after the player confirms a quality.
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
- Added canonical korchma place ids for new presence writes: `location.korchma.front`, `location.korchma.hall`, `location.korchma.quest_table`, `location.korchma.cellar`, `location.korchma.barrel`, and `location.korchma.news_corner`.
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

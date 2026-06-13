# Changelog

All notable project changes are documented here.

This project follows a simple pre-1.0 versioning policy:
- `0.0.x` for foundation and local playability slices.
- `0.x.0` for larger MVP milestones.
- Breaking changes may still happen before `1.0.0`, but they should be called out explicitly.

## [0.0.12] - 12026-06-13 - Character Impact Loop

### Added
- Added the first character impact loop: race, class, hidden path, pronoun, title, and authored combo flavor can now affect korchma greetings, starter quest text, action outcomes, and barrel raid prep hints without changing rewards.
- Added a hooded human-ish ranger NPC near the barrel with biography-aware reactions and korchma round flavor.
- Added character flavor authoring docs for korchma greetings, quest routing, raid role hints, and future content review.
- Added future backlog notes for character-facing progression: stronger level impact, level-gated and race/class-specific items, front-of-korchma social boards, epic levels `11-20`, time-of-day encounter modifiers, fair-play lootbox wording, Donjons and Dragons flavor, party-gathering flavor, and item-to-level sinks.

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
- The tavern raid grants `+7 XP` and `+5 gold` once per stored UTC date, then returns an already-completed result on repeated taps.
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

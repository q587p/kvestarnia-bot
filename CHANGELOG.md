# Changelog

All notable project changes are documented here.

This project follows a simple pre-1.0 versioning policy:
- `0.0.x` for foundation and local playability slices.
- `0.x.0` for larger MVP milestones.
- Breaking changes may still happen before `1.0.0`, but they should be called out explicitly.

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
- The existing `🍺 До таверни` menu button now opens the real tavern screen instead of a placeholder.
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

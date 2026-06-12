# Character Creation

Kvestarnia character creation is intentionally lightweight: it collects just enough identity to make the hero feel visible without turning onboarding into a rules lecture.

## Flow

1. `/start`
2. Pronoun selection: `Він`, `Вона`, `Вони`
3. Race selection
4. Class selection
5. Confirmation
6. Character creation

Existing characters skip onboarding and go straight to the hero summary.

## Content Rules

Race and class availability is content-driven:

- races may limit allowed pronouns;
- classes may limit allowed races or pronouns;
- unavailable options stay visible as marked buttons when the Telegram UI can explain them;
- direct callback bypass must be rejected by service-level validation.

The bot should keep the denial text short, Ukrainian, and in Kvestarnia’s tavern-bureaucratic style.

## Persistence

Characters persist the selected pronoun as `Character.pronoun`. Existing local records receive the safe default `they` through the Prisma migration.

Combo titles are content-derived from race/class pairs and can be expanded without changing the database.

## Not In Scope Yet

- full Ukrainian grammar inflection;
- combat, loot, inventory, raids, guilds, or PvP;
- race/class stat rebalance beyond the existing starter stats;
- copying external race/lore systems.

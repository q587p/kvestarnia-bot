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

## Hidden Paths

The visible pronoun options also fill one internal tavern-bureaucracy field.
Квестарня also slips one quiet note into the hero’s file: a канцелярська шухляда персонажа, not a grand cosmic system.

| Visible option | Internal path |
| --- | --- |
| `Він` | `sun` |
| `Вона` | `moon` |
| `Вони` | `boundary` |

These path ids are stored on `Character.path` as internal metadata for future race/class restrictions, quests, dreams, achievements, NPC reactions, and seasonal events.

Do not show path names during character creation. When paths eventually gate content, explain restrictions in-world rather than as biological categories. Keep it short and tavern-bureaucratic: «Межа підписала пропуск заднім числом», «ця шухляда анкети сьогодні не відкривається».

## Content Rules

Race and class availability is content-driven:

- races may limit allowed pronouns;
- classes may limit allowed races or pronouns;
- unavailable options stay visible as marked buttons when the Telegram UI can explain them;
- direct callback bypass must be rejected by service-level validation.

The bot should keep the denial text short, Ukrainian, and in Kvestarnia’s tavern-bureaucratic style.

## Persistence

Characters persist the selected pronoun as `Character.pronoun`. Existing local records receive the safe default `they` through the Prisma migration.

Characters also persist the hidden `Character.path`. New characters derive it from the selected pronoun, and older records are backfilled by migration:

- `he` → `sun`
- `she` → `moon`
- `they` → `boundary`

Combo titles are content-derived from race/class/pronoun and can be expanded without changing the database. The confirmation step does not reveal the title; it appears after character creation and in hero summaries. `race.kharakternyk` remains only as a deprecated compatibility fallback for older local characters; new characters choose `class.kharakternyk`.

## Character Impact Loop

Starting in `0.0.11`, created-character metadata also feeds a small flavor selector in `src/content/characterFlavor.ts`.

The first supported placements are:

- korchma greeting;
- quest start;
- quest outcome;
- raid prep hint.

Race, class, authored combo, pronoun, and hidden path can all be selectors, but player-facing output must stay diegetic and must not expose internal path ids or path names. Combo titles remain visible; hidden path names remain internal.

This does not change starter stats, rewards, cooldowns, or combat math. It only makes different biographies produce different short reactions in the korchma, shawarma scene, fight probe, cellar errand, and barrel prep hints.

## Not In Scope Yet

- full Ukrainian grammar inflection beyond authored combo titles;
- combat, loot, inventory, raids, guilds, or PvP;
- race/class stat rebalance beyond the existing starter stats;
- copying external race/lore systems.

# Джерела й опори

## Репозиторій

- `src/content/races.ts` — поточні race ids, назви, описи, pronoun restrictions і `activeRaces`.
- `src/content/classes.ts` — поточні class ids, назви, descriptions, primaryStat і allowedRaces.
- `src/content/monsters.ts` — поточний runtime monster roster до 23 рівня.
- `src/content/items.ts`, `src/content/monsterLootItems.ts`, `src/content/lootExpansionV1.ts` — манатки, trophy ids і item flavor.
- `src/services/presenceService.ts` — visible presence locations: Перед корчмою, Зала, Стіл зі справами, Шинок, Льох, Бочка, Дошка корчми, Єгерський куток, Бійцівський куток, Низ, Сутерени.
- `src/bot/presenters/newsPresenter.ts` — поточна поверхня новин і return button до `news-corner`.
- `src/bot/callbacks/placeCallbackData.ts` — versioned place callback style.

## Docs

- `docs/product/brand.md` — canonical naming and voice.
- `docs/design/content-style-guide.md` — Telegram message shape, humor guardrails, `пригодник` rule.
- `docs/design/game-design.md` — fantasy, core loop, race/class list, hidden paths, character impact loop.
- `docs/design/bestiary.md` і `docs/design/monster-loot-drops.md` — handcrafted monster/trophy flavor for early roster.

## Важлива примітка

Не копіювати зовнішні лор-патерни як content. Вони корисні тільки як UX-підказка: короткі записи, джерело всередині світу, конкретна дивина, необовʼязковість читання.

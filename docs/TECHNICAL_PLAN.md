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

### cooldowns
- `id` UUID
- `character_id` FK
- `key`
- `available_at`

### daily_actions
- `id` UUID
- `character_id` FK
- `key`
- `local_date`
- `reward_xp`
- `reward_gold`
- `created_at`
- unique (`character_id`, `key`, `local_date`)

### combats
- `id` UUID
- `character_id` FK
- `monster_id`
- `state_json`
- `status`: active/won/lost/fled/expired
- `idempotency_key`
- `created_at`
- `updated_at`

### groups
- `id` UUID
- `telegram_chat_id` bigint unique
- `title`
- `created_at`

### raids
- `id` UUID
- `group_id` FK
- `boss_id`
- `state_json`
- `status`
- `starts_at`
- `ends_at`

### raid_participants
- `raid_id` FK
- `character_id` FK
- `damage_done`
- `actions_count`
- unique (`raid_id`, `character_id`)

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

У `0.0.4` таблиця `daily_actions` використовується для двох once-per-date keys:
- `tavern.friday-barrel-raid`
- `adventure.mimic-shawarma`

У `0.0.5` той самий механізм також використовується для першої безпечної combat probe:
- `combat.mimic-shawarma.probe`

У `0.0.6` той самий claim transaction може upsert/increment `character_items` тільки коли daily action створюється вперше:
- `tavern.friday-barrel-raid` → `item.wet-hero-ticket`
- `adventure.mimic-shawarma` → `item.suspicious-shawarma-wrapper` або `item.receipt-of-formal-suspicion`
- `combat.mimic-shawarma.probe` → `item.suspicious-shawarma-wrapper` або `item.receipt-of-formal-suspicion`

Цей механізм поки не є повним cooldown system і не потребує Redis.

## Telegram callback data
Callback data коротка, версіонована.

Поточні callback prefixes у `0.0.7`:
- `v1:onb:*`
- `v1:menu:hero`
- `v1:menu:help`
- `v1:menu:tavern`
- `v1:news:list:{page}`
- `v1:news:entry:{entryIndex}:{listPage}`
- `v1:tavern:raid`
- `v1:adv:mimic:poke`
- `v1:adv:mimic:receipt`
- `v1:adv:mimic:flee`
- `v1:fight:mimic:attack`
- `v1:fight:mimic:receipt`
- `v1:fight:mimic:flee`
- `v1:devreset:confirm`
- `v1:devreset:cancel`
- `v1:restart:confirm`
- `v1:restart:cancel`

Заплановані приклади для майбутніх persistent systems:
- `v1:combat:atk:{combatId}`
- `v1:combat:skill:{combatId}:{skillId}`
- `v1:menu:inventory`
- `v1:inv:equip:{inventoryItemId}` — future equipment callback, not implemented in 0.0.6.

Валідація обов’язкова. Не довіряти даним з callback.

## Presenters
Domain result → presenter → Telegram text/buttons.

Наприклад:
- `CombatResult` не містить HTML/Markdown.
- `presentCombatTurn(result)` повертає `{ text, keyboard }`.

Це дозволяє тестувати domain окремо і міняти формат Telegram без переписування бою.

## Progression helper
`0.0.4` вводить маленький deterministic helper для рівнів:
- `getLevelForXp(xp)`
- `getNextLevelThreshold(level)`
- `applyXpReward(currentXp, xpReward)`

Пороги першого slice: `0`, `10`, `25`, `45`, `70` XP для рівнів 1–5. Tavern, adventure і fight rewards мають використовувати цей helper, щоб `/hero` відразу показував оновлений рівень.

`0.0.7` додає derived effective stats без міграції схеми:
- stored `hpMax`, `manaMax` і `statsJson` залишаються level-1 базою;
- `summarizeCharacter(...)` рахує effective HP, ману й головну характеристику класу з урахуванням рівня;
- current HP і mana поки дорівнюють effective max, бо persistent HP loss і mana spending ще не реалізовані;
- fight preview бере ці effective значення через `CharacterSummary`, а не напряму з БД.

Формули alpha slice:
- HP max: `stored hpMax + (level - 1) * 4`.
- Mana max: `stored manaMax + (level - 1) * 2`.
- Primary stat: `stored primary stat + (level - 1)`.

Future equipment effects should layer on top of this effective-stats helper instead of rewriting stored starter values.

## Observability
Лоґи:
- `user_id`, `character_id`, `chat_id` — де доречно.
- action type.
- idempotency key.
- latency.
- помилки валідації.

Не лоґувати токени, приватні повідомлення повністю, персональні дані без потреби.

## Deployment MVP
Найпростіше:
- Render або інший PaaS із Node.js runtime.
- SQLite database file через persistent disk для поточного мінімального setup.
- Start command: `npm run db:deploy && npm run start`.
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

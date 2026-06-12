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

### inventory_items
- `id` UUID
- `character_id` FK
- `item_id` content id
- `rarity`
- `slot` nullable
- `is_equipped`
- `meta_json`
- `created_at`

### cooldowns
- `id` UUID
- `character_id` FK
- `key`
- `available_at`

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

## Idempotency
Кожен callback, що може видати нагороду, повинен мати idempotency key:
- `combat:{combatId}:finish`
- `raid:{raidId}:reward:{characterId}`
- `daily:{characterId}:{yyyy-mm-dd}`

Повторний callback має повертати “вже зараховано”, а не дублювати винагороду.

## Telegram callback data
Callback data коротка, версіонована:
- `v1:adv:start`
- `v1:combat:atk:{combatId}`
- `v1:combat:skill:{combatId}:{skillId}`
- `v1:inv:equip:{inventoryItemId}`

Валідація обов’язкова. Не довіряти даним з callback.

## Presenters
Domain result → presenter → Telegram text/buttons.

Наприклад:
- `CombatResult` не містить HTML/Markdown.
- `presentCombatTurn(result)` повертає `{ text, keyboard }`.

Це дозволяє тестувати domain окремо і міняти формат Telegram без переписування бою.

## Observability
Логи:
- `user_id`, `character_id`, `chat_id` — де доречно.
- action type.
- idempotency key.
- latency.
- помилки валідації.

Не логувати токени, приватні повідомлення повністю, персональні дані без потреби.

## Deployment MVP
Найпростіше:
- VPS або PaaS.
- App runtime + PostgreSQL + Redis як окремі сервіси.
- Webhook через HTTPS.
- Backups PostgreSQL щодня.

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

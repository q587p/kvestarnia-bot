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
- `last_action_at` nullable
- `last_seen_location_id` nullable
- `current_raid_id` nullable
- `current_adventure_id` nullable
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
- `updated_at`
- unique (`character_id`, `key`)

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

У `0.0.10` таблиця `character_cooldowns` використовується для першої repeatable активності:
- `cellar.mouse-errand` → 3-хвилинний cooldown для «Підвальної справи».

Cooldown reward claim має бути transactional:
- якщо `available_at > now`, повернути cooldown без XP/золота/items;
- якщо cooldown відсутній або минув, conditionally створити/оновити row, видати маленьку винагороду й перерахувати level;
- concurrent callback-и не мають проходити як дві винагороди.

Redis лишається майбутнім cache/job інструментом, не dependency для `0.0.10`.

Future tavern raid timing:
- `v1:tavern:raid` має створювати pending raid/action state з випадковим завершенням через 1–3 хвилини, а не одразу видавати reward.
- Поки pending raid активний, handlers для `/quest`, `/adventure`, `/fight`, `/hunt` і схожих action callback-ів мають відповідати блокувальним станом без видачі інших нагород.
- Завершення має бути idempotent: delayed completion не дублює XP/gold/items, а повторний callback тільки показує поточний або завершений стан.
- Для MVP це може жити у lightweight action/session таблиці; для group raids треба перейти на `raids` і `raid_participants`.

## Presence MVP
`0.0.9` додає легку in-game присутність на рівні `users`, бо окремої session table ще немає:
- `last_action_at` оновлюється тільки від оброблених команд, reply-кнопок і callback-ів;
- `last_seen_location_id` тримає coarse місцину на кшталт `location.korchma.hall`, `location.korchma.quest_table`, `location.korchma.cellar`, `location.korchma.barrel` або `location.korchma.news_corner`;
- `current_raid_id` і `current_adventure_id` тримають поточну сценову участь, доки немає справжніх raid/adventure session tables.

Пороги:
- active: до 5 хвилин від останньої обробленої дії;
- idle/recent: понад 5 і до 15 хвилин;
- inactive: старше 15 хвилин і не показується в `/online`.

Це не Telegram online tracking. Не показувати точні timestamp-и, не показувати глобальний список локацій і не робити background ticks джерелом присутності.

Важливий борг `0.0.9`/`0.0.10`: присутність place-based, але ще не session-based. Якщо гравець зайшов у залу корчми, до столу зі справами, підвалу або іншої малої місцини, цей coarse place id може лишатися останньою відомою місциною до 15-хвилинного idle cutoff або до наступної location-changing команди/callback-а. Це прийнятно для MVP-присутності, але майбутні групові рейди, pending actions і справжні локації мають перейти на окремі session/raid rows.

Web presence у `0.0.9`:
- `GET /api/presence/locations` повертає тільки активні/притихлі місцини з лічильниками; публічні `players` за замовчуванням порожні, доки немає реального privacy UI або явно увімкненого future flag-а;
- `GET /presence` рендерить сторінку «Жива Квестарня» на тому самому HTTP server;
- приховані, secret або невідомі місцини не мають витікати у public endpoint як реальні назви чи ids; використовуй «Невідома місцина» або ховай їх повністю;
- майбутній `showInPublicPresence` має керувати публічністю імен, навіть якщо presence count лишається агрегованим;
- Telegram `/online`, `/look` і `👥 Учасники` можуть показувати імена в межах спільної місцини/сцени, бо це in-game visibility, не публічний веб-список.

`0.0.10` додає легку модель Корчми як набору місцин:
- `location.korchma.front` — Перед корчмою;
- `location.korchma.hall` — Зала корчми;
- `location.korchma.quest_table` — Стіл зі справами;
- `location.korchma.cellar` — Підвал корчми;
- `location.korchma.barrel` — Біля Бочки Пінного Міражу;
- `location.korchma.news_corner` — Дошка вістей.

Legacy ids `location.tavern`, `location.shawarma-table` і `location.tavern-cellar` лишаються read aliases для старих rows, але нові writes мають використовувати `location.korchma.*`. `/quest` не позначає гравця біля столу зі справами на рівні глобальної кнопки; command handler спершу перевіряє поточну місцину, блокує квест надворі й лише тоді переводить героя до столу або підвалу. Підвал є відкритою aggregate-місциною для public `/presence`, але public web усе одно лишає `players` порожнім за замовчуванням.

Тимчасовий shortcut: `/fight` і `/hunt` у `0.0.10` все ще напряму позначають `location.korchma.quest_table`, бо combat probe лишається глобальною legacy-командою. Коли з’явиться повніший quest/combat routing, ці команди теж мають пройти через місцину або явний перехід до столу зі справами.

## Telegram callback data
Callback data коротка, версіонована.

Поточні callback prefixes у `0.0.9`:
- `v1:onb:*`
- `v1:menu:hero`
- `v1:menu:help`
- `v1:menu:tavern`
- `v1:place:hall`
- `v1:place:front`
- `v1:place:quest-table`
- `v1:place:barrel`
- `v1:place:cellar`
- `v1:place:news-corner`
- `v1:news:list:{page}`
- `v1:news:entry:{entryIndex}:{listPage}`
- `v1:tavern:raid`
- `v1:tavern:participants`
- `v1:adv:mimic:poke`
- `v1:adv:mimic:receipt`
- `v1:adv:mimic:flee`
- `v1:adv:mimic:participants`
- `v1:cellar:cheese-trap`
- `v1:cellar:sweep-bravely`
- `v1:cellar:negotiate`
- `v1:cellar:participants`
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

Future combat-state note: this is an alpha shortcut, not the final resource model. When persistent HP loss, mana spending, healing, rest, or turn-based combat state ships, `CharacterSummary` must stop treating current HP/mana as automatically full. Keep effective max calculation separate from persisted current resource state, clamp persisted current to the effective max, and avoid silent full-heal/full-mana behavior in summaries.

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

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

Future equipment/trading notes:
- `0.0.13` adds preview-only equipment and item detail views without schema changes. It reuses `character_items` for ownership checks and content metadata for rarity/slot/value/description.
- `0.0.14` adds `character_equipment` as a separate persistent equipment shell. It stores content `item_id` per `character_id` + `slot`, while `character_items` remains the ownership/count table.
- Equipping validates current ownership and known equippable content before upserting a slot. Unknown content ids, trophies, consumables, cosmetics, and junk are not equippable in this shell.
- Current slot mapping: `weapon` → `weapon`, `armor` → `chest`, `accessory` → `accessory`. The repository slot vocabulary still allows `head` and `legs` for future compatibility, but the visible UI hides them until content/schema has real supported items.
- Known equipment debt: `character_equipment` stores content `item_id`, not a concrete `character_item.id`. That is acceptable for the current MVP because equipping does not change quantity and there is no selling, trading, item instance state, or item-to-level exchange yet. Before any sell/trade/item-to-level flow, revisit this relation so equipped state cannot point at a stack that was consumed, transferred, split, or instance-mutated.
- Equipment currently has no stat effects. `/hero`, fight preview, rewards, cooldowns, HP/mana, and level-up math remain unchanged. Future stat effects should layer through one equipment/effective-stats helper, not ad hoc presenter math.
- Item content metadata should eventually support `requiredLevel`, allowed `raceId`/`classId` lists, and optional hidden `path`/pronoun selectors for rare restricted манатки.
- Item content metadata includes `goldValue` for priced items or an explicit `priceless` marker for story trophies and special collectibles. Current code displays this in item detail, inventory total value, and hero wallet context; it does not sell, trade, convert, or spend items.
- `character_items` stays the ownership/count table. Actual equipment slots, temporary permission effects, cursed exceptions, attunement, respec/form-change state, and trade offers should be separate rows or state machines.
- Equipping must validate ownership, level, restrictions, and any active bypass in one domain/service path; callbacks should never trust button text or stale presenter state.
- Player-to-player exchange/gifting needs an idempotent transaction: remove/decrement from sender, create/increment for receiver, write an audit/transfer row, and fail cleanly if the sender no longer owns the item.
- Future item-to-level exchange needs a dedicated transaction: validate selected inventory quantities, ignore/reject priceless items, sum `goldValue * quantity`, consume the selected items, grant exactly the allowed level-up, and write an audit row/idempotency key so repeated callbacks cannot duplicate levels.

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

У `0.0.4` таблиця `daily_actions` використовується для двох idempotent reward keys:
- `tavern.friday-barrel-raid`
- `adventure.mimic-shawarma`

У `0.0.5` той самий механізм також використовується для першої безпечної combat probe:
- `combat.mimic-shawarma.probe`

У `0.0.6` той самий claim transaction може upsert/increment `character_items` тільки коли daily action створюється вперше:
- `tavern.friday-barrel-raid` → `item.wet-hero-ticket`
- `adventure.mimic-shawarma` → `item.suspicious-shawarma-wrapper` або `item.receipt-of-formal-suspicion`
- `combat.mimic-shawarma.probe` → `item.suspicious-shawarma-wrapper` або `item.receipt-of-formal-suspicion`

У `0.0.15` starter gear джерела лишаються тим самим idempotent claim mechanism:
- `combat.mimic-shawarma.probe` attack → `item.pan-of-persuasion`, receipt → `item.stamp-of-minor-authority`
- `cellar.mouse-errand` negotiate → `item.cork-ring-of-serious-business`
- `tavern.friday-barrel-raid` → `item.apron-of-foam-resistance` plus one deterministic rotating barrel junk trophy

У `0.0.17` той самий `daily_actions` path використовується для першої ротації монстрів із бестіарію:
- `combat.hunt-board.contract` → один `/hunt` контракт на київський годинний відтинок, `3-7 XP`, `0-3` золота й максимум один детермінований `monsterLoot` item.
- Вибір монстра детермінований від Kyiv-local `YYYY-MM-DDTHH` і character id; `monster.mimic-shawarma` і boss-tagged монстри не входять у перший Hunt Board MVP.
- Старий period id у `v1:hunt:act:{period}:*` повертає stale-period copy і не створює claim для поточної години.

У `0.0.18` Hunt Board callback-и отримують короткий deterministic contract token:
- token будується з Kyiv-local `YYYY-MM-DDTHH`, `character.id` і компактного reward/selection fingerprint-а монстра: `monster.id`, `level`, `tags`, `monsterLoot` ids;
- новий action callback має форму `v1:hunt:act:{period}:{token}:{action}`;
- якщо period stale, handler повертає stale-period copy до reward claim;
- якщо period поточний, але token не збігається з поточно перерахованим контрактом, handler повертає stale-contract/refresh copy і не створює `daily_actions` claim;
- legacy tokenless callback-и з `0.0.17` лишаються safe, включно з date-only форматом `YYYY-MM-DD`: view може оновити дошку, action без token не може зарахувати поточну винагороду.

У `0.0.19` Hunt Board отримує persisted ledger:
- `hunt_contracts` має один row на `character_id + local_period_id` і зберігає `monster_id`, `contract_token`, status, completed action, stored XP/gold і serialized item grants;
- перший view або action за period створює posted row, а наступні виклики використовують persisted monster/token як source of truth для identity;
- action callback валідується проти persisted row до `daily_actions.claimForTelegramUser`, тому content order/deploy drift не може перекинути стару кнопку на іншого монстра в тому самому period;
- після успішного `daily_actions` claim ledger позначається completed і зберігає reward summary для replay;
- repeated callback або existing `daily_actions` claim показує stored XP/gold/items із ledger, якщо вони доступні; якщо ledger completion колись не записався, fallback показує stored XP/gold із `daily_actions` і чесно не вигадує item details.
- Onboarding gate: Hunt Board відкривається з 3 рівня. Перевірка стоїть у service path до `hunt_contracts` upsert і до `daily_actions.claimForTelegramUser`, щоб низькорівневий `/hunt` або stale action callback не створював ledger row і не рухав reward state.

`daily_actions` лишається reward-idempotency authority. `hunt_contracts` не має сам видавати XP/gold/items і не замінює encounter session. Це audit/replay layer для current one-shot Hunt Board.

Залишковий борг перед великим Hunt Board: ledger ще не є persistent combat/encounter state. Для групових полювань, wilderness sessions, collection progression, складного loot tracking або combat HP/mana потрібна окрема session model і ширший transaction boundary.

Цей механізм поки не є повним cooldown system і не потребує Redis.

У `0.0.10` таблиця `character_cooldowns` використовується для першої repeatable активності:
- `cellar.mouse-errand` → 3-хвилинний cooldown для «Підвальної справи».

Cooldown reward claim має бути transactional:
- якщо `available_at > now`, повернути cooldown без XP/золота/items;
- якщо cooldown відсутній або минув, conditionally створити/оновити row, видати маленьку винагороду й перерахувати level;
- concurrent callback-и не мають проходити як дві винагороди.
- Onboarding gate: Підвальна справа відкривається з 2 рівня. Перевірка стоїть до cooldown reward claim, а command/callback handlers не мають переносити presence в `location.korchma.cellar`, якщо герой ще locked.

Redis лишається майбутнім cache/job інструментом, не dependency для `0.0.10`.

Tavern raid timing in `0.0.11`/`0.0.15`/`0.0.16`:
- `v1:tavern:raid` створює lightweight pending action через годинний `CharacterCooldown` key з prefix `tavern.friday-barrel-raid.pending` і period id `YYYY-MM-DDTHH:23`, з випадковим завершенням через 5–8 хвилин, а не одразу видає reward. У `0.0.16` period id явно є Kyiv-local korchma bucket-ом, не серверним UTC bucket-ом і не user-facing timestamp-ом.
- Новий raid period відкривається на 23-й хвилині кожної години за київським корчемним часом. З 03:00 до 07:00 за Києвом нові старти повертають audit-break copy про переоблік; уже pending рейди все ще можуть завершитись. О 07:00 рейд знову доступний у поточному period bucket, а далі лічильник перемикається за звичайним правилом 23-ї хвилини.
- Поки pending raid активний, handlers для `/quest`, `/adventure`, `/fight`, `/hunt`, `/cellar` і схожих action callback-ів відповідають блокувальним станом без видачі інших нагород.
- Reward amount для завершення рейду — deterministic roll від `periodId + telegramUserId`: `18-26 XP` і `8-14 золота`. Фактичні значення записуються в `DailyAction.rewardXp/rewardGold`; existing claim повертає stored amount, а не перекидає roll.
- Завершення idempotent: після `available_at <= now` той самий callback завершує reward claim для period id старту; повторний callback показує completed/already-completed без дублювання XP/gold/items.
- Bot layer ставить in-process `setTimeout` notification після `pending-started`, а `completeFridayBarrelRaid(telegramUserId, periodId)` лишається джерелом правди для reward claim. У `0.0.16` scheduler має один timer на `chatId + telegramUserId + periodId`, чистить map після firing і не надсилає completed-message для `already-completed`, `pending`, `audit-break` або `no-character`. Ця нотифікація best-effort: після restart/deploy таймери губляться, а за кількох bot worker-ів локальні timer map-и можуть дублювати повідомлення, якщо deployment не гарантує один worker.
- Manual fallback шукає pending raid у поточному й останніх 23 годинних period id, щоб завершення не губилося після restart або довгої паузи гравця. Старіші pending рейди потребують cleanup/migration або durable replay, бо поточний fallback не сканує безмежну історію.
- Для MVP це лишається cooldown/action state без persistent job scheduler; перед горизонтальним scaling або group raids треба перейти на outbox/persistent jobs, `raids` і `raid_participants`.

Рішення й борги для raid timing:
- Pending-рейд на Бочку має переживати rollover годинного відтинку й видавати винагороду за period id старту. Поточний MVP зберігає period id у полі `daily_actions.local_date`; перед повним activity model це імʼя поля варто переглянути або задокументувати як generic idempotency bucket.
- Runtime callers мають віддавати перевагу `advanceFridayBarrelRaid`, бо він володіє flow start/pending/complete/already-completed. `completeFridayBarrelRaid` лишати public тільки для compatibility/tests, доки service API не буде прибраний.
- Поки рейд pending, stale scene callbacks на кшталт `v1:adv:mimic:*`, `v1:fight:mimic:*`, `v1:hunt:*` і `v1:cellar:*` не мають перезаписувати `last_seen_location_id`, `current_raid_id` або `current_adventure_id` до того, як pending guard їх заблокує. Безпечне гортання може оновлювати last action, але не має замінювати рейдову присутність біля Бочки без явного location transition rule.

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

Legacy ids `location.tavern`, `location.shawarma-table` і `location.tavern-cellar` лишаються read aliases для старих rows, але нові writes мають використовувати `location.korchma.*`. `/quest` не позначає гравця біля столу зі справами на рівні глобальної кнопки; command handler спершу перевіряє поточну місцину, блокує квест надворі й лише тоді переводить героя до столу. Підвал є відкритою aggregate-місциною для public `/presence`, але public web усе одно лишає `players` порожнім за замовчуванням.

Routing rule у `0.0.11`/`0.0.17`: `/quest`, `/adventure`, `/fight`, `/hunt` і `/cellar` не мають глобально телепортувати героя до Столу зі справами. Якщо остання відома місцина надворі або порожня, handler показує `Квести видають усередині.` і кнопку входу до корчми. Якщо герой уже всередині корчми, `/quest` відкриває hub і пише `location.korchma.quest_table`; direct focus commands `/adventure`, `/fight` і `/hunt` можуть показати свою starter scene тільки після такого interior gate. `/hunt` у цьому MVP пише `location.korchma.quest_table` і `adventure.hunt-board.contract`, доки немає окремої wilderness/session model. `/cellar` лишається secondary fallback і пише `location.korchma.cellar` тільки після входу.

`0.0.11` також додає `korchma_round_purchases` як малий журнал підтверджених частувань:
- `v1:tavern:round` тільки показує offer/statistics screen і не списує золото;
- `v1:tavern:round-simple` і `v1:tavern:round-fine` виконують repeatable spending після raid gate;
- рейтинги за добу, тиждень і місяць агрегуються з purchase log за `local_date`;
- leaderboard сортується за сумою витраченого золота, потім за кількістю частувань;
- майбутній tie-breaker має бути детермінованим: earliest purchase in period, потім stable `character_id`, якщо потрібно, щоб привітання за перше місце не стрибали між рівними rows;
- unlimited repeatable spending прийнятний для першого sink, бо кожна покупка вимагає явного підтвердження, але майбутній UX/anti-spam може додати soft cooldown або rate limit.

## Telegram callback data
Callback data коротка, версіонована.

Поточні callback prefixes у `0.0.18`:
- `v1:onb:*`
- `v1:menu:hero`
- `v1:menu:help`
- `v1:menu:tavern`
- `v1:place:hall`
- `v1:place:front`
- `v1:place:arrivals`
- `v1:place:quest-table`
- `v1:place:barrel`
- `v1:place:cellar`
- `v1:place:news-corner`
- `v1:quest:adventure`
- `v1:quest:fight`
- `v1:quest:hunt`
- `v1:quest:cellar`
- `v1:news:list:{page}`
- `v1:news:entry:{entryIndex}:{listPage}`
- `v1:tavern:raid`
- `v1:tavern:participants`
- `v1:tavern:ranger`
- `v1:tavern:round`
- `v1:tavern:round-simple`
- `v1:tavern:round-fine`
- `v1:adv:mimic:poke`
- `v1:adv:mimic:receipt`
- `v1:adv:mimic:flee`
- `v1:adv:mimic:participants`
- `v1:cellar:cheese-trap`
- `v1:cellar:sweep-bravely`
- `v1:cellar:negotiate`
- `v1:cellar:participants`
- `v1:item:inventory`
- `v1:item:detail:{itemId}`
- `v1:equip:view`
- `v1:equip:item:{itemId}`
- `v1:equip:clear:{slot}`
- `v1:fight:mimic:attack`
- `v1:fight:mimic:receipt`
- `v1:fight:mimic:flee`
- `v1:hunt:view:{localPeriodId}:{contractToken}`
- `v1:hunt:act:{localPeriodId}:{contractToken}:strike`
- `v1:hunt:act:{localPeriodId}:{contractToken}:trick`
- `v1:hunt:act:{localPeriodId}:{contractToken}:retreat`
- `v1:bst:list:{page}`
- `v1:bst:mon:{monsterId}:{page}`
- `v1:devreset:confirm`
- `v1:devreset:cancel`
- `v1:restart:confirm`
- `v1:restart:cancel`

Заплановані приклади для майбутніх persistent systems:
- `v1:combat:atk:{combatId}`
- `v1:combat:skill:{combatId}:{skillId}`
- `v1:equip:wear:{itemId}` або коротший equivalent — future richer equipment mutation after the `0.0.14` shell, if slots, restrictions, or item instances need more data than content ids.

Валідація обов’язкова. Не довіряти даним з callback: `v1:item:detail:{itemId}` має перевірити, що item id валідний, content існує або має fallback, і герой реально володіє цією манаткою перед показом деталей. `v1:equip:item:{itemId}` має додатково перевірити ownership і equippable content metadata; `v1:equip:clear:{slot}` має відхилити невідомий slot.

Regression guard: item/equipment callback parsers мають і надалі явно відхиляти payload-и довші за `TELEGRAM_CALLBACK_DATA_LIMIT`, навіть якщо generated callback-и зараз короткі.

Майбутній UX-борг для `safeEditMessageText`:
- Перед редагуванням callback-повідомлення перевіряти, що це останнє актуальне повідомлення бота в цьому chat/user flow, або що конкретний екран явно дозволено редагувати старим `message_id`.
- Якщо після старого callback-повідомлення вже були нові повідомлення бота, не редагувати старе повідомлення високо в історії. Замість цього надіслати нове повідомлення, щоб гравець бачив зміну без скролу вгору.
- Для реалізації може знадобитись lightweight облік останнього bot `message_id` на chat/user/session або wrapper, який після `reply`/`edit` оновлює цей стан.
- Додати тести на stale callback: старе повідомлення з кнопкою натиснули після нового тексту, handler не ховає результат у старому edit, а надсилає нове повідомлення.

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

Future progression pass:
- Revisit the alpha formulas so level has a stronger, visible impact on HP, mana, combat coefficients, event checks, and activity/content gates.
- Keep the source of truth centralized in progression/effective-stat helpers; presenters, services, and combat/event logic should not each invent their own level math.
- Add tests around level breakpoints so raising level changes real outcomes, not only displayed summary numbers.
- Model levels `11-20` as an epic bracket with milestone unlocks for race/class abilities, inspired by Munchkin-style extra class/race tricks. Keep unlock definitions data-driven enough for tests and presenters to answer «what changed at this level?» without hard-coded string checks.

Future time-of-day combat modifiers:
- Derive a coarse local phase from the shared time helper: `morning`, `day`, `evening`, `night`.
- Store monster affinity as content tags or explicit modifiers, not presenter text: e.g. `night`, `dark`, `underground`, `sunlit`, `dawn`.
- Apply phase modifiers in the deterministic combat/effective-enemy helper before presenters render HP/attack previews.
- Test each phase with fixed clocks; never depend on wall-clock time directly in domain tests.
- Keep UI wording coarse and flavorful. Do not show exact server timestamps; say the night makes a tagged enemy bolder, not «+17% о 23:04».

Future korchma progression boards:
- Add a durable event/log source for first arrival and level-up milestones instead of deriving them from mutable current character state.
- Level-up records should be idempotent per `character_id` + reached `level`; repeated reward callbacks must not duplicate the same milestone.
- The front-of-korchma level board can show recent level-ups plus a ranking by highest reached level. Use deterministic tie-breakers: reached level desc, achieved time asc, then stable `character_id`.
- Level 10 needs a distinct milestone type or presenter branch so it can be highlighted without hard-coding string searches.
- Keep these boards as in-game Telegram surfaces near `location.korchma.front`; public web presence must still avoid exposing player names by default.

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

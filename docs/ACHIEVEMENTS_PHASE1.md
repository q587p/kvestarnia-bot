# Achievements Phase 1

Дата фіксації: 12026-06-14.

## Рішення

Future rewardless gameplay/meta slice після persistent fight / equipment / loot ланцюжка:

```text
Later — Achievements Phase 1
```

Phase 1 ачівки в Квестарні — це колекція жартівливих титулів і записів про подвиги, а не механічні бонуси. Вони мають підсилювати відчуття прогресу, давати гравцю ще одну причину відкрити персонажа й сміятися з власних рішень, але не давати XP, золота, бойової сили або pay-to-win переваг.

Вибір активного титулу біля імені персонажа — не частина цього slice, якщо у коді не знайдеться зовсім маленького й безпечного місця. У Phase 1 достатньо зберігати отримані ачівки як майбутні титули.

## UX

Вхід:

- кнопка `🏅 Ачівки` з екрану персонажа;
- callback короткий і стабільний, наприклад `char:ach`;
- не додавати окрему persistent reply-кнопку й не роздувати side command menu.

Екран:

```text
🏅 Ачівки
Розділ: 📚 Усі
Отримано: 17/54
Сторінка: 1/6

1. ✅ Де тут вихід? — створити персонажа • 14.06
2. 🔒 Палиця вже не випадкова — досягти 5 рівня • 2/5
3. ❔ Таємна ачівка — умова прихована, бо літописець хихоче.
```

Правила:

- отримана: `✅ Назва — критерій • DD.MM`;
- отримана в попередні роки: `DD.MM.YY`;
- заблокована відкрита: `🔒 Назва — критерій • current/target`;
- заблокована прихована: `❔ Таємна ачівка — умова прихована...`;
- пагінація: 10 рядків на сторінку;
- сортування стабільне через `sort_order`, щоб сходинки не стрибали після unlock;
- hidden-ачівки не показують criterion до unlock.

Категорії Phase 1:

- `all` — усі;
- `level` / onboarding — старт і рівні;
- `combat` — бій і моби;
- `quests` — квести й сюжет;
- `bosses` — боси;
- `gear` — манатки й золото;
- `presence` — присутність і повернення;
- `weird` — провали й дивацтва.

## Data Model

Мінімальні таблиці:

```text
achievement_definitions
player_achievements
achievement_progress
```

`achievement_definitions`:

- `id`;
- `title`;
- `criterion`;
- `locked_hint`;
- `category`;
- `trigger_event`;
- `metric`;
- `target`;
- `hidden`;
- `grant_title`;
- `enabled`;
- `sort_order`;
- timestamps.

`player_achievements`:

- `player_id` або `character_id`, залежно від наявної моделі ownership;
- `achievement_id`;
- `unlocked_at`;
- `notified_at`;
- optional `progress_current_snapshot`;
- unique index для owner + achievement.

`achievement_progress`:

- owner id;
- `achievement_id`;
- `current`;
- `target`;
- `updated_at`.

Якщо статистика вже є канонічно в іншій таблиці, не дублювати її без потреби. Для рівня, золота, kill count або completed quests сервіс може перераховувати прогрес із source-of-truth. `achievement_progress` потрібен там, де без нього немає надійного лічильника або потрібен debug/streak state.

## Seed

Початковий seed із архіву `kvestarnia-achievements-phase1.zip` містить 54 definition records.

Наступний PR має перенести seed у репозиторій у відповідне місце, наприклад:

```text
src/content/achievements.ts
```

або data seed файл, якщо Prisma seed-flow уже зручніший для цього проєкту.

Вимоги до seed:

- idempotent loader: повторний запуск не створює дублікати;
- 54 записи, унікальні `id` і `sort_order`;
- всі player-facing рядки українською;
- приховані ачівки мають `locked_hint`;
- залежні від ще неготових систем definition-и можна seed-ити як `enabled=false`.

Додаткові candidate definitions для бочкової поведінки:

- `barrel.checks.count`: скільки разів гравець натискав `🍺 Перевірити бочку` під час або після pending-рейду. Пороги: 10 / 100 / 1000. Тон: «Бочка вже знає ваші кроки», «Корчмар видав вам окремий журнал перевірок», «Ви перевірили бочку частіше, ніж вона перевіряла свою совість».
- `barrel.tips.seen.count`: скільки різних або загальних `Порад дня` гравець побачив під час очікування рейду. Пороги: 10 / 100 / 1000. Тон: «Порада дня стала порадою життя», «Ви бачили стільки порад, що єгер почав радитися з вами», «1000 порад потому бочка все ще не визнає провини».

Якщо runtime не має надійного source-of-truth для цих лічильників, додати `achievement_progress` або окремий lightweight counter у майбутньому achievements PR. Не намагатися вираховувати це з текстів повідомлень або старих Telegram callback-ів.

## Events

Мінімальний контракт:

```ts
type AchievementEvent = {
  ownerId: string;
  type: string;
  occurredAt: Date;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};
```

Сервіс:

```ts
await achievements.track(event);
```

Події Phase 1:

- `character.created`;
- `ui.character_tab.opened`;
- `ui.achievements.opened`;
- `player.level_changed`;
- `quest.story.completed`;
- `dialogue.choice.selected`;
- `quest.completed`;
- `combat.mob_killed`;
- `combat.finished`;
- `combat.critical_hit`;
- `combat.boss_killed`;
- `combat.player_died`;
- `combat.player_fled`;
- `inventory.item_received`;
- `equipment.item_equipped`;
- `equipment.changed`;
- `shop.item_sold`;
- `shop.item_bought`;
- `economy.gold_earned`;
- `presence.daily_activity`;
- `presence.action`;
- `ui.callback.accepted`.

Події, яких runtime ще не має, не треба вигадувати в цьому PR. Definition-и під них можуть бути disabled або лишитися в seed як майбутні, але сервіс не має ламатися від відсутності shop/boss/critical hit pipelines.

## Notifications

Один unlock:

```text
🏅 Нова ачівка!
«Мобопсихолог» — за 5 вбитих мобів.
Титул додано в Персонаж → Ачівки.
```

Кілька unlock-ів за одну дію:

```text
🏅 Нові ачівки: 3
✅ Бойове хрещення в калюжі
✅ Мобопсихолог
✅ Перший пергамент не з’їв
```

Правила:

- не спамити під час backfill;
- не надсилати повторне повідомлення після retry;
- після успішного показу ставити `notified_at`;
- якщо кілька ачівок відкрились одним event, групувати в один короткий текст.

## Safety

- Ачівки не дають бойових бонусів, золота, XP або предметів у Phase 1.
- Unlock має бути ідемпотентним.
- Callback data мають бути коротші за 64 bytes і покриті тестами.
- Hidden criteria не мають витікати в locked state.
- Backfill для старих гравців має бути silent або одним зведеним повідомленням.
- Telegram HTML має escape-ити всі dynamic values.
- Не будувати окрему bestiary collection system у цьому PR.

## Required Tests

- seed validation: кількість, унікальність ids/sort_order, hidden hints;
- seed idempotency;
- threshold unlock-и для рівнів, мобів, квестів, золота;
- disabled definitions не відкриваються;
- hidden achievements не спойлерять criterion до unlock;
- кілька unlock-ів від одного event;
- duplicate event не дублює unlock;
- UI rendering для earned/locked/hidden rows;
- date formatting `DD.MM` і `DD.MM.YY`;
- pagination first/middle/last page;
- callback data length <= 64 bytes;
- backfill не створює повторні notifications.

## Next PR Notes

Запропонована назва майбутнього PR:

```text
Achievements Phase 1
```

Scope guard:

- не змішувати з equipment stats, loot engine або reward-bearing combat changes;
- не додавати бойові бонуси;
- не додавати economy rewards;
- не робити active-title selection, якщо це тягне нову складну модель;
- не розширювати бестіарій як collection track;
- не додавати production dependencies.

Після цього повернутися до основного RPG-ланцюжка:

```text
persistent fight sessions → equipment stat effects → loot engine → level 1-13 polish
```

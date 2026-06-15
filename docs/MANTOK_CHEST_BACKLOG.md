# Дружня Скриня / Манатко-скриня

## Навіщо

`0.0.23` додає перший controlled loot path для won persistent fights. Це добре для гри, але одразу збільшує обсяг манаток у торбі. Без item sink інвентар швидко стане довгим, а довгий інвентар — це вже не пригода, а маленька бухгалтерська хмара.

Наступний gameplay-slice після loot reward має дати гравцю веселий спосіб зменшувати кількість зайвих речей без нудної кнопки `Продати все`.

## Фантазія

У корчмі зʼявляється Дружня Скриня з грушениці. Вона трохи переступає з ніжки на ніжку, удає невинність і дуже відповідально ставиться до оптимізації інвентаря.

Player-facing назви:

- `Дружня Скриня`;
- `Манатко-скриня` як коротка внутрішня/жартівлива назва.

Не використовувати прямі чужі назви персонажів, світів або довгі цитати. Пасхалка має працювати образом: жива скриня, багато ніжок, дивний апетит.

## MVP

Runtime MVP входить у `0.0.24`: entry point із `/inventory`, auto-pick `Згодувати 5 найдешевших`, confirmation, transactional confirm, idempotent replay і friendly stale/error states.

Гравець віддає рівно `5` eligible манаток і отримує `1` нову манатку, яка краща за середнє вкладених речей за контрольованою score-функцією.

Цілі:

- зменшити інвентар на `4` item instances за одну операцію;
- перетворити зайві речі на маленьку loot-радість;
- не відкривати магазини, продаж, trading, crafting або item-to-level exchange;
- не споживати предмети без явного підтвердження.

## Базові правила

- batch size: `5`;
- `0.0.24` реалізує тільки `Згодувати 5 найдешевших`; manual selection лишається follow-up;
- перед переробкою обовʼязковий confirmation screen;
- preview не мутує стан;
- recycle має бути транзакційним та idempotent-safe для повторного Telegram callback;
- якщо output item не вдалося створити, input items не зникають.

Eligible манатки:

- належать поточному гравцю;
- не екіпіровані;
- не quest/story/protected;
- не locked/favorite, якщо такі прапорці вже існують або будуть додані;
- не pending у trade/mail/auction/future state;
- не дублюються в одному batch.

Поточна важлива реалізаційна межа: inventory stack-based (`CharacterItem.itemId + quantity`), без item-instance identity. Тому `0.0.24` споживає 5 одиниць зі stack-ів, а не 5 окремих rows. Якщо `itemId` екіпірований, увесь stack цього `itemId` захищений від Скрині, навіть якщо `quantity > 1`. Locked/favorite/trade/mail/auction прапорців ще немає, тому вони не застосовуються.

## Score-модель

У `0.0.24` item level ще не існує, тому runtime формула спирається на наявні content fields:

```text
rarityRank: common=1, uncommon=2, rare=3, epic=4
itemScore = (goldValue ?? 0) + rarityRank * 25
averageScore = mean(input itemScore)
minimumOutputScore = floor(averageScore) + 1
```

Output item має мати `score > averageInputScore`. Це означає «краще за середнє пʼяти вкладених», а не обовʼязково краще за найкращу вкладену річ.

## UX-скелет

Entry point із inventory:

```text
♻️ До Дружньої Скрині
```

Основні екрани:

- main screen з кількістю eligible манаток;
- `Що вона робить?`;
- auto-pick confirmation для 5 найдешевших;
- manual selection з пагінацією і counter `x/5` — follow-up, не `0.0.24`;
- final confirmation;
- success result із output item card;
- friendly error state, якщо предмет змінився або вже недоступний.

Ключовий warning:

```text
Скриня зʼїсть ці 5 манаток назавжди й поверне 1 нову. Вкладені речі не повернуться.
```

## Технічні вимоги

- використовувати існуючі inventory/item/reward patterns;
- не створювати паралельну loot архітектуру, якщо `domain/loot` уже достатній;
- callback data тримати короткою; якщо selection не влазить, зберігати selection state server-side;
- додати audit/event log або найближчий наявний аналог;
- не додавати production dependency;
- user-facing рядки українською, з лапками `«»` там, де потрібні цитати.

## Тести

Мінімум:

- score calculation;
- average score і minimum output score;
- invalid batch sizes: `4`, `6`, duplicates — повністю актуально для майбутнього manual selection;
- equipped/protected/foreign/missing items not eligible;
- successful recycle consumes `5` and creates `1`;
- output score strictly greater than average input score;
- rollback when output generation fails;
- repeated callback does not create second output;
- auto-pick selects 5 lowest-score eligible items;
- bot happy path if current harness makes it cheap.

## Не входить у перший slice

- ручний вибір input-манаток;
- item-instance identity;
- продаж, магазини, market, trading;
- crafting tree;
- item-to-level exchange;
- окремий квест на приручення Скрині;
- унікальні set items Скрині;
- анімації;
- social recycling.

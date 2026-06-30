# Груповий рейд: Старший брат Бочки

Статус: design/task package; `0.2.17` ships a feature-flagged MVP on the party-boss runtime, while fuller raid mechanics in this package remain future work.
Дата зрізу: `12026-06-24` за Києвом

Цей архів готує високорівневе ускладнення чинного рейду на Бочку Пінного Міражу.

## Рекомендація одним абзацом

З **8 рівня** стара Бочка кличе свого старшого родича — **Старшого брата Бочки**. Гравець створює конкретну рейдову сесію у звичному погодинному відтинку, має чинне вікно очікування, кличе людей через `👀 Хто поруч` або непрозоре deep-link запрошення, після чого група з `1..8` учасників проходить синхронний покроковий бій. Жорсткого мінімуму немає: соло дозволене після окремого попередження, `3` — мінімально практичний склад із добрими манатками, `4–5` — рекомендований, `6–8` — надійніший, але бос отримує більше HP, цілей і спільних механік.

## Чому поріг 8, а не 10

- Поточна альфа має виразний діапазон `8–13`; поріг 10 залишив би надто вузьке населення для першого групового тесту.
- На 8 рівні вже є помітний запас HP, класові дії, спорядження й причина готуватися.
- Складність усе одно масштабується за складом і рівнями групи, а UI чесно позначає 1–2 учасників як дуже ризикований склад.
- Пізніше можна додати вищий tier, не міняючи базової party-архітектури.

## Рекомендована черга в `0.2.x`

Не пришивати фічу до конкретних номерів наперед. Якщо запропонована черга після `0.2.1` не зміниться, природні місця — приблизно:

1. `0.2.3` — **Threat Escalation**;
2. `0.2.4` — **Item Tags / One-Use Manatky**, with one narrow consumable candidate such as `бинти` if balance still supports it;
3. наступний вільний `0.2.x` — **Raid Party Session Foundation** as a temporary party/session slice;
4. наступний вільний `0.2.x` — **Party Vs One Boss** as the first production party-combat proof;
5. `0.2.17` — **Senior Barrel Brother Raid MVP** as the first feature-flagged real route on the existing party-boss runtime.
6. later `0.2.x+` — fuller **Senior Barrel Brother Group Raid** mechanics from this package after MVP evidence.

За нинішньої черги party/raid сходинки починаються орієнтовно з `0.2.5+`, але перед роботою файли `0.2.x-*` треба перейменувати на фактичні вільні версії. Номери PR до назв артефактів не додавати.

## Чому окремі slices

### 1. Party Session Foundation

Dev-only або feature-flagged фундамент: сесія, учасники, join/leave, передавання лідерства, ліміт, непрозорий токен, deep link, `Хто поруч`, expiry, restart recovery та concurrency-тести. Без нового production-боса й без економіки.

### 2. Party Vs One Boss

Production proof: тимчасова party входить у бій проти одного спільного боса без targetable adds, broad party-vs-many runtime або raid-scale reward faucet. Цей slice доводить UI, черги ходів, stale callbacks, AFK fallback, restart recovery й exactly-once settlement на меншому ризику.

### 3. Senior Barrel Brother MVP and later fuller raid

`0.2.17` activates the narrow level 8+ Senior route behind `SENIOR_BARREL_BROTHER_RAID_ENABLED`, reusing the party-boss runtime, frozen Barrel period and exactly-once Barrel success settlement. Fuller mechanics in this package, such as richer phases, eligible PvE buffs, trophies, spotlight rewards and targetable-add follow-ups, remain later slices.

Це не роздуває один PR одночасно міграцією, соціяльним маршрутом, новим combat runtime, економікою, real-raid content і великим обсягом тексту.

## Ключові рішення

- **Учасники:** `1..8`; рекомендовано `4–5`.
- **Вікно збору:** використовує чинний Barrel `periodId` та вже обчислене очікування; ранній старт доступний після короткої паузи.
- **Соло:** дозволене після `93` секунд і другого підтвердження; баланс не гарантує соло-перемогу.
- **Раунд:** `23` секунди; дії приховані до спільного розв’язання.
- **AFK:** timeout робить auto-defend, а не безкоштовну auto-attack.
- **Тривалість бою:** підготовлені перемоги зазвичай цілитимуться в `4–8` раундів; прихованого останнього раунду немає, а 13-й раунд лишається тільки горизонтом симуляції/QA.
- **HP боса:** стартова формула й таблиця лежать у balance doc; HP не масштабується від манаток або бафів, тому підготовка справді допомагає.
- **Дрібні вороги:** у першому релізі це очищувані hazard stacks, а не окремі targetable enemies. Справжні adds відкладені до наступного вузького slice після стабілізації party-vs-one-boss.
- **Нагороди:** усі meaningful contributors отримують XP/золото та personal loot roll; один affinity drop гарантовано дістається комусь із повноцінних учасників. Це бонус, а не winner-takes-all.
- **Погодинний gate:** успіх Старшого брата зараховується як успіх Бочки та відкриває чинні післярейдові дії. Подвійної старої й нової нагороди в одному відтинку немає.

## Вміст архіву

- `docs/design/` — повний gameplay flow і числовий баланс.
- `docs/content/` — українські репліки та IP/style guard.
- `docs/architecture/` — модель сесії, транзакції, callbacks, scheduler і recovery.
- `docs/implementation/` — очікувана карта змін у репозиторії.
- `docs/tasks/` — дві version-task заготовки.
- `docs/ai/prompts/` — main Codex prompts, balance prompt і readonly review prompt.
- `docs/qa/` — автоматична та ручна Telegram QA-матриця.
- `docs/backlog/` — відкладені справжні adds.
- `docs/references/` — нотатки про натхнення без копіювання чужого контенту.

## Як використати

1. Розпакувати в корінь актуального `kvestarnia-bot` або перенести потрібні файли вручну.
2. Перед новою implementation перевірити актуальний `main`, merge status попередніх combat/architecture slices і вільний номер версії.
3. Перейменувати рівно одну активну future task doc з `0.2.x-*` на фактичну версію.
4. Запустити свіжий Codex thread через відповідний prompt.
5. Не реалізовувати обидві task docs в одному потоці або одному PR.

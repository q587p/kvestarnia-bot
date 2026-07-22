# Phase 2 Roadmap Audit

## Поточний стан

`main` виглядає як `0.2.6 — Passage Search MVP`; `0.2.7 — Player Abilities MVP` відкритий PR і має розглядатися як майже готовий next baseline, але не як уже злитий `main`.

`0.2.7` робить саме той зріз, який давно хотілося з бойового боку: каталог class/race abilities, окрема `race` дія, компактні кнопки в PvE/training, replay-safe summaries, bounded power, no PvP/party/economy/reward changes. Це правильний slice: він не ламає roadmap і не підміняє рейди чи item economy.

## Діагноз по Phase 2

Phase 2 уже фактично стала не «рейдова фаза», а **Social Combat & Interactions**. Це здорове відхилення від старого плану, бо проєкт спершу навчився робити opt-in social state без дублів, предметних втрат, toxic PvP і reward snowball.

Що вже добре закрито:

- duel/training spine;
- safe gifting;
- multi-enemy foundation;
- architecture stabilization;
- threat escalation;
- item tags + one-use bandage;
- Bard Performance як перша безпечна non-combat class action;
- Passage Search як tiny side loop;
- Player Abilities MVP у PR.

Головна проблема зараз не в напрямі гри, а в **розсинхроні поверхонь**:

- public site/news виглядають сильно застарілими;
- `history/phase2/deferred-0.2.md` після merge `0.2.7` все ще казатиме, що Race Abilities — proposed next;
- Product Brief має старий рядок про «Бочку підтримки», тоді як Brand канонізує «Банку підтримки Квестарні»;
- Telegram bot description каже «про пригоди, лут і ґільдії», що може звучати так, ніби ґільдії вже playable;
- task index і docs index мають draft-и, але немає чіткого post-0.2.7 order.

## Рекомендований порядок після `0.2.7`

### 0. Перед новою gameplay-фічею: public surface + roadmap sync

Не треба робити з цього великий release, якщо зміни docs/site-copy-only. Але це перший практичний крок, бо гравець і новий Codex бачать не те саме, що репозиторій.

Scope:

- сайт: latest news має відповідати repo `news.md` або чесно казати, що сайт-архів обмежений;
- Telegram bot description: прибрати ready-sounding `ґільдії`, замінити на «корчму», «манатки», «майбутні соціяльні пригоди» або інший не-overpromise текст;
- README/docs: після `0.2.7` додати Player Abilities до актуального playable list;
- `history/phase2/deferred-0.2.md`: перевести Race Abilities зі статусу proposed next у shipped/partially shipped, а наступними назвати Achievements/Daily/etc.;
- `docs/ai/context.md`, task index, public site copy sync.

### 1. `0.2.8` — Achievements + Cosmetic Title Records

Це найкращий наступний runtime slice, якщо `0.2.7` проходить. Причини:

- давно відкладений Phase 1 tail;
- підсилює identity після race/class abilities;
- додає social/cosmetic retention без power creep;
- не чіпає economy, party runtime, market або reward multipliers;
- дає майбутнім дуелям, дошкам і remort/social memory легальний cosmetic substrate.

Scope треба звузити: records + browse + grouped unlocks + hidden/locked/earned states. Active title selection — тільки якщо дуже малий safe slice; інакше залишити later.

### 2. `0.2.9` — Daily Korchma Rounds

Це повертає до задуму «жива корчма поруч у Telegram». Не бойова power-фіча, а щоденний маршрут із маленькими сценами, location presence, двома з трьох incidents і explicit claim.

Чому після achievements:

- daily route створить багато природних achievement events;
- achievements дадуть мета-шар для таких малих сцен;
- daily route не мусить бути великим quest engine.

### 3. `0.2.10` — Combat Balance + Monster Signature Moves Proof

Після `0.2.7` у бою зʼявиться більше кнопок і AoE/support fallback. Треба не додавати ще десять player systems, а перевірити:

- same-level win-rate;
- two-enemy pressure;
- class/race ability usage;
- чи не стали support/aoe класи занадто сильними або нудними;
- чи бій читається як 2–5 ходів, а не як «кнопкова бухгалтерія».

Small runtime proof: 5–8 ordinary monsters отримують authored signature moves/flavor through existing monster ability/intents, без reward changes.

### 4. `0.2.11` — Inventory / Equipment Clarity Pass

Не робити одразу full equipment rework. Він великий, schema-heavy і може зламати баланс одразу після abilities. Спершу clarity pass:

- inventory view filters: all / equipment / consumable / story;
- equipment comparison copy;
- visible slot/effect/value rationale;
- audit of obvious item value/effect outliers;
- no new broad slot model unless task explicitly expands.

### 5. `0.2.12` — Postal Mantok Delivery

Після safe gifting і item reservation stability можна додати delivery without same-location presence. Це social/economy extension, але без market:

- known recipient only;
- explicit delivery fee;
- recipient opt-in;
- no location/online leak;
- same reservation semantics as safe gifting.

### 6. `0.2.13+` — Party Foundation → Party vs One Boss → Real Raid

Тільки після identity, daily, combat/balance and item clarity. Перший party PR має бути foundation/dev/feature-flagged recruiting state, not boss. Потім one boss. Лише після цього Big Barrel Brother або інший реальний raid.

## Що змінити в планах

1. **Оновити `history/phase2/deferred-0.2.md` після `0.2.7`.** Там Race Abilities досі «proposed next». Після merge це stale.
2. **Додати короткий post-0.2.7 order у `docs/product/roadmap.md` і `docs/tasks/README.md`.** Зараз є багато draft-ів, але немає одного next-order source of truth.
3. **Винести public surface sync як окремий task.** Сайт/news зараз відстає від repo і шкодить баченню більше, ніж будь-яка внутрішня дрібниця.
4. **Не робити full equipment rebalance перед achievements/daily/balance.** Він важливий, але зарано.
5. **Не робити party/raid runtime одразу після abilities.** У проєкті правильно накопичені social primitives, але ще бракує public alignment, identity records і combat balance після abilities.
6. **Codex workflow лишити коротким.** Prompts мають посилатися на task docs + context, а не тягнути довгі інструкції.

## Старі хвости, які не загублені, але ще не зроблені

- Achievements Phase 1: 54 seed definitions, hidden/locked/earned browsing, grouped unlocks, no rewards.
- Cosmetic/player titles: частково привʼязані до achievements, але active title selection краще не пхати в перший PR, якщо модель розростається.
- Collections: Bestiary/Museum of Manatky. Бестіарій є read-only surface, але collection journal ще ні.
- Full itemization/equipment: більше слотів, hand/offhand/two-handed, clearer UI, level-gated/race/class/path-specific rare items.
- Item-for-item trade and gold add-on: safe gifting shipped, broader trading not yet.
- Postal/courier delivery: drafted, not shipped.
- Group mini-raid/world boss: original MVP ambition, intentionally deferred; not forgotten, but moved behind party/session foundation.
- Leaderboard/admin commands/analytics/feedback for closed alpha: still pending Phase 3-ish work.
- Monster grammar metadata: useful for richer Ukrainian copy; still deferred.
- Food/coffee/Shynok menu buffs: deferred until economy telemetry.
- Ordinary `/fight` and `/spar` short per-turn timeout: duel path has timeout model; ordinary/training can still inherit later.
- Public site/news sync and deploy/news pipeline: not an old Phase 1 feature, but now an urgent product-facing debt.

## Чи відхилились від бачення?

Серйозного відхилення немає. Навпаки, більшість змін підтримує vision:

- Telegram-first: callbacks, result cards, presence, same-location actions;
- fun-per-message: Bard Performance, Passage Search, abilities, Shynok interactions;
- fair free-to-play: no paid power, no power rewards for support;
- social but opt-in: duels, tips, safe gifting;
- no huge raid before primitives: correct architectural restraint.

Ризик інший: проєкт може виглядати назовні як старий `0.0.x` foundation, бо сайт/news/description не встигають за грою. Тобто бачення в коді живе, але публічна вітрина частково відстає.

## Як повернутися ближче до задуманого

Не «відкотитись», а зробити три речі:

1. **Вітрина має наздогнати гру.** Сайт, Telegram description, README/news мають звучати як поточна Квестарня, не як `0.0.24`.
2. **Додати identity/meta без сили.** Achievements/title records дадуть гравцю історію про себе.
3. **Додати щоденну корчемну сцену без великого engine.** Daily Korchma Rounds повертає корчму як живий простір, а не лише меню для систем.

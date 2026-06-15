# Phase 1 Quest Contracts Backlog

Цей документ тримає **квестові справи** окремо від бойових, інвентарних і bestiary-петель. Квест у Квестарні - це не «ще один чекліст», а коротка корчмарська справа, яку хочеться взяти між двома ковтками чаю.

## Design rules

- Квест - це маленька справа з корчми, а не загальний список завдань.
- Подавай механіку через папірці, чергу, прохання шинкаря, підозрілі монстри або дурнуваті доручення.
- Квест може рахувати перемоги в боях, перший огляд манаток, перше читання bestiary, екіпірування речі або невелику присутність у корчмі.
- Повторний callback не має видавати нагороду вдруге. Completion має бути ідемпотентним.
- Прогрес і кнопки повинні читатися на одному екрані Telegram.
- Нагорода має бути скромною й очевидною: трохи XP, трохи золота, дрібна cosmetics/junk thing, або титул пізніше.
- Квест не має непомітно під’їдати бойову силу, доки окремий slice про equipment effects або reward math цього прямо не дозволить.
- Loss / flee / expired combat не рахуємо як «переміг», якщо квест не був спеціально написаний як жарт над відступом.
- Achievements і bestiary collection - це окремі треки. У цьому документі їх не змішуємо.
- Формулювання мають бути українськими, короткими й без пафосу «виконай 37 завдань для нагороди».

## Quest contract shape

Кожна майбутня справа має мати:

- stable draft id;
- player-facing title;
- one-line flavor premise;
- progress source;
- target count or exact condition;
- reward concept;
- non-goals;
- implementation notes;
- phase label: `Phase 1 finish`, `Phase 1+`, або `Later`.

## Seed backlog

### 1. `quest.contract.thirteen-small-problems.followup`

- **Title:** `Тринадцять дрібних проблем: друга папка`
- **Flavor:** Шинкар зітхає, бо перша папка вже закінчилась, а дрібні проблеми, як завжди, прийшли з друзями.
- **Trigger / progress source:** 5 завершених persistent fight сесій після завершення `Тринадцять дрібних проблем`.
- **Target:** `5/5` нових перемог або успішних завершень справи.
- **Reward concept:** невеликий XP payout і короткий запис у journal / notice board.
- **Non-goals:** жодного per-fight XP, жодного loot replay, жодного зміщення бойового балансу.
- **Implementation notes:** completion має читати ledger, а не довіряти повторному натисканню кнопки.
- **Phase:** `Phase 1 finish`.

### 2. `quest.contract.inventory.auditor`

- **Title:** `Манатки під лупою`
- **Flavor:** Корчмар хоче знати, що саме лежить у торбі, перш ніж знову казати «та воно ж саме себе не порахує».
- **Trigger / progress source:** відкриття `/inventory` і перегляд кількох категорій або stack detail.
- **Target:** `3` окремі огляди манаток або `1` повний інвентарний чек.
- **Reward concept:** дрібний gold або cosmetic note.
- **Non-goals:** жодного sell/trade, жодної автоматичної оцінки power.
- **Implementation notes:** квест має жити поруч із inventory UI, а не в бойовому екрані.
- **Phase:** `Phase 1 finish`.

### 3. `quest.contract.bestiary.reader.level3`

- **Title:** `Читач монстрів`
- **Flavor:** Хтось мусить читати про цих потвор, і чомусь цим героєм знову стаєш ти.
- **Trigger / progress source:** відкриття `/bestiary` після 3 рівня і перегляд хоча б кількох записів.
- **Target:** `3` прочитані записи або `1` повне відкриття розділу.
- **Reward concept:** маленький XP payout або запис «любить дивитися на чудовиськ».
- **Non-goals:** жодного bestiary collection progression, жодних бонусів за закриті записи.
- **Implementation notes:** reuse read-only bestiary screen; quest only listens to read events.
- **Phase:** `Phase 1 finish`.

### 4. `quest.contract.korchma.cellar.errand`

- **Title:** `Спустись у підвал, підніми настрій`
- **Flavor:** У підвалі завжди щось прохолоне, десь пропаде, а десь знайдеться - саме так корчма перевіряє характер.
- **Trigger / progress source:** completion of `/cellar` style errand or tavern side activity.
- **Target:** `1` завершена дрібна підвальна справа.
- **Reward concept:** невелика сума gold, без power creep.
- **Non-goals:** жодних прихованих рейдів, жодних корисних для бою нагород.
- **Implementation notes:** should feel like a tavern errand, not a dungeon system.
- **Phase:** `Phase 1 finish`.

### 5. `quest.contract.dignified-retreat`

- **Title:** `Відступ із гідністю`
- **Flavor:** Шинкар каже, що іноді геройство - це вчасно не стати на шлях міміка ще раз.
- **Trigger / progress source:** loss or flee outcomes in combat, counted кілька разів, але не спамом.
- **Target:** `3` достойні відступи або `1` жартівлива поразка у потрібному контексті.
- **Reward concept:** title / note / funny record, без бойової сили.
- **Non-goals:** жодного фарму через повторні поразки, жодного «lose to win» аб’юзу.
- **Implementation notes:** grant should be capped and only for first-time story beats, not grindable.
- **Phase:** `Phase 1+`.

### 6. `quest.contract.equipment.attunement.preview`

- **Title:** `Річ, що до тебе прилипла`
- **Flavor:** Річ ще не стала сильною, але вже обрала тебе як людину, яку можна навантажити.
- **Trigger / progress source:** equipping a preview-equippable item and opening equipment details.
- **Target:** `1` equipped item in a visible slot.
- **Reward concept:** small flavor unlock або title later.
- **Non-goals:** жодних stat effects in this quest, жодних різких bonus jumps.
- **Implementation notes:** цей квест має лишитися дружнім до `0.0.22` equipment effects; до того він може бути тільки shell copy.
- **Phase:** `Phase 1+`.

### 7. `quest.contract.level10.capstone.notice`

- **Title:** `Десята відмітка, і далі вже серйозно`
- **Flavor:** Корчмар підписує папірець так, ніби ти нарешті навчився не плутати міміка зі скринею.
- **Trigger / progress source:** reach level 10.
- **Target:** exact condition `level = 10`.
- **Reward concept:** ceremonial title, notice board mention, або коротка підсумкова сцена.
- **Non-goals:** жодного power spike beyond normal level-up math.
- **Implementation notes:** це capstone, а не прогрес-важіль; не роби його обов’язковим sink.
- **Phase:** `Later`.

### 8. `quest.contract.korchma.social.rounds`

- **Title:** `Щедра рука, теплий стіл`
- **Flavor:** У корчмі люблять не лише героїв, а й тих, хто інколи ставить людям ще один кухоль.
- **Trigger / progress source:** future social/presence events like buying a round or joining a public tavern presence moment.
- **Target:** `1` або `3` social actions in a safe window.
- **Reward concept:** social badge, board note, or flavor title.
- **Non-goals:** жодних combat rewards, жодних PvP hooks, жодної купівлі сили.
- **Implementation notes:** only after social/presence hooks exist; do not fake them now.
- **Phase:** `Later`.

### 9. `quest.contract.cellar.cleanup.first-pass`

- **Title:** `Підвал, де все ще не зовсім на місці`
- **Flavor:** Підвал не просить геройства. Він просить не наступити на відро.
- **Trigger / progress source:** a small cellar or tavern cleanup interaction.
- **Target:** `1` completed cleanup step.
- **Reward concept:** tiny gold or a junk-but-funny collectible.
- **Non-goals:** no dungeon loop, no repeated grind path, no combat reward leakage.
- **Implementation notes:** useful as a second tavern-side wrapper if `/cellar` grows a tiny chore track.
- **Phase:** `Phase 1 finish`.

## Do not build yet

Цей docs pack **не** реалізує:

- runtime quest state;
- Prisma migrations;
- нові Telegram commands;
- XP / gold / item grants у коді;
- combat rewards;
- loot tables;
- equipment effects;
- achievements runtime;
- bestiary collection progression;
- group raids / guilds / PvP.

## Future implementation shape

Коли прийде PR на runtime, quest contract має:

- читати source-of-truth з уже існуючих подій, а не вигадувати окремий прогрес-двигун;
- бути ідемпотентним по owner + contract id + period / state version;
- показувати короткий прогрес у стилі `2/5`, `1/1`, `готово`;
- не дублювати rewards при повторному callback;
- не ламати `Тринадцять дрібних проблем`, а лише дати їй корчмарський хвіст.

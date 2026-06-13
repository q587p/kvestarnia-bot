# Group Hook Design Pack

## Мета

Цей пакет описує перший груповий hook для Квестарні без зміни runtime-коду.

Робоча ідея: **малий корчемний рейд із вікном приєднання, списком учасників, 1-3 легкими діями та підсумком**. Це має стати першою причиною, чому бот корисний не лише в приватному чаті, а й у Telegram-групі.

## Чому це пасує Квестарні

- Квестарня вже вміє говорити мовою корчми, де жарти й бюрократія існують поруч.
- Уже є presence, місцини корчми, індивідуальні дії та ідемпотентні винагороди.
- Груповий рейд природно підхоплює ту ж логіку, але переносить її в соціальний простір.
- Мала групова сцена краще відповідає Telegram, ніж великий MMO-рейд із десятком екранів.

## MVP shape

Перший груповий hook має виглядати так:

1. Один гравець стартує корчемний рейд у групі або в корчмі.
2. Відкривається коротке вікно приєднання.
3. Учасники натискають «Приєднатися».
4. Бот показує список тих, хто вже в рейді.
5. Після старту рейду кожен учасник може обрати 1 з 1-3 простих дій.
6. Рейд завершується коротким підсумком, XP, золотом і, можливо, одним трофеєм.

Сценарій має бути малим. Якщо для його опису потрібно більше ніж один екран на телефоні, він уже завеликий.

## Не-цілі

- Не робити повний MMO-рейд.
- Не робити позиційний бій, танків, хілерів і складні ротації.
- Не робити guild raid system як окрему платформу.
- Не додавати Redis лише заради першого рейду.
- Не прив’язувати equipment preview до рейду: 0.0.14 equipment shell не має змінювати доступність, шкоду або нагороди групового hook-а.
- Не робити Mini App UI.

## Що можна перевикористати вже зараз

- `presence` і coarse location ids, особливо `location.korchma.hall`, `location.korchma.quest_table`, `location.korchma.barrel`.
- Поточний `tavern` solo placeholder як тимчасову форму для майбутнього групового hook-а.
- Ідемпотентні reward-claims із `daily_actions` або новим session-key підходом.
- Поточні presenter/helper патерни для коротких Telegram HTML сцен.
- Callback validation і versioning (`v1:*`).
- Стіл зі справами й корчемні location/scene transition правила.

## Що не має змінюватися ще

- Нагороди не мають дублюватися при повторних callback-ах.
- Equipment preview не має змінювати HP, mana, damage, reward tables або доступність рейду.
- Поки рейд pending, інші scene callbacks не мають витягувати героя з рейду без явного transition rule.
- Self-serve solo fallback має лишитися доступним, доки груповий flow не дозріє.

## Головна сцена

### Пуск рейду

Пропозиція player-facing тексту:

> Корчмар ставить бочку посеред зали й каже, що це «невеликий рейд». У залі вже смішно.

Кнопки:

- `Приєднатися`
- `Список учасників`
- `Почати`
- `Вийти`

### Join window

Після старту рейду з’являється короткий таймер приєднання. Якщо 3+ учасники не зібралися, система може або:

- повернутися до solo-compatible placeholder;
- або завершити рейд із лагідною відмовою без нагороди.

Для першого релізу кращий варіант — не карати гравця, а дати зрозумілу, коротку відмову.

## Safety and abuse notes

- Кожен учасник може приєднатися лише один раз.
- Повторний join не має створювати дубль у participant list.
- Callback-и мають бути короткими, версіонованими й перевіреними на ownership.
- Закінчений або expired рейд не має приймати дії.
- Якщо користувач натиснув стару кнопку, бот має показати нейтральний стан або свіжу summary-екранку, а не дублювати reward.
- У групі не слід показувати зайві приватні дані. Лише те, що потрібно для самої гри.

## Idempotency notes

Кожна з нижчеописаних дій має окремий ключ ідемпотентності:

- створення сесії;
- приєднання до сесії;
- підтвердження участі;
- підсумок рейду;
- отримання винагороди.

Приклад мислення:

- `raid_session` створюється один раз;
- `raid_participant` унікальний за `(session_id, character_id)`;
- `raid_action` унікальний за `(session_id, character_id, action_key)`;
- reward-claim окремо захищений від повторного виконання.

## Relation to presence and korchma place ids

- `location.korchma.hall` може лишатися place id для старту соціального hook-а.
- `location.korchma.barrel` логічно виглядає як прив’язка для старту або watch-state рейду.
- `location.korchma.quest_table` доречна як місце, де рейд стартує або де видно список дій.
- Presence уже вміє coarse location-логіку, тож груповий hook має складатися з неї, а не перетворюватися на окрему мапу світу.

## Reuse from 0.0.11 / 0.0.12

- Підвальна fallback-логіка показала, як поводитися з exhausted daily content.
- Барельний solo placeholder показав, як вбудувати `pending` state без background jobs.
- Quest hub показав, як корчма може відкривати кілька пов’язаних дій без перевантаження меню.
- Character impact loop уже дав м’яку flavor-інтеграцію без стат-бонусів, і груповий hook може наслідувати цей принцип.

## Callback and command surface proposal

Майбутні callbacks краще тримати короткими:

- `v1:raid:start:{sessionId}`
- `v1:raid:join:{sessionId}`
- `v1:raid:leave:{sessionId}`
- `v1:raid:status:{sessionId}`
- `v1:raid:act:{sessionId}:{action}`

### Length constraints

- Telegram callback data має лишатися короткою.
- Session id краще робити компактним: короткий UUID-варіант, base36 або окремий short id.
- Не варто вставляти в callback довгі slug-и, title-и або names.

### Stale callback behavior

- `missing session` → коротке «Рейд уже зник або ще не почався».
- `expired session` → коротке «Час цього рейду минув».
- `completed session` → коротке «Рейд уже завершено».
- `full session` → коротке «Місць уже немає».
- `already joined` → коротке «Ви вже в рейді».

У всіх цих станах не треба дублювати reward або перестворювати стан мовчки.

## MVP player flow examples

### Старт рейду

```text
🍺 Корчмар ставить бочку посеред зали.

Каже, що це невеликий рейд. Звісно, саме такі речі найчастіше ламають меблі.

[Приєднатися] [Список учасників] [Почати]
```

### Приєднання

```text
✅ Ви в рейді.

Поки що вас троє. Корчмар робить вигляд, що так і планував.

[Список учасників] [Вийти]
```

### Уже приєднаний

```text
Ви вже в цьому рейді.

Не поспішайте, бочка нікуди не втече.
```

### Недостатньо учасників

```text
Поки що нас замало.

Для справжнього рейду треба ще кілька сміливців або один дуже впертий бухгалтер.
```

### Рейд стартував

```text
🥁 Рейд почався.

Бочка поглядає на вас підозріло, але вже пізно вдавати, що це не ваша ідея.

[Тицьнути] [Оглянути] [Відступити]
```

### Дія обрана

```text
✅ Дію зараховано.

Черга переходить далі, а корчмар тихо записує все в журнал.
```

### Дія вже надіслана

```text
Ця дія вже зарахована.

Бочка не любить повторів.
```

### Рейд завершено

```text
🏁 Рейд завершено.

Ви повертаєтеся з XP, золотом і дуже дивним трофеєм.
```

### Підсумок нагород

```text
🎁 Підсумок рейду

XP: +12
Золото: +7
Манатка: Квиток мокрого героя
```

### Expired session

```text
Час цього рейду минув.

Якщо бочка ще на місці, значить, вона просто чекає наступну спробу.
```

### Stale callback

```text
Ця кнопка вже застаріла.

Відкрийте новий стан рейду, і все буде по-чесному.
```

## Testing strategy

Майбутня реалізація мусить мати:

- unit tests для join/start/finish state machine;
- repository tests для транзакцій і унікальних participant rows;
- callback parsing tests для всіх `v1:raid:*` варіантів;
- presenter tests для join/full/expired/completed UX;
- stale callback tests;
- no duplicate reward tests;
- no Telegram imports in domain tests;
- privacy tests для presence/group visibility;
- group chat vs private chat behavior tests;
- idempotency tests для join, act і finish.

## Social actions backlog

Після першого рейду природно йти в соціальні actions, але не раніше.

- Buy a round for people currently in the korchma.
- Invite nearby players to a raid.
- Front-of-korchma public board.
- Recent level-up celebration.
- Generosity/rank shoutouts.
- Party gathering flavor.
- Social action cooldowns.

Ці елементи краще описати окремо в `docs/SOCIAL_ACTIONS_BACKLOG.md`, щоб не змішувати їх із session design.

## Future Codex prompt draft

### Codex implementation prompt — 0.0.15 First Group Barrel Hook

Goal: implement the first real group barrel hook for Квестарня without changing equipment behavior.

Context:
- Read `AGENTS.md`, `docs/GROUP_HOOK_DESIGN.md`, `docs/GROUP_RAID_SESSION_NOTES.md`, `docs/SOCIAL_ACTIONS_BACKLOG.md`, `docs/GAME_DESIGN.md`, `docs/TECHNICAL_PLAN.md`, `docs/SECURITY_AND_FAIR_PLAY.md`, `docs/CONTENT_STYLE_GUIDE.md`, and the current inventory/presence/tavern services.

Constraints:
- Keep it small.
- Do not implement full MMO raids, guilds, PvP, or jobs.
- Do not change equipment effects or reward math.
- Keep all player-facing text Ukrainian.
- Keep callback data versioned and short.
- Do not add Redis unless there is a clear need.

Implement:
- group raid session creation;
- join/leave/status actions;
- participant list;
- 1-3 simple participant actions;
- idempotent reward claim;
- expired/full/already-joined states;
- presenter and callback tests;
- no duplicate rewards;
- no Telegram imports in domain.

Done when:
- a group can start a small raid, join it, finish it, and see a short summary without reward duplication;
- stale callbacks are handled safely;
- `npm test`, `npm run typecheck`, and `git diff --check` pass or are clearly explained.

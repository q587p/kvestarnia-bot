# Next Implementation Backlog після `0.0.25`

Нижче — канонічний порядок маленьких PR для добивання Phase 1. Кожен slice має бути перевірюваним окремо; якщо PR роздувається, різати.

## Phase 1 Scope Guard

Бестіарій лишається content/data foundation: read-only `/bestiary`, monster content, loot notes, flavor routing і Hunt Board contract source.

Не розширювати бестіарій як окрему фічу, collection loop, share card або journal progression, доки не закритий основний RPG-ланцюжок:

```text
persistent fight → equipment stats → loot/reward replay → level 1-13 + HP/mana persistence → recovery/balance polish → inventory/chest polish → balance/playtest polish
```

## Later — Durable Barrel Raid Notifications

**Objective**
Зробити автозавершення Бочки надійним після restart/deploy, не змінюючи економіку й не дублюючи винагороди.

**Scope**

- durable outbox або persistent job row для pending barrel raid notifications;
- startup-resume: знайти pending-рейди, час яких уже настав або ще настане;
- due рейди завершувати через наявний idempotent reward path;
- future рейди планувати заново після старту процесу;
- унікальний ключ для notification delivery, щоб retries або кілька workers не слали дубль.

**Non-goals**

- no group raid/session rewrite;
- no reward rebalance;
- no new loot table;
- no migration of all cooldowns into a broad scheduler in the same slice.

**Acceptance criteria**

- після restart/deploy pending Бочка не губить завершальне повідомлення;
- manual `🍺 Перевірити бочку` лишається fallback і не дублює reward;
- повторний startup/resume або retry не надсилає кілька однакових completed-повідомлень;
- tests cover due-on-startup, future-reschedule, already-completed, and duplicate-worker/idempotency paths.

## Later — Shynok Mantok-for-Beer Sink

**Objective**
Додати в `🍻 Шинок` опцію `Продаж манаток задля пива`: гравець спалює зайві priced манатки не за золото в кишеню, а прямо за раунд пива для корчми.

**Rules**

- Корчмар приймає манатки за курсом у 5 разів гіршим за номінальну вартість.
- Обрано манаток на `50+` оціночного золота — можна виставити просте пиво.
- Обрано манаток на `500+` оціночного золота — можна виставити якісне пиво.
- Надлишок вартости не повертається автоматично; UI має чесно сказати, що корчмар округлює на користь піни.
- Манатки списуються тільки після явного confirmation screen зі списком конкретних речей.

**Guardrails**

- Не давати вільне золото й не відкривати broad selling/trading/shop loop у цьому slice.
- Не приймати `безцінні`, екіпіровані, заблоковані, story/quest або protected манатки.
- Manual selection може повторити підхід `0.0.27` Дружньої Скрині: короткі індексні callback-и, preview конкретних stacks, stale-input protection на confirm.
- Дія не має обходити raid gate для частування пивом.
- Успішне частування через манатки має писатися в той самий рейтинг щедрості, але окремо позначати spend type, щоб статистика золота й манаток не змішувалась.

**Acceptance criteria**

- кнопка в `🍻 Шинок` зʼявляється тільки коли є eligible манатки на мінімум `50` оціночного золота;
- просте/якісне пиво коректно визначається за сумою selected priced items;
- repeated або stale confirm не списує манатки вдруге;
- beer result text не каже, що гравець отримав золото;
- tests cover not-enough, simple threshold, quality threshold, protected/equipped/priceless exclusions, duplicate confirm, and generosity ledger entry.

## Later — Shynok Food Buffs

**Objective**
Додати в `🍻 Шинок` їжу як другий корчмарський спосіб витратити золото: пригодник купує короткий обід/перекус/підозрілу тарілку й отримує тимчасовий баф до наступного бою, кількох ходів або короткого проміжку часу.

**Flavor direction**

- Їжа має бути смішною, але корисною: не просто «+2 до стата», а «борщ, який переконав HP триматися», «вареники суворої мани», «дерун бюрократичного прискорення», «котлета, що бачила баланс і вижила».
- Алюзії дозволені як спеція: НРІ, Munchkin, MMORPG food buffs, українська кухня, корчемна побутовість. Не копіювати сучасні IP, назви страв із чужих світів або прямі цитати.
- Корчмар може коментувати покупку, але не має перетворювати меню на довгу енциклопедію.

**First-menu candidates**

- `🍲 Борщ впертої живучости` — тимчасово піднімає `hpMax` або додає малий shield на перший бій.
- `🥟 Вареники тихої мани` — прискорюють mana recovery або дають малий `manaMax`/mana refill перед боєм.
- `🥔 Дерун службового прискорення` — малий bonus до DEX/ініціятиви/ухилення на одну сутичку.
- `🍞 Грінка чесної сили` — малий STR/physical damage bonus, без stacking-а з сильнішими стравами.
- `🧀 Сирник дипломатичного тиску` — малий CHA/social action bonus для квестів або trick-дій.
- `🍄 Печеня «не питайте з чого»` — дешевий risky варіянт: слабший баф, але кумедний flavor або малий шанс не того ефекту.

**Rules**

- У персонажа одночасно активний тільки один харчовий баф або один окремий слот бафа із явною заміною попереднього.
- Баф має коротку тривалість: наступний persistent fight, кілька ходів, одна квестова перевірка або обмежене часове вікно.
- Списання золота тільки після confirmation screen із назвою страви, ціною, ефектом і тим, що буде замінено.
- Не продавати їжу під час pending raid або інших станів, де пригодові дії заблоковані.
- Бафи мають проходити через той самий effective-stats/resource helper, що й манатки, а не через розкидані presenter hacks.
- Не давати XP, рівень, loot roll або прямий обхід gates. Це підготовка й стратегічна витрата, не нове джерело прогресу.

**Balance guardrails**

- Дешеві страви: помітний flavor, малий ефект, щоб новачок міг спробувати без страху.
- Дорогі страви: сильніші або довші, але без обовʼязковости для нормального win rate.
- Не stack-ати їжу з собою; не дозволяти купити 10 борщів і перетворити бій на бухгалтерію супу.
- Якщо баф піднімає `hpMax`/`manaMax`, не має безкоштовно лікувати понад описаний ефект. Поточні HP/мана мають оновлюватись явно й тестовано.
- Добові/тижневі рейтинги пива не змішувати з їжею; якщо зʼявиться food ledger, це окрема мірялка.

**Acceptance criteria**

- `🍻 Шинок` показує меню їжі з цінами й короткими ефектами;
- purchase confirm списує золото один раз і створює один active food buff;
- repeated/stale callback не списує золото вдруге;
- новий food buff замінює попередній із ясним текстом;
- fight start/effective stats враховує активний харчовий баф і гасить його за правилами тривалости;
- `/hero` або окрема деталь показує активний харчовий баф без технічних id;
- tests cover insufficient gold, one active buff, replace flow, stale confirm, HP/mana edge cases, and fight consumption.

## Later — Shynok Bard Performance

**Objective**
Додати в `🍻 Шинок` бардівський виступ як малу культурну дію: бард раз на день або раз на годину може спробувати заспівати, заграти або скласти сатиричний куплет і отримати трохи золота. Може й не отримати, бо корчма має право на художню критику.

**Design source**

Корчма історично була місцем неофіційної культури: пісні, жарти, сатиричні куплети, бандура, скрипка, ложки, живий гумор і раптові виступи. У Квестарні це має стати не лекцією, а кнопкою з ризиком, короткою сценою й корчмарським висновком.

**Rules**

- Почати з класового доступу: тільки `Бард` бачить дію `🎶 Виступити` у `🍻 Шинку`.
- Кулдаун: перший безпечний варіянт — раз на день за Києвом; якщо payout малий і не фармиться, можна окремо перевести на раз на годину.
- Результат залежить від `charisma` і `luck`, із bounded randomness і без показу точних шансів.
- Музична манатка дає суттєвий бонус до перевірки або payout. Якщо манатка bard-only, бонус для барда більший; якщо universal, інші класи можуть отримати дрібний flavor/майбутній bonus, але не цю дію.
- Результати: провал із жартом і `0` золота, скромні оплески з малим золотом, добрий виступ із кращим золотом, рідкісний великий успіх із записом на дошці або короткою реплікою корчмаря.
- Не давати XP, лут, рівень або бойовий баф у першому slice. Це мале золото й соціяльний flavor, не новий основний grind.
- Не дозволяти виступ під час pending raid або інших станів, де пригодові дії заблоковані.

**Musical manatky starter pack**

Додати в loot/content pool кілька музичних манаток перед або разом із runtime-дією, бо зараз у контенті є бардівський flavor, але майже немає dedicated інструментів:

- `item.bandura-of-careful-applause` — `Бандура обережних оплесків`, accessory/weapon-like focus, bard-preferred.
- `item.fiddle-of-second-chorus` — `Скрипка другого куплету`, accessory, universal, bard bonus stronger.
- `item.spoons-of-public-rhythm` — `Ложки громадського ритму`, common accessory/junk, cheap but funny.
- `item.kobza-of-suspicious-encore` — `Кобза підозрілого бісу`, rare accessory, bard-only or bard-preferred.
- `item.whistle-of-table-silence` — `Свисток столової тиші`, common utility, not bard-only.
- `item.lyre-that-knows-one-song` — `Ліра, що знає одну пісню`, uncommon accessory, good for first implementation.

Instrument metadata should include whether it is `musical`, whether it is `bardPreferred` or `bardOnly`, and what performance modifier it gives. Do not hide these rules behind item names only.

**Acceptance criteria**

- `🍻 Шинок` shows `🎶 Виступити` only for bards with an eligible character state;
- daily/hourly cooldown is Kyiv-based and idempotent;
- payout is deterministic for a claimed action and replay does not reroll gold;
- charisma/luck influence the result within tested caps;
- equipped or carried musical manatky affect performance according to clear metadata;
- generated musical manatky appear in loot/content pool and item detail does not leak internal ids;
- tests cover no-character, non-bard locked state, bard without instrument, bard with universal instrument, bard with bard-preferred/bard-only instrument, cooldown replay, and reward idempotency.

## Later — Calendar Korchma Revels and Wednesday Frogs

**Objective**
Додати легкий календарний шар для корчми: неділі, свята й окремі дні тижня можуть давати короткі події, flavor, малі бонуси або особливі encounter weights. Це має відчуватися як корчма, де у вихідні й святкові дні шумніше, а в середу чомусь підозріло більше жаб.

**Design source**

Історична корчма була місцем святкувань, музики й танців до пізньої ночі. Для Квестарні це означає не сухий календар, а маленькі повторювані приводи зайти: недільний гамір, святковий Шинок, середові жаби, коротка чутка, тимчасовий бонус до тосту або тематичний монстр.

**First slice**

- `CalendarService` або маленький helper, який визначає київський день тижня, неділю, відомі ручні свята й special tags на сьогодні.
- `🍺 Корчма` / `🍻 Шинок` показують один короткий calendar flavor рядок, якщо є подія.
- У середу додати frog-themed flavor або підвищити вагу frog/frogfolk-tagged контенту там, де це вже безпечно підтримується.
- У неділю або ручне свято можна дати малий social/flavor bonus: дешевший тост, додатковий рядок для бардівського виступу, +малий шанс на добрий виступ або короткий recovery comfort.
- Не робити перший slice повним seasonal event engine.

**Wednesday frog direction**

- Мем `It Is Wednesday My Dudes` використовувати тільки як джерело смаку, не як дослівний player-facing текст.
- Квестарнянський варіянт: `середові жаби`, `жаби календарного схвалення`, `ква-календар`, `Жаба, що прийшла рівно посеред тижня`.
- Existing/generated content уже має `frogfolk`/frog hooks у loot expansion, тож runtime PR має перевірити, чи можна безпечно підняти вагу таких манаток у середу без нового content pack.
- Якщо контенту мало, додати невеликий starter pack жаб: монстр, 3-5 манаток, 3-5 коротких реплік.

**Guardrails**

- Календарні бонуси мають бути малими й не-FOMO: якщо гравець пропустив середу або неділю, прогрес не зламався.
- Time basis — `Europe/Kyiv`, не UTC.
- Player-facing текст не показує технічні timestamps або exact formula.
- Свята не мають зачіпати реальні трагедії або політичні дати як punchline.
- Не змішувати календарні бонуси з release/news: це runtime flavor, не обіцянка майбутніх persistent scheduler-ів.

**Acceptance criteria**

- helper має unit tests для понеділка/середи/неділі, київської timezone і ручного holiday override;
- середовий frog flavor deterministic у межах дня й не дублюється хаотично на кожен refresh;
- недільний/святковий bonus не обходить cooldown-и й не дублює rewards;
- event text короткий, український і без дослівного копіювання мемів;
- tests cover no-event day, Wednesday frog day, Sunday revel day, explicit holiday day, and replay/idempotency.

## Later — Манчкін-скупник Manual Selection Polish

**Objective**
Доробити `🎒 Манчкін-скупника` після auto-pick MVP: дати гравцю ручний вибір манаток для рівня без роздування callback data і без ризику stale списань.

**Rules**

- Поріг лишається `1000` оціночного золота разом із докладеним золотом з гаманця.
- `12 → 13` не дозволяти: 13 рівень тільки боями.
- Екіпіровані, безцінні, story/quest/protected і zero-value манатки не eligible.
- Preview має показувати конкретні selected stacks, суму манаток, докладене золото, переплату й XP carry.

**Acceptance criteria**

- manual selector не кладе довгі item ids у callback-и;
- confirm перечитує inventory/equipment/gold і відхиляє stale input;
- repeated confirm не дає другий рівень;
- tests cover exact threshold, gold-fill threshold, protected/equipped exclusions, stale manual selection, and level-13 refusal.

## Later — Bestiary Browse Filters

**Objective**
Додати в read-only `📖 Бестіарій` швидку навігацію за рівнями й типами, щоб 30+ монстрів не виглядали як випадкова купа сторінок.

**Scope**

- На головному екрані бестіарію додати кнопки `Рівні` й `Типи`.
- `Рівні` відкриває список наявних рівнів із кількістю монстрів біля кожного.
- Натискання рівня показує всіх монстрів цього рівня з кнопками на detail-записи.
- `Типи` відкриває список наявних тегів/типів із player-facing українськими назвами й кількістю монстрів.
- Натискання типу показує всіх монстрів із цим тегом.
- У відфільтрованих списках лишити шлях назад: до `Рівні`, до `Типи`, до загального списку.

**Non-goals**

- no collection tracking;
- no seen/resolved/studied states;
- no new monster content in this navigation slice;
- no reward, loot, XP, gold, or progression promises.

**Acceptance criteria**

- callback data for level/type filters stays under Telegram 64-byte limit;
- filters derive available levels/tags from `src/content/monsters.ts`, not from hardcoded stale lists;
- tags use `BESTIARY_TAG_LABELS`, and tests fail if a monster tag lacks a player-facing label;
- tests cover level list, type list, filtered monster lists, empty-safe fallback, and back buttons.

## Later — Hlybka Dungeon Location

**Objective**
Додати нову локацію `Глибка` як першу dungeon-місцину для бойових справ, щоб Стіл зі справами був орієнтиром і журналом, а не місцем, де проблеми бʼються прямо між паперами.

**Scope**

- Додати place/presence id для Глибки, орієнтовно `location.korchma.hlybka`, якщо runtime лишається в корчемній location-моделі.
- У залі або зі `Стіл зі справами` дати перехід до `Глибка`.
- `Тринадцять дрібних проблем` має вести в Глибку: quest hub показує справу біля столу, але кнопка бойової дії переводить у dungeon screen і вже там стартує/показує persistent fight.
- Здача `Тринадцяти дрібних проблем` має відбуватися у Корчмаря в `🍻 Шинку`, не автоматично на бойовому екрані й не біля Столу зі справами.
- Після здачі `13` проблем у `🍻 Шинку` Корчмар може видати наступну аналогічну справу на `42` проблеми. `42` — гарне число; нагорода має бути більшою, але це окремий balance pass, не частина першого routing slice.
- `/fight` для level 3+ має або вести в Глибку після interior gate, або пояснювати, що проблеми чекають унизу, не біля столу.
- `👀 Хто поруч` у Глибці показує персонажів саме в цій місцині, не всіх біля Столу зі справами.
- Пізніші бойові/підземельні справи зможуть теж вести в Глибку, щоб не плодити окремі «кімнати бою» для кожного квесту.

**Non-goals**

- no full dungeon crawl;
- no map/grid/exploration system;
- no group dungeon session;
- no new combat formulas or rewards just because зʼявилась локація;
- no schema migration unless existing presence/place abstractions are insufficient.

**Acceptance criteria**

- Стіл зі справами лишається списком справ і маршрутизатором;
- старт/продовження `Тринадцяти дрібних проблем` змінює presence на Глибку;
- completion flow веде до Корчмаря в Шинку для здачі `13` проблем і відкриття наступної справи на `42`;
- active persistent fight screen має back path до Глибки або Столу, без відчуття, що бій відбувається на столі;
- old quest/fight callbacks лишаються safe і не телепортують гравця надвір;
- tests cover place callback, quest hub route, `/fight` route, presence location, and stale callback behavior.

## 0.0.20 — Combat Domain Engine

**Status**
Implemented in `0.0.20` as pure domain code. Runtime `/fight` wiring landed in `0.0.21`.

**Objective**
Реалізувати чистий domain combat engine без Telegram/grammY.

**Scope**

- combat state: player HP/mana, monster HP, turn, status `active/won/lost/fled/expired`;
- actions: `attack`, `skill`, `flee`;
- deterministic resolver: один player action + monster response змінює state;
- formulas MVP: physical/spell/trick damage, armor/resist, mana cost, flee result;
- unarmed/basic fallback: engine не має припускати, що герой уже має starter weapon;
- injected або deterministic RNG у тестах.

**Non-goals**

- no Telegram handlers;
- no Prisma migration;
- no loot grants;
- no mandatory starter weapon ownership;
- no equipment stat effects;
- no group combat.

**Acceptance criteria**

- domain не імпортує Telegram/grammY;
- tests cover win, loss, flee, mana too low, deterministic turn resolution;
- tests cover weaponless/basic attack path;
- звичайний бій має sanity band для 2-5 ходів.

## 0.0.21 — Persistent Fight Sessions

**Status**
Implemented in `0.0.21` as the first Telegram runtime wiring for the combat domain engine. Persistent fights initially shipped without per-fight rewards in this slice, but include one tiny wrapper quest, `Тринадцять дрібних проблем`, with a fixed one-time completion reward after 13 won sessions. `0.0.23` later adds the first small per-session reward/loot path.

**Objective**
Підʼєднати combat engine до `/fight` як справжню persistent solo session.

**Scope**

- `solo_combat_sessions` stores serializable `CombatState`, monster id, status, and lazy expiry;
- service створює або відновлює one active combat for level 3+ characters;
- callback-и короткі, v1, ownership/turn validated, stale-safe;
- fight screen показує HP/mana героя, HP ворога, доступні дії, результат останнього ходу;
- pending Barrel raid guard лишається сильнішим за fight callbacks;
- quest hub and fight screens show `Тринадцять дрібних проблем` progress from won solo sessions;
- completion reward is claimed once through `daily_actions` bucket `once`;
- starter fight probe for levels 1-2 stays intact.

**Non-goals**

- no per-fight rewards, XP, gold, or item grants in the original `0.0.21` slice; this gap is later addressed by `0.0.23`;
- no random loot tables;
- no equipment effects;
- no group/PvP combat;
- no background workers.

**Acceptance criteria**

- `/fight` starts/resumes one active solo combat;
- repeated callback того самого ходу не проводить ще один хід;
- stale callback не дублює damage/rewards;
- terminal states are stable and do not reopen automatically.

## Later — Achievements Phase 1

**Objective**
Додати першу систему ачівок як колекцію жартівливих титулів без gameplay-бонусів.

**Source**

- `docs/ACHIEVEMENTS_PHASE1.md`;
- локальний planning archive `kvestarnia-achievements-phase1.zip` має seed на 54 definition records і issue-ready tasks.

**Scope**

- definitions seed із 54 ачівками;
- storage для earned achievements і progress snapshots;
- idempotent `AchievementService.track(event)`;
- кнопка `🏅 Ачівки` з екрану персонажа;
- категорії, пагінація по 10 рядків, earned/locked/hidden states;
- grouped unlock notifications;
- silent або summarized backfill для старих гравців;
- callback data <=64 bytes.

**Non-goals**

- no combat runtime wiring beyond safe event hooks;
- no XP, gold, item, stat, or power rewards;
- no active-title selection unless it is clearly tiny and safe;
- no bestiary collection expansion;
- no shop/economy implementation just to satisfy future achievement definitions;
- no production dependencies.

**Acceptance criteria**

- seed validation/idempotency tests pass;
- hidden achievements do not reveal criteria before unlock;
- duplicate events do not duplicate earned rows or notifications;
- UI shows `Отримано: X/54`, categories, pages, and dates;
- backfill does not spam old players.

## 0.0.22 — Equipment Stat Effects

Status: implemented in `0.0.22`.

**Objective**
Екіпіровані манатки починають давати маленькі прозорі bonuses, а combat і `/hero` читають ту саму effective stats математику.

**Scope**

- optional item effects, наприклад stat bonus, HP/mana max, armor, weapon damage, spell power;
- one effective-stats helper for base + level + equipment;
- `/hero`, `/equipment`, item detail показують внесок предметів;
- combat session reads effective values.

**Non-goals**

- no selling/trading/item instance refactor;
- no crafting;
- no requiredLevel bypass/respec tricks;
- no broad consumable economy or automatic item spending;
- no big offensive scaling.

**Acceptance criteria**

- equip/unequip змінює numbers у hero/equipment і combat tests;
- usable-item candidates are documented and safe, but any actual spend/use action requires explicit confirmation and idempotent callback design;
- junk/cosmetic/priceless items не дають power випадково;
- presenter не рахує приховану математику.

Follow-up debt: usable item metadata and actual item-use actions remain future work with explicit confirmation and idempotent callback design.

## 0.0.23 — Loot Engine + Reward Replay

**Objective**
Перетворити monster loot mapping на контрольований, тестований loot engine.

**Status**
Implemented in `0.0.23` for won persistent solo fights.

**Scope**

- `src/domain/loot/*` із rarity table;
- LUCK дає малий bounded modifier;
- loot candidates беруться з monsterLoot/item content;
- deterministic або injected RNG;
- reward claim transactional/idempotent;
- repeat/retry callback може показати stored reward details.
- won persistent fight claims a small XP/gold/item reward once per session.

**Non-goals**

- no shops;
- no selling/trading;
- no crafting;
- no item-to-level sink;
- no bestiary collection expansion.

**Acceptance criteria**

- tests cover rarity distribution sanity, bounded LUCK, duplicate claim, no eligible item fallback;
- повторний callback не reroll-ить loot;
- reward UI безпечно показує exact items.

## 0.0.24 — Level Cap 13 & Grownup Cellar Quest

**Status**
Implemented in `0.0.24`.

**Scope**

- current alpha cap raised from level 10 to level 13;
- total XP thresholds extended with a steeper post-level-9 climb: `450`, `650`, `900`, `1300`;
- level-cap celebration and `/restart` suggestion moved to level 13;
- epic-level planning bracket moved to levels `14-23`;
- persistent solo fights prefer monsters closer to the hero level and fall back to the highest eligible lower-level monster when content has no same-band enemy yet;
- XP from persistent solo fights is capped to `1` when the monster is more than 2 levels below the hero;
- level 4+ `/cellar` route opens `Справа не до миші` instead of the retired mouse dead-end;
- seal purchase, roleplay bypass, bottle grant, and `Шинок` turn-in are idempotent through existing `daily_actions` / cooldown / item rows;
- no broad quest engine or new schema was added.

## 0.0.25 — Persistent HP/Mana & Loot Expansion

**Status**
Implemented in PR #39.

**Scope**

- persisted HP/mana attrition for level 3+ persistent solo fights;
- lazy out-of-combat HP/mana regeneration with class/race/title/stat modifiers;
- guarded passive regen writes so stale read paths do not overwrite fresher combat/equipment resource rows;
- Loot Expansion v1 as a wide content-backed persistent-fight loot pool;
- handcrafted loot coverage for the ordinary level 4-13 monster ladder;
- Hunt Board scaling against the level 4-13 monster ladder;
- direct item-detail links from Mantok Chest output and the kept grownup cellar bottle result;
- public-site/news/docs cleanup for the player-facing release surface.

**Non-goals**

- no manual Mantok Chest input selection;
- no potions, temple healing, paid healing, combat-time regeneration, shops, trading, crafting, item-instance inventory, full loot effect processors, or full Hunt Board combat loop.

## 0.0.26 — Phase 1 Recovery & Balance Polish

**Status**
Current stabilization slice after `0.0.25`. This is the small pass that keeps HP/mana attrition, passive recovery, loot expansion, Hunt Board scaling, and persistent fight rewards coherent before the next feature slice.

**Objective**
Підрівняти відчуття після `0.0.25`: hero recovery має бути зрозумілим, same-level fights — не ламатися на верхніх рівнях, а локальний smoke path — легко повторюваним.

**Scope**

- passive recovery clarity in `/hero`, fight rest states, and quest hub hints;
- small monster-derivation tuning only where smoke tests show obvious outliers;
- docs/checklist updates for the 3, 4, 8, 13 smoke band;
- no new systems or economy branches.

**Non-goals**

- no potion/healing economy;
- no manual chest selection;
- no new loot families;
- no combat formula rewrites beyond a small monster-side tune;
- no schema changes.

**Acceptance criteria**

- zero-HP reads tell the player to rest first;
- same-level ordinary fights stay in the target feel band after smoke checks;
- `npm run simulate:combat`, `npm run sample:loot`, and `npm run check` are documented in the playtesting notes.

## 0.0.27 — Manual Mantok Chest Selection & Inventory Polish

**Objective**
Доробити Дружню Скриню після runtime MVP: ручний вибір манаток, краща інвентарна ергономіка й підготовка до item-instance identity без магазинів, продажу або trading.

**Status**
Implemented in the `0.0.27` slice as manual stack-unit selection for the existing Дружня Скриня flow. Deeper item-instance identity remains deferred.

**Scope**

- manual selection with pagination and `x/5` counter;
- one-unit add/remove controls for eligible stacks, with selected/available counts;
- clearer distinction between recyclable vs protected/equipped/priceless/story/apology stacks;
- keep transaction/idempotency safety from the `0.0.24` auto-pick path;
- document or design item-instance identity if stack-level protection becomes too restrictive;
- docs source: `docs/MANTOK_CHEST_BACKLOG.md`.

**Non-goals**

- no shops;
- no selling/trading;
- no crafting tree;
- no item-to-level exchange;
- no social recycling;
- no new combat rewards.

**Acceptance criteria**

- tests cover manual selection, callback size, stale selections and duplicate callbacks;
- selected items never disappear unless 1 valid output item is created;
- player-facing copy stays clear that input манатки are gone forever after confirmation.

## 0.0.28 — Yeger Trial: Unquiet Hunt Quest

**Objective**
Замінити player-facing hourly Hunt Board на першу Єгерську справу з persistent combat progress.

**Status**
Implemented in the `0.0.28` slice as `Неспокійні справи`: level 4+ quest, 5 won unquiet persistent solo fights, one-time XP/gold/keepsake reward.

`0.0.29` adds the first timed tracking search before a fight: `👣 Вийти на слід` creates a short persisted `character_cooldowns` wait, `/hunt` shows pending/ready trail state, and `🔎 Перевірити слід` resolves into either a targeted unquiet persistent fight or a no-fight miss.

**Follow-up backlog**

- lure/ambush table with манатка-as-bait;
- background auto-resolution or notifications for ready tracks, if the product later wants it;
- Yeger reputation as a real table instead of flavor;
- wilderness/location-aware hunt presence;
- group hunt hooks after solo loop stabilizes.

## 0.0.29+ — Phase 1 Balance and Playtest Polish

**Objective**
Не додавати фічі, а довести Phase 1 до done: real fight → reward → loot → level-up → hero/equipment/resources impact має мати нормальний темп 1-13 і зрозумілий playtest checklist.

**Scope**

- tune current fight reward/loot/progression path;
- verify level thresholds 1-13, multi-level grant, cap behavior, and weak-target XP together;
- verify level/equipment/resource persistence affects combat math through shared effective stats without hidden refills;
- after `0.0.26`, resource-management follow-up should add explicit healing/rest/item actions only through confirmed, idempotent flows; no hidden full auto-restore before every fight;
- future-safe monster level modifiers: манатки або дії інших гравців можуть тимчасово знижувати чи піднімати effective рівень монстра; нижчий рівень має давати менші/гірші rewards, вищий — кращі rewards, але різко складніший бій і більшу потребу в разових манатках;
- short Ukrainian level-up copy with concrete changes.

**Proposed total XP thresholds**

```text
1: 0
2: 10
3: 25
4: 45
5: 70
6: 110
7: 160
8: 225
9: 305
10: 450
11: 650
12: 900
13: 1300
```

**Acceptance criteria**

- tests cover threshold crossing, multiple levels, cap at 13, duplicate reward no duplicate level;
- `/hero` and combat agree on level/effective values.

## Later / Не Phase 1 Finish

- group hunts/raids;
- social player interactions: виклик на дуель у корчемний бійцівський куток, пропозиція всліпу помінятися манатками, маленька інтерактивна міні-гра між гравцями;
- корчемні ігри з `docs/SOCIAL_ACTIONS_BACKLOG.md`: дуже прості карти/шашки на 2–4 кроки з opt-in викликом nearby пригодника, легким випадковим розвʼязанням, presence flavor і косметичним/соціяльним результатом без бойової переваги;
- player influence on hunts: допомогти іншому гравцю закрити полювання або, якщо дуже хочеться бути проблемою, допомогти монстру в межах безпечних anti-abuse rules;
- activity presence: зберігати й показувати coarse тип поточної дії персонажа, наприклад «чекає бочку», «спілкується з єгерем», «бʼється з монстром», «отримує нагороду»;
- trading/gifting;
- shops/selling;
- crafting/enchant/reroll;
- daily tavern sample packs after usable items exist: one claim per Kyiv-local day, no power creep, no healing/consumable effects until item-use callbacks are explicit and idempotent, and reusable gift-campaign definitions with `localDate` as the claim bucket;
- Redis/BullMQ/jobs, якщо SQLite transactions достатні;
- Mini App inventory/profile;
- more bestiary content or collection UI.

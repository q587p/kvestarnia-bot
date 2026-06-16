# Next Implementation Backlog після `0.1.0`

## Current order after `0.1.0`

`0.0.x` завершено після `0.0.30 — Level Barter Safety & Closeout Alignment`. `0.1.0 — Phase 1 Closeout & Phase 2 Roadmap` є release/docs/smoke PR: version bump, release notes, changelog/news, README, roadmap/backlog/playtesting alignment, Phase 2 docs reset, and no new gameplay runtime.

Перед новими feature tracks звірятися з:
- [PHASE1_RELEASE_NOTES.md](PHASE1_RELEASE_NOTES.md)
- [PHASE1_CLOSEOUT_0_1_TRANSITION.md](PHASE1_CLOSEOUT_0_1_TRANSITION.md)
- [PHASE1_CLOSEOUT_SMOKE.md](PHASE1_CLOSEOUT_SMOKE.md)
- [phase2/SOCIAL_COMBAT_PLAN.md](phase2/SOCIAL_COMBAT_PLAN.md)
- [phase2/DUELS_AND_INVITES.md](phase2/DUELS_AND_INVITES.md)

Перший порядок після `0.1.0`:

1. `0.1.1` — playtest bugfixes, copy polish, small UX papercuts, and smoke fallout.
2. `0.1.2` — presence interior/routing cleanup plus first runtime `/remort` at level 13: treat `Шинок` as korchma interior, move bot presence routing rules out of `createBot.ts`, and add replay-safe remort drafts/history.
3. `0.1.3` — choose one reliability/polish item based on real pain: durable Barrel completion notifications or Mantok Chest pending cleanup.
4. `0.1.4` — Hlybka routing or fight/quest navigation cleanup if playtest shows confusion around where fights happen.
5. First Phase 2 prep/runtime slice only after smoke evidence: бійцівський куток із тренувальним `Сумлінним Допельґанґером`, не груповий рейд.
6. Duel invite MVP після того, як допельґанґер доведе форму бою й картку результату.
7. Duel result/rematch/tournament card support.
8. Trading/gifting MVP: one eligible item unit or narrow item-for-item flow.
9. Combat variety: guard, cooldowns, monster skills, action catalog, item tags and one-use manatky.
10. Remort follow-ups: remort-only advanced options, richer legacy flavor and social/cosmetic records; the base `/remort` loop is already runtime in `0.1.2`.
11. Multi-enemy combat.
12. Party combat / real raid MVP with capped contribution-aware rewards.

Feature tracks start only after smoke and stabilization. Docs-only ideas added around `0.0.30` remain deferred unless they are needed to explain current runtime. Achievements runtime, food/coffee buffs, NPC rankings, expanded equipment, battle interventions, manual Munchkin selection, shops/selling/crafting, item-instance inventory, group raids, guilds, Mini App, and broad combat rewrites are not part of `0.1.0`.

Deferred side tracks remain useful but should not steal the Phase 2 spine: durable Barrel notification reliability, Mantok Chest pending cleanup, Shynok item-for-beer, bestiary filters, Yeger bait/lure/reputation, rewardless achievements, food/coffee buffs, NPC rankings, the docs-planned Support Jar live status, and very-late alternate clients such as web play or non-Telegram messenger bots.

Each slice below should be independently testable. If a PR starts turning into several systems at once, split it.

## Post-closeout scope guard

Бестіарій лишається content/data foundation: read-only `/bestiary`, monster content, loot notes, flavor routing і Hunt Board contract source.

Не розширювати бестіарій як окрему фічу, collection loop, share card або journal progression, доки `0.1.x` playtest не підтвердить, що закритий Phase 1 ланцюжок стабільний:

```text
persistent fight → equipment stats → loot/reward replay → level 1-13 + HP/mana persistence → recovery/balance polish → inventory/chest polish → balance/playtest polish
```

## Implemented in `0.1.2` — `/remort` After Level 13

**Objective**
Замість того, щоб після 13 рівня просто пропонувати `/restart`, `0.1.2` відкриває окрему механіку `/remort`: переродження героя у стилі MUD-ів, де завершений персонаж починає нове коло не як чистий wipe, а з памʼяттю, статусом або обмеженим legacy-бонусом.

**Research note**

- Перед дизайном подивитися, як `remort` працює в MUD-ах: скидання рівня, збереження імені/репутації, remort-count, доступ до нових рас/класів, невеликі permanent бонуси, unlock-и або титули.
- Виписати, які патерни підходять Квестарні, а які ламають баланс або роблять veteran snowball.

**Scope**

- Команда `/remort` є окремим шляхом після досягнення 13 рівня.
- На 13 рівні capstone copy пропонує `/remort`, а не лише `/restart`.
- `/restart` лишається технічним reset/discovery loop, але не головною endgame-пропозицією.
- Runtime details першого slice: remort-count, запис дошки, `Памʼять минулих пригод` як 23% від попереднього level-growth для HP/мани/головної характеристики, і до 5 явно вибраних owned манаток.
- Перед reset показується preview: що скидається, що лишається і які саме манатки обрані.
- Нове коло має відкривати інший смак проходження без pay-to-win і без обовʼязкового grind-покарання.

**Follow-ups**

- remort-only title/cosmetic options;
- remort-only race/class flavor without stronger power snowball;
- rare remort-gated manatky that only wake up, equip or reveal their proper joke after one or more remorts;
- richer public board/history text;
- possible renaming flow after separate UGC/moderation guardrails.

**Non-goals**

- no prestige power snowball у першому slice;
- no paid power або premium remort;
- no wipe без явного confirmation;
- no автоматичне переродження без окремої команди й пояснення.
- no рівні 14-23 у тому самому slice;
- no приховане збереження або списання манаток без preview.

**Acceptance criteria**

- 13-level celebration пропонує `/remort` як головний наступний крок;
- `/remort` має окремий confirmation flow і не плутається з `/restart`;
- unavailable below level 13;
- preview shows reset/preserve consequences;
- player can explicitly select up to 5 owned preserved manatky;
- protected/story/priceless/equipped/effect-bearing manatky rules are explicit and player-facing;
- remort-state/rewards ідемпотентні й не дублюються повторним callback-ом;
- docs пояснюють, чим `/remort` відрізняється від `/restart`;
- tests cover unavailable below level 13, confirmation, successful remort, repeated confirm, and preserved/deleted state choices.

## Later — NPC Player Rankings

**Objective**
Додати біля корчми або дошки вістей NPC, який веде поточні топи пригодників і говорить про це так, ніби числа самі приходять до нього на сповідь. Це має бути соціяльний гачок і причина посміхнутися, а не таблиця сорому.

**NPC direction**

- Робоча роль: `Лічильник`, `Писар сили`, `Пан з рахівницею`, `Той, хто знає ваше місце`. Назву вибрати в runtime PR.
- NPC пояснює, що він не вирішує, хто герой, а лише тримає список, поки список не тримає його.
- Винести поверхню надвір або до дошки, щоб не перевантажувати корчемний hub.

**Leaderboards**

- `Сила пригодника`: рівень, характеристики, effective stats і вдягнені манатки. Не використовувати сирий hidden/internal score без пояснення.
- `Гаманець`: наявне золото персонажа.
- `Скарб у манатках`: сумарний item score / оціночна вартість манаток, окремо від spendable gold.
- Майбутні розширення: щедрість у Шинку, закриті справи, перемоги над проблемами, досягнення рівнів.

**UI rules**

- Показувати максимум перші `39` місць: три сторінки по `13` рядків.
- Пагінація кнопками `⬅️` / `➡️`, без довгих повідомлень, які ризикують упертися в Telegram limit.
- У кожному leaderboard показувати власну позицію окремим рядком: навіть якщо гравець поза top 39, він бачить своє місце, але бот не показує весь хвіст списку.
- Формат рядка: медаль для `1-3`, далі номер, коротке імʼя, optional guild/tag, значення score людською мовою.
- Якщо значення однакове, tie-breaker має бути детермінованим: спершу вищий рівень/релевантний secondary score, потім earliest joined/created або stable `character_id`.
- Не показувати технічні id, telegram usernames без потреби, exact timestamps або приховані локації.

**Scoring guardrails**

- `Сила пригодника` має бути derived/read-only, без нового reward source.
- Equipment effects враховувати через shared effective-stats helper, щоб `/hero`, combat і leaderboard не рахували різні світи.
- Item score для манаток має використовувати той самий або явно споріднений scoring path, що й Дружня Скриня / Манчкін-скупник, але без автоматичного продажу чи конвертації.
- Рейтинги не мають давати прямий бойовий бонус. Нагороди, якщо зʼявляться, мають бути cosmetic/social: рядок на дошці, титул, локальний жарт.

**Acceptance criteria**

- NPC має entry point із надвору/дошки й коротке пояснення;
- є три вкладки/кнопки: сила, золото, манатки;
- кожен топ пагінується по `13`, максимум `39` видимих позицій;
- власна позиція показується окремо й працює поза top 39;
- ties стабільні між переглядами;
- tests cover score calculation, pagination, own-rank outside top 39, privacy-safe names, no exact timestamps, and Telegram message length guard.

## Very later — Web and Multi-Messenger Play Surfaces

**Objective**
Колись дати гравцям можливість грати не тільки через Telegram: легкий web-клієнт і, можливо, окремі bot adapters для інших месенджерів на кшталт WhatsApp, Viber або інших платформ, якщо там буде сенс і нормальні API.

**Product direction**

- Telegram bot лишається канонічним playable surface до стабільної альфи.
- Web play surface має бути саме грою, а не лише dashboard-ом: герой, корчма, справи, бій, манатки й базова навігація через shared application services.
- Інші месенджери мають бути adapters поверх тієї самої доменної логіки, без копіювання правил гри в окремі кодові гілки.
- Кожна платформа повинна мати чесні privacy, identity, callback/idempotency і anti-abuse правила; не переносити Telegram-specific припущення як універсальні.

**Preconditions**

- core Telegram loop стабільний і має достатньо playtest evidence;
- domain/services відділені від grammY настільки, щоб інший adapter не вимагав переписати бойову, loot, inventory або remort логіку;
- є нормальна web/session/auth історія без витоку Telegram id, приватних локацій або player names;
- є окремий support/hosting план, бо кілька клієнтів означають більше surface area, логів і maintenance.

**Non-goals before then**

- no WhatsApp/Viber runtime у `0.1.x`;
- no web rewrite замість Telegram bot-а;
- no Mini App dependency як обовʼязковий шлях гри;
- no public promise про дату або конкретну платформу, доки немає технічного spike-а й політик платформи.

**First investigation slice**

- перевірити API/ToS/hosting constraints для web, WhatsApp, Viber та інших кандидатів;
- описати shared adapter boundary: input command/callback → application service → presenter payload → platform renderer;
- вибрати одну read-only або low-risk дію для proof-of-concept, наприклад `/hero` чи read-only корчемний hub, без reward mutation.

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

## Closed in `0.1.1` — Банка підтримки

**Objective**
Додати добровільну підтримку Квестарні через Monobank-банку без ігрових переваг, без преміуму й без прив’язки реальних грошей до прогресу.

**Status**
First safe runtime/link-plumbing slice shipped in `0.1.1`: optional strict Monobank `SUPPORT_JAR_URL`, secondary `/support`, `/start support_thanks`, public-site block only when configured, docs/release surfaces and focused tests.

**Scope**

- optional `SUPPORT_JAR_URL`;
- secondary `/support` command, not in welcome flow;
- deep link `/start support_thanks` with gratitude scene;
- optional public-site secondary support block;
- README/docs copy without hardcoded real URL;
- tests for configured URL, missing URL, regular `/start`, `support_thanks` and no gameplay rewards.

**Non-goals**

- no XP, gold, loot, manatky, equipment, rankings or feature access;
- no payment confirmation;
- no donor state;
- no premium positioning;
- no hardcoded fake Monobank URL;
- no gameplay reward or monetization release framing.

**Acceptance criteria**

- `/support` never renders a broken URL;
- `support_thanks` explicitly says there are no gameplay advantages;
- regular `/start` stays unchanged;
- support copy stays voluntary and secondary;
- `npm.cmd run check` passes for the runtime PR.

## Later — Live Support Jar Status

**Objective**
Показувати у `/support` і на сайті реальний aggregate status `Банки підтримки Квестарні` через офіційний Monobank API, щоб maintainer не оновлював суму й ціль вручну в env.

Canonical design doc: [SUPPORT_JAR_LIVE_STATUS.md](SUPPORT_JAR_LIVE_STATUS.md).

**Scope**

- server-side only `MONOBANK_API_TOKEN`;
- `GET /personal/client-info` only;
- find jar by `sendId` from `SUPPORT_JAR_URL`;
- cache with TTL, default `300` seconds, minimum `60`;
- coalesce concurrent refreshes;
- show only aggregate balance/goal for UAH;
- safe fallback when token absent, API unavailable, jar missing, response invalid, rate limited or unsupported currency;
- `/support` and homepage support block may render live aggregate status when available.

**Non-goals**

- no Monobank webhook;
- no statement endpoint;
- no scraping `send.monobank.ua`;
- no payment confirmation;
- no donor table, donor state, donor list or donor rankings;
- no premium;
- no XP, gold, loot, манатки, levels, combat power, progress or feature access;
- no DB migration for donor/payment data;
- no real Monobank URL or token in repository;
- no full Monobank response in logs.

**Acceptance criteria**

- app works with only `SUPPORT_JAR_URL` and no token;
- live current/goal renders when token and jar match;
- stale cache is used on refresh failure;
- no request happens more often than configured TTL;
- token never appears in UI, logs, docs, snapshots or errors;
- tests mock API calls and do not hit real Monobank;
- gameplay `Бочка Пінного Міражу` remains untouched.

## Later — Шинок Mantok-for-Beer Sink

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

## Later — Шинок Food Buffs

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
- `☕ Кава корчмарської тривоги` — тимчасово стискає кулдауни, а потім змушує організм і Бочку вимагати відсотки.

**Rules**

- У персонажа може бути до пʼяти одночасних харчових бафів. Дублі того самого типу не stack-аються без окремого правила: нова страва або продовжує/оновлює свій слот, або просить confirmation на заміну.
- Баф має коротку тривалість: наступний persistent fight, кілька ходів, одна квестова перевірка або обмежене часове вікно.
- Списання золота тільки після confirmation screen із назвою страви, ціною, ефектом і тим, що буде замінено.
- Не продавати їжу під час pending raid або інших станів, де пригодові дії заблоковані.
- Бафи мають проходити через той самий effective-stats/resource helper, що й манатки, а не через розкидані presenter hacks.
- Не давати XP, рівень, loot roll або прямий обхід gates. Це підготовка й стратегічна витрата, не нове джерело прогресу.

**Coffee cooldown effect**

- Кава — окремий харчовий/напійний ефект для cooldown activity, а не бойовий stat buff.
- Одна, друга й третя кава в позитивній фазі скорочують релевантні кулдауни до `75%`, `60%` і `50%` відповідно. Цілитись у Бочку, мишу/льохові справи, Єгерський пошук сліду й подібні persisted cooldown-и.
- Позитивна фаза триває приблизно `15-23` хвилини: конкретну тривалість рахувати від `luck` і bounded RNG, без показу точного roll-а гравцю.
- Після позитивної фази починається відкат: на `1/2/4` години кулдауни подовжуються до `150%/200%/400%` для одного/двох/трьох випитих горнят.
- Більше трьох кав за один цикл не наливають. Другу й третю можна купити тільки поки триває позитивне скорочення.
- Під час негативного подовження нову каву не продавати: корчмар каже, що серце героя й так уже читає дрібний шрифт.
- Коли негативна фаза минула, герой може почати новий кавовий цикл, якщо має золото й не заблокований pending raid / іншою небезпечною дією.
- UI має чітко показувати фазу кави грубими словами: `кава допомагає`, `кава мститься`, `кава відпустила`; без точних timestamps у player-facing copy.

**Balance guardrails**

- Дешеві страви: помітний flavor, малий ефект, щоб новачок міг спробувати без страху.
- Дорогі страви: сильніші або довші, але без обовʼязковости для нормального win rate.
- Не дозволяти нескінченне stacking-меню: максимум пʼять активних харчових бафів і максимум три кави в одному кавовому циклі.
- Якщо баф піднімає `hpMax`/`manaMax`, не має безкоштовно лікувати понад описаний ефект. Поточні HP/мана мають оновлюватись явно й тестовано.
- Кавове прискорення не має міняти already-claimed reward state або дублювати винагороди. Воно лише масштабує майбутню/поточну тривалість cooldown-ів у явно дозволених activities.
- Добові/тижневі рейтинги пива не змішувати з їжею; якщо зʼявиться food ledger, це окрема мірялка.

**Acceptance criteria**

- `🍻 Шинок` показує меню їжі з цінами й короткими ефектами;
- purchase confirm списує золото один раз і створює/оновлює active food buff у межах ліміту пʼяти;
- repeated/stale callback не списує золото вдруге;
- новий food buff оновлює відповідний слот або просить підтвердити заміну, якщо ліміт вичерпано;
- fight start/effective stats враховує активні харчові бафи й гасить їх за правилами тривалости;
- кава скорочує/подовжує тільки дозволені cooldown-и, має positive/negative фази, блокує додаткову каву під час негативної фази й не дозволяє понад три горнята за цикл;
- `/hero` або окрема деталь показує активний харчовий баф без технічних id;
- tests cover insufficient gold, five-buff limit, replace/refresh flow, stale confirm, HP/mana edge cases, fight consumption, coffee 75/60/50% positive scaling, 150/200/400% rebound scaling, and coffee blocking during negative phase.

## Later — Шинок Bard Performance

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

## 0.1.x Later — Манчкін-скупник Manual Selection Polish

**Objective**
Доробити `🎒 Манчкін-скупника` після retry-safe auto-pick MVP: дати гравцю ручний вибір манаток для рівня без роздування callback data і без ризику stale списань.

**Rules**

- Поріг лишається `1000` оціночного золота разом із докладеним золотом з гаманця.
- Обмін має включати щонайменше одну eligible priced манатку; gold-only лишається забороненим, якщо окремий future PR явно не змінить це рішення.
- `12 → 13` не дозволяти: 13 рівень тільки боями.
- Екіпіровані, безцінні, story/quest/protected і zero-value манатки не eligible.
- Preview має показувати конкретні selected stacks, суму манаток, докладене золото, переплату й XP carry.
- Runtime confirm уже має `level_barter_exchanges` ledger; manual selection має або переюзати його, або мати такий самий replay/idempotency boundary.

**Acceptance criteria**

- manual selector не кладе довгі item ids у callback-и;
- confirm перечитує inventory/equipment/gold і відхиляє stale input;
- repeated confirm replay-ить уже completed exchange і не дає другий рівень;
- tests cover exact threshold, gold-fill threshold, gold-only refusal, protected/equipped exclusions, stale manual selection, replay, pending Barrel guard, and level-13 refusal.

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

## Later — Глибка Dungeon Location

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
- Нічний flavor для `🎒 Манчкін-скупника`: коли Глибка вже існує, він може вночі ховатися/працювати саме там, а вдень знову тинятися біля дверей корчми.

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
Implemented in `0.0.26`; retained here as archive context for the recovery/balance stabilization pass.

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

**Status**
Closed by `0.1.0`; remaining polish belongs to the explicit `0.1.x` order at the top of this document.

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

**Small copy/UX debts**

- Fight turn wording cleanup: якщо callback answer каже `Хід записано`, а fight screen уже показує `Хід: N`, не називати log section `Останній хід` поруч із цим. Звести до одного терміна (`Раунд`, `Журнал`, `Остання дія` або без заголовка), щоб бойовий екран не звучав як три службові журнали один на одному. Tests should cover the player-facing flow text, not only individual presenter snippets.
- Active fight keyboard cleanup: коли persistent fight уже активний, не показувати `⬅️ До столу` поруч із бойовими діями. У бою гравець має або діяти (`Вдарити`, уміння, майбутній `Захист`), або пробувати `Відступити`; вихід до Столу має зʼявлятися тільки в terminal/non-active states або як окрема safe navigation після завершення. Tests should assert active fight keyboards do not include quest-table navigation.

## Later — Battle Interventions / Витівка Прилавка

**Objective**
Додати стартовий risk/reward вибір перед eligible solo боєм: Припічник може послабити монстра за меншу нагороду, лишити все як є або досипати перцю й підняти effective level за кращий потенційний reward.

**Source**

- `docs/BATTLE_INTERVENTIONS.md`;
- локальний planning archive `kvestarnia-battle-interventions-archive.zip` містив початкові design/copy/tasks/prompt notes.

**Scope**

- pre-first-turn intervention phase for regular solo fights;
- choices: `help` (`-3` effective monster levels), `none`, `hinder` (`+2` effective monster levels);
- base monster level and effective monster level tracked separately;
- combat stats use effective level, while monster identity/content stays the same;
- reward modifiers make help safer but poorer, and hinder riskier but potentially richer;
- capped overlevel XP multiplier for defeating a monster above player level;
- timeout defaults to `none`, never to `hinder`;
- duplicate/stale/other-user callbacks are idempotent and safe.

**Non-goals**

- no tutorial/story/fixed-reward fights;
- no group/PvP/social intervention stacking yet;
- no broad combat rewrite;
- no hidden mutation of monster templates;
- no uncapped reward farming;
- no player-to-player help/hinder until anti-abuse rules exist.

**Acceptance criteria**

- tests cover pure level/reward functions, eligibility, callback ownership, duplicate callbacks, timeout default, and reward differences;
- result copy clearly says why reward changed;
- Telegram buttons stay short and Ukrainian;
- feature can be disabled or kept out of special encounters;
- future player/event intervention source types are not blocked by the state shape.

## Later — Combat Variety: Guard, Cooldowns, Monster Skills

**Objective**
Зробити solo-бій менш пласким, не перетворюючи його на повний MMO-combat: додати захисну дію, обмежити частоту сильних умінь і дати монстрам хоча б одну виразну не-базову дію.

**Scope**

- додати player action `guard`: захист зброєю, щитом, підручною манаткою або голими руками, залежно від класу/раси/equipment;
- `guard` має зменшувати вхідну шкоду цього ходу, іноді давати малу контратаку або позиційну перевагу, але не ставати найкращою атакою;
- тематично підсилити guard/counter для воїна, гнома, домовика, орка-інтелігента, козака-характерника, жреця й важкої броні;
- додати cooldown-и для сильних player skills: базово раз на `4-5` ходів, але дешеві cantrip/trick/support-вміння можуть мати коротший cooldown або тільки mana cost;
- UI має показувати cooldown людською мовою: `ще 2 ходи`, `готово`, `бракує мани`, без прихованого списання ходу;
- дати кожному ordinary monster хоча б одну просту особливість: guard, heavy attack wind-up, trick, слабкий debuff, self-shield, surrender cue або once-per-fight skill;
- монстри мають іноді захищатися, а не тільки бити: guard-шанс залежить від тегів `guard`, `bureaucratic`, `coward`, `armored`, `trickster` чи подібних content tags;
- симуляції мають перевіряти, що guard/cooldown не роздуває звичайні бої далеко за 2-5 ходів і не створює безпечний нескінченний stall.

**Non-goals**

- no multi-enemy combat у цьому slice;
- no full status-effect engine;
- no consumable item actions;
- no permanent class rework або respec;
- no broad monster AI tree;
- no reward/loot rebalance, якщо guard/cooldown не вимагає вузького tuning-а.

**Acceptance criteria**

- repeated callback не дає повторної контратаки або подвійного cooldown decrement;
- skill cooldown і mana cost не списуються, якщо дія не пройшла validation;
- guard має окремі unit tests для damage reduction, no-weapon fallback, class/race тематичних modifiers і counter chance;
- monster action tests cover at least attack, guard, and one once-per-fight monster skill;
- presenter copy коротко пояснює, що сталося: `Ви прикрилися`, `Монстр став у захист`, `Вміння ще готує печатку`;
- combat simulation reports win-rate/turn-count drift before/after.

## Later — Expanded Equipment Doll and Combat Tags

**Objective**
Розширити «ляльку» спорядження з трьох слотів до виразної equipment-моделі, де манатки не просто додають цифри, а відкривають бойові варіянти: дві руки, щити, дворучна зброя, взуття, амулети, косметика й тегована поведінка.

**Player-facing direction**

Екран спорядження має читатися як коротка картка героя, а не як debug table:

```text
Спорядження героя

🗡 Пательня переконання +3 (⚔️ +8, 😎 +1)
🛡 Кришка обережного борщу +2 (🛡 +5, 🔰 блок)
🎩 Порожній слот
🧥 Фартух піностійкого пригодника +1 (🛡 +3, ❤️ +6)
👢 Чоботи службового тупоту +2 (🦶 копнути)
🪬 Амулет дрібної недовіри (🔮 +2, 🌀 trick)
✨ Косметика: значок «Я тут випадково»
```

Це приклад напрямку, не обіцянка конкретних предметів або чисел.

**Scope**

- розширити slot vocabulary: `mainHand`, `offHand`, `twoHand`, `head`, `chest`, `legs`, `feet`, `accessory1`, `accessory2`, `cosmetic`;
- визначити rules для рук:
  - `twoHand` займає обидві руки;
  - одноручна зброя може бути в `mainHand` або `offHand`, якщо предмет/клас це дозволяє;
  - щит або захисна манатка може займати одну руку;
  - два щити можливі тільки як окремий funny/defensive build і не мають давати безсмертя;
- додати item tags для майбутніх дій: `melee`, `ranged`, `magic-focus`, `shield`, `kick-enabled`, `guard`, `counter`, `spell-channel`, `offhand`, `two-handed`, `cosmetic`, `consumable`, `single-use`/`one-use`, `duel-legal`/`duel-blocked`, `raid-legal`/`raid-blocked`, `tradeable`/`trade-blocked`, `memory`, `sentimental`, `soulbound`;
- пройтися по наявних манатках і проставити tags/effect intent, щоб кожна supported equippable річ чесно пояснювала, чим вона може допомогти;
- stronger equipment impact має йти через `buildEffectiveCharacterStats(...)` і combat action catalog, а не через presenter hacks;
- якщо немає зброї, combat має мати unarmed fallback: кулаки, хвіст, голова, роги, пісня, печатка або інший flavor залежно від раси/класу/титулу;
- взуття з відповідним тегом може відкрити кнопку `Копнути`;
- щит має впливати на `guard`, block chance, shield bash або counter тільки коли це підтримує клас/раса/титул;
- магічна палка, посох, кільце або амулет можуть давати spell/trick action навіть не-магічним класам, але з меншим ефектом або дорожчою маною;
- cosmetic slot не дає бойової сили в першому slice, але може впливати на flavor, профіль або майбутні соціяльні реакції;
- разові манатки лишаються окремим майбутнім item-action slice з confirmation та idempotency, не автоматичним hidden proc-ом.

**Non-goals**

- no shops, selling, trading або crafting у цьому slice;
- no durability numbers на всіх предметах, якщо item instances ще не готові;
- no cursed equipment або forced unequip без окремого safe UX;
- no full consumable system;
- no giant stat rebalance без simulation;
- no cosmetic pay-to-win.

**Implementation notes**

- Перед runtime зміною потрібне рішення щодо `character_equipment`: чи лишається content-id per slot, чи потрібні concrete item instance ids перед split-stack / durability / transfer use cases.
- Callback data має лишатися коротким: краще slot codes (`mh`, `oh`, `2h`, `hd`, `ft`, `c1`) і server-side lookup, ніж довгі payload-и.
- UI має допомагати орієнтуватися: у вкладці `Спорядження` варто мати фільтри `Показати зброю`, `Показати захист`, `Показати амулети`, `Показати косметику`, які показують owned compatible items.
- Equipment restrictions мають пояснюватися in-world: не «не той gender/race», а «ця манатка просить іншу анкету пригодника» з кнопкою до деталей.

**Acceptance criteria**

- tests cover two-handed item occupying both hands, shield/offhand conflicts, two shields if allowed, empty unarmed fallback, and cosmetic no-power guarantee;
- every visible slot has Ukrainian label and distinct icon where practical;
- every supported equippable item has tags/effect intent and item detail explains them;
- `/equipment`, `/hero`, item detail, and combat agree on effective stats and unlocked actions;
- combat simulations include no-weapon, one-handed weapon, two-handed weapon, shield, dual-shield, magic-focus, and kick-enabled samples;
- no hidden full heal/refill, duplicate item spend, or automatic consumable use.

## Later — Multi-Enemy Combat and Summoner Tags

**Objective**
Спроєктувати і потім реалізувати перший обережний бій із кількома противниками, щоб `summoner`-монстри могли кликати допомогу, а майбутні рейди не починали з нуля.

**Scope**

- додати content-level tag або trait на кшталт `summoner` / `callsBackup`, який не гарантує підмогу, а відкриває контрольований шанс;
- у solo MVP дозволити максимум одного додаткового ворога, щоб не ламати Telegram UI і баланс;
- визначити ролі підмоги: extra weak attack, shield for main monster, minor heal, distraction або escape pressure;
- UI має показувати кілька ворогів компактно: головний ворог окремо, підмога одним коротким рядком із HP/станом;
- rewards не мають автоматично подвоюватися через підмогу; extra enemy може впливати на flavor або малий reward modifier тільки після окремого balance рішення;
- target selection має бути простим: за замовчуванням атака бʼє головного ворога, special actions можуть зачіпати підмогу, але без складної тактичної сітки;
- repeated/stale callback не має прикликати підмогу вдруге;
- цей shape має бути сумісний із майбутніми group raids: кілька enemy records, turn log, compact summary, idempotent reward source.

**Non-goals**

- no повноцінний raid engine;
- no positioning/grid;
- no party roles, tanks/healers або aggro table;
- no group rewards;
- no AoE/effects explosion у першому slice;
- no extra loot source just because зʼявився другий ворог.

**Acceptance criteria**

- combat state може серіалізувати 1 основного ворога + 1 підмогу без зміни старих finished sessions;
- summon trigger has once-per-fight idempotency guard;
- tests cover summon success, no duplicate summon, helper defeated, main defeated while helper remains, and reward materialization once;
- Telegram message лишається в один мобільний екран;
- docs пояснюють, як цей патерн стане основою для майбутнього group raid combat.

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

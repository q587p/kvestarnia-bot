# Balance Notes

## Балансова мета MVP
MVP має бути веселим, не ідеально збалансованим. Але він не має ламатися від першого power user.

Цілі:
- Бій на рівному рівні триває 2–5 ходів.
- Гравець перемагає звичайного монстра у 75–90% випадків.
- Поразка не карає жорстко.
- Level-up 1–5 швидкий, 6–13 помітно повільніший.
- Рідкісний лут приємний, але не обов’язковий для прогресу.

## Стати MVP
- STR — фізична шкода.
- DEX — ухилення/крит.
- INT — магія/mana.
- CHA — bard/соціяльні ефекти, rewards у квестах.
- LUCK — loot/crit/escape small modifiers.

## Базові формули

### HP
```text
hp_max = 20 + level * 5 + vitality_bonus + class_hp_bonus
```

Якщо немає VIT як окремого стату, class/race дають flat бонус.

### Physical damage
```text
damage = weapon_base + floor(STR * 0.7) + level_bonus - target_armor
minimum_damage = 1
```

### Spell damage
```text
spell_damage = spell_base + floor(INT * 0.9) + level_bonus - target_resist
```

### Бойові варіянти й мана
Наступний combat pass має рахувати не одну кнопку `Вдарити`, а typed бойові варіянти:
- `physical`: сила/спритність/зброя, без витрати мани.
- `spell`: розум/рівень/магічний focus, мала витрата мани.
- `social` або `trick`: харизма, спритність чи вдача, менша пряма шкода, але debuff/control/reward flavor.
- `class-special`: класова дія з власним cooldown або resource cost, якщо вона сильніша за базову атаку.

Магічні й містичні дії мають показувати витрату в UI, наприклад `🔮 -2 мани`, і не зʼїдати ману, якщо reward callback уже зарахований або дія стала stale.

Race/class/combo modifiers мають бути малими й симульованими. Вони можуть змінювати odds, damage band, crit flavor або доступну назву дії, але не мають робити мага без мани безпорадним чи воїна без spell-кнопки нудним.

Equipment effects для атак мають заходити через один effective-stats/equipment helper:
- weapon впливає на physical base або spell focus, якщо це явно магічна зброя;
- armor впливає на виживання, але не має безкоштовно піднімати шкоду;
- accessory може давати малий situational modifier, resource discount або extra flavor hook;
- priceless/trophy items не дають бойових бонусів, доки контент явно не переведений у equippable/effect item.

`0.0.21` persistent solo `/fight` використовує бойовий рушій у runtime. У цьому slice він навмисно не видавав XP, золото або лут, щоб перевірити session correctness, stale callbacks, mana failure і terminal states без нового economy source. `0.0.22` додає перші малі equipment stat effects через один helper, а `0.0.23` додає малий reward/loot path для won persistent fights.

### Hit chance
MVP можна почати без промахів у звичайній атаці або з дуже простим шансом:

```text
hit_chance = clamp(0.85 + (attacker.DEX - defender.DEX) * 0.01, 0.70, 0.95)
```

### Crit chance
```text
crit_chance = clamp(0.05 + DEX * 0.003 + LUCK * 0.002, 0.05, 0.25)
crit_multiplier = 1.5
```

### Escape chance
```text
escape_chance = clamp(0.45 + (DEX + LUCK - monster_level * 2) * 0.01, 0.25, 0.80)
```

## XP curve
Поточний alpha helper має єдину progression-логіку 1-13, яку використовують rewards, combat-facing summary, hero profile і тести. Робоча alpha-крива:

```text
level 1: 0 total XP
level 2: 10
level 3: 25
level 4: 45
level 5: 70
level 6: 110
level 7: 160
level 8: 225
level 9: 305
level 10: 450
level 11: 650
level 12: 900
level 13: 1300
```

Після 9 рівня крива навмисно стає крутішою: 10-13 мають відчуватися як довший alpha-climb, а не як ще чотири швидкі сходинки. Це не фінальний баланс. Якщо combat simulations покажуть надто швидкий або повільний темп, коригувати в окремому balance PR, а не ховати нові thresholds у feature PR.

## Вага рівня
Рівень має бути одним із головних важелів, бо Квестарня також про приємний ріст циферок. Якщо персонаж отримав новий рівень, це має відчуватися не тільки в `/hero`, а й у формулах.

Майбутній балансний прохід має перевірити:
- HP і мана ростуть достатньо помітно, щоб рівень здавався справжнім посиленням.
- Бій використовує рівень як окремий коефіцієнт у шкоді, виживанні, доступних діях або порогах монстрів.
- Події й пригоди можуть мати перевірки, варіанти відповіді, обмеження доступу або малі бонуси, залежні від рівня, але без глухої стіни для новачків там, де це не потрібно.
- Рівень не має повністю перекривати расовий і класовий колорит: циферки ростуть, але персонаж усе ще має відрізнятися не лише номером.

Фаза доби може бути окремим балансним важелем. Ніч має підсилювати не всіх, а лише ворогів із відповідними тегами: `night`, `dark`, `underground`, `undead` або подібними. Ранок, день і вечір теж можуть мати дрібні, читабельні модифікатори для своїх типів сцен. Почати краще з невеликих bonus bands, наприклад HP/attack/trait potency, і прогнати combat simulations окремо для `morning`, `day`, `evening`, `night`, щоб нічні вороги були страшнішими, але не ламали 75-90% win-rate для звичайних боїв.

Рівневі рейтинги мають підсилювати відчуття росту, але не тиснути на гравця нескінченною гонитвою. Показувати останні досягнення й важливі віхи, особливо 13 рівень у поточній альфі, краще за сирий список усіх XP. Рейтинг має бути приводом сказати «о, хтось доріс», а не таблицею сорому для тих, хто зайшов випити чаю.

Рівні `14-23` планувати як епічний діапазон із новими важелями, а не лише більшими числами. За прикладом Munchkin, раси й класи можуть відкривати додаткові абілки на milestone-рівнях: другий класовий трюк, расову витівку, тимчасовий bypass для манаток, бонус до конкретного типу подій або кумедний недолік, який іноді стає перевагою. Балансне правило: milestone має бути помітним у грі й тексті, але не робити одну расу/клас обов’язковим вибором.

## Gold economy MVP
Sources:
- PvE fights.
- Daily.
- Raid rewards.

Sinks:
- Repair після поразки.
- Reroll одного stat на предметі.
- Cosmetic title.
- Створення ґільдії.

У MVP не давати гравцям багато gold без sinks.

## Loot tables
Стартова таблиця:
```text
common:   70%
uncommon: 22%
rare:      7%
epic:      1%
```

`0.0.23` підключає цю таблицю як контрольований loot engine для won persistent solo fights:
- базовий шанс item drop: `35%`;
- LUCK дає тільки bounded modifier до drop chance: поточний cap `25-45%`, тож висока вдача не гарантує лут;
- LUCK може підняти rarity максимум на один крок і теж має малий cap, щоб rare/epic не ставали обовʼязковими;
- якщо монстр не має eligible loot candidates, перемога все одно може видати XP/gold без item;
- якщо потрібної rarity немає серед candidates, engine падає до найближчої доступної нижчої rarity, а потім до найближчої вищої, щоб не ламати reward path.

Поточний persistent fight payout навмисно малий:
```text
XP:   clamp(3 + monster.level * 2, 5, 14)
gold: clamp(1 + floor(monster.level / 2), 1, 7)
item: максимум 1 controlled monsterLoot item
```

У `0.0.24` вибір монстра для persistent solo fight став ближчим до рівня героя: сервіс спершу шукає звичайних небосів у вікні `рівень героя - 2 ... рівень героя`, а якщо такого контенту ще бракує, бере найвищий доступний нижчий рівень замість випадкової дрібноти. Якщо монстр нижчий за героя більше ніж на 2 рівні, XP за перемогу стискається до `1`; золото й контрольований item roll поки лишаються за чинною малою reward formula.

Loss, flee і expired fights не отримують full victory reward. Repeated callback replay-ить persisted reward summary з `solo_combat_sessions` і не reroll-ить item.

Модифікатори LUCK не мають ламати таблицю. Наприклад, LUCK додає не «+10% epic», а маленький бонус до upgrade roll.

## Pity / захист від невдачі
Навіть у MVP варто вести lightweight pity counter:
- Якщо 20 пригод без rare, наступні 5 пригод мають підвищений шанс rare.
- Не гарантувати epic у ранньому MVP.

## Предмети
Кожен предмет має budget:
```text
item_power_budget = base_by_level + rarity_bonus
```

Не робити предмети з безкоштовними бонусами. Якщо предмет дає сильний ефект, він має нижчі стати або кулдаун.

`0.0.22` робить persistent equipment першим малим балансним важелем. Ефекти йдуть тільки з content metadata через один equipment/effective-stats helper: `/hero`, `/equipment`, item detail і persistent solo combat читають однаковий summary. Нова fight-сесія бере effective HP/ману на старті, а наступні ходи читають live equipment-aware combat stats без прихованого лікування чи refill-а. Поточний budget навмисно скромний:
- `item.pan-of-persuasion`: `weaponDamage +2`;
- `item.stamp-of-minor-authority`: `weaponDamage +1`, `intelligence +1`;
- `item.apron-of-foam-resistance`: `armor +1`, `hpMax +2`;
- `item.pot-helmet-of-early-access`: `armor +1`;
- `item.cork-ring-of-serious-business`: `luck +1`;
- `item.badge-of-thirteen-small-problems`: no power effect.

Junk, cosmetics, priceless trophies і quest badges не мають випадкових power effects. Якщо майбутній предмет має впливати на combat, його треба явно перевести в supported equippable content і покрити тестом.

`0.0.15` додає reachable starter gear для всіх видимих слотів: weapon через `/fight`, armor через Бочку Пінного Міражу, accessory через підвальну мишу. Це розширює контент і оцінну вартість манаток, але не додає бойових ефектів, sell/trade логіки або нових reward formulas.

Після `0.0.19` starter weapon не є гарантованою baseline для балансування: starter `/fight` закритий після 2 рівня, cellar errands існують на 2-3 рівнях, Hunt Board відкривається з 3 рівня, а gates живуть у `src/domain/progression/activityGates.ts`. Combat math має мати unarmed/basic fallback і не вимагати `item.pan-of-persuasion` або `item.stamp-of-minor-authority` для нормального першого бою.

`0.0.20` реалізує перший domain-only combat engine з цим fallback-ом. Поточні numbers навмисно прості: same-level ordinary fight має вкладатися приблизно в 2-5 ходів, skill damage витрачає ману там, де це доречно, flee завершує бій окремим статусом, а loss не означає reward win. До підключення persistent `/fight` ці формули не видають лут і не змінюють live HP/mana в БД.

`0.0.16` піднімає raid reward math: Бочка дає deterministic roll `18-26 XP` і `8-14 золота`, плюс фартух і детермінований дрібний trophy item. У `0.0.19` це замінено на duration-based reward: рівень 1 лишається в діапазоні `5-8` хвилин, кожен рівень після першого додає `30` секунд до можливого максимуму, а XP/золото лінійно рахуються від фактичної тривалості pending-рейду. На 1 рівні максимум лишається `26 XP` і `14 золота`; на 13 рівні поточний максимум стає `42 XP` і `26 золота`. Фактичні `rewardXp`/`rewardGold` записуються в claim, тому repeated callback не перекидає нагороду й не дублює прогрес. Reliability-частина лишається важливою: period bucket, audit break, pending completion, notification dedupe і beer gate мають лишатися ідемпотентними, без нових шансів на дубль нагороди або безкоштовне частування.

`0.0.16` також додає content bestiary і monster loot definitions як data contract. З `0.0.23` ці definitions уже можуть падати через контрольований persistent-fight loot engine, але це ще не широка економічна петля: немає продажу, обміну, crafting, consumable use або item-to-level sink.

Сумарна вартість манаток у `/inventory` і `/hero` — це valuation, не spendable gold. Вона не додається до `character.gold`, не дозволяє купити пиво й не має впливати на gates, доки не з’явиться окрема підтверджена sell/trade/sink дія.

Майбутня оплата пива манатками має бути окремим item sink, а не прихованим продажем. Орієнтовний корчмарський курс: `×5` до ціни пива, тобто selected priced items на `50+` золота можуть закрити простий раунд, `500+` — якісний. Guardrails:
- гравець сам обирає манатки й підтверджує списання;
- `безцінні`, екіпіровані, заблоковані або сюжетно важливі речі не приймаються;
- надлишок вартости не повертається автоматично, якщо UI прямо не пояснює інше;
- дія не має обходити raid gate для `🍻 Всім пива` і не має давати XP, рівень або бойову перевагу.

Рівневі, расові, класові або path-залежні обмеження не є безкоштовним дозволом робити предмети надто сильними. Вони можуть додати flavor, рідкість і причину для обміну між гравцями, але не мають створювати ситуацію, де один restricted rare item стає обов’язковим для нормального прогресу.

Предмет може випасти до потрібного рівня, але тоді це має бути очікування з ясним UI, а не пастка: показати потрібний рівень, кому річ пасує, і що її пізніше можна буде вдягнути, підлаштувати або передати іншому персонажу.

Більшість манаток має мати вартість, щоб лут був не лише колекцією дивних назв, а й економічним ресурсом. `Безцінні` речі мають бути винятком: сюжетні трофеї, жарти, документи або колекційні штуки, які не можна чесно перетворити на золото чи рівень.

Майбутня механіка «речі на рівень» має бути обережним gold/item sink у дусі Munchkin: якщо персонаж здає манаток на визначену суму, наприклад `1000 золота`, підозрілий тип надворі може оформити підняття рівня. Guardrails:
- тільки явне підтвердження, без автоматичного списання;
- не приймати безцінні або заблоковані речі;
- не дозволяти перескочити важливі progression gates, якщо вони ще не відкриті;
- тримати пороги достатньо високими, щоб це було веселим способом спалити зайве, а не основним шляхом прокачки.

## PvP guardrails
- No item loss.
- No gold steal у MVP.
- Match by level bracket.
- Soft cap на win streak rewards.
- Newbie protection до level 5 або перших 48 годин.
- Для `Бойового кутка` рахувати reward-bearing повтори за ordered або normalized character pair: не більше `3` XP-bearing бійок з тим самим персонажем за день.
- Per-character daily cap має обмежувати сумарний PvP XP, щоб duel loop не став кращим ґріндом за PvE.
- Weekly ranking не має бути raw win count: враховувати різних опонентів, win rate, capped score і abuse flags.
- Race/class edge дозволений і бажаний у тематичних бійках, але симуляції мають ловити крайнощі: воїн-орк може бути фаворитом у кулачній драці, проте бард такого самого рівня не має падати до майже нульового win rate.
- Daily/weekly нагороди для переможців мають бути переважно cosmetic/social: титул, запис на дошці, маленький bonus payout. Не давати чемпіону предмет або buff, який збільшує наступний PvP snowball.

## Combat simulation harness
Для локальної балансної перевірки запускай:
```bash
npm run simulate:combat -- -- --levels 1-13 --runs 1000
```

Це допоміжний інструмент для playtest-циклу, а не production-фіча і не доказ фінального балансу. Звіт варто читати разом із реальними `/fight` сесіями, поточними equipment effects і майбутнім loot progression.

## Anti-snowball
- Рейдові нагороди: участь + performance, але не winner-takes-all.
- Бонуси ґільдії: convenience/cosmetic/малий бонус, не x2 damage.
- Daily catch-up для гравців, що пропустили день.

## Симуляції
Для довших локальних прогонів:
```bash
npm run simulate:combat -- -- --levels 1-13 --runs 10000
```

Вивід:
- win rate за рівнем.
- average turns.
- damage taken.
- potion usage.
- class/race outliers.

## Балансні червоні прапорці
- Одна раса/клас має win rate на 15%+ вищий за середній.
- Бій триває 8+ ходів у середньому.
- Гравець помирає до того, як зрозумів UI.
- Rare item стає обов’язковим для проходження звичайного контенту.
- Gold накопичується без витрат.

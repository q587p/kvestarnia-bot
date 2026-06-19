# Balance Notes

## Балансова мета MVP
MVP має бути веселим, не ідеально збалансованим. Але він не має ламатися від першого power user.

Цілі:
- Бій на рівному рівні триває 2–5 ходів.
- Гравець перемагає звичайного монстра у 75–90% випадків.
- Поразка не карає жорстко.
- Level-up 1–5 швидкий, 6–13 помітно повільніший.
- Рідкісний лут приємний, але не обов’язковий для прогресу.

`0.1.0` закриває Phase 1 як playable first loop, не як фінальний баланс. Поточна крива 1-13, persistent HP/мана, loot replay, Mantok Chest, Манчкін-скупник і перший `/remort` достатні для playtest-у, але числові пороги, win-rate, reward pacing, item pressure і prestige pacing мають лишатися предметом окремих `0.1.x` balance PR після реального smoke/playtest fallout.

Phase 2 додає соціяльний бій та взаємодії до фінального балансу, тому перші runtime-slices мають покладатися на caps, audit rows and replay-safe results, not perfect formulas. Canonical notes: [phase2/UNSTABLE_BALANCE_PRINCIPLES.md](phase2/UNSTABLE_BALANCE_PRINCIPLES.md).

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

Після реморту другий прохід до 13 рівня не має бути таким самим швидким, як перший. Орієнтир із MUD-досвіду: кожне нове життя може піднімати XP-планку за рівень; у Квестарні flat `+200 XP` за рівень було б забагато, тому `0.1.2` використовує просту пропорційну добавку до total XP: `ceil(base_threshold * (1 + 0.23 * remort_count))`. Для першого реморту це дає `1599 total XP` до 13 рівня. Це runtime-правило першого prestige slice, а не фінальний баланс.

## Вага рівня
Рівень має бути одним із головних важелів, бо Квестарня також про приємний ріст циферок. Якщо персонаж отримав новий рівень, це має відчуватися не тільки в `/hero`, а й у формулах.

`0.1.16` залишає той самий бюджет stat points (`level - 1`), але замість одного primary-stat тунелю розподіляє їх deterministic weighted allocator-ом. Class profile лишається головним bias-ом, race stat bonus і hidden path fixed bonus тільки зміщують розподіл; вони не додають extra level points. HP росте на `+4`, мана на `+2` за gained level.

Наступний балансний прохід має перевірити:
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
- Бардівський виступ у `🍻 Шинку`: малий capped gold payout із cooldown-ом, якщо клас/перевірка й манатки це дозволяють.

Sinks:
- Repair після поразки.
- Reroll одного stat на предметі.
- Cosmetic title.
- Створення ґільдії.
- Їжа в `🍻 Шинку` з короткими бафами: золото витрачається на підготовку, а не на прямий shortcut до XP, луту або прогресії.

У MVP не давати гравцям багато gold без sinks.

### Їжа шинку і тимчасові бафи

Їжа має бути малою тактичною витратою, а не pay-to-win. Вона може давати:
- малий тимчасовий `hpMax` або shield на наступний бій;
- малий `manaMax`, часткове відновлення мани або швидшу out-of-combat mana recovery;
- короткий бонус до STR/DEX/INT/CHA/LUCK для одного fight/check;
- легкий regeneration/recovery modifier із чіткою тривалістю.

Guardrails:
- до пʼяти active food buffs одночасно; дублі того самого типу не stack-аються без окремого правила, а заміна/оновлення потребує явного підтвердження;
- effect magnitude має бути меншим за добру екіпіровану манатку того ж рівня;
- тривалість має бути обмежена: наступний бій, кілька ходів, одна перевірка або коротке вікно часу;
- HP/mana buff не має приховано refill-ити ресурси понад описаний ефект;
- їжа не дає XP, золото, loot roll, рівень або обхід activity gates;
- ціни мають бути відчутними, але не обовʼязковими для нормального `75-90%` win rate.

Кава у шинку може бути окремим risky cooldown modifier:
- до трьох горнят в одному циклі, тільки поки триває позитивна фаза;
- позитивна фаза приблизно `15-23` хвилини, залежить від `LUCK` і bounded RNG;
- одна/дві/три кави скорочують дозволені cooldown-и до `75%/60%/50%`;
- після цього rebound на `1/2/4` години подовжує cooldown-и до `150%/200%/400%`;
- під час rebound нову каву не продавати, а UI має пояснювати це як втому/кавову помсту, не як технічний lock.

Перші страви краще балансувати як `cheap/funny`, `standard/useful`, `expensive/situational`: дешеві дають малий ефект і добрий жарт, середні допомагають у звичайній сутичці, дорогі мають бути вибором перед складнішою справою, а не щоденним податком на гру.

### Бардівський виступ і золото

Виступ барда в шинку може бути малим gold source, але не основним методом заробітку:
- базовий payout нижчий за expected value звичайної перемоги в бою того ж рівня;
- `CHA` має бути головним модифікатором, `LUCK` — малим swing modifier;
- музична манатка може дати помітний bonus, але в межах cap-а;
- cooldown спершу daily за Києвом; hourly дозволяти тільки після симуляції й playtest-у;
- провал має давати `0` золота або символічну суму без XP;
- repeated callback replay-ить той самий результат і не reroll-ить виступ;
- bard-only specialization не має ставати обовʼязковим gold engine для прогресу інших класів.

Для музичних манаток потрібен окремий budget: universal інструмент дає менший performance bonus, bard-preferred або bard-only — більший, але без прямої бойової сили, якщо предмет не має окремого combat effect.

### Календарні бонуси

Неділі, свята й середові жаби можуть давати малі бонуси, але не мають міняти основну економіку:
- time basis завжди `Europe/Kyiv`;
- bonus до бардівського виступу, social action або recovery має бути меншим за різницю між поганим і добрим спорядженням;
- frog-themed Wednesday може піднімати flavor/weight для `frog`/`frogfolk` content, але не гарантувати rare/epic loot;
- святковий день може дати дешевший тост, кращий NPC mood або малий social bonus, але не безкоштовний рівень, великий XP або обхід fight gates;
- пропуск календарного дня не має відкидати гравця назад.

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

Поточний baseline persistent fight payout навмисно малий:
```text
XP:   clamp(3 + monster.level * 2, 5, 14)
gold: 0..character.level
item: максимум 1 controlled monsterLoot item
```

Для `Низ` passage-втручань `monster.level` у baseline XP формулі означає ефективний рівень після вибору проходу. Після `0.1.19` правий прохід спершу шукає доступного монстра на `3-5` рівнів нижче героя, а якщо такого контенту немає, падає до safe fallback/clamp. Easy/right XP рахується як `0.5x-0.75x` рівня героя з малим bounded LUCK bias до верхнього краю й округленням униз. Прямий прохід лишає baseline XP. Лівий прохід піднімає ризик і рахує XP як `1.25x-1.5x` рівня героя з тим самим bounded LUCK bias, але не нижче center-route baseline для того самого `baseMonsterLevel` плюс `1 XP`; floor не бере hard effective monster level, щоб низькорівневий монстр не платив як справді високорівневий тільки через проходову надбавку. Gold більше не стабільний за проходом або монстром для persistent fight wins: normal, Yeger і adventure fight sources ролять `0..character.level`, а fixed quest turn-ins лишають власні configured rewards. Якщо gold roll дорівнює `0`, item drop chance піднімається до `93%`; далі шанс лінійно повертається до configured max-gold chance: `getItemDropChance(luck) * passage.dropChanceMultiplier`, із фінальним cap у loot engine. Passage loot endpoints повернуті до старих modifiers: easy/right `dropChanceMultiplier=0.65`, `lootPowerOffset=-1`; normal `1`, `0`; hard/left `1.35`, `+1`. Антифарм XP для baseline/recovery перевіряє окремо збережений `baseMonsterLevel` до втручання: якщо базовий монстр уже був надто слабким для героя, лишаються старі стиснуті bands `3 XP` / `2 XP`; якщо розрив зʼявився тільки через легший правий прохід, це не farming.

`0.0.25` додає Loot Expansion v1 як широкий content-backed pool для persistent fight loot: `120` базових сімей манаток і `500` generated variants. Runtime зберігає тільки звичайні `item.*` ids, без нової міграції: базові pack ids перетворюються на `item.loot-v1-*`, а `+1...+5` мають level gates `3/6/10/14/18`. Affinity за класом, расою і титулом є м’якою вагою дропу, не hard-ban для випадіння. Hard requirements застосовуються тільки при екіпіруванні. `legendary` з pack поки мапиться у чинну `epic` rarity, бо поточна публічна item schema ще не має окремої легендарної категорії.

Hand-authored `monsterLoot` trophies still matter alongside the broad pool. The ordinary level `4-13` ladder now has at least one stable small trophy per monster, so specific higher-level problems can leave recognizable evidence without creating a full random loot table. In `0.0.26`, most of those handcrafted trophies also become modest supported equipment when they occupy weapon, armor, or accessory slots; only intentional keepsakes stay pure `junk`/`cosmetic`.

У `0.0.24` вибір монстра для persistent solo fight став ближчим до рівня героя: сервіс спершу шукає звичайних небосів у вікні `рівень героя - 2 ... рівень героя`, а якщо такого контенту ще бракує, бере найвищий доступний нижчий рівень замість випадкової дрібноти. `0.1.16` прибирає старе XP-стискання за різницю між героєм і монстром: baseline XP і broad loot profile дивляться на effective monster level. `0.1.19` відокремлює persistent fight gold у змінний `0..character.level` roll, дає side passages окремі character-level XP ranges, і тримає hard minimum привʼязаним до center baseline для того самого base monster, а не до hard effective level.

Loss отримує тільки малий consolation reward `1 XP` за спробу, без золота, луту або progress у Korchmar problem chain. Flee і expired fights не отримують reward. Repeated callback replay-ить persisted reward summary з `solo_combat_sessions` і не reroll-ить item. `0.1.6` додає stage chain `13 -> 23 -> 42 -> 93`; кожен новий етап рахує тільки звичайні won solo fights після часу видачі етапу, а training doppelganger не рахується.

Модифікатори LUCK не мають ламати таблицю. Наприклад, LUCK додає не «+10% epic», а маленький бонус до upgrade roll.

## HP/mana persistence and recovery
`0.0.25` робить HP і ману справжнім станом персонажа для persistent solo fights:
- current HP/mana зберігаються в `characters` і більше не відновлюються до максимуму при кожному `/fight` або `/hero`;
- новий старший бій стартує з поточного ресурсу після lazy out-of-combat regeneration;
- terminal fight state записує фактичні залишки HP/mana назад у персонажа й ставить нову точку відліку регенерації;
- якщо HP дорівнює 0, новий persistent fight не стартує, доки пасивне відновлення не поверне хоча б 1 HP;
- active fight не отримує природного відновлення між ходами.

Поточні повні цикли відновлення:
```text
HP:   base 10 хв, clamp 5-13 хв
mana: base 9 хв, clamp 4-13 хв
```

Class/race/title/stat modifiers змінюють саме час повного відновлення, а не максимуми й не бойові формули. STR прискорює HP recovery, INT прискорює mana recovery; класові й расові поправки лишаються малими та затиснутими clamp-ами. Це локальна attrition-система, не повний healing economy.

Не включено в цей slice: зілля, храмове лікування, платне лікування, resource-манатки, combat-time regeneration або штрафи смерті. Будь-який миттєвий heal/refill має бути окремою явною дією з idempotency boundary, а не прихованим побічним ефектом summary або equipment max changes.

## 0.0.26 Phase 1 recovery & balance polish
Після `0.0.25` smoke-прохід дивиться на ті самі 3, 4, 8 і 13 рівні, але вже з меншими монстрами-гігантами та яснішим повідомленням про відпочинок:
- same-level ordinary fights мають лишатися в районі `75-90%` win rate та `2-5` ходів;
- рівні 8 і 13 більше не повинні виглядати як помилка в математиці, де герой просто спостерігає за своєю поразкою;
- `/hero`, `needs-rest`, quest hub і terminal fight copy мають чітко пояснювати, що `HP 0` — це пауза, а не soft-lock;
- `npm run simulate:combat` і `npm run sample:loot` лишаються локальними smoke-інструментами, а не доказом фінального балансу.
- handcrafted monster trophies and generated utility loot should usually carry small supported effects when they are equippable, so item detail does not drown players in «бойового ефекту не виявлено» while fights require real gear.

Цей slice не додає potion economy, temple healing, combat-time regeneration або ручний chest selection. Він лише вирівнює відчуття після attrition/loot expansion, щоб наступні PR-и не працювали проти вже зламаного темпу.

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

Junk, cosmetics, priceless trophies і quest badges не мають випадкових power effects. Якщо предмет має впливати на combat, його треба явно перевести в supported equippable content і покрити тестом. Поточний content test вимагає `effect` для кожної `weapon`/`armor`/`accessory` манатки, щоб спорядження не виглядало як порожня обіцянка.

`0.0.15` додає reachable starter gear для всіх видимих слотів: weapon через `/fight`, armor через Бочку Пінного Міражу, accessory через льохову мишу. Це розширює контент і оцінну вартість манаток, але не додає бойових ефектів, sell/trade логіки або нових reward formulas.

Після `0.0.19` starter weapon не є гарантованою baseline для балансування: starter `/fight` закритий після 2 рівня, cellar errands існують на 2-3 рівнях, Hunt Board відкривається з 3 рівня, а gates живуть у `src/domain/progression/activityGates.ts`. Combat math має мати unarmed/basic fallback і не вимагати `item.pan-of-persuasion` або `item.stamp-of-minor-authority` для нормального першого бою.

Hunt Board лишається простим для входу: один контракт на годину і три дії. Після появи рівнів `4-13` дошка не повинна застрягати на старих рівнях `1-3`: вона обирає звичайних небосів поруч із рівнем героя (`рівень - 2 ... рівень`), а якщо persisted або fallback-контракт значно слабший, XP стискається до `1`. Це синхронізує `/hunt` із persistent solo fight selection без перетворення дошки на повний combat loop.

`0.0.20` реалізує перший domain-only combat engine з цим fallback-ом. Поточні numbers навмисно прості: same-level ordinary fight має вкладатися приблизно в 2-5 ходів, skill damage витрачає ману там, де це доречно, flee завершує бій окремим статусом, а loss не означає reward win. До підключення persistent `/fight` ці формули не видають лут і не змінюють live HP/mana в БД.

`0.0.16` піднімає raid reward math: Бочка дає deterministic roll `18-26 XP` і `8-14 золота`, плюс фартух і детермінований дрібний trophy item. У `0.0.19` це замінено на duration-based reward: рівень 1 лишається в діапазоні `5-8` хвилин, кожен рівень після першого додає `30` секунд до можливого максимуму, а XP/золото лінійно рахуються від фактичної тривалості pending-рейду. На 1 рівні максимум лишається `26 XP` і `14 золота`; на 13 рівні поточний максимум стає `42 XP` і `26 золота`. Фактичні `rewardXp`/`rewardGold` записуються в claim, тому repeated callback не перекидає нагороду й не дублює прогрес. Reliability-частина лишається важливою: period bucket, audit break, pending completion, notification dedupe і beer gate мають лишатися ідемпотентними, без нових шансів на дубль нагороди або безкоштовне частування.

`0.0.16` також додає content bestiary і monster loot definitions як data contract. З `0.0.23` ці definitions уже можуть падати через контрольований persistent-fight loot engine, але це ще не широка економічна петля: немає продажу, обміну, crafting або consumable use.

Сумарна вартість манаток у `/inventory` і `/hero` — це valuation, не spendable gold. Вона не додається до `character.gold`, не дозволяє купити пиво й не має впливати на gates, доки не з’явиться окрема підтверджена sell/trade/sink дія.

Майбутня оплата пива манатками має бути окремим item sink, а не прихованим продажем. Орієнтовний корчмарський курс: `×5` до ціни пива, тобто selected priced items на `50+` золота можуть закрити простий раунд, `500+` — якісний. Guardrails:
- гравець сам обирає манатки й підтверджує списання;
- `безцінні`, екіпіровані, заблоковані або сюжетно важливі речі не приймаються;
- надлишок вартости не повертається автоматично, якщо UI прямо не пояснює інше;
- дія не має обходити raid gate для `🍻 Всім пива` у шинку і не має давати XP, рівень або бойову перевагу.

Рівневі, расові, класові або path-залежні обмеження не є безкоштовним дозволом робити предмети надто сильними. Вони можуть додати flavor, рідкість і причину для обміну між гравцями, але не мають створювати ситуацію, де один restricted rare item стає обов’язковим для нормального прогресу.

Предмет може випасти до потрібного рівня, але тоді це має бути очікування з ясним UI, а не пастка: показати потрібний рівень, кому річ пасує, і що її пізніше можна буде вдягнути, підлаштувати або передати іншому персонажу.

Більшість манаток має мати вартість, щоб лут був не лише колекцією дивних назв, а й економічним ресурсом. `Безцінні` речі мають бути винятком: сюжетні трофеї, жарти, документи або колекційні штуки, які не можна чесно перетворити на золото чи рівень.

Механіка `🎒 Манчкін-скупник` уже існує як обережний item+gold sink у дусі Munchkin: якщо персонаж здає eligible манатки й докладає золото до визначеної суми `1000`, підозрілий тип надворі може оформити підняття рівня. Це не free-gold loop, не broad selling/trading system і не shortcut до `12 -> 13`. Guardrails:
- тільки явне підтвердження, без автоматичного списання;
- не приймати безцінні або заблоковані речі;
- не дозволяти gold-only: у кожному обміні має бути хоча б одна priced eligible манатка;
- не дозволяти перескочити важливі progression gates, якщо вони ще не відкриті;
- не дозволяти купити 13 рівень, бо поточний alpha-cap має братися боями;
- тримати пороги достатньо високими, щоб це було веселим способом спалити зайве, а не основним шляхом прокачки;
- repeated confirm має replay-ити audit row і не списувати речі/золото/рівень вдруге.

## Phase 2 PvP / duel guardrails
- No item loss.
- No gold steal у MVP.
- No wagers in the first duel slice.
- Consent first: target accepts explicitly, decline/expiry is safe and non-punitive.
- Match by level bracket.
- Soft cap на win streak rewards.
- Newbie protection до level 5 або перших 48 годин.
- Для `Бойового кутка` рахувати reward-bearing повтори за ordered або normalized character pair: не більше `3` XP-bearing бійок з тим самим персонажем за день.
- Per-character daily cap має обмежувати сумарний PvP XP, щоб duel loop не став кращим ґріндом за PvE.
- Weekly ranking не має бути raw win count: враховувати різних опонентів, win rate, capped score і abuse flags.
- Race/class edge дозволений і бажаний у тематичних бійках, але симуляції мають ловити крайнощі: воїн-орк може бути фаворитом у кулачній драці, проте бард такого самого рівня не має падати до майже нульового win rate.
- Daily/weekly нагороди для переможців мають бути переважно cosmetic/social: титул, запис на дошці, маленький bonus payout. Не давати чемпіону предмет або buff, який збільшує наступний PvP snowball.

### `0.1.17` instant duel normalization

`⚡ Миттєва дуель` stays rewardless and quick-resolve, but its hidden math no longer lets raw level/remort gaps decide almost every result.

The instant resolver prepares both duelists through `instant-duel-v2`:
- compute a canonical progression budget from level-derived HP max, mana max and the full distributed stat-growth vector used by `buildLevelGrowthBonus(...)`;
- add deterministic remort-memory budget through the canonical `buildRemortMemoryBonus(...)` helper and the level-13 growth budget;
- choose the stronger canonical progression tier as the target;
- prepare each participant at that common target tier with that participant's own class/race/path growth profile, then add only the missing HP max, mana max and per-stat deltas;
- preserve current HP/mana ratios when temporary maxima rise;
- keep real level/remort values for display and flavor;
- keep race, class, title, path, starter distribution, equipped item ids and all equipment/manatka effects personal;
- remove the old raw `level * 10` score term and use equalized prepared progression contribution instead.

Historic cross-class remort memory is not fully reconstructable from the current character row after remort. For instant-duel normalization, remort budget therefore uses the current character's class/race/path growth profile as a deterministic anti-snowball approximation. This is intentionally conservative: it prevents remort count from leaking back through non-primary stats without pretending to recover every previous-life identity exactly.

Current resources matter only through a bounded readiness penalty after sync and normalization:

```text
hpMissingRatio = 1 - hpCurrent / hpMax
manaMissingRatio = manaMax <= 0 ? 0 : 1 - manaCurrent / manaMax
readinessPenalty = round(clamp(0, 12, hpMissingRatio * 8 + manaMissingRatio * 4))
```

Full resources produce zero penalty. HP matters more than mana. The cap keeps tired acceptance disadvantageous but not an automatic loss. Telegram/player-facing copy must stay qualitative and must not print this formula or exact percentages.

### `0.1.18` turn-based duel resources and combat math

`♟️ Покрокова дуель` reuses the same progression-only preparation helper as instant duels, then freezes both accepted participant snapshots into the session. Unlike quick duels, completed turn-based duels grant a tiny XP-only reward because they consume real turn time.

Balance rules:
- race, class, title, path, current build, equipped manatky and equipment effects remain personal;
- temporary progression normalization may raise session maxima while preserving the accepted HP/mana ratios;
- duel HP/mana inside `duel_combat_sessions.state_json` are ephemeral and must not damage, heal or refill persistent character resources;
- participant choices are hidden until both players choose or the timer fills missing choices, so HP/mana spending is applied at round reveal rather than at the first button press;
- the turn-based resolver uses the same `resolveActorCombatAction(...)` primitive as PvE, so basic attack, class skill, mana cost, cooldown, armor/resist, weapon/spell/stat effects and HP clamping do not fork into a duel-only formula set;
- PvP damage uses the normalized effective combat level from the duel progression tier, while visible level/remort in cards stays real;
- class skills with incoming-damage mitigation apply that mitigation to the opponent's damage in the same hidden reveal round, independent of Telegram button order;
- timeout auto-actions are ordinary basic attacks for missing choices, not a separate penalty damage table;
- max-turn safety resolves as a deterministic draw instead of creating an infinite session.
- terminal XP is stored in `result_json` and granted exactly once by the terminal transaction: loss `1 XP`, draw `2-5 XP`, win `4-8 XP`, with a small bounded LUCK chance to nudge within the range;
- same-location targeted invites from `👀 Хто поруч` only change invitation routing; they do not add gold/item rewards, rating, wager or combat-power modifiers.

Player-facing copy may say that the Корчмар keeps the fight moving, but must not print hidden hit/critical/cooldown formulas or exact chances.

## Phase 2 trading/gifting guardrails
- Gift/trade is not a gold source.
- First slice transfers one eligible item unit or one narrow item-for-item offer.
- Gold transfer, if added after nearby player selection, needs a separate cap/audit/idempotency design and must not become a faucet or level-barter bypass.
- Equipped, protected, priceless, story, apology and already-pending items are not eligible.
- No auction house, market pricing or gold add-ons until transfer audit/idempotency is proven.
- Trading should help players move unsuitable манатки, not bypass progression, level gates or anti-abuse rules.

## Remort guardrails
`0.1.2` додає перший `/remort` runtime slice:
- `/remort` is explicit and unavailable below level 13.
- It is not `/restart`: reset/preserve rules must be visible before confirmation and covered by tests.
- First remort slice preserves memory and up to 5 selected owned manatky, including powerful or sentimental ones. If this bends balance too much, fix it with explicit tags, level gates, attunement or remort-only rules rather than silent deletion.
- Remort preserves one unit per selected item id in this MVP. Unknown/archived item ids may be selectable with a fallback label, but they must not be carried invisibly outside the 5-item promise.
- Legacy bonus uses `ceil(previous_level_growth_bonus * 0.23 * remort_number)` for HP, mana and each stat that previous distributed level growth raised. It is visible as `Памʼять минулих пригод`, not a public `x/5` cap; if it snowballs, tune through explicit gates/tags/attunement.
- No paid remort, hidden wipe, automatic prestige, 14+ levels or remort-only power track in this slice.

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

# Achievements Catalog

This is the reference catalog for shipped and planned Kvestarnia achievements. Keep it in sync with `src/content/achievements.ts` whenever adding player-facing functionality or achievement definitions.

Runtime rules:
- Achievements are rewardless records and future cosmetic-title provenance only.
- They must not grant XP, gold, items, stats, loot odds, combat power, quest progress, donor perks or paid advantage.
- Hidden achievements may appear here for development clarity, but locked player-facing UI must not leak their condition.
- Disabled future definitions are not shown to players and do not count in visible completion totals unless a character already has an older stored row for that id.
- New player-facing mechanics should add matching achievements/hooks for visible actions, milestones or odd outcomes, or explicitly document why no durable event exists yet.
- If a condition cannot be historically recalculated, add a durable event ledger before adding long-term counters.
- `0.2.13` Postal Manatka Delivery intentionally defers postal-specific achievements. It stores durable `item_transfers` rows with `transfer_kind = postal`, but the current achievement trigger catalog has gift-specific keys only; first postal sent/received records should be added in a later slice with explicit postal trigger keys instead of overloading gift counters.

Current count: 147 enabled achievements and 12 disabled hidden future placeholders.

## Runtime Hook Timing

Immediate unlock hooks currently run from successful action boundaries that already emit achievement events: character creation, opening the achievement list, opening the latest-events feed, level/item/equipment events, item crafting and use, committed Mantok gear actions, combat reward paths, problem-chain turn-in and local dev level/item grants. These can notify the player at action time when a definition is newly earned.

Manual recalculation through `🔎 Перевірити` remains the broader idempotent backfill path for durable ledger rows and older characters: current identity, identities selected during stored remorts, remort, starter/cellar/Yeger/adventure daily rows, training/Doppleganger, duels, Barrel, Shynok beer rounds, daily Korchma rounds, tavern table games, gifts, sales, drinks, passage search, hunt contracts, special stored fight outcomes and similar rows proven from persisted state. These rows may appear only after the manual check unless the current runtime flow also emits a direct event. The very first pre-remort identity can only be recovered if it is still the current identity or a future durable snapshot exists; old rows before that snapshot are not guessed.

## Current Catalog

| ID | Status | Visibility | Trigger | Player-facing title | Full description |
| --- | --- | --- | --- | --- | --- |
| `achievement.character.created` | enabled | visible | `character.created` | Де тут вихід? | створити пригодника й офіційно стати проблемою Корчмаря. |
| `achievement.journey.achievements-opened` | enabled | visible | `achievement.list.opened` | Ачівка за ачівки | уперше відкрити список ачівок і дати літописцю привід поправити окуляри. |
| `achievement.journey.latest-events-opened` | enabled | visible | `latest-events.opened` | Хроніка відкрила око | уперше відкрити Хроніки Квестарні й переконатися, що корчемні події самі себе не перепишуть. |
| `achievement.journey.cosmetic-title-selected` | enabled | visible | `cosmetic-title.selected` | Табличка тримається | уперше вдягнути косметичний титул і не отримати за це жодної бойової переваги. |
| `achievement.race.human-ish` | enabled | visible | `character.created race.human-ish` | Анкета витримала людисько | стати людиськом і довести, що практичність теж може бути підозрілою. |
| `achievement.race.dwarf` | enabled | visible | `character.created race.dwarf` | Полиця програла гному | стати гномом і не дати високим полицям виграти морально. |
| `achievement.race.elf` | enabled | visible | `character.created race.elf` | Образа лягла влучно | стати ельфом і подивитися на чоботи світу з належною драмою. |
| `achievement.race.bisyny` | enabled | visible | `character.created race.bisyny` | Словник знову під замком | стати бісинами й лишити корчмарські словники у стані самооборони. |
| `achievement.race.drantohor` | enabled | visible | `character.created race.drantohor` | Межа підписала заднім числом | стати дрантогором і зробити вигляд, що маршрут був погоджений. |
| `achievement.race.domovyk` | enabled | visible | `character.created race.domovyk` | За піччю теж є карʼєра | стати домовиком і змусити пил поводитися обережніше. |
| `achievement.race.dryland-rusalka` | enabled | visible | `character.created race.dryland-rusalka` | Чайник під наглядом | стати сухопутною русалкою й тримати чайники у ввічливій напрузі. |
| `achievement.race.intellectual-orc` | enabled | visible | `character.created race.intellectual-orc` | Рецензія прилетіла обличчям | стати орком-інтелігентом і мати аргументи з помітною вагою. |
| `achievement.race.molfar-soul` | enabled | visible | `character.created race.molfar-soul` | Оберіг знайшов запасний оберіг | стати мольфарською душею й носити туман так, ніби це документ. |
| `achievement.class.warrior` | enabled | visible | `character.created class.warrior` | План стояв рівно | стати воїном і переконливо пояснити світу залізом. |
| `achievement.class.mage` | enabled | visible | `character.created class.mage` | У кімнаті стало складніше | стати магом і сказати слово, після якого меблі нервово теплішають. |
| `achievement.class.bard` | enabled | visible | `character.created class.bard` | Куплет подав заявку | стати бардом і принести в бій небезпечно впевнений приспів. |
| `achievement.class.rogue` | enabled | visible | `character.created class.rogue` | Рахунок зник першим | стати злодієм і лишити таверну з питаннями до бухгалтерії. |
| `achievement.class.priest` | enabled | visible | `character.created class.priest` | Суворий погляд лікує | стати жерцем і подивитися на нежить так, щоб вона переглянула плани. |
| `achievement.class.varenyk-mancer` | enabled | visible | `character.created class.varenyk-mancer` | Начинка бачить майбутнє | стати вареник-мантом і дати тісту службові повноваження. |
| `achievement.class.bureaucramancer` | enabled | visible | `character.created class.bureaucramancer` | Форма 13-А зітхнула | стати бюрокромантом і налякати хаос правильною печаткою. |
| `achievement.class.ranger` | enabled | visible | `character.created class.ranger` | Слід підписав квитанцію | стати єгерем і знати, де ховається остання стріла. |
| `achievement.class.kharakternyk` | enabled | visible | `character.created class.kharakternyk` | Проблема відвела очі | стати козаком-характерником і дивитися на халепу до її капітуляції. |
| `achievement.level.2` | enabled | visible | `level.reached >= 2` | Табурет навчився хитатися | досягти 2 рівня й зрозуміти, що табурет під вами теж має амбіції. |
| `achievement.level.3` | enabled | visible | `level.reached >= 3` | Перший поверх амбіцій | досягти 3 рівня, де справи вже починають дивитися у відповідь. |
| `achievement.level.5` | enabled | visible | `level.reached >= 5` | Палиця вже не випадкова | досягти 5 рівня й виглядати так, ніби це був план. |
| `achievement.level.8` | enabled | visible | `level.reached >= 8` | Корчмар памʼятає обличчя | досягти 8 рівня й стати обличчям, яке Корчмар уже не плутає з рахунком. |
| `achievement.level.10` | enabled | visible | `level.reached >= 10` | Десять рівнів і жодної підозри | досягти 10 рівня так, ніби Корчмар не веде окрему теку. |
| `achievement.level.13` | enabled | visible | `level.reached >= 13` | Тринадцятий пункт інструкції | досягти 13 рівня й не читати дрібний шрифт уголос. |
| `achievement.remort.first` | enabled | visible | `remort.completed >= 1` | Знову з першої, але з претензією | завершити перший реморт і повернутися з досвідом, який підозріло світиться. |
| `achievement.level.23` | disabled | hidden | `future` | Двадцять три причини не питати | досягти 23 рівня й дати літописцю новий привід нервово рахувати. |
| `achievement.combat.first-win` | enabled | visible | `combat.finished won excluding monster.mimic-shawarma >= 1` | Бойове хрещення в калюжі | виграти бій з монстром і не питати, чия це була калюжа. |
| `achievement.combat.three-wins` | enabled | visible | `combat.finished won >= 3` | Три монстри не погодили протокол | виграти 3 бої з монстрами й лишити протокол у стані легкої образи. |
| `achievement.combat.thirteen-wins` | enabled | visible | `combat.finished won >= 13` | Тринадцять разів не впав | виграти 13 боїв з монстрами й підписати підлозі акт про ненапад. |
| `achievement.combat.persistent-win-23` | enabled | visible | `combat.persistent.finished won >= 23` | Двадцять три аргументи | перемогти у 23 старших боях і залишити Низ без переконливого протоколу. |
| `achievement.combat.persistent-win-42` | enabled | visible | `combat.persistent.finished won >= 42` | Відповідь: бити обережніше | перемогти у 42 старших боях і не сперечатися з відповіддю Корчмаря. |
| `achievement.combat.persistent-win-93` | enabled | visible | `combat.persistent.finished won >= 93` | Девʼяносто три свідки мовчать | перемогти у 93 старших боях і змусити свідків Низу нервово мовчати. |
| `achievement.combat.first-loss` | enabled | visible | `combat.finished lost >= 1` | Горизонтальний досвід | програти бій і зробити вигляд, що це була розвідка підлоги. |
| `achievement.combat.three-losses` | enabled | visible | `combat.finished lost >= 3` | Підлога впізнає кроки | програти 3 бої й отримати від підлоги мовчазне «знову ви». |
| `achievement.combat.first-flee` | enabled | visible | `combat.finished fled >= 1` | Тактичний відступ із поясненнями | утекти з бою й назвати це перевіркою запасних дверей. |
| `achievement.quest.first-problem` | enabled | visible | `problem.quest.completed` | Перший пергамент не зʼїв | здати першу корчмарську проблему й лишити папірець придатним для архіву. |
| `achievement.quest.problem-chain.23` | enabled | visible | `problem.quest.completed >= 2` | Двадцять три підозрілі підписи | закрити другу теку корчмарських проблем і не загубити підпис між плямами. |
| `achievement.quest.problem-chain.42` | enabled | visible | `problem.quest.completed >= 3` | Сорок дві причини для печатки | закрити третю теку корчмарських проблем і змусити печатку задуматися. |
| `achievement.quest.first-korchma` | enabled | visible | `quest.first-korchma.completed >= 1` | Стіл таки існує | зайти до Корчми й дійти до Столу зі справами, не вимагаючи карту на серветці. |
| `achievement.quest.mimic-shawarma` | enabled | visible | `starter.mimic-shawarma.completed >= 1` | Шаурма мала зуби | завершити першу справу з міміком-шаурмою й не довіряти обіду з очима. |
| `achievement.quest.cellar-mouse` | enabled | visible | `cellar.mouse.completed >= 1` | Мишача дипломатія | завершити льохову справу з мишею й лишити сирні аргументи в архіві. |
| `achievement.quest.barrel-beer-tutorial` | enabled | visible | `quest.barrel-beer-tutorial.completed >= 1` | Туди, звідти і з кухлем | завершити першу бочкову справу з пивом і повернутися до столу, доки піна ще має юридичну силу. |
| `achievement.quest.daily-korchma-round` | enabled | visible | `daily.korchma-round.completed >= 1` | Дві катастрофи — це вже порядок | закрити перший Корчмарський обхід і лишити третю дрібницю на офіційне «не сьогодні». |
| `achievement.quest.daily-korchma-round.seven` | enabled | visible | `daily.korchma-round.completed >= 7` | Тиждень дрібниць підписано | закрити 7 Корчмарських обходів і навчити дощечку впізнавати ваш почерк. |
| `achievement.quest.daily-korchma-round.thirteen` | enabled | visible | `daily.korchma-round.completed >= 13` | Тринадцять ревізій без паніки | закрити 13 Корчмарських обходів і лишити здоровий глузд у стані контрольованої образи. |
| `achievement.quest.problem-chain.93` | enabled | visible | `problem.quest.completed >= 4` | Девʼяносто три волі до проблем | завершити весь корчмарський ланцюжок проблем і не сперечатися з останньою текою. |
| `achievement.quest.yeger-first` | enabled | visible | `yeger.trial.completed >= 1` | Єгер кивнув. Це майже овація | завершити перше випробування Єгеря й побачити кивок майже урочистого масштабу. |
| `achievement.quest.strong-success` | enabled | visible | `adventure.choice.strong-success >= 1` | План спрацював. Підозріло | отримати сильний успіх у корчемній справі й поводитися так, ніби все було заплановано. |
| `achievement.combat.starter-probe` | enabled | visible | `starter.mimic-shawarma.probe.completed >= 1` | Бойове хрещення в соусі | завершити навчальну сутичку з міміком-шаурмою й відмити соус із висновків. |
| `achievement.item.first-received` | enabled | visible | `item.received` | Манатка дивиться першою | отримати першу манатку й чемно не питати, звідки вона дивиться. |
| `achievement.item.three-owned` | enabled | visible | `item.received >= 3` | Три манатки вже радяться | мати 3 манатки в торбі, поки вони ще не створили комітет. |
| `achievement.item.thirteen-owned` | enabled | visible | `item.received >= 13` | Тринадцять одиниць сумніву | мати 13 манаток у торбі й не питати, чому торба важчає морально. |
| `achievement.bandage.first-owned` | enabled | visible | `item.received item.responsible-panic-bandage >= 1` | Бинт дивиться відповідально | мати перший Бинт відповідальної паніки й не питати, чи він теж нервує. |
| `achievement.bandage.ninety-three-owned` | enabled | visible | `item.received item.responsible-panic-bandage >= 93` | Девʼяносто три причини не кровити | мати 93 Бинти відповідальної паніки й виглядати як склад невеликої надії. |
| `achievement.bandage.first-used` | enabled | visible | `item.used item.responsible-panic-bandage >= 1` | Паніка спрацювала за призначенням | уперше використати Бинт відповідальної паніки й не сперечатися з медициною. |
| `achievement.bandage.four-used` | enabled | visible | `item.used item.responsible-panic-bandage >= 4` | Чотири вузли самозбереження | використати 4 Бинти відповідальної паніки й виглядати майже професійно. |
| `achievement.bandage.ninety-three-used` | enabled | visible | `item.used item.responsible-panic-bandage >= 93` | Девʼяносто три рази не сьогодні | використати 93 Бинти відповідальної паніки й змусити біль заповнити форму. |
| `achievement.bandage.dense-crafted` | enabled | visible | `item.crafted item.dense-bandage >= 1` | Бинт набрався серйозности | уперше створити Щільний бинт і не назвати це ремеслом із паніки. |
| `achievement.bandage.dense-used` | enabled | visible | `item.used item.dense-bandage >= 1` | Вузол тримався до кінця | уперше використати Щільний бинт у бою й дати рані коротку службову відпустку. |
| `achievement.bandage.field-kit-crafted` | enabled | visible | `item.crafted item.field-kit >= 1` | Аптечка визнала поле | уперше створити Польову аптечку й переконати бинти працювати командою. |
| `achievement.bandage.field-kit-used` | enabled | visible | `item.used item.field-kit >= 1` | Польова медицина без поля | уперше використати Польову аптечку в бою й не питати, де тут медична комісія. |
| `achievement.yeger.free-bandage.first` | enabled | visible | `yeger.free-bandage.claimed >= 1` | Єгер дав бинт і не моргнув | уперше отримати безкоштовний медичний запас як єгер. |
| `achievement.equipment.first-equipped` | enabled | visible | `equipment.item_equipped` | На мені це виглядає службово | вдягнути першу манатку й почути, як гачок нервово погодився. |
| `achievement.equipment.three-equipped` | enabled | visible | `equipment.item_equipped >= 3` | Образ уже має інвентарний номер | вдягнути 3 манатки й виглядати як службова перевірка пригод. |
| `achievement.equipment.all-slots-equipped` | enabled | visible | `equipment.item_equipped current slots >= 7` | Усі гачки при справі | вдягнути манатки в усі підготовлені слоти й зробити вигляд, що це не шафа, а бойова концепція. |
| `achievement.equipment.ninety-three-equipped-total` | enabled | hidden | `equipment.item_equipped cumulative >= 93` | Девʼяносто три примірки без протоколу | сумарно екіпірувати 93 манатки й довести, що гачки теж можуть вигоріти. |
| `achievement.mantok.gear-action.first` | enabled | visible | `mantok.gear-action.used >= 1` | Манатка натиснула кнопку | уперше застосувати бойову дію з манатки й дати спорядженню привід пишатися. |
| `achievement.item-upgrade.first-success` | enabled | visible | `item-upgrade.succeeded >= 1` | Молот сказав «дзень» | уперше успішно підсилити манатку в Чароковальні. |
| `achievement.item-upgrade.first-failure` | enabled | visible | `item-upgrade.failed >= 1` | Іскра має власну думку | уперше пережити невдалу спробу підсилення без втрати гідности в журналі. |
| `achievement.item-upgrade.level-five` | enabled | visible | `item-upgrade.level-5 >= 1` | Пʼять плюсів і жодної скромности | довести манатку до +5 і дати молоту маленьку відпустку. |
| `achievement.iskrokamin.first-owned` | enabled | visible | `item.received(item.iskrokamin) >= 1` | Іскра попросила кишеню | уперше отримати Іскрокамінь. |
| `achievement.item.twenty-three-owned` | enabled | visible | `item.received >= 23` | Торба відкрила малий архів | мати 23 манатки в торбі й почути, як ремінь просить профспілку. |
| `achievement.item.forty-two-owned` | enabled | visible | `item.received >= 42` | Сорок дві манатки відповіли | мати 42 манатки в торбі й не питати, на яке саме питання вони відповіли. |
| `achievement.item.ninety-three-owned` | enabled | visible | `item.received >= 93` | Девʼяносто три докази торби | мати 93 манатки в торбі й виглядати як пересувний склад пригод. |
| `achievement.mantok.chest.first` | enabled | visible | `mantok.chest.completed >= 1` | Скриня зробила вигляд, що так і треба | уперше завершити переробку манаток у скрині. |
| `achievement.mantok.chest.thirteen` | enabled | visible | `mantok.chest.completed >= 13` | Скриня просить журнал техогляду | завершити 13 переробок манаток і лишити скриню з робочою підозрою. |
| `achievement.mantok.sale.first` | enabled | visible | `mantok.sale.completed >= 1` | Манчкін-скупник кивнув | уперше продати манатку й не дивитися занадто довго на гаманець. |
| `achievement.mantok.sale.thirteen` | enabled | visible | `mantok.sale.completed >= 13` | Скупник уже впізнає кроки | продати манатки 13 разів і стати знайомим пунктом у нічному обліку. |
| `achievement.level.barter.first` | enabled | visible | `level.barter.completed >= 1` | Манчкін прийняв рівневу заявку | уперше скористатися обміном Манчкіна й зробити вигляд, що це не магія бухгалтерії. |
| `achievement.level.barter.three` | enabled | visible | `level.barter.completed >= 3` | Три рівневі квитанції | тричі скористатися обміном Манчкіна й не сперечатися з дрібним шрифтом. |
| `achievement.bard.performance.first` | enabled | visible | `bard.performance.completed >= 1` | Куплет вийшов на люди | уперше виступити як бард і змусити Шинок перевірити акустику. |
| `achievement.bard.performance.thirteen` | enabled | visible | `bard.performance.completed >= 13` | Тринадцять куплетів свідчать | виступити як бард 13 разів і лишити Шинок у стані культурної обережности. |
| `achievement.priest.heal.first` | enabled | visible | `priest.heal.completed >= 1` | Мана замість бинта | уперше полікувати жерцем поза боєм і не витратити жодного бинта на бюрократію. |
| `achievement.priest.blessing.first` | enabled | visible | `priest.blessing.completed >= 1` | Печатка суворої турботи | уперше благословити когось жерцем так, щоб навіть пил став чемнішим. |
| `achievement.rogue.pickpocket.first` | enabled | visible | `rogue.pickpocket.attempted >= 1` | Кишеня не підписувала згоду | уперше спробувати тиху кишеню як злодій і лишити протоколу дивні питання. |
| `achievement.varenyk.sated.self-first` | enabled | visible | `varenyk.sated.self >= 1` | Сам собі гостина | уперше нагодувати себе варениками й не вимагати окремого рахунку. |
| `achievement.varenyk.sated.other-first` | enabled | visible | `varenyk.sated.other >= 1` | Миска дипломатії | уперше нагодувати іншого пригодника й довести, що підтримка буває з тістом. |
| `achievement.rogue.pickpocket.success` | enabled | visible | `rogue.pickpocket.success >= 1` | Монета змінила філософію | уперше успішно обчистити кишеню так тихо, що золото саме переглянуло біографію. |
| `achievement.rogue.pickpocket.caught` | enabled | visible | `rogue.pickpocket.caught >= 1` | Лікоть мав аргументи | уперше провалити тиху кишеню так голосно, що HP попросило прилягти. |
| `achievement.training.doppelganger.first` | enabled | visible | `training.doppelganger.finished >= 1` | Дзеркало вдарило першим | уперше завершити тренування з Допельґанґером і не підписувати протокол споріднености. |
| `achievement.social.training-win-1` | enabled | visible | `training.doppelganger.won >= 1` | Сам собі суперник | перемогти Сумлінного Допельґанґера й не звинувачувати дзеркало в упередженості. |
| `achievement.training.doppelganger.thirteen` | enabled | visible | `training.doppelganger.finished >= 13` | Допельґанґер просить відпустку | завершити 13 тренувань із Допельґанґером і лишити дзеркало втомленим. |
| `achievement.social.training-win-13` | enabled | visible | `training.doppelganger.won >= 13` | Допельґанґер просить вихідний | перемогти Сумлінного Допельґанґера 13 разів і дати дзеркалу привід на заяву. |
| `achievement.duel.quick.first` | enabled | visible | `duel.quick.resolved >= 1` | Миттєва дуель не встигла моргнути | уперше завершити миттєву дуель і зберегти обличчя в будь-якому стані. |
| `achievement.social.duel-resolved` | enabled | visible | `duel.resolved >= 1` | Добровільна незручність | завершити перший двобій з іншим пригодником і зберегти корчемну ввічливість. |
| `achievement.social.duel-win` | enabled | visible | `duel.won >= 1` | Переміг знайомого, дружба триває | виграти перший двобій і не оголошувати себе меблям чемпіоном. |
| `achievement.duel.quick.thirteen` | enabled | visible | `duel.quick.resolved >= 13` | Тринадцять швидких непорозумінь | завершити 13 миттєвих дуелей і навчити рукавичку літати по графіку. |
| `achievement.duel.turnbased.first` | enabled | visible | `duel.turnbased.resolved >= 1` | Хід подумав і погодився | уперше завершити покрокову дуель і пережити офіційне очікування. |
| `achievement.social.duel-defend` | enabled | visible | `duel.turnbased.defend >= 1` | Не бити — теж хід | уперше захиститися у покроковому двобої й зробити паузу офіційною. |
| `achievement.duel.turnbased.three` | enabled | visible | `duel.turnbased.resolved >= 3` | Три ходи в чужу впевненість | завершити 3 покрокові дуелі й не загубити чергу в кишені. |
| `achievement.barrel.raid.first` | enabled | visible | `barrel.raid.claimed >= 1` | Бочка видала перший акт | уперше отримати результат Бочки й не питати, хто там веде облік. |
| `achievement.barrel.raid.thirteen` | enabled | visible | `barrel.raid.claimed >= 13` | Бочка вже вітається | отримати 13 результатів Бочки й не сперечатися з пінним архівом. |
| `achievement.barrel.raid.first-loss` | enabled | visible | `barrel.raid.lost >= 1` | Бочка внесла правки | уперше програти Старшому Братові Бочки й отримати від Корчмаря позначку «пінна розвідка». |
| `achievement.barrel.raid.bandage-used` | enabled | visible | `barrel.raid.bandage-used >= 1` | Бочка дозволила медицину | уперше використати медичну манатку проти Старшого Брата Бочки й не отримати письмової заборони. |
| `achievement.warrior.raid-taunt.activated` | enabled | visible | `warrior.raid-taunt.activated >= 1` | Увага Бочки | уперше гукнути Старшому Братові Бочки «На мене!» й переконати його не сперечатися. |
| `achievement.korchma.round.first` | enabled | visible | `korchma.round.purchased >= 1` | Перший кухоль за компанію | уперше проставити пиво й лишити на столі соціяльний слід. |
| `achievement.korchma.round.thirteen` | enabled | visible | `korchma.round.purchased >= 13` | Тринадцять кухлів дипломатії | проставити пиво 13 разів і стати окремим пунктом корчемної ввічливости. |
| `achievement.tavern.game.first` | enabled | visible | `tavern.game.played >= 1` | Перший стіл витримав | уперше завершити гру за столом у Шинку й не отримати нічого, крім запису та погляду Корчмаря. |
| `achievement.tavern.game.win.first` | enabled | visible | `tavern.game.won >= 1` | Стіл визнав переможця | уперше виграти гру за столом і поводитися так, ніби фішки самі все підтвердять. |
| `achievement.tavern.game.win.three` | enabled | visible | `tavern.game.won >= 3` | Три партії глянули прихильно | виграти 3 гри за столом і не називати це законом природи при свідках. |
| `achievement.tavern.game.win.thirteen` | enabled | visible | `tavern.game.won >= 13` | Тринадцять столів аплодували ніжками | виграти 13 ігор за столом і лишити шинковій статистиці нервову усмішку. |
| `achievement.tavern.game.loss.first` | enabled | visible | `tavern.game.lost >= 1` | Стілець підтримав морально | уперше програти гру за столом і зберегти гідність у приблизно вертикальному стані. |
| `achievement.tavern.game.loss.three` | enabled | visible | `tavern.game.lost >= 3` | Три поразки без сварки з меблями | програти 3 гри за столом і не подати офіційну скаргу на кості, фішки чи атмосферу. |
| `achievement.tavern.game.draw.first` | enabled | visible | `tavern.game.drawn >= 1` | Нічия вмостилася посередині | уперше завершити гру за столом нічиєю й дати банку привід повернутися додому. |
| `achievement.tavern.game.loss.thirteen` | enabled | visible | `tavern.game.lost >= 13` | Тринадцять разів красиво не вийшло | програти 13 ігор за столом і лишитися людиною, якій Корчмар усе ще дає стілець. |
| `achievement.item.gift.sent.first` | enabled | visible | `item.gift.sent >= 1` | Манатка пішла в люди | уперше подарувати манатку іншому пригоднику й не вимагати драматичного листа подяки. |
| `achievement.item.gift.sent.thirteen` | enabled | visible | `item.gift.sent >= 13` | Дарувальник із журналом | подарувати манатки 13 разів і змусити щедрість вести облік. |
| `achievement.item.gift.received.first` | enabled | visible | `item.gift.received >= 1` | Подарунок має інвентарний голос | уперше прийняти подаровану манатку й не питати, що вона про вас знає. |
| `achievement.shynok.drink.first` | enabled | visible | `shynok.drink.activated >= 1` | Перший напій погодився всередину | уперше випити напій у Шинку й дати організму офіційний привід здивуватися. |
| `achievement.shynok.drink.four` | enabled | visible | `shynok.drink.activated >= 4` | Чотири напої вже мають думку | випити 4 шинкові напої й лишити стільцю право на занепокоєння. |
| `achievement.passage.search.first` | enabled | visible | `passage.search.completed >= 1` | Пил дав перші свідчення | уперше завершити пошук у Низу й не довіряти знайденому камінцю. |
| `achievement.passage.search.thirteen` | enabled | visible | `passage.search.completed >= 13` | Тринадцять порпань у відповідь | завершити 13 пошуків у Низу й навчити пил впізнавати ваш почерк. |
| `achievement.passage.search.monster.first` | enabled | visible | `passage.search.monster-attack >= 1` | Пошук знайшов зуби | уперше завершити пошук так, щоб місцевий монстр образився особисто. |
| `achievement.passage.search.all-current` | enabled | visible | `passage.search.unique-nodes >= 5` | Усі теперішні закутки підозрюють | обшукати всі нині доступні місця й проходи Низу, не оголошуючи, що це всі назавжди. |
| `achievement.hunt.contract.first` | enabled | visible | `hunt.contract.completed >= 1` | Дошка полювання зробила позначку | уперше закрити запис із дошки полювання й повернути папірець із доказами. |
| `achievement.hunt.contract.thirteen` | enabled | visible | `hunt.contract.completed >= 13` | Тринадцять оголошень знято | закрити 13 записів із дошки полювання й навчити цвяхи вас поважати. |
| `achievement.adventure.choice.first` | enabled | visible | `adventure.choice.completed >= 1` | Три справи подивилися першими | уперше розвʼязати одну зі справ на найближчий час і не образити решту дві. |
| `achievement.adventure.choice.thirteen` | enabled | visible | `adventure.choice.completed >= 13` | Тринадцять найближчих «ой» | розвʼязати 13 справ на найближчий час і дати календарю привід нервувати. |
| `achievement.adventure.choice.complication.first` | enabled | visible | `adventure.choice.complication >= 1` | Справа покликала свідка з зубами | уперше отримати ускладнення з монстром у справі на найближчий час. |
| `achievement.adventure.choice.complication.three` | enabled | visible | `adventure.choice.complication >= 3` | Три справи вже кусаються | тричі отримати монстрове ускладнення у справах і не подавати скаргу на жанр. |
| `achievement.combat.threat-escalation.first` | enabled | visible | `combat.threat-escalated >= 1` | Низ додав свідків | уперше дійти до ескалації бою, коли Низ вирішив, що одного монстра замало. |
| `achievement.combat.threat-escalation.three` | enabled | visible | `combat.threat-escalated >= 3` | Три протоколи натовпу | тричі пережити ескалацію бою й лишити Низ із процедурним задоволенням. |
| `achievement.combat.threat-pressure.first` | enabled | visible | `combat.threat-pressure >= 1` | Натиск Низу підкрутив гайку | уперше відчути тиск Низу, коли друга проблема прийшла вже з інструкцією. |
| `achievement.combat.threat-pressure.three` | enabled | visible | `combat.threat-pressure >= 3` | Три натиски і жодної ввічливости | тричі пережити тиск Низу й не погодитися, що це нормальна гостинність. |
| `achievement.combat.hard-passage-win` | enabled | visible | `combat.persistent.hard-win >= 1` | Ліворуч було написано «не треба» | перемогти після складного лівого проходу в Низі й не сперечатися з написом. |
| `achievement.combat.adventure-origin-win` | enabled | visible | `combat.persistent.adventure-origin-win >= 1` | Справу закрито кулаком | перемогти у бою, до якого привела корчемна справа. |
| `achievement.combat.yeger-origin-win` | enabled | visible | `combat.persistent.yeger-origin-win >= 1` | Слід довів до синця | перемогти неупокоєну ціль Єгеря й повернути слід із синцем. |
| `achievement.combat.low-hp-win` | enabled | hidden | `combat.persistent.low-hp-win >= 1` | На чесному слові й одному HP | перемогти у старшому бою, маючи не більш як 10% HP. |
| `achievement.gear.zero-gold-item` | enabled | hidden | `combat.persistent.zero-gold-item-win >= 1` | Золота нуль, зате доказ | виграти старший бій без золота, але з манаткою. |
| `achievement.gold.leet-balance` | enabled | visible | `gold.balance >= 1337` | 1337 у кишені | мати принаймні 1337 золота й змусити корчмарську бухгалтерію читати баланс як елітний шифр. |
| `achievement.gold.over-nine-thousand` | enabled | visible | `gold.balance >= 9001` | Понад девʼять тисяч | мати принаймні 9001 золота й почути, як корчмарський лічильник просить не міряти силу гаманця. |
| `achievement.remort.first-memory` | disabled | hidden | `future` | Свічка памʼятає більше | пройти перший реморт і лишити памʼять там, де Корчма її не дістане шваброю. |
| `achievement.combat.critical-1` | disabled | hidden | `future` | Критичне непорозуміння | завдати першого критичного удару у старшому бою. |
| `achievement.combat.critical-23` | disabled | hidden | `future` | Кістки мають особисту думку | завдати 23 критичних удари у старших боях. |
| `achievement.combat.defend-1` | disabled | hidden | `future` | Щит — теж дієслово | уперше захиститися у старшому бою. |
| `achievement.combat.defend-23` | disabled | hidden | `future` | Меблі корчми вже заздрять | захиститися 23 рази у старших боях. |
| `achievement.presence.day-1` | disabled | hidden | `future` | Корчма ще стоїть | проявити активність у грі в один київський день. |
| `achievement.presence.day-3` | disabled | hidden | `future` | Третій день без нормального сну | проявити активність у 3 різні київські дні. |
| `achievement.presence.day-13` | disabled | hidden | `future` | Тринадцять днів у табелі | проявити активність у 13 різних київських днів. |
| `achievement.oddity.failed-flee` | disabled | hidden | `future` | Втік, але залишився | спробувати втекти й не втекти. |
| `achievement.oddity.three-defends` | disabled | hidden | `future` | Черепаха схвалила техніку | захищатися три ходи поспіль в одному старшому бою. |
| `achievement.oddity.unequipped-win` | disabled | hidden | `future` | Без штанів, але з планом | перемогти у старшому бою без вдягнених манаток. |

## Not Yet Countable Without New Ledgers

These are good future achievements, but current persisted state cannot honestly reconstruct or count them yet:

- Persistent PvE critical-hit and manual defend lifetime counters; current finished fight rows do not preserve a durable per-turn action log that can be counted across old sessions.
- Failed flee and three consecutive defends in one senior fight; existing terminal rows do not preserve enough committed turn history for historical backfill.
- Distinct Kyiv active-day streaks; current character timestamps and last activity fields are not durable day receipts and must not be used to infer 3/13 day history.
- Unequipped senior-fight wins; current fight rows do not reliably freeze the equipment-at-start snapshot for old fights.
- Bestiary reading and specific monster-record reads.
- News board opens and reading several news entries from the Telegram board.
- Memorial board views beyond the current board data itself.
- `??? ?????` opens and repeated nearby-player checks.
- Location visit history, visiting every current place and first visits to Nyz; current presence stores where a character is now, not a durable route diary.
- Yeger trail attempts, failed trails and repeated trail outcomes; current cooldown state only preserves the latest trail, not the historical series.
- Class/race ability lifetime-use achievements such as 42 uses; current fumble cycles live in active combat/duel JSON, not a durable per-character counter.

## Future Achievement Analytics

A later internal analytics slice should expose aggregate achievement statistics without adding player power:

- per-achievement earned character count and percentage, for example level 10 reached by 5% of characters and level 23 by 0%;
- filterable views by active characters, all characters, remort generation or release window if those cohorts are useful;
- no public personal data, Telegram ids, private names or exact individual histories in aggregate views;
- no gameplay rewards, leader pressure or monetization advantage from completion percentages.

This should be implemented as a separate admin/analytics surface or report, not as part of the player achievement journal.

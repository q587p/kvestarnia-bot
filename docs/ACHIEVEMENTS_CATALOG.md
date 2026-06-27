# Achievements Catalog

This is the reference catalog for shipped and planned Kvestarnia achievements. Keep it in sync with `src/content/achievements.ts` whenever adding player-facing functionality or achievement definitions.

Runtime rules:
- Achievements are rewardless records and future cosmetic-title provenance only.
- They must not grant XP, gold, items, stats, loot odds, combat power, quest progress, donor perks or paid advantage.
- Hidden achievements may appear here for development clarity, but locked player-facing UI must not leak their condition.
- New player-facing mechanics should add matching achievements/hooks for visible actions, milestones or odd outcomes, or explicitly document why no durable event exists yet.
- If a condition cannot be historically recalculated, add a durable event ledger before adding long-term counters.

Current count: 85 enabled achievements, 1 disabled hidden future placeholder.

## Current Catalog

| ID | Status | Visibility | Trigger | Player-facing title | Full description |
| --- | --- | --- | --- | --- | --- |
| `achievement.character.created` | enabled | visible | `character.created` | Де тут вихід? | створити пригодника й офіційно стати проблемою Корчмаря. |
| `achievement.race.human-ish` | enabled | visible | `character.created` / `race.human-ish` | Анкета витримала людисько | стати людиськом і довести, що практичність теж може бути підозрілою. |
| `achievement.race.dwarf` | enabled | visible | `character.created` / `race.dwarf` | Полиця програла гному | стати гномом і не дати високим полицям виграти морально. |
| `achievement.race.elf` | enabled | visible | `character.created` / `race.elf` | Образа лягла влучно | стати ельфом і подивитися на чоботи світу з належною драмою. |
| `achievement.race.bisyny` | enabled | visible | `character.created` / `race.bisyny` | Словник знову під замком | стати бісинами й лишити корчмарські словники у стані самооборони. |
| `achievement.race.drantohor` | enabled | visible | `character.created` / `race.drantohor` | Межа підписала заднім числом | стати дрантогором і зробити вигляд, що маршрут був погоджений. |
| `achievement.race.domovyk` | enabled | visible | `character.created` / `race.domovyk` | За піччю теж є карʼєра | стати домовиком і змусити пил поводитися обережніше. |
| `achievement.race.dryland-rusalka` | enabled | visible | `character.created` / `race.dryland-rusalka` | Чайник під наглядом | стати сухопутною русалкою й тримати чайники у ввічливій напрузі. |
| `achievement.race.intellectual-orc` | enabled | visible | `character.created` / `race.intellectual-orc` | Рецензія прилетіла обличчям | стати орком-інтелігентом і мати аргументи з помітною вагою. |
| `achievement.race.molfar-soul` | enabled | visible | `character.created` / `race.molfar-soul` | Оберіг знайшов запасний оберіг | стати мольфарською душею й носити туман так, ніби це документ. |
| `achievement.class.warrior` | enabled | visible | `character.created` / `class.warrior` | План стояв рівно | стати воїном і переконливо пояснити світу залізом. |
| `achievement.class.mage` | enabled | visible | `character.created` / `class.mage` | У кімнаті стало складніше | стати магом і сказати слово, після якого меблі нервово теплішають. |
| `achievement.class.bard` | enabled | visible | `character.created` / `class.bard` | Куплет подав заявку | стати бардом і принести в бій небезпечно впевнений приспів. |
| `achievement.class.rogue` | enabled | visible | `character.created` / `class.rogue` | Рахунок зник першим | стати злодієм і лишити таверну з питаннями до бухгалтерії. |
| `achievement.class.priest` | enabled | visible | `character.created` / `class.priest` | Суворий погляд лікує | стати жерцем і подивитися на нежить так, щоб вона переглянула плани. |
| `achievement.class.varenyk-mancer` | enabled | visible | `character.created` / `class.varenyk-mancer` | Начинка бачить майбутнє | стати вареник-мантом і дати тісту службові повноваження. |
| `achievement.class.bureaucramancer` | enabled | visible | `character.created` / `class.bureaucramancer` | Форма 13-Б зітхнула | стати бюрокромантом і налякати хаос правильною печаткою. |
| `achievement.class.ranger` | enabled | visible | `character.created` / `class.ranger` | Слід підписав квитанцію | стати єгерем і знати, де ховається остання стріла. |
| `achievement.class.kharakternyk` | enabled | visible | `character.created` / `class.kharakternyk` | Проблема відвела очі | стати козаком-характерником і дивитися на халепу до її капітуляції. |
| `achievement.level.2` | enabled | visible | `level.reached >= 2` | Табурет навчився хитатися | досягти 2 рівня й зрозуміти, що табурет під вами теж має амбіції. |
| `achievement.level.3` | enabled | visible | `level.reached >= 3` | Перший поверх амбіцій | досягти 3 рівня, де справи вже починають дивитися у відповідь. |
| `achievement.level.5` | enabled | visible | `level.reached >= 5` | Палиця вже не випадкова | досягти 5 рівня й виглядати так, ніби це був план. |
| `achievement.level.10` | enabled | visible | `level.reached >= 10` | Десять рівнів і жодної підозри | досягти 10 рівня так, ніби Корчмар не веде окрему теку. |
| `achievement.level.13` | enabled | visible | `level.reached >= 13` | Тринадцятий пункт інструкції | досягти 13 рівня й не читати дрібний шрифт уголос. |
| `achievement.level.23` | enabled | visible | `level.reached >= 23` | Двадцять три причини не питати | досягти 23 рівня й дати літописцю новий привід нервово рахувати. |
| `achievement.combat.first-win` | enabled | visible | `combat.finished won >= 1` | Бойове хрещення в калюжі | виграти бій з монстром і не питати, чия це була калюжа. |
| `achievement.combat.three-wins` | enabled | visible | `combat.finished won >= 3` | Три монстри не погодили протокол | виграти 3 бої з монстрами й лишити протокол у стані легкої образи. |
| `achievement.combat.thirteen-wins` | enabled | visible | `combat.finished won >= 13` | Тринадцять разів не впав | виграти 13 боїв з монстрами й підписати підлозі акт про ненапад. |
| `achievement.combat.first-loss` | enabled | visible | `combat.finished lost >= 1` | Горизонтальний досвід | програти бій і зробити вигляд, що це була розвідка підлоги. |
| `achievement.combat.three-losses` | enabled | visible | `combat.finished lost >= 3` | Підлога впізнає кроки | програти 3 бої й отримати від підлоги мовчазне «знову ви». |
| `achievement.combat.first-flee` | enabled | visible | `combat.finished fled >= 1` | Тактичний відступ із поясненнями | утекти з бою й назвати це перевіркою запасних дверей. |
| `achievement.quest.first-problem` | enabled | visible | `problem.quest.completed >= 1` | Перший пергамент не зʼїв | здати першу корчмарську проблему й лишити папірець придатним для архіву. |
| `achievement.quest.problem-chain.23` | enabled | visible | `problem.quest.completed >= 2` | Двадцять три підозрілі підписи | закрити другу теку корчмарських проблем і не загубити підпис між плямами. |
| `achievement.quest.problem-chain.42` | enabled | visible | `problem.quest.completed >= 3` | Сорок дві причини для печатки | закрити третю теку корчмарських проблем і змусити печатку задуматися. |
| `achievement.item.first-received` | enabled | visible | `item.received >= 1` | Манатка дивиться першою | отримати першу манатку й чемно не питати, звідки вона дивиться. |
| `achievement.item.three-owned` | enabled | visible | `item.received >= 3` | Три манатки вже радяться | мати 3 манатки в торбі, поки вони ще не створили комітет. |
| `achievement.item.thirteen-owned` | enabled | visible | `item.received >= 13` | Тринадцять одиниць сумніву | мати 13 манаток у торбі й не питати, чому торба важчає морально. |
| `achievement.item.twenty-three-owned` | enabled | visible | `item.received >= 23` | Торба відкрила малий архів | мати 23 манатки в торбі й почути, як ремінь просить профспілку. |
| `achievement.item.forty-two-owned` | enabled | visible | `item.received >= 42` | Сорок дві манатки відповіли | мати 42 манатки в торбі й не питати, на яке саме питання вони відповіли. |
| `achievement.item.ninety-three-owned` | enabled | visible | `item.received >= 93` | Девʼяносто три докази торби | мати 93 манатки в торбі й виглядати як пересувний склад пригод. |
| `achievement.bandage.first-owned` | enabled | visible | `item.received item.responsible-panic-bandage >= 1` | Бинт дивиться відповідально | мати перший Бинт відповідальної паніки й не питати, чи він теж нервує. |
| `achievement.bandage.ninety-three-owned` | enabled | visible | `item.received item.responsible-panic-bandage >= 93` | Девʼяносто три причини не кровити | мати 93 Бинти відповідальної паніки й виглядати як склад невеликої надії. |
| `achievement.bandage.first-used` | enabled | visible | `item.used item.responsible-panic-bandage >= 1` | Паніка спрацювала за призначенням | уперше використати Бинт відповідальної паніки й не сперечатися з медициною. |
| `achievement.bandage.four-used` | enabled | visible | `item.used item.responsible-panic-bandage >= 4` | Чотири вузли самозбереження | використати 4 Бинти відповідальної паніки й виглядати майже професійно. |
| `achievement.bandage.ninety-three-used` | enabled | visible | `item.used item.responsible-panic-bandage >= 93` | Девʼяносто три рази не сьогодні | використати 93 Бинти відповідальної паніки й змусити біль заповнити форму. |
| `achievement.yeger.free-bandage.first` | enabled | visible | `yeger.free-bandage.claimed >= 1` | Єгер дав бинт і не моргнув | уперше отримати безкоштовний бинт як єгер. |
| `achievement.equipment.first-equipped` | enabled | visible | `equipment.item_equipped >= 1` | На мені це виглядає службово | вдягнути першу манатку й почути, як гачок нервово погодився. |
| `achievement.equipment.three-equipped` | enabled | visible | `equipment.item_equipped >= 3` | Образ уже має інвентарний номер | вдягнути 3 манатки й виглядати як службова перевірка пригод. |
| `achievement.mantok.chest.first` | enabled | visible | `mantok.chest.completed >= 1` | Скриня зробила вигляд, що так і треба | уперше завершити переробку манаток у скрині. |
| `achievement.mantok.chest.thirteen` | enabled | visible | `mantok.chest.completed >= 13` | Скриня просить журнал техогляду | завершити 13 переробок манаток і лишити скриню з робочою підозрою. |
| `achievement.mantok.sale.first` | enabled | visible | `mantok.sale.completed >= 1` | Манчкін-скупник кивнув | уперше продати манатку й не дивитися занадто довго на гаманець. |
| `achievement.mantok.sale.thirteen` | enabled | visible | `mantok.sale.completed >= 13` | Скупник уже впізнає кроки | продати манатки 13 разів і стати знайомим пунктом у нічному обліку. |
| `achievement.level.barter.first` | enabled | visible | `level.barter.completed >= 1` | Манчкін прийняв рівневу заявку | уперше скористатися обміном Манчкіна й зробити вигляд, що це не магія бухгалтерії. |
| `achievement.level.barter.three` | enabled | visible | `level.barter.completed >= 3` | Три рівневі квитанції | тричі скористатися обміном Манчкіна й не сперечатися з дрібним шрифтом. |
| `achievement.bard.performance.first` | enabled | visible | `bard.performance.completed >= 1` | Куплет вийшов на люди | уперше виступити як бард і змусити Шинок перевірити акустику. |
| `achievement.bard.performance.thirteen` | enabled | visible | `bard.performance.completed >= 13` | Тринадцять куплетів свідчать | виступити як бард 13 разів і лишити Шинок у стані культурної обережности. |
| `achievement.training.doppelganger.first` | enabled | visible | `training.doppelganger.finished >= 1` | Дзеркало вдарило першим | уперше завершити тренування з Допельґанґером і не підписувати протокол споріднености. |
| `achievement.training.doppelganger.thirteen` | enabled | visible | `training.doppelganger.finished >= 13` | Допельґанґер просить відпустку | завершити 13 тренувань із Допельґанґером і лишити дзеркало втомленим. |
| `achievement.duel.quick.first` | enabled | visible | `duel.quick.resolved >= 1` | Миттєва дуель не встигла моргнути | уперше завершити миттєву дуель і зберегти обличчя в будь-якому стані. |
| `achievement.duel.quick.thirteen` | enabled | visible | `duel.quick.resolved >= 13` | Тринадцять швидких непорозумінь | завершити 13 миттєвих дуелей і навчити рукавичку літати по графіку. |
| `achievement.duel.turnbased.first` | enabled | visible | `duel.turnbased.resolved >= 1` | Хід подумав і погодився | уперше завершити покрокову дуель і пережити офіційне очікування. |
| `achievement.duel.turnbased.three` | enabled | visible | `duel.turnbased.resolved >= 3` | Три ходи в чужу впевненість | завершити 3 покрокові дуелі й не загубити чергу в кишені. |
| `achievement.barrel.raid.first` | enabled | visible | `barrel.raid.claimed >= 1` | Бочка видала перший акт | уперше отримати результат Бочки й не питати, хто там веде облік. |
| `achievement.barrel.raid.thirteen` | enabled | visible | `barrel.raid.claimed >= 13` | Бочка вже вітається | отримати 13 результатів Бочки й не сперечатися з пінним архівом. |
| `achievement.korchma.round.first` | enabled | visible | `korchma.round.purchased >= 1` | Перший кухоль за компанію | уперше проставити пиво й лишити на столі соціяльний слід. |
| `achievement.korchma.round.thirteen` | enabled | visible | `korchma.round.purchased >= 13` | Тринадцять кухлів дипломатії | проставити пиво 13 разів і стати окремим пунктом корчемної ввічливости. |
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
| `achievement.remort.first-memory` | disabled | hidden | `future` | Свічка памʼятає більше | пройти перший реморт і лишити памʼять там, де Корчма її не дістане шваброю. |

## Not Yet Countable Without New Ledgers

These are good future achievements, but current persisted state cannot honestly reconstruct or count them yet:

- Bestiary reading and specific monster-record reads.
- News board opens and reading several news entries from the Telegram board.
- Memorial board views beyond the current board data itself.
- `Хто поруч` opens and repeated nearby-player checks.
- Location visit history, visiting every current place and first visits to Nyz; current presence stores where a character is now, not a durable route diary.
- Yeger trail attempts, failed trails and repeated trail outcomes; current cooldown state only preserves the latest trail, not the historical series.
- Class/race ability lifetime-use achievements such as 42 uses; current fumble cycles live in active combat/duel JSON, not a durable per-character counter.

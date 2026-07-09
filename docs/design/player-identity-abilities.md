# Player Identity Abilities

Дата фіксації: 12026-06-27.

Цей файл є простим реєстром рас, класів, поточних комбо-титулів і повʼязаних абілок: бойових та соціяльних, наявних і запланованих. Він не додає runtime-механік сам по собі: якщо в колонці написано `planned`, це дизайн-напрям, а не обіцянка вже відкритої кнопки.

## Легенда

- `current` — уже є в коді або в поточному `0.2.7` PR.
- `planned` — заплановано в docs/backlog, але не є активною runtime-механікою.
- `бойова` — діє в бою або прямо змінює бойовий хід.
- `соціяльна` — діє поза боєм, у пригодах, взаємодії, репутації, титулі або корчемній сцені.
- Ally/group scopes у `0.2.7` поки деградують до самого пригодника, доки немає party runtime.
- Поточні class/race бойові абілки відображаються в persistent PvE, training doppelganger player turns і turn-based duel turns; quick duel лишається миттєвою формулою без action-кнопок.
- Поточні class/race бойові абілки мають приховану критичну невдачу: active combat/duel JSON веде 93-use cycle per ability, committed фейл витрачає звичайні ресурс/cooldown, скасовує звичайний damage/support/guard/mitigation/counter ефект абілки, а outcome зберігається в summary для replay. Це внутрішній сюрпризний контракт, не player-news обіцянка.
- Title abilities нижче є planned slot: коли окремий slice додасть активну титульну абілку, ті самі turn-based/training/PvE action surfaces мають показувати актуальний набір героя.

## Раси

| Раса | Поточна бойова абілка | Поточна соціяльна/контентна роль | Planned |
| --- | --- | --- | --- |
| Людисько | `🧰 Практична імпровізація` (`ability.race.practical-improvisation`): single enemy, trick, 0 мани, 3 own-action cooldown. | Race-specific adventure offers; race identity in profile, remort choice and duel snapshots. | More practical social shortcuts, small tavern-problem bypasses, milestone race tricks after balance review. |
| Гном | `🪨 Низький центр ваги` (`ability.race.low-center-of-gravity`): all allies including self, guard/mitigation, 0 мани, 4 cooldown. | Race-specific adventure offers; sturdy identity hooks in loot/equipment affinity. | Group guard stance when party combat exists; mining/craft/inspection social hooks. |
| Ельф | `🎯 Ображена точність` (`ability.race.offended-precision`): single enemy, trick precision, 0 мани, 3 cooldown. | Race-specific adventure offers; aesthetic/precision flavor hooks. | Social critique/etiquette scenes, later precision milestone trick. |
| Бісини | `📝 Правка на полях` (`ability.race.margin-note`): all enemies, social/control damage, 1 мана, 4 cooldown. | Race-specific adventure offers; editorial/problem-text flavor. | Stronger noncombat edit/annotation tools, controlled debuff identity in group content. |
| Дрантогор | `🌀 Крок крізь Межу` (`ability.race.step-through-the-border`): single enemy plus response mitigation, 1 мана, 4 cooldown. | Race-specific adventure offers; boundary/route identity. | Border-step traversal jokes, safer future movement hooks, no auto-navigation until scoped. |
| Домовик | `🧦 Запас під піччю` (`ability.race.under-stove-stash`): lowest-HP ally/self fallback heal + guard, 0 мани, 4 cooldown. | Race-specific adventure offers; house/stash flavor. | Hearth support in party runtime; small domestic social conveniences without loot mutation. |
| Русалка сухопутна | `🌊 Сухий приплив` (`ability.race.dry-tide`): all enemies plus small self-heal, spell, 2 мани, 4 cooldown. | Race-specific adventure offers; tea/waterless drama hooks. | Tide/morale scenes, later support or charm-flavored social actions. |
| Орк-інтелігент | `📚 Рецензований удар` (`ability.race.peer-reviewed-smash`): single enemy, physical/social flavor, 0 мани, 4 cooldown. | Race-specific adventure offers; scholarly argument flavor. | Review/argument social methods, future debate-style control without power creep. |
| Мольфарська душа | `🧿 Туманний оберіг` (`ability.race.fog-amulet`): all allies including self, ward/mitigation/counter, 1 мана, 4 cooldown. | Race-specific adventure offers; fog/amulet identity. | Group wards when party runtime exists; ritual support and protective social hooks. |

## Класи

| Клас | Поточна бойова абілка | Поточна соціяльна/контентна роль | Planned |
| --- | --- | --- | --- |
| Воїн | `🪓 Силовий замах` (`skill.forceful-strike`): single enemy, physical, 0 мани, 1 cooldown. | Class-specific adventure offers; combat-forward title/loot affinity. | Guard/cleave milestone option, tavern challenge social hooks. |
| Маг | `🔥 Гаряче закляття` (`skill.hot-spell`): all enemies, spell, 5 мани, 2 cooldown. | Class-specific adventure offers; spell-theory flavor. | Controlled utility magic, puzzle/inspection social tricks, later second spell. |
| Бард | `🎶 Небезпечний куплет` (`skill.dangerous-couplet`): all enemies plus ally morale/guard metadata, social damage, 4 мани, 3 cooldown. | `0.2.5` Bard Performance: same-location noncombat performance with applause/tips; no XP/items/buffs/achievements/quest progress. | Instruments, broader performance techniques, group morale support after party runtime. |
| Злодій | `🌘 Тіньовий розтин` (`skill.shadow-cut`): single enemy plus response mitigation, trick, 0 мани, 2 cooldown. | Class-specific adventure offers; stealth/deception method flavor. | Sneak/social bypasses, lock/trap scenes, later evasion milestone. |
| Жрець | `✨ Суворе благословення` (`skill.strict-blessing`): lowest-HP ally/self fallback heal + guard/mitigation, 4 мани, 3 cooldown. | Class-specific adventure offers; blessing/ritual flavor. | Party healing when allies exist; voluntary support rites without paid or combat-power shortcuts. |
| Вареник-мант | `🥟 Кипляча начинка` (`skill.boiling-filling`): all enemies plus small self/ally fallback heal, spell, 4 мани, 2 cooldown. | Class-specific adventure offers; food/steam/tavern craft flavor. | Food-ish noncombat technique only as a scoped slice; no broad crafting yet. |
| Бюрокромант | `📄 Форма 13-Б` (`skill.form-thirteen-b`): all enemies plus response reduction, social/control, 4 мани, 3 cooldown. | Class-specific adventure offers; paperwork/authority method flavor. | Forms, permits and queue manipulation as social techniques; keep callbacks server-owned. |
| Єгер | `🏹 Рикошетний постріл` (`skill.trick-shot`): primary plus splash/all enemies, trick, 1 мана, 2 cooldown. | Yeger hunt/board systems already exist, but class-ranger discounts/free medical supply hooks are narrow item/Yeger mechanics, not a universal profession engine. | Tracking, contracts and outdoor utility in small slices; no group auto-navigation by default. |
| Козак-характерник | `👁 Степовий косий погляд` (`skill.steppe-side-eye`): all enemies plus control/mitigation, trick, 2 мани, 2 cooldown. | Class-specific adventure offers; steppe/tuman/control flavor. | More характерницькі tricks, ritual/control support. |

## Поточні Титули

Поточний титул виводиться з раси + класу через `getComboTitle(...)`. Ці титули вже є видимим identity-текстом і живлять кілька content hooks:

- Adventure Choice can add title-specific problems for known combo titles.
- Resource recovery has tiny substring hooks: titles containing `удар`, `щит` or `стійк` can accelerate HP recovery; titles containing `канцеляр`, `оберіг` or `мольфар` can accelerate mana recovery.
- Loot Expansion v1 has title-surrogate affinity families for generated loot, but those are adapter requirements/weights, not player-selectable title abilities.
- There is no active title-selection UI and no title combat button yet.

| Раса | Клас | Титул (він) | Титул (вона) | Титул (вони) |
| --- | --- | --- | --- | --- |
| Людисько | Воїн | Пересічний Пригодник | Пересічна Пригодниця | Пересічні Пригодники |
| Людисько | Маг | Побутовий Теоретик Іскор | Побутова Теоретикиня Іскор | Побутові Теоретики Іскор |
| Людисько | Бард | Самозваний Куплетоносець | Самозвана Куплетоносиця | Самозвані Куплетоносці |
| Людисько | Злодій | Власник Випадкової Відмички | Власниця Випадкової Відмички | Власники Випадкової Відмички |
| Людисько | Жрець | Черговий Благословитель | Чергова Благословителька | Чергові Благословителі |
| Людисько | Вареник-мант | Начинковий Оптиміст | Начинкова Оптимістка | Начинкові Оптимісти |
| Людисько | Бюрокромант | Молодший Паперорухач | Молодша Паперорухачка | Молодші Паперорухачі |
| Людисько | Єгер | Слідознавець за Обставинами | Слідознавиця за Обставинами | Слідознавці за Обставинами |
| Людисько | Козак-характерник | Степовий Пояснювач | Степова Пояснювачка | Степові Пояснювачі |
| Гном | Воїн | Молотковий Аргумент | Молоткова Аргументація | Молоткові Аргументи |
| Гном | Маг | Шахтний Іскрознавець | Шахтна Іскрознавиця | Шахтні Іскрознавці |
| Гном | Злодій | Тунельний Майстер Відмички | Тунельна Майстриня Відмички | Тунельні Майстри Відмички |
| Гном | Бюрокромант | Печатник Глибин | Печатниця Глибин | Печатники Глибин |
| Гном | Єгер | Гірський Слідознавець | Гірська Слідознавиця | Гірські Слідознавці |
| Ельф | Маг | Довговухий Теоретик Вогню | Довговуха Теоретикиня Вогню | Довговухі Теоретики Вогню |
| Ельф | Бард | Лютневий Довгожитель | Лютнева Довгожителька | Лютневі Довгожителі |
| Ельф | Злодій | Естетичний Зникальник | Естетична Зникальниця | Естетичні Зникальники |
| Ельф | Жрець | Жрець Довгих Пояснень | Жриця Довгих Пояснень | Жерці Довгих Пояснень |
| Ельф | Єгер | Лісовий Картограф Чужих Слідів | Лісова Картографка Чужих Слідів | Лісові Картографи Чужих Слідів |
| Бісини | Воїн | Редактор Бойових Аргументів | Редакторка Бойових Аргументів | Редактори Бойових Аргументів |
| Бісини | Маг | Заклинач Коментарів на Полях | Заклиначка Коментарів на Полях | Заклиначі Коментарів на Полях |
| Бісини | Бард | Редакторський Жах Куплетів | Редакторська Кара Куплетів | Редакторські Жахи Куплетів |
| Бісини | Злодій | Коментатор Тіньового Проходу | Коментаторка Тіньового Проходу | Коментатори Тіньового Проходу |
| Бісини | Жрець | Тлумач Підозрілих Благословень | Тлумачка Підозрілих Благословень | Тлумачі Підозрілих Благословень |
| Бісини | Вареник-мант | Начинковий Дискутант | Начинкова Дискутантка | Начинкові Дискутанти |
| Бісини | Бюрокромант | Бісова Правка Форми | Бісова Правка Форми | Бісові Правки Форми |
| Бісини | Єгер | Слідознавець Зайвої Правки | Слідознавиця Зайвої Правки | Слідознавці Зайвої Правки |
| Бісини | Козак-характерник | Бісова Оселедцева Теорія | Бісова Оселедцева Теорія | Бісові Оселедцеві Теорії |
| Дрантогор | Воїн | Остромазький Аргумент | Остромазька Аргументація | Остромазькі Аргументи |
| Дрантогор | Маг | Заблукалий Теоретик Іскор | Заблукала Теоретикиня Іскор | Заблукалі Теоретики Іскор |
| Дрантогор | Злодій | Межовий Обхідник | Межова Обхідниця | Межові Обхідники |
| Дрантогор | Бюрокромант | Гість Без Печатки | Гостя Без Печатки | Гості Без Печатки |
| Дрантогор | Єгер | Слідознавець Чужої Карти | Слідознавиця Чужої Карти | Слідознавці Чужої Карти |
| Дрантогор | Козак-характерник | Межовий Заблуканець | Межова Заблукана | Межові Заблуканці |
| Домовик | Злодій | Завідувач Чужої Полиці | Завідувачка Чужої Полиці | Завідувачі Чужої Полиці |
| Домовик | Жрець | Пічний Благословитель | Пічна Благословителька | Пічні Благословителі |
| Домовик | Бюрокромант | Архівний Дух | Архівна Душа | Архівні Духи |
| Домовик | Єгер | Слідопит Підпіччя | Слідопитка Підпіччя | Слідопити Підпіччя |
| Русалка сухопутна | Маг | Чарівник Сухої Калюжі | Чарівниця Сухої Калюжі | Чарівники Сухої Калюжі |
| Русалка сухопутна | Бард | Співець Без Моря | Співачка Без Моря | Співці Без Моря |
| Русалка сухопутна | Жрець | Жрець Чайникових Припливів | Жриця Чайникових Припливів | Жерці Чайникових Припливів |
| Русалка сухопутна | Вареник-мант | Сирен Сметани | Сирена Сметани | Сирени Сметани |
| Орк-інтелігент | Воїн | Критик Прикладного Биття | Критикиня Прикладного Биття | Критики Прикладного Биття |
| Орк-інтелігент | Маг | Кандидат Бойових Наук | Кандидатка Бойових Наук | Кандидати Бойових Наук |
| Орк-інтелігент | Бард | Рецензент Бойового Куплету | Рецензентка Бойового Куплету | Рецензенти Бойового Куплету |
| Орк-інтелігент | Жрець | Етичний Зцілювач Кулаком | Етична Зцілювачка Кулаком | Етичні Зцілювачі Кулаком |
| Орк-інтелігент | Бюрокромант | Завідувач Ударної Канцелярії | Завідувачка Ударної Канцелярії | Завідувачі Ударної Канцелярії |
| Орк-інтелігент | Козак-характерник | Доцент Прикладного Туману | Доцентка Прикладного Туману | Доценти Прикладного Туману |
| Мольфарська душа | Маг | Збирач Туману | Збирачка Туману | Збирачі Туману |
| Мольфарська душа | Бард | Співець Туману з Довідкою | Співачка Туману з Довідкою | Співці Туману з Довідкою |
| Мольфарська душа | Злодій | Обереговий Зникальник | Оберегова Зникальниця | Оберегові Зникальники |
| Мольфарська душа | Жрець | Пастир Малих Оберегів | Пастирка Малих Оберегів | Пастирі Малих Оберегів |
| Мольфарська душа | Бюрокромант | Писар Оберегових Справ | Писарка Оберегових Справ | Писарі Оберегових Справ |
| Мольфарська душа | Козак-характерник | Кум Туману | Кума Туману | Куми Туману |

## Planned Титульні Абілки

| Зона | План | Guardrail |
| --- | --- | --- |
| Achievements Phase 1 | `0.2.8` ships rewardless achievement records and persisted cosmetic title grants as provenance for future title UI. | No XP, gold, loot, combat power, active title selection or pay-to-win advantage. |
| Active title selection | Later UI may let a player choose a visible active title near the name. | Not part of current runtime; do not key mechanics from localized visible text alone. |
| Title social hooks | Titles may affect funny adventure outcomes, board-memory lines, reputation scenes or small capped social modifiers. | Keep effects tiny, transparent where needed and replay-safe. |
| Title combat hooks | Only future scoped slices should add title-linked combat behavior, likely as cosmetic/funny identity first and as a visible action slot on the same current-skill surfaces. | No title should become required for PvE/PvP power; quick duel should not grow hidden title math without a separate balance review. |

## Planned Ширші Напрями Абілок

| Тип identity | Бойовий план | Соціяльний план |
| --- | --- | --- |
| Race | Milestone race tricks, party-ready guards/heals, bounded control riders. | Race-specific scene tools, movement/inspection flavor, small tavern-problem shortcuts. |
| Class | Second class techniques at later levels, party support, better role distinction. | Noncombat techniques for more classes after Bard proof, without a universal profession engine in one slice. |
| Title | Mostly cosmetic; any combat hook must be tiny, separately reviewed and surfaced explicitly beside current class/race actions when it exists. | Achievements, active-title display, reputation and board-memory flavor. |

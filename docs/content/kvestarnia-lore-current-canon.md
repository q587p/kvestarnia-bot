# Поточний канон для лор-пакета

Цей файл замінює абстрактні народи/істоти з першої версії пакета на те, що вже є в репозиторії Квестарні.

## Джерела правди

- `src/content/races.ts` — раси й активність у onboarding.
- `src/content/classes.ts` — класи, primary stat і дозволені раси.
- `src/content/monsters.ts` — runtime monster roster.
- `src/services/presenceService.ts` — назви видимих місцин Квестарні.

## Раси

- **Людисько** (`race.human-ish`) — активна. Практичне в усьому, що вдалося вписати в корчмарську анкету.
- **Гном** (`race.dwarf`) — активна. Стійкий до ударів, боргів і високих полиць.
- **Ельф** (`race.elf`) — активна. Влучний, драматичний і трохи ображений на стан ваших чобіт.
- **Бісини** (`race.bisyny`) — активна. Кажуть, назву колись занесло з однієї великої брами. Відтоді словники в таверні тримають під замком.
- **Дрантогор** (`race.drantohor`) — активна. Заблукав із Королівства Остромаг і робить вигляд, що це був план. Межа підписала пропуск заднім числом. — тільки шлях `they` у поточному onboarding
- **Домовик** (`race.domovyk`) — активна. Знаходить дрібний лут там, де інші знаходять лише пил. — у поточному onboarding без `she`
- **Русалка сухопутна** (`race.dryland-rusalka`) — активна. Магічна, харизматична й підозріло уважна до чайників. — у поточному onboarding без `he`
- **Орк-інтелігент** (`race.intellectual-orc`) — активна. Сила з дипломом і аргументами, які краще не ловити обличчям.
- **Мольфарська душа** (`race.molfar-soul`) — активна. Носить у кишені оберіг, у голові туман, а в кишені ще один оберіг.
## Класи

- **Воїн** (`class.warrior`) — primary stat `strength`. У бою має `🪓 Силовий замах`, може тримати по зброї в кожній руці, а в рейді проти Старшого Брата Бочки — гукнути `🛡️ На мене!` й прийняти гуркіт на себе.
- **Маг** (`class.mage`) — primary stat `intelligence`. У бою застосовує `🔥 Гаряче закляття`, а в задвірку має класову спорідненість із Чароковальнею.
- **Бард** (`class.bard`) — primary stat `charisma`. У бою застосовує `🎶 Небезпечний куплет`; виступає в шинку для активної публіки, добровільні чайові не впливають на `✨ Натхнення`, а `🎻 Журлива балада` послаблює Старшого Брата Бочки під час рейду.
- **Злодій** (`class.rogue`) — primary stat `dexterity`. У бою має `🌘 Тіньовий розтин`, а поза боєм може ризикнути `🗡️ Тихою кишенею` по активній цілі поруч.
- **Жрець** (`class.priest`) — primary stat `charisma`. У бою застосовує `✨ Суворе благословення`, а поза боєм лікує маною або коротко благословляє Вдачу собі чи активному пригоднику поруч.
- **Вареник-мант** (`class.varenyk-mancer`) — primary stat `intelligence`. У бою застосовує `🥟 Киплячу начинку`; від 3 рівня `🍽️ Нагодувати` підбадьорює HP одразу, а короткий `😋 Ситий` підтримує HP і ману щохвилини поза боєм або кожен хід у бою, витрачаючи хвилину дії.
- **Бюрокромант** (`class.bureaucramancer`) — primary stat `intelligence`. У бою знерухомлює ворогів `📄 Формою 13-А`, а перед рейдом на Старшого Брата Бочки може відкрити `Протокол 13-З` для персональних претензій підписантів.
- **Єгер** (`class.ranger`) — primary stat `dexterity`. У бою застосовує `🏹 Рикошетний постріл`, а єгерський куток тримає його справи, сліди й медичні запаси.
- **Козак-характерник** (`class.kharakternyk`) — primary stat `luck`. У бою застосовує `👁 Степовий косий погляд`; біля Старшого Брата Бочки може поставити рейдовий знак, який ватага підпирає перед першим великим гуркотом.

## Разові манатки

- Усі двадцять чинних витратних предметів мають явну дію: три медичні припаси, дві погрібні манатки й `item.loot-v1-c001`–`item.loot-v1-c015`.
- Ефекти спрацьовують одразу: лікують себе, пару або живу ватагу, відновлюють ману, знімають одну дозволену прикрість, скорочують ще чинні після звичайного відліку дії відкати, завдають певної шкоди або змінюють рівно одну найближчу відповідь ворога. Наступні відповіді відбуваються звичайно; ефекти не створюють прихованих харчових бафів чи здобичі.
- Випадковий ресурс визначається один раз і відтворюється без безкоштовного перекидання. Поза боєм використання має підтвердження; у бою воно витрачає хід. Повний ресурс або відсутність законної цілі не витрачає предмет.
- Квестова Пляшка Пінного Міражу захищена до фінального рішення в погребі; після вибору «залишити» нею можна скористатися.

## Видимі місцини й presence-назви

- **Перед корчмою** (`location.korchma.front`) — Корчма Квестарні.
- **Задвірок корчми** (`location.korchma.yard`) — Корчма Квестарні.
- **Зала корчми** (`location.korchma.hall`) — Корчма Квестарні.
- **Стіл зі справами** (`location.korchma.quest_table`) — Корчма Квестарні.
- **Шинок** (`location.korchma.bar`) — Корчма Квестарні.
- **Льох корчми** (`location.korchma.cellar`) — Корчма Квестарні.
- **Біля Бочки Пінного Міражу** (`location.korchma.barrel`) — Корчма Квестарні.
- **Дошка корчми** (`location.korchma.news_corner`) — Корчма Квестарні.
- **Єгерський куток** (`location.korchma.ranger_corner`) — Корчма Квестарні.
- **Бійцівський куток** (`location.korchma.fighting_corner`) — Корчма Квестарні.
- **Низ** (`location.korchma.deep`) — Корчма Квестарні; `🪺 Гніздо ґільдій` є бічною каморою при Спуску й навмисно ділить цей presence-id.
- **Сутерени Корчми** (`location.korchma.deep.level1`) — Низ.
- **Лівий прохід** (`location.korchma.deep.level1.left`) — Сутерени Корчми.
- **Прямий прохід** (`location.korchma.deep.level1.straight`) — Сутерени Корчми.
- **Правий прохід** (`location.korchma.deep.level1.right`) — Сутерени Корчми.

## Монстри (93 записів у snapshot)

Групування за рівнями. У лорі не треба одразу показувати все: MVP може мати кілька spotlight-записів, а повний список тримати як індекс / future unlock.

- **Рівень 1:** Мімік-шаурма (`monster.mimic-shawarma`); Льохова Миша з Титулом (`monster.basement-mouse-with-title`); Зграя капців тривожної мобільности (`monster.anxious-slippers-swarm`); Комар-ревізор дрібних витрат (`monster.audit-mosquito`).
- **Рівень 2:** Скелет-вахтер печаток (`monster.stamp-doorkeeper-skeleton`); Гоблін з Електронною Табличкою (`monster.spreadsheet-goblin`); Павук дедлайнів (`monster.deadline-spider`); Привид непрочитаних правил (`monster.unread-rules-ghost`); Борщовий слизень правильної температури (`monster.borshch-slime`); Буханець-бандит умовної нарізки (`monster.conditionally-sliced-loaf-bandit`); Архівний книшоїд (`monster.archival-knysh-eater`); Медузка звітности (`monster.report-jellyfish`); Крамарик без здачі (`monster.no-change-merchantling`); Чайник сухого моря (`monster.dry-sea-teapot`); Капустяний лицар на перерві (`monster.cabbage-knight-on-break`).
- **Рівень 3:** Дракончик попереднього погодження (`monster.preapproval-dragonling`); Ґарґулья лічильника черги (`monster.queue-counter-gargoyle`); Троль останнього коментаря (`monster.final-comment-troll`); Дзеркальце зайвої самокритики (`monster.self-critique-mirror`).
- **Рівень 4:** Скаргова лампа (`monster.complaint-lantern`); Баняк колективної відповідальности (`monster.collective-liability-cauldron`); Лис обхідного листа (`monster.bypass-sheet-fox`).
- **Рівень 5:** Податковий дракон нульової декларації (`monster.zero-declaration-tax-dragon`); Кабан прибутково-видаткової книги (`monster.ledger-boar`); Квасний голем на заквасці (`monster.sourdough-kvas-golem`); Жаба тендерного комітету (`monster.tender-committee-frog`).
- **Рівень 6:** Крендель солоної обіцянки (`monster.salted-oath-pretzel`); Акт закриття, який не закрився (`monster.unclosed-closure-act`); Чугайстер-практикант із техніки безпеки (`monster.safety-intern-chuhaister`); Злидні гуртової знижки (`monster.bulk-discount-zlydni`); Млинок чуток четвертого помелу (`monster.fourth-grind-rumor-mill`).
- **Рівень 7:** Мапа коридору, яка бреше (`monster.liar-corridor-map`); Вепр неналежного паркування (`monster.improper-parking-boar`); Блуд із трьома правильними дорогами (`monster.three-correct-roads-blud`); Саламандра мокрого вугілля (`monster.wet-coal-salamander`); Мавпочка службового ключа (`monster.service-key-monkey`).
- **Рівень 8:** Пінний ревізор у чоботях (`monster.foam-auditor-boots`); Песиголовець із відділу кадрів (`monster.hr-pesyholovets`); Сорока ліцензійного блиску (`monster.licensed-shine-magpie`); Ковбасний василіск дієтичного меню (`monster.diet-menu-sausage-basilisk`); Водяник сухого фонтану (`monster.dry-fountain-vodyanyk`).
- **Рівень 9:** Химера трьох підписів (`monster.three-signature-chimera`); Пічний лев комендантської години (`monster.curfew-stove-lion`); Качка трьох інстанцій (`monster.three-instance-duck`); Перелесник рекламної акції (`monster.promo-perelesnyk`); Кам’яний сом підвального водогону (`monster.basement-pipe-stone-catfish`).
- **Рівень 10:** Наглядач сирного сховку (`monster.cheese-vault-warden`); Ворон остаточного погодження (`monster.final-approval-raven`); Пан Коцький квартального звіту (`monster.quarterly-report-pan-kotsky`); Дідько малого бізнесу (`monster.small-business-didko`); Риба-пилка кошторисної глибини (`monster.deep-estimate-sawfish`).
- **Рівень 11:** Гідра календарних переносів (`monster.calendar-hydra`); Мідний полоз скарбової вентиляції (`monster.treasure-ventilation-copper-snake`); Бараболя стратегічного резерву (`monster.strategic-reserve-potato`); Тур обліку лісових збитків (`monster.forest-loss-aurochs`).
- **Рівень 12:** Пророк інвентарної недостачі (`monster.inventory-prophet`); Лісовик службової стежки (`monster.service-path-lisovyk`); Залізний вареник облоги (`monster.siege-iron-varenyk`); Змій-кур’єр тринадцяти адрес (`monster.thirteen-address-dragon-courier`).
- **Рівень 13:** Писар тихої катастрофи (`monster.quiet-catastrophe-clerk`); Водяний бухгалтер припливів (`monster.tide-accountant-vodyanyk`); Гороховий велетень невиграного тендеру (`monster.failed-tender-pea-giant`); Дракон архівної вентиляції (`monster.archive-ventilation-dragon`).
- **Рівень 14:** Чугайстер семи протягів (`monster.seven-draft-chuhaister`); Гарбузовий гетьман сезонної оборони (`monster.seasonal-defense-pumpkin-hetman`); Привид другого примірника (`monster.second-copy-ghost`).
- **Рівень 15:** Вій шестигодинної наради (`monster.six-hour-meeting-viy`); Бобер державного шлюзу (`monster.state-sluice-beaver`); Упир касового розриву (`monster.cash-gap-upyr`).
- **Рівень 16:** Мавка невчасної відпустки (`monster.late-vacation-mavka`); Кулішний фенікс третього підігріву (`monster.third-reheat-kulish-phoenix`); Мара нічного резервування (`monster.night-reservation-mara`).
- **Рівень 17:** Очеретяний цар комірної тиші (`monster.storage-silence-reed-king`); Бандурний грифон фальшивої ноти (`monster.false-note-bandura-griffin`); Вовкулака останньої зміни (`monster.last-shift-vovkulaka`).
- **Рівень 18:** Арідник гірського лізингу (`monster.mountain-leasing-aridnyk`); Триусий короп митного ставу (`monster.customs-three-whisker-carp`); Некромант-стажер відділу кадрів (`monster.hr-intern-necromancer`).
- **Рівень 19:** Казенний мамонт холодного складу (`monster.cold-storage-state-mammoth`); Велетенська бджола акцизного меду (`monster.excise-honey-giant-bee`); Полудниця понаднормової спеки (`monster.overtime-heat-poludnytsia`).
- **Рівень 20:** Залізний крук мобілізації ложок (`monster.spoon-mobilization-iron-raven`); Триголовий змій пожежної безпеки (`monster.fire-safety-three-headed-serpent`); Мрець-ревізор останньої волі (`monster.last-will-dead-auditor`).
- **Рівень 21:** Кит підземного моря з актом приймання (`monster.underground-sea-acceptance-whale`); Сивий ведмідь заставного майна (`monster.collateral-grey-bear`); Панночка порожньої світлиці (`monster.empty-chamber-lady`).
- **Рівень 22:** Медовий левіятан ярмаркового збору (`monster.fair-tax-honey-leviathan`); Кам’яний жайвір облогової пісні (`monster.siege-song-stone-skylark`); Чорнокнижник списаного майна (`monster.written-off-assets-black-booker`).
- **Рівень 23:** Зоряний вепр останнього маршруту (`monster.last-route-star-boar`); Князь драконячої черги (`monster.queue-dragon-prince`); Король упирів простроченого архіву (`monster.expired-archive-upyr-king`).

## Правило актуалізації

Якщо Codex реалізує фічу, він має **імпортувати поточні масиви** з `src/content/*`, а не вручну копіювати цей snapshot у runtime. Snapshot у пакеті — для планування, рев’ю й seed-текстів.


## Planning Note

This file is a review/planning snapshot for the lore seed. Runtime implementation should import current race, class, monster and location content from source files whenever practical.

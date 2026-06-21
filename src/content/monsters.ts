import type { MonsterContent } from "./schema";

export const monsters = [
  {
    "id": "monster.mimic-shawarma",
    "name": "Мімік-шаурма",
    "description": "Виглядає апетитно, але це саме так працює маркетинг міміків.",
    "level": 1,
    "tags": [
      "mimic",
      "food",
      "starter",
      "korchma"
    ]
  },
  {
    "id": "monster.basement-mouse-with-title",
    "name": "Льохова Миша з Титулом",
    "description": "Мала істота великого самопроголошення. Вимагає сир, повагу й дрібний герб.",
    "level": 1,
    "tags": [
      "beast",
      "cellar",
      "tiny-boss",
      "diplomacy"
    ]
  },
  {
    "id": "monster.stamp-doorkeeper-skeleton",
    "name": "Скелет-вахтер печаток",
    "description": "Не пускає навіть смерть без пропуску. Смерть уже стоїть у черзі.",
    "level": 2,
    "tags": [
      "undead",
      "bureaucracy",
      "gatekeeper"
    ]
  },
  {
    "id": "monster.spreadsheet-goblin",
    "name": "Гоблін з Електронною Табличкою",
    "description": "Порахував ваші HP до зустрічі й образився, що вони ще не мінус.",
    "level": 2,
    "tags": [
      "goblin",
      "bureaucracy",
      "numbers"
    ]
  },
  {
    "id": "monster.deadline-spider",
    "name": "Павук дедлайнів",
    "description": "Плете павутину з «сьогодні швиденько» й ловить тих, хто повірив.",
    "level": 2,
    "tags": [
      "beast",
      "time",
      "web"
    ]
  },
  {
    "id": "monster.preapproval-dragonling",
    "name": "Дракончик попереднього погодження",
    "description": "Не дихає вогнем без трьох підписів, але димить з принципу.",
    "level": 3,
    "tags": [
      "dragon",
      "bureaucracy",
      "fire",
      "mini-boss"
    ]
  },
  {
    "id": "monster.unread-rules-ghost",
    "name": "Привид непрочитаних правил",
    "description": "З’являється, коли хтось натиснув кнопку, не дочитавши абзац дрібним шрифтом.",
    "level": 2,
    "tags": [
      "ghost",
      "rules",
      "undead",
      "tutorial"
    ]
  },
  {
    "id": "monster.anxious-slippers-swarm",
    "name": "Зграя капців тривожної мобільности",
    "description": "Біжить у різні боки й вимагає, щоб ви теж визначились.",
    "level": 1,
    "tags": [
      "swarm",
      "household",
      "mobility",
      "comic"
    ]
  },
  {
    "id": "monster.borshch-slime",
    "name": "Борщовий слизень правильної температури",
    "description": "Спробуй сказати «холодний» — він стане особистим.",
    "level": 2,
    "tags": [
      "slime",
      "food",
      "kitchen",
      "temperature"
    ]
  },
  {
    "id": "monster.conditionally-sliced-loaf-bandit",
    "name": "Буханець-бандит умовної нарізки",
    "description": "Ще не нарізаний, але вже вимагає частку з кожної крихти.",
    "level": 2,
    "tags": [
      "food",
      "bandit",
      "bread",
      "knife"
    ]
  },
  {
    "id": "monster.queue-counter-gargoyle",
    "name": "Ґарґулья лічильника черги",
    "description": "Сидить над дверима і видає номерки тим, хто просто проходив повз.",
    "level": 3,
    "tags": [
      "construct",
      "queue",
      "stone",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.audit-mosquito",
    "name": "Комар-ревізор дрібних витрат",
    "description": "П’є не кров, а пояснення, куди поділися дві монети.",
    "level": 1,
    "tags": [
      "insect",
      "audit",
      "annoying",
      "gold"
    ]
  },
  {
    "id": "monster.archival-knysh-eater",
    "name": "Архівний книшоїд",
    "description": "Їсть старі справи, лишає крихти доказів і дуже ситий вигляд.",
    "level": 2,
    "tags": [
      "archive",
      "food",
      "paper",
      "beast"
    ]
  },
  {
    "id": "monster.final-comment-troll",
    "name": "Троль останнього коментаря",
    "description": "Живе під мостом, але вилазить там, де хтось написав «закриваю тему».",
    "level": 3,
    "tags": [
      "troll",
      "naming",
      "bridge",
      "argument"
    ]
  },
  {
    "id": "monster.report-jellyfish",
    "name": "Медузка звітности",
    "description": "Пливе повітрям, жалить пунктами плану й просить називати це прозорістю.",
    "level": 2,
    "tags": [
      "jellyfish",
      "paperwork",
      "soft",
      "floating"
    ]
  },
  {
    "id": "monster.no-change-merchantling",
    "name": "Крамарик без здачі",
    "description": "Малий торговець великої принциповости. Має решту, але вважає її лором.",
    "level": 2,
    "tags": [
      "merchant",
      "gold",
      "trickster",
      "shop"
    ]
  },
  {
    "id": "monster.self-critique-mirror",
    "name": "Дзеркальце зайвої самокритики",
    "description": "Показує не обличчя, а коментарі, які ви самі собі не просили.",
    "level": 3,
    "tags": [
      "cursed",
      "mirror",
      "mind",
      "comic"
    ]
  },
  {
    "id": "monster.dry-sea-teapot",
    "name": "Чайник сухого моря",
    "description": "Свистить так, ніби пам’ятає океан, але в ньому тільки чай і претензії.",
    "level": 2,
    "tags": [
      "kitchen",
      "teapot",
      "water",
      "sound"
    ]
  },
  {
    "id": "monster.cabbage-knight-on-break",
    "name": "Капустяний лицар на перерві",
    "description": "Охороняє грядку, честь і право бути квашеним за графіком.",
    "level": 2,
    "tags": [
      "plant",
      "knight",
      "garden",
      "armor"
    ]
  },
  {
    "id": "monster.zero-declaration-tax-dragon",
    "name": "Податковий дракон нульової декларації",
    "description": "Маленький тільки на відстані. Зблизька питає, чому скарб названо «знахідкою».",
    "level": 5,
    "tags": [
      "dragon",
      "boss",
      "gold",
      "bureaucracy",
      "tax"
    ]
  },
  {
    "id": "monster.complaint-lantern",
    "name": "Скаргова лампа",
    "description": "Світить лише тоді, коли хтось починає жалітись голосніше за корчмаря.",
    "level": 4,
    "tags": [
      "paperwork",
      "sound",
      "time",
      "unquiet"
    ]
  },
  {
    "id": "monster.ledger-boar",
    "name": "Кабан прибутково-видаткової книги",
    "description": "Риє нісом у рахунках і залишає після себе тільки сумнівні витрати та сліди копит.",
    "level": 5,
    "tags": [
      "beast",
      "paperwork",
      "audit",
      "unquiet"
    ]
  },
  {
    "id": "monster.salted-oath-pretzel",
    "name": "Крендель солоної обіцянки",
    "description": "Сухий, гнучкий і страшенно переконаний, що довіра — це теж начинка.",
    "level": 6,
    "tags": [
      "food",
      "bread",
      "rules"
    ]
  },
  {
    "id": "monster.unclosed-closure-act",
    "name": "Акт закриття, який не закрився",
    "description": "Шурхотить правилами й просить ще один підпис після того, як справу вже поховали в архіві.",
    "level": 6,
    "tags": [
      "paperwork",
      "rules",
      "bureaucracy",
      "unquiet"
    ]
  },
  {
    "id": "monster.liar-corridor-map",
    "name": "Мапа коридору, яка бреше",
    "description": "Показує вихід там, де насправді тільки ще один коридор і трохи сорому.",
    "level": 7,
    "tags": [
      "paper",
      "rules",
      "trickster",
      "unquiet"
    ]
  },
  {
    "id": "monster.foam-auditor-boots",
    "name": "Пінний ревізор у чоботях",
    "description": "Перевіряє кухлі, піну й вашу готовність відповідати за третю кружку.",
    "level": 8,
    "tags": [
      "audit",
      "queue",
      "sound",
      "unquiet"
    ]
  },
  {
    "id": "monster.three-signature-chimera",
    "name": "Химера трьох підписів",
    "description": "Кожна голова погоджується з двома іншими, але тільки на словах.",
    "level": 9,
    "tags": [
      "bureaucracy",
      "construct",
      "cursed"
    ]
  },
  {
    "id": "monster.cheese-vault-warden",
    "name": "Наглядач сирного сховку",
    "description": "Стійкий до холоду, до спокуси і до будь-яких аргументів без серветки.",
    "level": 10,
    "tags": [
      "food",
      "stone",
      "gatekeeper",
      "unquiet"
    ]
  },
  {
    "id": "monster.calendar-hydra",
    "name": "Гідра календарних переносів",
    "description": "Відрізали понеділок — виріс вівторок, але вже з іншим дедлайном.",
    "level": 11,
    "tags": [
      "time",
      "paperwork",
      "water",
      "unquiet"
    ]
  },
  {
    "id": "monster.inventory-prophet",
    "name": "Пророк інвентарної недостачі",
    "description": "Знає, що зникло, ще до того, як ви зрозуміли, що це було.",
    "level": 12,
    "tags": [
      "gold",
      "paperwork",
      "mind",
      "unquiet"
    ]
  },
  {
    "id": "monster.quiet-catastrophe-clerk",
    "name": "Писар тихої катастрофи",
    "description": "Записує кінець світу так акуратно, ніби це просто внутрішня службова.",
    "level": 13,
    "tags": [
      "paperwork",
      "cursed",
      "soft"
    ]
  },
  {
    "id": "monster.collective-liability-cauldron",
    "name": "Баняк колективної відповідальности",
    "description": "Коли щось іде не так, накриває кришкою найближчого й призначає його відповідальним.",
    "level": 4,
    "tags": [
      "construct",
      "kitchen",
      "armor",
      "blame"
    ]
  },
  {
    "id": "monster.bypass-sheet-fox",
    "name": "Лис обхідного листа",
    "description": "Має всі підписи, крім того, що доводить, навіщо він сюди прийшов.",
    "level": 4,
    "tags": [
      "beast",
      "paperwork",
      "trickster",
      "forest"
    ]
  },
  {
    "id": "monster.sourdough-kvas-golem",
    "name": "Квасний голем на заквасці",
    "description": "Піднімається повільно, бродить довго, а потім вимагає не називати це пліснявою.",
    "level": 5,
    "tags": [
      "construct",
      "food",
      "fermentation",
      "armor"
    ]
  },
  {
    "id": "monster.tender-committee-frog",
    "name": "Жаба тендерного комітету",
    "description": "Квакає тільки після кворуму. Кворум завжди мокрий.",
    "level": 5,
    "tags": [
      "beast",
      "bureaucracy",
      "water",
      "committee"
    ]
  },
  {
    "id": "monster.safety-intern-chuhaister",
    "name": "Чугайстер-практикант із техніки безпеки",
    "description": "Рятує від лісових небезпек так старанно, що сам стає окремою небезпекою.",
    "level": 6,
    "tags": [
      "folklore",
      "forest",
      "wind",
      "dance"
    ]
  },
  {
    "id": "monster.bulk-discount-zlydni",
    "name": "Злидні гуртової знижки",
    "description": "Прийшли гуртом, бо поодинці розоряти було невигідно.",
    "level": 6,
    "tags": [
      "folklore",
      "swarm",
      "greedy",
      "household"
    ]
  },
  {
    "id": "monster.fourth-grind-rumor-mill",
    "name": "Млинок чуток четвертого помелу",
    "description": "Меле не зерно, а фрази «кажуть, ніби». Борошно теж підозріле.",
    "level": 6,
    "tags": [
      "construct",
      "sound",
      "rumor",
      "wind"
    ]
  },
  {
    "id": "monster.improper-parking-boar",
    "name": "Вепр неналежного паркування",
    "description": "Припаркувався поперек коридору й називає це природним правом копита.",
    "level": 7,
    "tags": [
      "beast",
      "road",
      "armor",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.three-correct-roads-blud",
    "name": "Блуд із трьома правильними дорогами",
    "description": "Показує три правильні дороги. Всі ведуть назад до нього.",
    "level": 7,
    "tags": [
      "folklore",
      "map",
      "trickster",
      "forest"
    ]
  },
  {
    "id": "monster.wet-coal-salamander",
    "name": "Саламандра мокрого вугілля",
    "description": "Запалює те, що не горить, і гасить те, що ви щойно запалили.",
    "level": 7,
    "tags": [
      "beast",
      "fire",
      "water",
      "temperature"
    ]
  },
  {
    "id": "monster.service-key-monkey",
    "name": "Мавпочка службового ключа",
    "description": "Має ключ від кожних дверей, крім тих, за якими її щойно бачили.",
    "level": 7,
    "tags": [
      "beast",
      "key",
      "archive",
      "mobility"
    ]
  },
  {
    "id": "monster.hr-pesyholovets",
    "name": "Песиголовець із відділу кадрів",
    "description": "Запитує про сильні сторони, а потім перевіряє їх зубами.",
    "level": 8,
    "tags": [
      "folklore",
      "humanoid",
      "beast",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.licensed-shine-magpie",
    "name": "Сорока ліцензійного блиску",
    "description": "Краде лише сертифіковане блискуче. Сертифікат друкує сама.",
    "level": 8,
    "tags": [
      "beast",
      "gold",
      "trickster",
      "air"
    ]
  },
  {
    "id": "monster.diet-menu-sausage-basilisk",
    "name": "Ковбасний василіск дієтичного меню",
    "description": "Одним поглядом робить меню пісним, а кухаря — дуже ввічливим.",
    "level": 8,
    "tags": [
      "food",
      "reptile",
      "gaze",
      "kitchen"
    ]
  },
  {
    "id": "monster.dry-fountain-vodyanyk",
    "name": "Водяник сухого фонтану",
    "description": "Завідує водою, якої немає, і бере плату за її нецільове використання.",
    "level": 8,
    "tags": [
      "folklore",
      "water",
      "bureaucracy",
      "merchant"
    ]
  },
  {
    "id": "monster.curfew-stove-lion",
    "name": "Пічний лев комендантської години",
    "description": "Реве після відбою, бо до відбою мусив подати заявку.",
    "level": 9,
    "tags": [
      "construct",
      "fire",
      "gatekeeper",
      "night"
    ]
  },
  {
    "id": "monster.three-instance-duck",
    "name": "Качка трьох інстанцій",
    "description": "Кожне «кря» повертає вашу скаргу на попередній рівень.",
    "level": 9,
    "tags": [
      "beast",
      "bureaucracy",
      "water",
      "argument"
    ]
  },
  {
    "id": "monster.promo-perelesnyk",
    "name": "Перелесник рекламної акції",
    "description": "Залітає іскрою, обіцяє подарунок, а дрібний шрифт уже горить.",
    "level": 9,
    "tags": [
      "folklore",
      "fire",
      "trickster",
      "social"
    ]
  },
  {
    "id": "monster.basement-pipe-stone-catfish",
    "name": "Кам’яний сом підвального водогону",
    "description": "Лежить у трубі так давно, що сантехніки внесли його до плану будівлі.",
    "level": 9,
    "tags": [
      "beast",
      "stone",
      "water",
      "cellar"
    ]
  },
  {
    "id": "monster.final-approval-raven",
    "name": "Ворон остаточного погодження",
    "description": "Каже «кар» тільки після погодження. Тому зазвичай мовчить загрозливо.",
    "level": 10,
    "tags": [
      "beast",
      "bureaucracy",
      "air",
      "mind"
    ]
  },
  {
    "id": "monster.quarterly-report-pan-kotsky",
    "name": "Пан Коцький квартального звіту",
    "description": "Його всі бояться, бо ніхто не перевіряв резюме.",
    "level": 10,
    "tags": [
      "folklore",
      "beast",
      "diplomacy",
      "trickster"
    ]
  },
  {
    "id": "monster.small-business-didko",
    "name": "Дідько малого бізнесу",
    "description": "Веде справи чесно: підписує договір рогом і одразу губить копію.",
    "level": 10,
    "tags": [
      "folklore",
      "demon",
      "merchant",
      "fire"
    ]
  },
  {
    "id": "monster.deep-estimate-sawfish",
    "name": "Риба-пилка кошторисної глибини",
    "description": "Ріже бюджет на частини й кожну називає непередбаченими витратами.",
    "level": 10,
    "tags": [
      "beast",
      "water",
      "audit",
      "knife"
    ]
  },
  {
    "id": "monster.treasure-ventilation-copper-snake",
    "name": "Мідний полоз скарбової вентиляції",
    "description": "Живе між скарбом і протягом, тому шипить із фінансовою прохолодою.",
    "level": 11,
    "tags": [
      "beast",
      "metal",
      "gold",
      "air"
    ]
  },
  {
    "id": "monster.strategic-reserve-potato",
    "name": "Бараболя стратегічного резерву",
    "description": "Лежала на чорний день. Чорний день настав і тепер лежить вона на вас.",
    "level": 11,
    "tags": [
      "plant",
      "food",
      "armor",
      "warehouse"
    ]
  },
  {
    "id": "monster.forest-loss-aurochs",
    "name": "Тур обліку лісових збитків",
    "description": "Рахує зламані дерева рогами. Методика переконлива, хоча трохи б’є.",
    "level": 11,
    "tags": [
      "beast",
      "forest",
      "audit",
      "armor"
    ]
  },
  {
    "id": "monster.service-path-lisovyk",
    "name": "Лісовик службової стежки",
    "description": "Знає коротку стежку, але видає її тільки після довгої співбесіди.",
    "level": 12,
    "tags": [
      "folklore",
      "forest",
      "map",
      "gatekeeper"
    ]
  },
  {
    "id": "monster.siege-iron-varenyk",
    "name": "Залізний вареник облоги",
    "description": "Начинка засекречена, тісто броньоване, сметана оголошена постачанням.",
    "level": 12,
    "tags": [
      "food",
      "construct",
      "armor",
      "siege"
    ]
  },
  {
    "id": "monster.thirteen-address-dragon-courier",
    "name": "Змій-кур’єр тринадцяти адрес",
    "description": "Доставляє вогонь за адресою. Якщо адреса хибна — вважає це геолокацією.",
    "level": 12,
    "tags": [
      "dragon",
      "fire",
      "mobility",
      "delivery"
    ]
  },
  {
    "id": "monster.tide-accountant-vodyanyk",
    "name": "Водяний бухгалтер припливів",
    "description": "Зводить приплив із відпливом і щомісяця знаходить нестачу берега.",
    "level": 13,
    "tags": [
      "folklore",
      "water",
      "bureaucracy",
      "time"
    ]
  },
  {
    "id": "monster.failed-tender-pea-giant",
    "name": "Гороховий велетень невиграного тендеру",
    "description": "Виріс із однієї горошини й тепер вимагає технічне завдання на кожен крок.",
    "level": 13,
    "tags": [
      "giant",
      "plant",
      "bureaucracy",
      "argument"
    ]
  },
  {
    "id": "monster.archive-ventilation-dragon",
    "name": "Дракон архівної вентиляції",
    "description": "Дме на пил так потужно, що старі справи знову вважають активними.",
    "level": 13,
    "tags": [
      "dragon",
      "air",
      "archive",
      "fire"
    ]
  },
  {
    "id": "monster.seven-draft-chuhaister",
    "name": "Чугайстер семи протягів",
    "description": "Танцює сімома протягами одразу й ображається, коли двері називають це ремонтом.",
    "level": 14,
    "tags": [
      "folklore",
      "forest",
      "wind",
      "dance"
    ]
  },
  {
    "id": "monster.seasonal-defense-pumpkin-hetman",
    "name": "Гарбузовий гетьман сезонної оборони",
    "description": "Командує грядкою до першого морозу, а потім переходить на стратегічне пюре.",
    "level": 14,
    "tags": [
      "plant",
      "armor",
      "leadership",
      "autumn"
    ]
  },
  {
    "id": "monster.second-copy-ghost",
    "name": "Привид другого примірника",
    "description": "Перший примірник загубили. Другий прийшов сам і просить розписатися хоча б олівцем.",
    "level": 14,
    "tags": [
      "ghost",
      "paperwork",
      "duplicate"
    ]
  },
  {
    "id": "monster.six-hour-meeting-viy",
    "name": "Вій шестигодинної наради",
    "description": "Повіки важкі не від містики, а від порядку денного на сорок два пункти.",
    "level": 15,
    "tags": [
      "folklore",
      "gaze",
      "mind",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.state-sluice-beaver",
    "name": "Бобер державного шлюзу",
    "description": "Перегородив потік, узгодив дамбу й тепер штрафує воду за обхід.",
    "level": 15,
    "tags": [
      "beast",
      "water",
      "construct",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.cash-gap-upyr",
    "name": "Упир касового розриву",
    "description": "Не п’є кров — лише ліквідність. Від цього чомусь не легше.",
    "level": 15,
    "tags": [
      "undead",
      "gold",
      "merchant",
      "night"
    ]
  },
  {
    "id": "monster.late-vacation-mavka",
    "name": "Мавка невчасної відпустки",
    "description": "Кличе в ліс відпочити й дуже дивується, коли ви питаєте про дату повернення.",
    "level": 16,
    "tags": [
      "folklore",
      "forest",
      "social",
      "trickster"
    ]
  },
  {
    "id": "monster.third-reheat-kulish-phoenix",
    "name": "Кулішний фенікс третього підігріву",
    "description": "Повстає з пригорілої скоринки щоразу, коли кухар каже «ще нормальний».",
    "level": 16,
    "tags": [
      "food",
      "fire",
      "bird",
      "sustain"
    ]
  },
  {
    "id": "monster.night-reservation-mara",
    "name": "Мара нічного резервування",
    "description": "Сідає на груди системі бронювання й шепоче, що всі місця вже зайняті.",
    "level": 16,
    "tags": [
      "cursed",
      "night",
      "mind",
      "time"
    ]
  },
  {
    "id": "monster.storage-silence-reed-king",
    "name": "Очеретяний цар комірної тиші",
    "description": "Править складом, де кожен шурхіт оголошено державною таємницею.",
    "level": 17,
    "tags": [
      "plant",
      "water",
      "royal",
      "controller"
    ]
  },
  {
    "id": "monster.false-note-bandura-griffin",
    "name": "Бандурний грифон фальшивої ноти",
    "description": "Охороняє скарб і тональність. Друге — значно агресивніше.",
    "level": 17,
    "tags": [
      "beast",
      "air",
      "sound",
      "treasure"
    ]
  },
  {
    "id": "monster.last-shift-vovkulaka",
    "name": "Вовкулака останньої зміни",
    "description": "Вдень заповнює табель, уночі — графу «причина відсутности колег».",
    "level": 17,
    "tags": [
      "cursed",
      "beast",
      "night",
      "time"
    ]
  },
  {
    "id": "monster.mountain-leasing-aridnyk",
    "name": "Арідник гірського лізингу",
    "description": "Пропонує гору в розстрочку. Відсоток росте швидше за саму гору.",
    "level": 18,
    "tags": [
      "folklore",
      "demon",
      "stone",
      "gold"
    ]
  },
  {
    "id": "monster.customs-three-whisker-carp",
    "name": "Триусий короп митного ставу",
    "description": "Має три вуса й чотири декларації на кожну луску.",
    "level": 18,
    "tags": [
      "beast",
      "water",
      "bureaucracy",
      "merchant"
    ]
  },
  {
    "id": "monster.hr-intern-necromancer",
    "name": "Некромант-стажер відділу кадрів",
    "description": "Повертає працівників у штат навіть після дуже остаточного звільнення.",
    "level": 18,
    "tags": [
      "unquiet",
      "magic",
      "bureaucracy",
      "humanoid"
    ]
  },
  {
    "id": "monster.cold-storage-state-mammoth",
    "name": "Казенний мамонт холодного складу",
    "description": "Зберігався за документами. За фактом документи зберігалися під ним.",
    "level": 19,
    "tags": [
      "beast",
      "ice",
      "warehouse",
      "armor"
    ]
  },
  {
    "id": "monster.excise-honey-giant-bee",
    "name": "Велетенська бджола акцизного меду",
    "description": "Жалить тільки після сплати збору. Збір приймає медом.",
    "level": 19,
    "tags": [
      "beast",
      "insect",
      "gold",
      "food"
    ]
  },
  {
    "id": "monster.overtime-heat-poludnytsia",
    "name": "Полудниця понаднормової спеки",
    "description": "З’являється опівдні й питає, хто погодив працювати без капелюха.",
    "level": 19,
    "tags": [
      "ghost",
      "folklore",
      "day",
      "heat"
    ]
  },
  {
    "id": "monster.spoon-mobilization-iron-raven",
    "name": "Залізний крук мобілізації ложок",
    "description": "Збирає ложки в одну зграю й називає це реформою приборів.",
    "level": 20,
    "tags": [
      "construct",
      "air",
      "household",
      "swarm"
    ]
  },
  {
    "id": "monster.fire-safety-three-headed-serpent",
    "name": "Триголовий змій пожежної безпеки",
    "description": "Одна голова дихає вогнем, друга гасить, третя складає акт.",
    "level": 20,
    "tags": [
      "dragon",
      "fire",
      "water",
      "bureaucracy",
      "elite"
    ]
  },
  {
    "id": "monster.last-will-dead-auditor",
    "name": "Мрець-ревізор останньої волі",
    "description": "Перевіряє заповіт так ретельно, що спадкоємці починають сумніватися у власній живості.",
    "level": 20,
    "tags": [
      "undead",
      "audit",
      "paperwork",
      "law"
    ]
  },
  {
    "id": "monster.underground-sea-acceptance-whale",
    "name": "Кит підземного моря з актом приймання",
    "description": "Не поміщається в акт приймання, але акт уже підписано.",
    "level": 21,
    "tags": [
      "beast",
      "water",
      "underground",
      "bureaucracy"
    ]
  },
  {
    "id": "monster.collateral-grey-bear",
    "name": "Сивий ведмідь заставного майна",
    "description": "Усе, на що сів, автоматично переходить у забезпечення.",
    "level": 21,
    "tags": [
      "beast",
      "gold",
      "armor",
      "merchant"
    ]
  },
  {
    "id": "monster.empty-chamber-lady",
    "name": "Панночка порожньої світлиці",
    "description": "Приймає гостей у кімнаті без дверей і дуже тихо питає, як вони ввійшли.",
    "level": 21,
    "tags": [
      "ghost",
      "household",
      "night",
      "mind"
    ]
  },
  {
    "id": "monster.fair-tax-honey-leviathan",
    "name": "Медовий левіятан ярмаркового збору",
    "description": "Збирає ярмарковий збір ложкою розміру човна.",
    "level": 22,
    "tags": [
      "beast",
      "food",
      "gold",
      "water"
    ]
  },
  {
    "id": "monster.siege-song-stone-skylark",
    "name": "Кам’яний жайвір облогової пісні",
    "description": "Співає так важко, що ноти падають на укріплення.",
    "level": 22,
    "tags": [
      "construct",
      "stone",
      "sound",
      "air"
    ]
  },
  {
    "id": "monster.written-off-assets-black-booker",
    "name": "Чорнокнижник списаного майна",
    "description": "Списує речі з балансу, а потім викликає їх назад зовсім іншими.",
    "level": 22,
    "tags": [
      "cursed",
      "magic",
      "paperwork",
      "gold"
    ]
  },
  {
    "id": "monster.last-route-star-boar",
    "name": "Зоряний вепр останнього маршруту",
    "description": "Біжить за картою неба, де всі дороги позначені як «через вас».",
    "level": 23,
    "tags": [
      "beast",
      "sky",
      "map",
      "mobility"
    ]
  },
  {
    "id": "monster.queue-dragon-prince",
    "name": "Князь драконячої черги",
    "description": "Охороняє останнє місце в черзі й ніколи не пояснює, що там видають.",
    "level": 23,
    "tags": [
      "dragon",
      "bureaucracy",
      "gatekeeper",
      "royal",
      "elite"
    ]
  },
  {
    "id": "monster.expired-archive-upyr-king",
    "name": "Король упирів простроченого архіву",
    "description": "Прокинувся через сторіччя й одразу попросив усі довідки за минулий квартал.",
    "level": 23,
    "tags": [
      "undead",
      "archive",
      "bureaucracy",
      "royal",
      "elite"
    ]
  }
] satisfies MonsterContent[];

export type LoreCanonicalRefType = "race" | "class" | "monster" | "location" | "item";

export interface LoreCanonicalRef {
  type: LoreCanonicalRefType;
  id: string;
}

export interface LoreCategory {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  entryMode?: "lore" | "external";
}

export interface LoreEntry {
  id: string;
  categoryId: string;
  title: string;
  source: string;
  body: string;
  canonicalRefs?: readonly LoreCanonicalRef[];
}

export interface LoreEntryGroup {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  sortOrder: number;
  entryIds: readonly string[];
}

export interface LoreContentValidationInput {
  categories?: readonly LoreCategory[];
  entries?: readonly LoreEntry[];
  groups?: readonly LoreEntryGroup[];
  knownRefs?: Partial<Record<LoreCanonicalRefType, ReadonlySet<string>>>;
}

export const loreCategories: readonly LoreCategory[] = [
  {
    id: "kvestarnia",
    title: "🏚 Про Квестарню",
    description: "Корчма, дошка, правила й те, чому сюди весь час заходять пригодники.",
    sortOrder: 10
  },
  {
    id: "places",
    title: "🪧 Місцини корчми",
    description: "Поточні місця Квестарні: зала, Шинок, Стіл зі справами, Льох, Бочка, Низ і сусідні кутки.",
    sortOrder: 20
  },
  {
    id: "races",
    title: "🧝 Раси пригодників",
    description: "Активні раси з анкети пригодника, без вигаданих народів поза поточною грою.",
    sortOrder: 30
  },
  {
    id: "classes",
    title: "⚔️ Класи пригодників",
    description: "Поточні класи персонажа й те, як вони звучать у корчмі.",
    sortOrder: 40
  },
  {
    id: "bestiary",
    title: "🧌 Бестіарій",
    description: "Повний чинний Бестіарій живе на Столі зі справами; тут Дошка корчми тримає до нього закладку.",
    sortOrder: 50,
    entryMode: "external"
  },
  {
    id: "loot",
    title: "🎒 Манатки",
    description: "Лут, трофеї й речі, які іноді краще не нюхати перед екіпіруванням.",
    sortOrder: 60
  },
  {
    id: "customs",
    title: "📜 Звичаї й чутки",
    description: "Як Квестарня пояснює рівні, дошки, поразки, пошук і корчмарську бухгалтерію.",
    sortOrder: 70
  }
] as const;

export const loreEntryGroups: readonly LoreEntryGroup[] = [
  {
    id: "outside",
    categoryId: "places",
    title: "🏚 Надвірʼя",
    description: "Поріг, дощ і задвірок, де маг уже зайняв навіс під Чароковальню.",
    sortOrder: 10,
    entryIds: ["place-front", "place-yard"]
  },
  {
    id: "hall-shynok",
    categoryId: "places",
    title: "🍺 Зала й шинок",
    description: "Головна зала, дошка, стіл зі справами й шинокова піна з бухгалтерським виразом.",
    sortOrder: 20,
    entryIds: ["place-hall", "place-quest-table", "place-bar", "place-news-corner"]
  },
  {
    id: "barrel-cellar",
    categoryId: "places",
    title: "🛢 Бочка й льох",
    description: "Підозрілий низ корчми до того, як він остаточно стає Низом.",
    sortOrder: 30,
    entryIds: ["place-cellar", "place-barrel"]
  },
  {
    id: "corners",
    categoryId: "places",
    title: "🎯 Кутки",
    description: "Єгерський і бійцівський кутки: там, де поради мають ремені, сліди або синці.",
    sortOrder: 40,
    entryIds: ["place-ranger-corner", "place-fighting-corner"]
  },
  {
    id: "nyz",
    categoryId: "places",
    title: "⬇️ Низ",
    description: "Спуск, Сутерени Корчми й проходи, які поводяться надто самостійно для архітектури.",
    sortOrder: 50,
    entryIds: [
      "place-deep",
      "place-deep-level1",
      "place-deep-level1-left",
      "place-deep-level1-straight",
      "place-deep-level1-right"
    ]
  }
] as const;

export const loreEntries: readonly LoreEntry[] = [
  {
    id: "tavern-threshold-current",
    categoryId: "kvestarnia",
    title: "Квестарня, що стоїть на порозі",
    source: "зі слів корчмаря, записано на звороті рахунку",
    body: "Квестарня стоїть не між містами, а між «я на хвилинку» і «чому в мене вже 13 рівень». Двері скриплять так, ніби впізнають кожного, хто заходив без плану, без зброї або з надлишком хоробрости."
  },
  {
    id: "notice-board-current",
    categoryId: "kvestarnia",
    title: "Дошка корчми",
    source: "прибито кривим цвяхом біля входу",
    body: "Дошка корчми не любить, коли її називають просто меню. На ній живуть новини, перекази, зарубки видатних жителів, підозрілі стрілочки й папірці, які самі не пам’ятають, хто їх прибив.",
    canonicalRefs: [{ type: "location", id: "location.korchma.news_corner" }]
  },
  {
    id: "place-front",
    categoryId: "places",
    title: "Перед корчмою",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Перед корчмою пригодники ще мають шанс сказати: «та я тільки подивлюся». Двері терпляче чекають. Вони бачили цю фразу стільки разів, що вже мають на неї окрему петлю.",
    canonicalRefs: [{ type: "location", id: "location.korchma.front" }]
  },
  {
    id: "place-yard",
    categoryId: "places",
    title: "Задвірок корчми",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Задвірок корчми — місце, де мотузки, відра й підозрілі сліди поводяться так, ніби мають маленьку профспілку. Тепер під навісом тут стоїть Чароковальня: ельф-маг привіз банку з Іскрокаменем, молот і впевненість, що манатки треба лагідно переконувати іскрами. Корчмар каже: якщо щось шурхотить, це ще не проблема. Якщо іскрить — це вже запис до мага.",
    canonicalRefs: [{ type: "location", id: "location.korchma.yard" }]
  },
  {
    id: "place-hall",
    categoryId: "places",
    title: "Зала корчми",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Зала корчми тримає всі маршрути разом: дошку, стіл, шинок, бочку, льох і спуск до Низу. Якщо пригодник не знає, куди йти, зала чемно робить вигляд, що це теж план.",
    canonicalRefs: [{ type: "location", id: "location.korchma.hall" }]
  },
  {
    id: "place-quest-table",
    categoryId: "places",
    title: "Стіл зі справами",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Стіл зі справами витримує квести, полювання, архіви й бестіарій. Він би попросив підвищення, але поки що просить тільки не ставити кухлі на папери з написом «терміново».",
    canonicalRefs: [{ type: "location", id: "location.korchma.quest_table" }]
  },
  {
    id: "place-bar",
    categoryId: "places",
    title: "Шинок",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Шинок знає, що напої — це не лише золота яма, а й соціяльний ритуал. Тут Бард може виступити, пригодник — пригостити всіх пивом, компанія — сісти за тавлеї чи кості, а корчмар — зробити вигляд, що це економіка, а не драматична піна.",
    canonicalRefs: [{ type: "location", id: "location.korchma.bar" }]
  },
  {
    id: "place-cellar",
    categoryId: "places",
    title: "Льох корчми",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Льох корчми зберігає пляшки, пил і відчуття, що хтось уже записав вас у господарський журнал. Тут навіть тиша звучить так, ніби її треба здати за описом.",
    canonicalRefs: [{ type: "location", id: "location.korchma.cellar" }]
  },
  {
    id: "place-barrel",
    categoryId: "places",
    title: "Біля Бочки Пінного Міражу",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Бочка Пінного Міражу стоїть так упевнено, ніби це всі інші перебувають біля неї, а не вона в корчмі. Піна тут має розклад, характер і кілька претензій до героїзму.",
    canonicalRefs: [{ type: "location", id: "location.korchma.barrel" }]
  },
  {
    id: "place-news-corner",
    categoryId: "places",
    title: "Дошка корчми",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Дошка корчми тримає вісти, перекази, подарунки й пошту так, ніби папір сам просив соціяльного життя. Якщо запис зник, він або застарів, або пішов по цвяхи.",
    canonicalRefs: [{ type: "location", id: "location.korchma.news_corner" }]
  },
  {
    id: "place-ranger-corner",
    categoryId: "places",
    title: "Єгерський куток",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Єгерський куток пахне ременями, слідами й рішеннями, які краще приймати до темряви. Єгер не губить шляхів: він просто іноді дає їм час подумати.",
    canonicalRefs: [{ type: "location", id: "location.korchma.ranger_corner" }]
  },
  {
    id: "place-fighting-corner",
    categoryId: "places",
    title: "Бійцівський куток",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Бійцівський куток пояснює різницю між тренуванням і суперечкою меблям. Тут удари мають чергу, а черга іноді отримує перший урок з ухилення.",
    canonicalRefs: [{ type: "location", id: "location.korchma.fighting_corner" }]
  },
  {
    id: "place-deep",
    categoryId: "places",
    title: "Низ",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Низ починається там, де корчма перестає вдавати, що має нормальний підвал. Спуск до Низу чемний, але дуже наполегливий: він завжди знає, куди веде, і рідко питає, чи ви готові.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep" }]
  },
  {
    id: "place-deep-level1",
    categoryId: "places",
    title: "Сутерени Корчми",
    source: "польова нотатка з місцини: Низ",
    body: "Сутерени Корчми — перший ярус Низу, де коридори ще вдають пристойність. Якщо мапа тут бреше, це не баґ. Це місцева форма ввічливости.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep.level1" }]
  },
  {
    id: "place-deep-level1-left",
    categoryId: "places",
    title: "Лівий прохід",
    source: "польова нотатка з місцини: Сутерени Корчми",
    body: "Лівий прохід у Сутеренах виглядає так, ніби вже знає вашу помилку наперед. Тут темрява не густа, вона просто добре організована.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep.level1.left" }]
  },
  {
    id: "place-deep-level1-straight",
    categoryId: "places",
    title: "Прямий прохід",
    source: "польова нотатка з місцини: Сутерени Корчми",
    body: "Прямий прохід обіцяє бути прямим, і саме тому викликає недовіру. Двері попереду не сперечаються, але в Квестарні це ще не доказ невинности.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep.level1.straight" }]
  },
  {
    id: "place-deep-level1-right",
    categoryId: "places",
    title: "Правий прохід",
    source: "польова нотатка з місцини: Сутерени Корчми",
    body: "Правий прохід здається легшим, що вже саме по собі підозріло. Коли коридор усміхається без обличчя, пригодники зазвичай перевіряють ремені й самооцінку.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep.level1.right" }]
  },
  {
    id: "race-human-ish",
    categoryId: "races",
    title: "Людисько",
    source: "з корчмарської анкети пригодника",
    body: "Людисько в Квестарні — це не «звичайна людина», а майстер виживання в анкетах, чергах і ситуаціях, де інші вже шукають мітологічне пояснення.\n\nУ бою «🧰 Практична імпровізація» бʼє найближчою придатною річчю: шкода не завжди академічна, зате влучна й без зайвих пояснень.",
    canonicalRefs: [{ type: "race", id: "race.human-ish" }]
  },
  {
    id: "race-dwarf",
    categoryId: "races",
    title: "Гном",
    source: "з корчмарської анкети пригодника",
    body: "Гном стійкий до ударів, боргів і високих полиць. У Квестарні це важлива трійця: полиці тут підозріло амбітні, а борги іноді мають власний голос.\n\nУ бою «🪨 Низький центр ваги» тримає гнома й союзників рівніше: підлога на його боці, а чужі удари втрачають частину запалу.",
    canonicalRefs: [{ type: "race", id: "race.dwarf" }]
  },
  {
    id: "race-elf",
    categoryId: "races",
    title: "Ельф",
    source: "з корчмарської анкети пригодника",
    body: "Ельф влучний, драматичний і трохи ображений на стан ваших чобіт. Якщо він мовчить, це або зосередження, або дуже довга внутрішня рецензія на інтерʼєр.\n\nУ бою «🎯 Ображена точність» знаходить місце, де ворог найменше готовий до критики. Постріл чи удар виходить не гучний, зате дуже особистий.",
    canonicalRefs: [{ type: "race", id: "race.elf" }]
  },
  {
    id: "race-bisyny",
    categoryId: "races",
    title: "Бісини",
    source: "з корчмарської анкети пригодника",
    body: "Бісини ходять так, ніби словники досі сперечаються, хто їх випустив. Вони спритні, кмітливі й харизматичні рівно настільки, щоб будь-яка називальна суперечка стала пригодою.\n\nУ бою «📝 Правка на полях» чіпляє всіх ворогів одразу: коментар короткий, шкода дрібна, але після нього бити у відповідь уже менш переконливо.",
    canonicalRefs: [{ type: "race", id: "race.bisyny" }]
  },
  {
    id: "race-drantohor",
    categoryId: "races",
    title: "Дрантогор",
    source: "з корчмарської анкети пригодника",
    body: "Дрантогор заблукав із Королівства Остромаг і робить вигляд, що це був план. Межа підписала пропуск заднім числом, а мапа досі соромиться.\n\nУ бою «🌀 Крок крізь Межу» виходить не звідти, де ворог чекав. Удар приходить із незручної географії, а відповідь губить дорогу назад.",
    canonicalRefs: [{ type: "race", id: "race.drantohor" }]
  },
  {
    id: "race-domovyk",
    categoryId: "races",
    title: "Домовик",
    source: "з корчмарської анкети пригодника",
    body: "Домовик знаходить дрібний лут там, де інші знаходять лише пил. Пил не заперечує: він теж давно підозрював, що під шафою відбувається економіка.\n\nУ бою «🧦 Запас під піччю» витягає допомогу для найбільш побитого союзника або самого домовика. Ніхто не питає, чому запас теплий.",
    canonicalRefs: [{ type: "race", id: "race.domovyk" }]
  },
  {
    id: "race-dryland-rusalka",
    categoryId: "races",
    title: "Русалка сухопутна",
    source: "з корчмарської анкети пригодника",
    body: "Сухопутна русалка магічна, харизматична й підозріло уважна до чайників. Вона вже не питає, де море, але кожна калюжа поводиться біля неї чемніше.\n\nУ бою «🌊 Сухий приплив» накочує на всіх ворогів без води й трохи підтягує саму русалку. Корчма визнає це припливом, бо сперечатись мокро навіть без моря.",
    canonicalRefs: [{ type: "race", id: "race.dryland-rusalka" }]
  },
  {
    id: "race-intellectual-orc",
    categoryId: "races",
    title: "Орк-інтелігент",
    source: "з корчмарської анкети пригодника",
    body: "Орк-інтелігент має силу з дипломом і аргументи, які краще не ловити обличчям. Після бійки він може пояснити, чому це була дискусія.\n\nУ бою «📚 Рецензований удар» подає аргумент плечем і додає посилання на практику. Ворог рідко погоджується, зате часто відступає від теми.",
    canonicalRefs: [{ type: "race", id: "race.intellectual-orc" }]
  },
  {
    id: "race-molfar-soul",
    categoryId: "races",
    title: "Мольфарська душа",
    source: "з корчмарської анкети пригодника",
    body: "Мольфарська душа носить у кишені оберіг, у голові туман, а в кишені ще один оберіг. Корчмар не питає, де саме душа тримає кишені.\n\nУ бою «🧿 Туманний оберіг» ставить туман перед союзниками, стишує відповідь ворога й іноді повертає нахабству дрібний борг.",
    canonicalRefs: [{ type: "race", id: "race.molfar-soul" }]
  },
  {
    id: "class-warrior",
    categoryId: "classes",
    title: "Воїн",
    source: "з навчальної полиці класів",
    body: "Воїн має простий план: стояти рівно й переконливо махати залізом. У бою цей план називається «🪓 Силовий замах» і пояснює одній проблемі, чому стояти перед сокирою — погана кар’єра.\n\nПоза самим замахом воїн може тримати по зброї в кожній руці. Корчмар каже, що це не жадібність, а симетрична аргументація.",
    canonicalRefs: [{ type: "class", id: "class.warrior" }]
  },
  {
    id: "class-mage",
    categoryId: "classes",
    title: "Маг",
    source: "з навчальної полиці класів",
    body: "Маг каже складні слова, після яких у кімнаті стає гарячіше. У бою це оформлено як «🔥 Гаряче закляття»: усі вороги раптом згадують, що техніка безпеки теж буває магічною.\n\nУ задвірку магу легше домовлятися з Чароковальнею: не тому, що іскри слухняні, а тому, що він знає, коли саме відскочити від манатки з гідністю.",
    canonicalRefs: [{ type: "class", id: "class.mage" }]
  },
  {
    id: "class-bard",
    categoryId: "classes",
    title: "Бард",
    source: "з навчальної полиці класів",
    body: "Бард перемагає харизмою, куплетами й небезпечною впевненістю. У бою «🎶 Небезпечний куплет» чіпляє всіх ворогів і лишає союзникам моральний піджак на плечах.\n\nУ шинку бард може виступити для активної публіки поруч. Це називають мистецтвом, поки хтось не починає рахувати чайові.",
    canonicalRefs: [{ type: "class", id: "class.bard" }]
  },
  {
    id: "class-rogue",
    categoryId: "classes",
    title: "Злодій",
    source: "з навчальної полиці класів",
    body: "Злодій зникає швидше, ніж рахунок після походу в корчму. У бою «🌘 Тіньовий розтин» робить один точний розріз і лишає коротку тіньову паузу перед відповіддю.\n\nКоли злодія вже сприймають як фахівця, а не як протяг у капюшоні, він може ризикнути «🗡️ Тихою кишенею» по активній цілі поруч. Золота мало, публічного сорому нема, зате чужий лікоть іноді має переконливу теорію справедливости.",
    canonicalRefs: [{ type: "class", id: "class.rogue" }]
  },
  {
    id: "class-priest",
    categoryId: "classes",
    title: "Жрець",
    source: "з навчальної полиці класів",
    body: "Жрець лікує союзників і суворо дивиться на нежить. У бою «✨ Суворе благословення» підлатає найпобитішого й пояснить супротивнику, що милосердя теж має гострий край.\n\nКоли корчма визнає жерця достатньо відповідальним для чужих синців, він може допомогти собі або активному пригоднику поруч поза боєм: полікувати маною без бинтів або накласти коротке благословення на Вдачу.",
    canonicalRefs: [{ type: "class", id: "class.priest" }]
  },
  {
    id: "class-varenyk-mancer",
    categoryId: "classes",
    title: "Вареник-мант",
    source: "з навчальної полиці класів",
    body: "Вареник-мант керує тістом, настроєм і легким відчуттям ситости. У бою «🥟 Кипляча начинка» бризкає по ворогах, а пара трохи зцілює пригодника, бо навіть магія любить, коли всередині тепло.",
    canonicalRefs: [{ type: "class", id: "class.varenyk-mancer" }]
  },
  {
    id: "class-bureaucramancer",
    categoryId: "classes",
    title: "Бюрокромант",
    source: "з навчальної полиці класів",
    body: "Бюрокромант знерухомлює ворогів формами, печатками й дуже серйозним виглядом. У бою «📄 Форма 13-Б» змушує кожного ворога тимчасово виглядати як помилка заповнення, а це в Квестарні майже стан здоров’я.",
    canonicalRefs: [{ type: "class", id: "class.bureaucramancer" }]
  },
  {
    id: "class-ranger",
    categoryId: "classes",
    title: "Єгер",
    source: "з навчальної полиці класів",
    body: "Єгер знає стежки, пастки й де ховається ваша остання стріла. У бою «🏹 Рикошетний постріл» знаходить головну ціль і нахабно чіпляє решту, бо стріла теж має маршрутну думку.\n\nПоза боєм єгерський куток тримає неспокійні справи, сліди й медичні запаси. Єгер не завжди пояснює, звідки це знає, бо тоді доведеться пояснювати і стрілу.",
    canonicalRefs: [{ type: "class", id: "class.ranger" }]
  },
  {
    id: "class-kharakternyk",
    categoryId: "classes",
    title: "Козак-характерник",
    source: "з навчальної полиці класів",
    body: "Козак-характерник дивиться на проблему так, що проблема сама шукає собі іншу пригоду. У бою «👁 Степовий косий погляд» проходить по всіх ворогах і стишує їхню певність, не підвищуючи голосу. Біля Старшого Брата Бочки характерник може поставити знак, який ватага підпирає перед першим великим гуркотом.",
    canonicalRefs: [{ type: "class", id: "class.kharakternyk" }]
  },
  {
    id: "loot-mantok-definition",
    categoryId: "loot",
    title: "Що таке манатки",
    source: "пояснення з торби, яка бачила забагато",
    body: "Манатки — це не просто предмети. Це доказ, що пригода справді сталася й не все вдалося замʼяти під килим. Пательня переконання, корок пінного переобліку й чек формальної підозри можуть бути механічно дрібними, але історично важливими. Деякі манатки ще й упізнають родичів: комплектом вони штовхають циферки трохи впевненіше. А найнахабніші рідкісні манатки вже вчать спорядження окремого бойового трюку: на картці він чесно зветься «Дія спорядження», а не прихований фокус із рукава. У задвірку корчми ельф-маг тримає Чароковальню, де окрему споряджену дивину можна обережно підсилити Іскрокаменем до видимого плюса; після вдягання магія ще має налаштуватися на пригодника, бо навіть пательня не любить працювати без знайомства. Це магічне покращення, а не ринок, не ремесло на продаж і не автоматичний спалах.",
    canonicalRefs: [
      { type: "item", id: "item.pan-of-persuasion" },
      { type: "item", id: "item.foam-cork-of-accounting" },
      { type: "item", id: "item.receipt-of-formal-suspicion" },
      { type: "item", id: "item.iskrokamin" }
    ]
  },
  {
    id: "loot-one-use-mantok",
    categoryId: "loot",
    title: "Разові манатки",
    source: "памʼятка з дна торби",
    body: "Разові манатки не вдягають на себе, а витрачають у слушну мить. Поза боєм Бинт відповідальної паніки можна прикласти без зайвого геройства; у бою медична манатка стає дією ходу, лікує тут і зараз, а вороги не завжди чемно чекають.",
    canonicalRefs: [
      { type: "item", id: "item.responsible-panic-bandage" },
      { type: "item", id: "item.dense-bandage" },
      { type: "item", id: "item.field-kit" }
    ]
  },
  {
    id: "loot-mantok-crafting",
    categoryId: "loot",
    title: "Крафт манаток",
    source: "зі шпаргалки Єгеря, трохи в бинтах",
    body: "Крафт у Квестарні поки що вузький і медичний: після єгерських неспокійних справ або після першого ремортного досвіду звичайні бинти можна перешити у Щільний бинт або зібрати в Польову аптечку. Це не фабрика чудес, а спосіб змусити паніку тримати форму.",
    canonicalRefs: [
      { type: "item", id: "item.responsible-panic-bandage" },
      { type: "item", id: "item.dense-bandage" },
      { type: "item", id: "item.field-kit" }
    ]
  },
  {
    id: "loot-apology-items",
    categoryId: "loot",
    title: "Вибачальні манатки",
    source: "занотовано після технічної пригоди",
    body: "Коли корчма чхає деплоєм, у торбах можуть з’являтися речі з вибаченнями: Квитанція відкоченої міграції, Корок повторного деплою або Печатка P3009 «Уже лагодимо».",
    canonicalRefs: [
      { type: "item", id: "item.apology.rollback-receipt" },
      { type: "item", id: "item.apology.redeploy-cork" },
      { type: "item", id: "item.apology.p3009-stamp" }
    ]
  },
  {
    id: "custom-search-deep",
    categoryId: "customs",
    title: "Пошукати в Низі",
    source: "з нотатки, знайденої біля Сутеренів",
    body: "У Низі можна пошукати, але Низ теж може пошукати вас. Безпечний обшук знаходить дрібниці або нічого; ризикований прохід іноді нагадує, що монстр уже стояв поруч і просто чекав вашого жесту.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep.level1" }]
  },
  {
    id: "custom-no-p2w",
    categoryId: "customs",
    title: "Про гроші й силу",
    source: "написано на дні Бочки підтримки",
    body: "У Квестарні реальні монети можуть підтримати корчму, сервер і корчмареві нерви, але не купують бойову силу, лут чи прогрес. За підтримку можна отримати тепле «дякуємо» й Тост із Бочки."
  }
] as const;

export function getLoreCategory(categoryId: string): LoreCategory | undefined {
  return loreCategories.find((category) => category.id === categoryId);
}

export function getLoreEntry(entryId: string): LoreEntry | undefined {
  return loreEntries.find((entry) => entry.id === entryId);
}

export function getLoreEntryGroup(groupId: string): LoreEntryGroup | undefined {
  return loreEntryGroups.find((group) => group.id === groupId);
}

export function getLoreEntriesForCategory(categoryId: string): readonly LoreEntry[] {
  return loreEntries.filter((entry) => entry.categoryId === categoryId);
}

export function getLoreEntryGroupsForCategory(categoryId: string): readonly LoreEntryGroup[] {
  return loreEntryGroups
    .filter((group) => group.categoryId === categoryId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getLoreEntriesForGroup(groupId: string): readonly LoreEntry[] {
  const group = getLoreEntryGroup(groupId);

  if (!group) {
    return [];
  }

  return group.entryIds
    .map((entryId) => getLoreEntry(entryId))
    .filter((entry): entry is LoreEntry => Boolean(entry));
}

export function selectRandomLoreEntry(
  entries: readonly LoreEntry[] = loreEntries,
  rng: () => number = Math.random
): LoreEntry | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const index = Math.min(entries.length - 1, Math.floor(Math.max(0, rng()) * entries.length));
  return entries[index];
}

export function selectRandomLoreEntryForCategory(
  categoryId: string,
  rng: () => number = Math.random
): LoreEntry | undefined {
  return selectRandomLoreEntry(getLoreEntriesForCategory(categoryId), rng);
}

export function validateLoreBoardContent(input: LoreContentValidationInput = {}): string[] {
  const categories: readonly LoreCategory[] = input.categories ?? loreCategories;
  const entries: readonly LoreEntry[] = input.entries ?? loreEntries;
  const groups: readonly LoreEntryGroup[] = input.groups ?? loreEntryGroups;
  const errors: string[] = [];
  const categoryIds = new Set<string>();
  const entryIds = new Set<string>();
  const groupIds = new Set<string>();

  for (const category of categories) {
    if (!category.id.trim()) {
      errors.push("Lore category has empty id.");
    }
    if (!category.title.trim()) {
      errors.push(`Lore category ${category.id} has empty title.`);
    }
    if (!category.description.trim()) {
      errors.push(`Lore category ${category.id} has empty description.`);
    }
    if (categoryIds.has(category.id)) {
      errors.push(`Duplicate lore category id: ${category.id}.`);
    }
    categoryIds.add(category.id);
  }

  for (const entry of entries) {
    if (!entry.id.trim()) {
      errors.push("Lore entry has empty id.");
    }
    if (entryIds.has(entry.id)) {
      errors.push(`Duplicate lore entry id: ${entry.id}.`);
    }
    entryIds.add(entry.id);
    if (!categoryIds.has(entry.categoryId)) {
      errors.push(`Lore entry ${entry.id} references unknown category ${entry.categoryId}.`);
    }
    if (!entry.title.trim()) {
      errors.push(`Lore entry ${entry.id} has empty title.`);
    }
    if (!entry.source.trim()) {
      errors.push(`Lore entry ${entry.id} has empty source.`);
    }
    if (!entry.body.trim()) {
      errors.push(`Lore entry ${entry.id} has empty body.`);
    }

    const canonicalRefs: readonly LoreCanonicalRef[] = entry.canonicalRefs ?? [];

    for (const ref of canonicalRefs) {
      if (!ref.id.trim()) {
        errors.push(`Lore entry ${entry.id} has empty canonical ref.`);
        continue;
      }

      const knownIds = input.knownRefs?.[ref.type];
      if (knownIds && !knownIds.has(ref.id)) {
        errors.push(`Lore entry ${entry.id} references unknown ${ref.type} id ${ref.id}.`);
      }
    }
  }

  for (const group of groups) {
    if (!group.id.trim()) {
      errors.push("Lore entry group has empty id.");
    }
    if (groupIds.has(group.id)) {
      errors.push(`Duplicate lore entry group id: ${group.id}.`);
    }
    groupIds.add(group.id);
    if (!categoryIds.has(group.categoryId)) {
      errors.push(`Lore entry group ${group.id} references unknown category ${group.categoryId}.`);
    }
    if (!group.title.trim()) {
      errors.push(`Lore entry group ${group.id} has empty title.`);
    }
    if (!group.description.trim()) {
      errors.push(`Lore entry group ${group.id} has empty description.`);
    }
    if (group.entryIds.length === 0) {
      errors.push(`Lore entry group ${group.id} has no entries.`);
    }

    for (const entryId of group.entryIds) {
      const entry = entries.find((candidate) => candidate.id === entryId);

      if (!entry) {
        errors.push(`Lore entry group ${group.id} references unknown entry ${entryId}.`);
        continue;
      }

      if (entry.categoryId !== group.categoryId) {
        errors.push(`Lore entry group ${group.id} references entry ${entryId} from ${entry.categoryId}.`);
      }
    }
  }

  for (const category of categories) {
    if (category.entryMode !== "external" && !entries.some((entry) => entry.categoryId === category.id)) {
      errors.push(`Lore category ${category.id} has no entries.`);
    }
  }

  return errors;
}

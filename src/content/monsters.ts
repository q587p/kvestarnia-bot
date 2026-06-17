import type { MonsterContent } from "./schema";

export const monsters = [
  {
    id: "monster.mimic-shawarma",
    name: "Мімік-шаурма",
    description: "Виглядає апетитно, але це саме так працює маркетинг міміків.",
    level: 1,
    tags: ["mimic", "food", "starter", "korchma"]
  },
  {
    id: "monster.basement-mouse-with-title",
    name: "Льохова Миша з Титулом",
    description: "Мала істота великого самопроголошення. Вимагає сир, повагу й дрібний герб.",
    level: 1,
    tags: ["beast", "cellar", "tiny-boss", "diplomacy"]
  },
  {
    id: "monster.stamp-doorkeeper-skeleton",
    name: "Скелет-вахтер печаток",
    description: "Не пускає навіть смерть без пропуску. Смерть уже стоїть у черзі.",
    level: 2,
    tags: ["undead", "bureaucracy", "gatekeeper"]
  },
  {
    id: "monster.spreadsheet-goblin",
    name: "Гоблін з Електронною Табличкою",
    description: "Порахував ваші HP до зустрічі й образився, що вони ще не мінус.",
    level: 2,
    tags: ["goblin", "bureaucracy", "numbers"]
  },
  {
    id: "monster.deadline-spider",
    name: "Павук дедлайнів",
    description: "Плете павутину з «сьогодні швиденько» й ловить тих, хто повірив.",
    level: 2,
    tags: ["beast", "time", "web"]
  },
  {
    id: "monster.preapproval-dragonling",
    name: "Дракончик попереднього погодження",
    description: "Не дихає вогнем без трьох підписів, але димить з принципу.",
    level: 3,
    tags: ["dragon", "bureaucracy", "fire", "mini-boss"]
  },
  {
    id: "monster.unread-rules-ghost",
    name: "Привид непрочитаних правил",
    description: "З’являється, коли хтось натиснув кнопку, не дочитавши абзац дрібним шрифтом.",
    level: 2,
    tags: ["ghost", "rules", "undead", "tutorial"]
  },
  {
    id: "monster.anxious-slippers-swarm",
    name: "Зграя капців тривожної мобільности",
    description: "Біжить у різні боки й вимагає, щоб ви теж визначились.",
    level: 1,
    tags: ["swarm", "household", "mobility", "comic"]
  },
  {
    id: "monster.borshch-slime",
    name: "Борщовий слизень правильної температури",
    description: "Спробуй сказати «холодний» — він стане особистим.",
    level: 2,
    tags: ["slime", "food", "kitchen", "temperature"]
  },
  {
    id: "monster.conditionally-sliced-loaf-bandit",
    name: "Буханець-бандит умовної нарізки",
    description: "Ще не нарізаний, але вже вимагає частку з кожної крихти.",
    level: 2,
    tags: ["food", "bandit", "bread", "knife"]
  },
  {
    id: "monster.queue-counter-gargoyle",
    name: "Ґарґулья лічильника черги",
    description: "Сидить над дверима і видає номерки тим, хто просто проходив повз.",
    level: 3,
    tags: ["construct", "queue", "stone", "bureaucracy"]
  },
  {
    id: "monster.audit-mosquito",
    name: "Комар-ревізор дрібних витрат",
    description: "П’є не кров, а пояснення, куди поділися дві монети.",
    level: 1,
    tags: ["insect", "audit", "annoying", "gold"]
  },
  {
    id: "monster.archival-knysh-eater",
    name: "Архівний книшоїд",
    description: "Їсть старі справи, лишає крихти доказів і дуже ситий вигляд.",
    level: 2,
    tags: ["archive", "food", "paper", "beast"]
  },
  {
    id: "monster.final-comment-troll",
    name: "Троль останнього коментаря",
    description: "Живе під мостом, але вилазить там, де хтось написав «закриваю тему».",
    level: 3,
    tags: ["troll", "naming", "bridge", "argument"]
  },
  {
    id: "monster.report-jellyfish",
    name: "Медузка звітности",
    description: "Пливе повітрям, жалить пунктами плану й просить називати це прозорістю.",
    level: 2,
    tags: ["jellyfish", "paperwork", "soft", "floating"]
  },
  {
    id: "monster.no-change-merchantling",
    name: "Крамарик без здачі",
    description: "Малий торговець великої принциповости. Має решту, але вважає її лором.",
    level: 2,
    tags: ["merchant", "gold", "trickster", "shop"]
  },
  {
    id: "monster.self-critique-mirror",
    name: "Дзеркальце зайвої самокритики",
    description: "Показує не обличчя, а коментарі, які ви самі собі не просили.",
    level: 3,
    tags: ["cursed", "mirror", "mind", "comic"]
  },
  {
    id: "monster.dry-sea-teapot",
    name: "Чайник сухого моря",
    description: "Свистить так, ніби пам’ятає океан, але в ньому тільки чай і претензії.",
    level: 2,
    tags: ["kitchen", "teapot", "water", "sound"]
  },
  {
    id: "monster.cabbage-knight-on-break",
    name: "Капустяний лицар на перерві",
    description: "Охороняє грядку, честь і право бути квашеним за графіком.",
    level: 2,
    tags: ["plant", "knight", "garden", "armor"]
  },
  {
    id: "monster.zero-declaration-tax-dragon",
    name: "Податковий дракон нульової декларації",
    description: "Маленький тільки на відстані. Зблизька питає, чому скарб названо «знахідкою».",
    level: 5,
    tags: ["dragon", "boss", "gold", "bureaucracy", "tax"]
  },
  {
    id: "monster.complaint-lantern",
    name: "Скаргова лампа",
    description: "Світить лише тоді, коли хтось починає жалітись голосніше за корчмаря.",
    level: 4,
    tags: ["paperwork", "sound", "time", "unquiet"]
  },
  {
    id: "monster.ledger-boar",
    name: "Кабан прибутково-видаткової книги",
    description: "Риє нісом у рахунках і залишає після себе тільки сумнівні витрати та сліди копит.",
    level: 5,
    tags: ["beast", "paperwork", "audit", "unquiet"]
  },
  {
    id: "monster.salted-oath-pretzel",
    name: "Крендель солоної обіцянки",
    description: "Сухий, гнучкий і страшенно переконаний, що довіра — це теж начинка.",
    level: 6,
    tags: ["food", "bread", "rules"]
  },
  {
    id: "monster.unclosed-closure-act",
    name: "Акт закриття, який не закрився",
    description: "Шурхотить правилами й просить ще один підпис після того, як справу вже поховали в архіві.",
    level: 6,
    tags: ["paperwork", "rules", "bureaucracy", "unquiet"]
  },
  {
    id: "monster.liar-corridor-map",
    name: "Мапа коридору, яка бреше",
    description: "Показує вихід там, де насправді тільки ще один коридор і трохи сорому.",
    level: 7,
    tags: ["paper", "rules", "trickster", "unquiet"]
  },
  {
    id: "monster.foam-auditor-boots",
    name: "Пінний ревізор у чоботях",
    description: "Перевіряє кухлі, піну й вашу готовність відповідати за третю кружку.",
    level: 8,
    tags: ["audit", "queue", "sound", "unquiet"]
  },
  {
    id: "monster.three-signature-chimera",
    name: "Химера трьох підписів",
    description: "Кожна голова погоджується з двома іншими, але тільки на словах.",
    level: 9,
    tags: ["bureaucracy", "construct", "cursed"]
  },
  {
    id: "monster.cheese-vault-warden",
    name: "Наглядач сирного сховку",
    description: "Стійкий до холоду, до спокуси і до будь-яких аргументів без серветки.",
    level: 10,
    tags: ["food", "stone", "gatekeeper", "unquiet"]
  },
  {
    id: "monster.calendar-hydra",
    name: "Гідра календарних переносів",
    description: "Відрізали понеділок — виріс вівторок, але вже з іншим дедлайном.",
    level: 11,
    tags: ["time", "paperwork", "water", "unquiet"]
  },
  {
    id: "monster.inventory-prophet",
    name: "Пророк інвентарної недостачі",
    description: "Знає, що зникло, ще до того, як ви зрозуміли, що це було.",
    level: 12,
    tags: ["gold", "paperwork", "mind", "unquiet"]
  },
  {
    id: "monster.quiet-catastrophe-clerk",
    name: "Писар тихої катастрофи",
    description: "Записує кінець світу так акуратно, ніби це просто внутрішня службова.",
    level: 13,
    tags: ["paperwork", "cursed", "soft"]
  }
] satisfies MonsterContent[];

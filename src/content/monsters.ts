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
    name: "Підвальна Миша з Титулом",
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
  }
] satisfies MonsterContent[];

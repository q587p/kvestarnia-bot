export const achievementCategories = [
  "onboarding",
  "level",
  "combat",
  "quests",
  "gear",
  "weird"
] as const;

export type AchievementCategory = (typeof achievementCategories)[number];

export const achievementStatuses = ["enabled", "disabled"] as const;
export type AchievementStatus = (typeof achievementStatuses)[number];

export const achievementTriggerTypes = [
  "achievement.list.opened",
  "latest-events.opened",
  "cosmetic-title.selected",
  "character.created",
  "gold.balance",
  "level.reached",
  "remort.completed",
  "combat.finished",
  "combat.persistent.finished",
  "combat.persistent.hard-win",
  "combat.persistent.adventure-origin-win",
  "combat.persistent.yeger-origin-win",
  "combat.persistent.low-hp-win",
  "combat.persistent.zero-gold-item-win",
  "problem.quest.completed",
  "item.received",
  "item.crafted",
  "item.used",
  "equipment.item_equipped",
  "item-upgrade.succeeded",
  "item-upgrade.failed",
  "item-upgrade.level-5",
  "mantok.gear-action.used",
  "starter.mimic-shawarma.completed",
  "starter.mimic-shawarma.probe.completed",
  "cellar.mouse.completed",
  "quest.first-korchma.completed",
  "quest.barrel-beer-tutorial.completed",
  "daily.korchma-round.completed",
  "adventure.choice.strong-success",
  "mantok.chest.completed",
  "level.barter.completed",
  "training.doppelganger.finished",
  "training.doppelganger.won",
  "duel.resolved",
  "duel.won",
  "duel.turnbased.defend",
  "duel.quick.resolved",
  "duel.turnbased.resolved",
  "barrel.raid.claimed",
  "barrel.raid.lost",
  "barrel.raid.bandage-used",
  "korchma.round.purchased",
  "tavern.game.played",
  "tavern.game.won",
  "tavern.game.lost",
  "tavern.game.drawn",
  "item.gift.sent",
  "item.gift.received",
  "mantok.sale.completed",
  "bard.performance.completed",
  "priest.heal.completed",
  "priest.blessing.completed",
  "rogue.pickpocket.attempted",
  "rogue.pickpocket.success",
  "rogue.pickpocket.caught",
  "yeger.free-bandage.claimed",
  "shynok.drink.activated",
  "passage.search.completed",
  "passage.search.monster-attack",
  "passage.search.unique-nodes",
  "hunt.contract.completed",
  "yeger.trial.completed",
  "adventure.choice.completed",
  "adventure.choice.complication",
  "combat.threat-escalated",
  "combat.threat-pressure",
  "future"
] as const;

export type AchievementTriggerType = (typeof achievementTriggerTypes)[number];

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  hidden: boolean;
  lockedDescription: string;
  sortOrder: number;
  status: AchievementStatus;
  trigger: {
    type: AchievementTriggerType;
    threshold?: number;
    outcome?: "won" | "lost" | "fled" | "expired";
    excludedMonsterId?: string;
    raceId?: string;
    classId?: string;
    itemId?: string;
    countMode?: "current" | "cumulative";
  };
  progressTarget?: number;
  cosmeticTitleGrantId?: string;
}

export const HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION =
  "Умова прихована, бо літописець хихоче.";

export const achievements = [
  {
    id: "achievement.character.created",
    category: "onboarding",
    title: "Де тут вихід?",
    description: "створити пригодника й офіційно стати проблемою Корчмаря.",
    hidden: false,
    lockedDescription: "створити пригодника.",
    sortOrder: 10,
    status: "enabled",
    trigger: { type: "character.created" },
    cosmeticTitleGrantId: "cosmetic-title.first-ink"
  },
  {
    id: "achievement.journey.achievements-opened",
    category: "onboarding",
    title: "Ачівка за ачівки",
    description: "уперше відкрити список ачівок і дати літописцю привід поправити окуляри.",
    hidden: false,
    lockedDescription: "уперше відкрити список ачівок.",
    sortOrder: 10.5,
    status: "enabled",
    trigger: { type: "achievement.list.opened" }
  },
  {
    id: "achievement.journey.latest-events-opened",
    category: "onboarding",
    title: "Хроніка відкрила око",
    description: "уперше відкрити Хроніки Квестарні й переконатися, що корчемні події самі себе не перепишуть.",
    hidden: false,
    lockedDescription: "уперше відкрити Хроніки Квестарні.",
    sortOrder: 10.55,
    status: "enabled",
    trigger: { type: "latest-events.opened" }
  },
  {
    id: "achievement.journey.cosmetic-title-selected",
    category: "onboarding",
    title: "Табличка тримається",
    description: "уперше вдягнути косметичний титул і не отримати за це жодної бойової переваги.",
    hidden: false,
    lockedDescription: "уперше вдягнути косметичний титул.",
    sortOrder: 10.6,
    status: "enabled",
    trigger: { type: "cosmetic-title.selected" }
  },
  {
    id: "achievement.race.human-ish",
    category: "onboarding",
    title: "Анкета витримала людисько",
    description: "стати людиськом і довести, що практичність теж може бути підозрілою.",
    hidden: false,
    lockedDescription: "стати людиськом.",
    sortOrder: 11,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.human-ish" },
    cosmeticTitleGrantId: "cosmetic-title.human-ish-paperproof"
  },
  {
    id: "achievement.race.dwarf",
    category: "onboarding",
    title: "Полиця програла гному",
    description: "стати гномом і не дати високим полицям виграти морально.",
    hidden: false,
    lockedDescription: "стати гномом.",
    sortOrder: 11.1,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.dwarf" },
    cosmeticTitleGrantId: "cosmetic-title.dwarf-low-shelf"
  },
  {
    id: "achievement.race.elf",
    category: "onboarding",
    title: "Образа лягла влучно",
    description: "стати ельфом і подивитися на чоботи світу з належною драмою.",
    hidden: false,
    lockedDescription: "стати ельфом.",
    sortOrder: 11.2,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.elf" },
    cosmeticTitleGrantId: "cosmetic-title.elf-offended-accuracy"
  },
  {
    id: "achievement.race.bisyny",
    category: "onboarding",
    title: "Словник знову під замком",
    description: "стати бісинами й лишити корчмарські словники у стані самооборони.",
    hidden: false,
    lockedDescription: "стати бісинами.",
    sortOrder: 11.3,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.bisyny" },
    cosmeticTitleGrantId: "cosmetic-title.bisyny-locked-dictionary"
  },
  {
    id: "achievement.race.drantohor",
    category: "onboarding",
    title: "Межа підписала заднім числом",
    description: "стати дрантогором і зробити вигляд, що маршрут був погоджений.",
    hidden: false,
    lockedDescription: "стати дрантогором.",
    sortOrder: 11.4,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.drantohor" },
    cosmeticTitleGrantId: "cosmetic-title.drantohor-border-plan"
  },
  {
    id: "achievement.race.domovyk",
    category: "onboarding",
    title: "За піччю теж є карʼєра",
    description: "стати домовиком і змусити пил поводитися обережніше.",
    hidden: false,
    lockedDescription: "стати домовиком.",
    sortOrder: 11.5,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.domovyk" },
    cosmeticTitleGrantId: "cosmetic-title.domovyk-stove-witness"
  },
  {
    id: "achievement.race.dryland-rusalka",
    category: "onboarding",
    title: "Чайник під наглядом",
    description: "стати сухопутною русалкою й тримати чайники у ввічливій напрузі.",
    hidden: false,
    lockedDescription: "стати сухопутною русалкою.",
    sortOrder: 11.6,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.dryland-rusalka" },
    cosmeticTitleGrantId: "cosmetic-title.dryland-rusalka-teapot-watch"
  },
  {
    id: "achievement.race.intellectual-orc",
    category: "onboarding",
    title: "Рецензія прилетіла обличчям",
    description: "стати орком-інтелігентом і мати аргументи з помітною вагою.",
    hidden: false,
    lockedDescription: "стати орком-інтелігентом.",
    sortOrder: 11.7,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.intellectual-orc" },
    cosmeticTitleGrantId: "cosmetic-title.intellectual-orc-reviewer"
  },
  {
    id: "achievement.race.molfar-soul",
    category: "onboarding",
    title: "Оберіг знайшов запасний оберіг",
    description: "стати мольфарською душею й носити туман так, ніби це документ.",
    hidden: false,
    lockedDescription: "стати мольфарською душею.",
    sortOrder: 11.8,
    status: "enabled",
    trigger: { type: "character.created", raceId: "race.molfar-soul" },
    cosmeticTitleGrantId: "cosmetic-title.molfar-soul-pocket-fog"
  },
  {
    id: "achievement.class.warrior",
    category: "onboarding",
    title: "План стояв рівно",
    description: "стати воїном і переконливо пояснити світу залізом.",
    hidden: false,
    lockedDescription: "стати воїном.",
    sortOrder: 12,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.warrior" },
    cosmeticTitleGrantId: "cosmetic-title.warrior-straight-plan"
  },
  {
    id: "achievement.class.mage",
    category: "onboarding",
    title: "У кімнаті стало складніше",
    description: "стати магом і сказати слово, після якого меблі нервово теплішають.",
    hidden: false,
    lockedDescription: "стати магом.",
    sortOrder: 12.1,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.mage" },
    cosmeticTitleGrantId: "cosmetic-title.mage-room-warming"
  },
  {
    id: "achievement.class.bard",
    category: "onboarding",
    title: "Куплет подав заявку",
    description: "стати бардом і принести в бій небезпечно впевнений приспів.",
    hidden: false,
    lockedDescription: "стати бардом.",
    sortOrder: 12.2,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.bard" },
    cosmeticTitleGrantId: "cosmetic-title.bard-dangerous-couplet"
  },
  {
    id: "achievement.class.rogue",
    category: "onboarding",
    title: "Рахунок зник першим",
    description: "стати злодієм і лишити таверну з питаннями до бухгалтерії.",
    hidden: false,
    lockedDescription: "стати злодієм.",
    sortOrder: 12.3,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.rogue" },
    cosmeticTitleGrantId: "cosmetic-title.rogue-invoice-vanished"
  },
  {
    id: "achievement.class.priest",
    category: "onboarding",
    title: "Суворий погляд лікує",
    description: "стати жерцем і подивитися на нежить так, щоб вона переглянула плани.",
    hidden: false,
    lockedDescription: "стати жерцем.",
    sortOrder: 12.4,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.priest" },
    cosmeticTitleGrantId: "cosmetic-title.priest-strict-gaze"
  },
  {
    id: "achievement.class.varenyk-mancer",
    category: "onboarding",
    title: "Начинка бачить майбутнє",
    description: "стати вареник-мантом і дати тісту службові повноваження.",
    hidden: false,
    lockedDescription: "стати вареник-мантом.",
    sortOrder: 12.5,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.varenyk-mancer" },
    cosmeticTitleGrantId: "cosmetic-title.varenyk-mancer-filling-prophet"
  },
  {
    id: "achievement.class.bureaucramancer",
    category: "onboarding",
    title: "Форма 13-Б зітхнула",
    description: "стати бюрокромантом і налякати хаос правильною печаткою.",
    hidden: false,
    lockedDescription: "стати бюрокромантом.",
    sortOrder: 12.6,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.bureaucramancer" },
    cosmeticTitleGrantId: "cosmetic-title.bureaucramancer-form-thirteen"
  },
  {
    id: "achievement.class.ranger",
    category: "onboarding",
    title: "Слід підписав квитанцію",
    description: "стати єгерем і знати, де ховається остання стріла.",
    hidden: false,
    lockedDescription: "стати єгерем.",
    sortOrder: 12.7,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.ranger" },
    cosmeticTitleGrantId: "cosmetic-title.ranger-trail-receipt"
  },
  {
    id: "achievement.class.kharakternyk",
    category: "onboarding",
    title: "Проблема відвела очі",
    description: "стати козаком-характерником і дивитися на халепу до її капітуляції.",
    hidden: false,
    lockedDescription: "стати козаком-характерником.",
    sortOrder: 12.8,
    status: "enabled",
    trigger: { type: "character.created", classId: "class.kharakternyk" },
    cosmeticTitleGrantId: "cosmetic-title.kharakternyk-problem-side-eye"
  },
  {
    id: "achievement.level.2",
    category: "level",
    title: "Табурет навчився хитатися",
    description: "досягти 2 рівня й зрозуміти, що табурет під вами теж має амбіції.",
    hidden: false,
    lockedDescription: "досягти 2 рівня.",
    sortOrder: 15,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 2 },
    progressTarget: 2,
    cosmeticTitleGrantId: "cosmetic-title.level-two-stool"
  },
  {
    id: "achievement.level.3",
    category: "level",
    title: "Перший поверх амбіцій",
    description: "досягти 3 рівня, де справи вже починають дивитися у відповідь.",
    hidden: false,
    lockedDescription: "досягти 3 рівня.",
    sortOrder: 20,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.level-three-witness"
  },
  {
    id: "achievement.level.5",
    category: "level",
    title: "Палиця вже не випадкова",
    description: "досягти 5 рівня й виглядати так, ніби це був план.",
    hidden: false,
    lockedDescription: "досягти 5 рівня.",
    sortOrder: 30,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 5 },
    progressTarget: 5,
    cosmeticTitleGrantId: "cosmetic-title.level-five-stick"
  },
  {
    id: "achievement.level.8",
    category: "level",
    title: "Корчмар памʼятає обличчя",
    description: "досягти 8 рівня й стати обличчям, яке Корчмар уже не плутає з рахунком.",
    hidden: false,
    lockedDescription: "досягти 8 рівня.",
    sortOrder: 35,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 8 },
    progressTarget: 8
  },
  {
    id: "achievement.level.10",
    category: "level",
    title: "Десять рівнів і жодної підозри",
    description: "досягти 10 рівня так, ніби Корчмар не веде окрему теку.",
    hidden: false,
    lockedDescription: "досягти 10 рівня.",
    sortOrder: 36,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 10 },
    progressTarget: 10,
    cosmeticTitleGrantId: "cosmetic-title.level-ten-folder"
  },
  {
    id: "achievement.level.13",
    category: "level",
    title: "Тринадцятий пункт інструкції",
    description: "досягти 13 рівня й не читати дрібний шрифт уголос.",
    hidden: false,
    lockedDescription: "досягти 13 рівня.",
    sortOrder: 37,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.level-thirteen-clause"
  },
  {
    id: "achievement.remort.first",
    category: "level",
    title: "Знову з першої, але з претензією",
    description: "завершити перший реморт і повернутися з досвідом, який підозріло світиться.",
    hidden: false,
    lockedDescription: "завершити перший реморт.",
    sortOrder: 38,
    status: "enabled",
    trigger: { type: "remort.completed", threshold: 1 }
  },
  {
    id: "achievement.level.23",
    category: "level",
    title: "Двадцять три причини не питати",
    description: "досягти 23 рівня й дати літописцю новий привід нервово рахувати.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 39,
    status: "disabled",
    trigger: { type: "future" },
    cosmeticTitleGrantId: "cosmetic-title.level-twenty-three-reasons"
  },
  {
    id: "achievement.combat.first-win",
    category: "combat",
    title: "Бойове хрещення в калюжі",
    description: "виграти бій з монстром і не питати, чия це була калюжа.",
    hidden: false,
    lockedDescription: "виграти перший бій з монстром.",
    sortOrder: 40,
    status: "enabled",
    trigger: {
      type: "combat.finished",
      outcome: "won",
      threshold: 1,
      excludedMonsterId: "monster.mimic-shawarma"
    },
    cosmeticTitleGrantId: "cosmetic-title.first-puddle-victor"
  },
  {
    id: "achievement.combat.three-wins",
    category: "combat",
    title: "Три монстри не погодили протокол",
    description: "виграти 3 бої з монстрами й лишити протокол у стані легкої образи.",
    hidden: false,
    lockedDescription: "виграти 3 бої з монстрами.",
    sortOrder: 42,
    status: "enabled",
    trigger: { type: "combat.finished", outcome: "won", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-monster-protocols"
  },
  {
    id: "achievement.combat.thirteen-wins",
    category: "combat",
    title: "Тринадцять разів не впав",
    description: "виграти 13 боїв з монстрами й підписати підлозі акт про ненапад.",
    hidden: false,
    lockedDescription: "виграти 13 боїв з монстрами.",
    sortOrder: 44,
    status: "enabled",
    trigger: { type: "combat.finished", outcome: "won", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-not-floor"
  },
  {
    id: "achievement.combat.persistent-win-23",
    category: "combat",
    title: "Двадцять три аргументи",
    description: "перемогти у 23 старших боях і залишити Низ без переконливого протоколу.",
    hidden: false,
    lockedDescription: "перемогти у 23 старших боях.",
    sortOrder: 46,
    status: "enabled",
    trigger: { type: "combat.persistent.finished", outcome: "won", threshold: 23 },
    progressTarget: 23
  },
  {
    id: "achievement.combat.persistent-win-42",
    category: "combat",
    title: "Відповідь: бити обережніше",
    description: "перемогти у 42 старших боях і не сперечатися з відповіддю Корчмаря.",
    hidden: false,
    lockedDescription: "перемогти у 42 старших боях.",
    sortOrder: 47,
    status: "enabled",
    trigger: { type: "combat.persistent.finished", outcome: "won", threshold: 42 },
    progressTarget: 42
  },
  {
    id: "achievement.combat.persistent-win-93",
    category: "combat",
    title: "Девʼяносто три свідки мовчать",
    description: "перемогти у 93 старших боях і змусити свідків Низу нервово мовчати.",
    hidden: false,
    lockedDescription: "перемогти у 93 старших боях.",
    sortOrder: 48,
    status: "enabled",
    trigger: { type: "combat.persistent.finished", outcome: "won", threshold: 93 },
    progressTarget: 93
  },
  {
    id: "achievement.combat.first-loss",
    category: "combat",
    title: "Горизонтальний досвід",
    description: "програти бій і зробити вигляд, що це була розвідка підлоги.",
    hidden: false,
    lockedDescription: "пережити першу бойову поразку.",
    sortOrder: 50,
    status: "enabled",
    trigger: { type: "combat.finished", outcome: "lost", threshold: 1 }
  },
  {
    id: "achievement.combat.three-losses",
    category: "combat",
    title: "Підлога впізнає кроки",
    description: "програти 3 бої й отримати від підлоги мовчазне «знову ви».",
    hidden: false,
    lockedDescription: "пережити 3 бойові поразки.",
    sortOrder: 52,
    status: "enabled",
    trigger: { type: "combat.finished", outcome: "lost", threshold: 3 },
    progressTarget: 3
  },
  {
    id: "achievement.combat.first-flee",
    category: "combat",
    title: "Тактичний відступ із поясненнями",
    description: "утекти з бою й назвати це перевіркою запасних дверей.",
    hidden: false,
    lockedDescription: "утекти з бою.",
    sortOrder: 54,
    status: "enabled",
    trigger: { type: "combat.finished", outcome: "fled", threshold: 1 }
  },
  {
    id: "achievement.quest.first-problem",
    category: "quests",
    title: "Перший пергамент не зʼїв",
    description: "здати першу корчмарську проблему й лишити папірець придатним для архіву.",
    hidden: false,
    lockedDescription: "здати першу корчмарську проблему.",
    sortOrder: 60,
    status: "enabled",
    trigger: { type: "problem.quest.completed" },
    cosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
  },
  {
    id: "achievement.quest.problem-chain.23",
    category: "quests",
    title: "Двадцять три підозрілі підписи",
    description: "закрити другу теку корчмарських проблем і не загубити підпис між плямами.",
    hidden: false,
    lockedDescription: "закрити другу теку корчмарських проблем.",
    sortOrder: 62,
    status: "enabled",
    trigger: { type: "problem.quest.completed", threshold: 2 },
    progressTarget: 2,
    cosmeticTitleGrantId: "cosmetic-title.twenty-three-problem-signatures"
  },
  {
    id: "achievement.quest.problem-chain.42",
    category: "quests",
    title: "Сорок дві причини для печатки",
    description: "закрити третю теку корчмарських проблем і змусити печатку задуматися.",
    hidden: false,
    lockedDescription: "закрити третю теку корчмарських проблем.",
    sortOrder: 64,
    status: "enabled",
    trigger: { type: "problem.quest.completed", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.forty-two-stamp-reasons"
  },
  {
    id: "achievement.quest.first-korchma",
    category: "quests",
    title: "Стіл таки існує",
    description: "зайти до Корчми й дійти до Столу зі справами, не вимагаючи карту на серветці.",
    hidden: false,
    lockedDescription: "дійти до Столу зі справами.",
    sortOrder: 64.8,
    status: "enabled",
    trigger: { type: "quest.first-korchma.completed", threshold: 1 }
  },
  {
    id: "achievement.quest.mimic-shawarma",
    category: "quests",
    title: "Шаурма мала зуби",
    description: "завершити першу справу з міміком-шаурмою й не довіряти обіду з очима.",
    hidden: false,
    lockedDescription: "завершити першу справу з міміком-шаурмою.",
    sortOrder: 65,
    status: "enabled",
    trigger: { type: "starter.mimic-shawarma.completed", threshold: 1 }
  },
  {
    id: "achievement.quest.cellar-mouse",
    category: "quests",
    title: "Мишача дипломатія",
    description: "завершити льохову справу з мишею й лишити сирні аргументи в архіві.",
    hidden: false,
    lockedDescription: "завершити льохову справу з мишею.",
    sortOrder: 65.2,
    status: "enabled",
    trigger: { type: "cellar.mouse.completed", threshold: 1 }
  },
  {
    id: "achievement.quest.barrel-beer-tutorial",
    category: "quests",
    title: "Туди, звідти і з кухлем",
    description: "завершити першу бочкову справу з пивом і повернутися до столу, доки піна ще має юридичну силу.",
    hidden: false,
    lockedDescription: "завершити справу «Бочка, або Туди і звідти».",
    sortOrder: 65.25,
    status: "enabled",
    trigger: { type: "quest.barrel-beer-tutorial.completed", threshold: 1 }
  },
  {
    id: "achievement.quest.daily-korchma-round",
    category: "quests",
    title: "Дві катастрофи — це вже порядок",
    description: "закрити перший Корчмарський обхід і лишити третю дрібницю на офіційне «не сьогодні».",
    hidden: false,
    lockedDescription: "закрити перший Корчмарський обхід.",
    sortOrder: 65.3,
    status: "enabled",
    trigger: { type: "daily.korchma-round.completed", threshold: 1 }
  },
  {
    id: "achievement.quest.daily-korchma-round.seven",
    category: "quests",
    title: "Тиждень дрібниць підписано",
    description: "закрити 7 Корчмарських обходів і навчити дощечку впізнавати ваш почерк.",
    hidden: false,
    lockedDescription: "закрити 7 Корчмарських обходів.",
    sortOrder: 65.31,
    status: "enabled",
    trigger: { type: "daily.korchma-round.completed", threshold: 7 },
    progressTarget: 7
  },
  {
    id: "achievement.quest.daily-korchma-round.thirteen",
    category: "quests",
    title: "Тринадцять ревізій без паніки",
    description: "закрити 13 Корчмарських обходів і лишити здоровий глузд у стані контрольованої образи.",
    hidden: false,
    lockedDescription: "закрити 13 Корчмарських обходів.",
    sortOrder: 65.32,
    status: "enabled",
    trigger: { type: "daily.korchma-round.completed", threshold: 13 },
    progressTarget: 13
  },
  {
    id: "achievement.quest.problem-chain.93",
    category: "quests",
    title: "Девʼяносто три волі до проблем",
    description: "завершити весь корчмарський ланцюжок проблем і не сперечатися з останньою текою.",
    hidden: false,
    lockedDescription: "завершити весь корчмарський ланцюжок проблем.",
    sortOrder: 65.4,
    status: "enabled",
    trigger: { type: "problem.quest.completed", threshold: 4 },
    progressTarget: 4
  },
  {
    id: "achievement.quest.yeger-first",
    category: "quests",
    title: "Єгер кивнув. Це майже овація",
    description: "завершити перше випробування Єгеря й побачити кивок майже урочистого масштабу.",
    hidden: false,
    lockedDescription: "завершити перше випробування Єгеря.",
    sortOrder: 65.6,
    status: "enabled",
    trigger: { type: "yeger.trial.completed", threshold: 1 }
  },
  {
    id: "achievement.quest.strong-success",
    category: "quests",
    title: "План спрацював. Підозріло",
    description: "отримати сильний успіх у корчемній справі й поводитися так, ніби все було заплановано.",
    hidden: false,
    lockedDescription: "отримати сильний успіх у корчемній справі.",
    sortOrder: 65.8,
    status: "enabled",
    trigger: { type: "adventure.choice.strong-success", threshold: 1 }
  },
  {
    id: "achievement.combat.starter-probe",
    category: "combat",
    title: "Бойове хрещення в соусі",
    description: "завершити навчальну сутичку з міміком-шаурмою й відмити соус із висновків.",
    hidden: false,
    lockedDescription: "завершити навчальну сутичку з міміком-шаурмою.",
    sortOrder: 66.6,
    status: "enabled",
    trigger: { type: "starter.mimic-shawarma.probe.completed", threshold: 1 }
  },
  {
    id: "achievement.item.first-received",
    category: "gear",
    title: "Манатка дивиться першою",
    description: "отримати першу манатку й чемно не питати, звідки вона дивиться.",
    hidden: false,
    lockedDescription: "отримати першу манатку.",
    sortOrder: 70,
    status: "enabled",
    trigger: { type: "item.received" },
    cosmeticTitleGrantId: "cosmetic-title.first-mantok-witness"
  },
  {
    id: "achievement.item.three-owned",
    category: "gear",
    title: "Три манатки вже радяться",
    description: "мати 3 манатки в торбі, поки вони ще не створили комітет.",
    hidden: false,
    lockedDescription: "мати 3 манатки в торбі.",
    sortOrder: 72,
    status: "enabled",
    trigger: { type: "item.received", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-mantok-council"
  },
  {
    id: "achievement.item.thirteen-owned",
    category: "gear",
    title: "Тринадцять одиниць сумніву",
    description: "мати 13 манаток у торбі й не питати, чому торба важчає морально.",
    hidden: false,
    lockedDescription: "мати 13 манаток у торбі.",
    sortOrder: 74,
    status: "enabled",
    trigger: { type: "item.received", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-mantok-doubts"
  },
  {
    id: "achievement.bandage.first-owned",
    category: "gear",
    title: "Бинт дивиться відповідально",
    description: "мати перший Бинт відповідальної паніки й не питати, чи він теж нервує.",
    hidden: false,
    lockedDescription: "отримати перший Бинт відповідальної паніки.",
    sortOrder: 76,
    status: "enabled",
    trigger: { type: "item.received", itemId: "item.responsible-panic-bandage", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-responsible-bandage"
  },
  {
    id: "achievement.bandage.ninety-three-owned",
    category: "gear",
    title: "Девʼяносто три причини не кровити",
    description: "мати 93 Бинти відповідальної паніки й виглядати як склад невеликої надії.",
    hidden: false,
    lockedDescription: "мати 93 Бинти відповідальної паніки.",
    sortOrder: 78,
    status: "enabled",
    trigger: { type: "item.received", itemId: "item.responsible-panic-bandage", threshold: 93 },
    progressTarget: 93,
    cosmeticTitleGrantId: "cosmetic-title.ninety-three-responsible-bandages"
  },
  {
    id: "achievement.iskrokamin.first-owned",
    category: "gear",
    title: "Іскра попросила кишеню",
    description: "уперше отримати Іскрокамінь і не пояснювати торбі, чому вона тепер трохи світиться.",
    hidden: false,
    lockedDescription: "уперше отримати Іскрокамінь.",
    sortOrder: 78.1,
    status: "enabled",
    trigger: { type: "item.received", itemId: "item.iskrokamin", threshold: 1 }
  },
  {
    id: "achievement.bandage.first-used",
    category: "gear",
    title: "Паніка спрацювала за призначенням",
    description: "уперше використати Бинт відповідальної паніки й не сперечатися з медициною.",
    hidden: false,
    lockedDescription: "уперше використати Бинт відповідальної паніки.",
    sortOrder: 78.2,
    status: "enabled",
    trigger: { type: "item.used", itemId: "item.responsible-panic-bandage", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-bandage-use"
  },
  {
    id: "achievement.bandage.four-used",
    category: "gear",
    title: "Чотири вузли самозбереження",
    description: "використати 4 Бинти відповідальної паніки й виглядати майже професійно.",
    hidden: false,
    lockedDescription: "використати 4 Бинти відповідальної паніки.",
    sortOrder: 78.4,
    status: "enabled",
    trigger: { type: "item.used", itemId: "item.responsible-panic-bandage", threshold: 4 },
    progressTarget: 4,
    cosmeticTitleGrantId: "cosmetic-title.four-bandage-uses"
  },
  {
    id: "achievement.bandage.ninety-three-used",
    category: "gear",
    title: "Девʼяносто три рази не сьогодні",
    description: "використати 93 Бинти відповідальної паніки й змусити біль заповнити форму.",
    hidden: false,
    lockedDescription: "використати 93 Бинти відповідальної паніки.",
    sortOrder: 78.6,
    status: "enabled",
    trigger: { type: "item.used", itemId: "item.responsible-panic-bandage", threshold: 93 },
    progressTarget: 93,
    cosmeticTitleGrantId: "cosmetic-title.ninety-three-bandage-uses"
  },
  {
    id: "achievement.bandage.dense-crafted",
    category: "gear",
    title: "Бинт набрався серйозности",
    description: "уперше створити Щільний бинт і не назвати це ремеслом із паніки.",
    hidden: false,
    lockedDescription: "уперше створити Щільний бинт.",
    sortOrder: 78.7,
    status: "enabled",
    trigger: { type: "item.crafted", itemId: "item.dense-bandage", threshold: 1 }
  },
  {
    id: "achievement.bandage.dense-used",
    category: "gear",
    title: "Вузол тримався до кінця",
    description: "уперше використати Щільний бинт у бою й дати рані коротку службову відпустку.",
    hidden: false,
    lockedDescription: "уперше використати Щільний бинт у бою.",
    sortOrder: 78.72,
    status: "enabled",
    trigger: { type: "item.used", itemId: "item.dense-bandage", threshold: 1 }
  },
  {
    id: "achievement.bandage.field-kit-crafted",
    category: "gear",
    title: "Аптечка визнала поле",
    description: "уперше створити Польову аптечку й переконати бинти працювати командою.",
    hidden: false,
    lockedDescription: "уперше створити Польову аптечку.",
    sortOrder: 78.74,
    status: "enabled",
    trigger: { type: "item.crafted", itemId: "item.field-kit", threshold: 1 }
  },
  {
    id: "achievement.bandage.field-kit-used",
    category: "gear",
    title: "Польова медицина без поля",
    description: "уперше використати Польову аптечку в бою й не питати, де тут медична комісія.",
    hidden: false,
    lockedDescription: "уперше використати Польову аптечку в бою.",
    sortOrder: 78.76,
    status: "enabled",
    trigger: { type: "item.used", itemId: "item.field-kit", threshold: 1 }
  },
  {
    id: "achievement.yeger.free-bandage.first",
    category: "gear",
    title: "Єгер дав бинт і не моргнув",
    description: "уперше отримати безкоштовний медичний запас як єгер.",
    hidden: false,
    lockedDescription: "уперше отримати безкоштовний медичний запас як єгер.",
    sortOrder: 79,
    status: "enabled",
    trigger: { type: "yeger.free-bandage.claimed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-yeger-free-bandage"
  },
  {
    id: "achievement.equipment.first-equipped",
    category: "gear",
    title: "На мені це виглядає службово",
    description: "вдягнути першу манатку й почути, як гачок нервово погодився.",
    hidden: false,
    lockedDescription: "вдягнути першу манатку.",
    sortOrder: 80,
    status: "enabled",
    trigger: { type: "equipment.item_equipped" },
    cosmeticTitleGrantId: "cosmetic-title.first-equipped-hook"
  },
  {
    id: "achievement.equipment.three-equipped",
    category: "gear",
    title: "Образ уже має інвентарний номер",
    description: "вдягнути 3 манатки й виглядати як службова перевірка пригод.",
    hidden: false,
    lockedDescription: "вдягнути 3 манатки.",
    sortOrder: 82,
    status: "enabled",
    trigger: { type: "equipment.item_equipped", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-equipped-inspection"
  },
  {
    id: "achievement.equipment.all-slots-equipped",
    category: "gear",
    title: "Усі гачки при справі",
    description: "вдягнути манатки в усі підготовлені слоти й зробити вигляд, що це не шафа, а бойова концепція.",
    hidden: false,
    lockedDescription: "заповнити всі слоти спорядження.",
    sortOrder: 83,
    status: "enabled",
    trigger: { type: "equipment.item_equipped", threshold: 7 },
    progressTarget: 7,
    cosmeticTitleGrantId: "cosmetic-title.all-hooks-on-duty"
  },
  {
    id: "achievement.equipment.ninety-three-equipped-total",
    category: "gear",
    title: "Девʼяносто три примірки без протоколу",
    description: "сумарно екіпірувати 93 манатки й довести, що гачки теж можуть вигоріти.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 83.5,
    status: "enabled",
    trigger: { type: "equipment.item_equipped", threshold: 93, countMode: "cumulative" },
    progressTarget: 93,
    cosmeticTitleGrantId: "cosmetic-title.ninety-three-fittings"
  },
  {
    id: "achievement.mantok.gear-action.first",
    category: "gear",
    title: "Манатка натиснула кнопку",
    description: "уперше застосувати бойову дію з манатки й дати спорядженню привід пишатися.",
    hidden: false,
    lockedDescription: "уперше застосувати бойову дію з манатки.",
    sortOrder: 83.6,
    status: "enabled",
    trigger: { type: "mantok.gear-action.used", threshold: 1 }
  },
  {
    id: "achievement.item-upgrade.first-success",
    category: "gear",
    title: "Молот сказав «дзень»",
    description: "уперше успішно підсилити манатку в Чароковальні.",
    hidden: false,
    lockedDescription: "уперше успішно підсилити манатку.",
    sortOrder: 83.7,
    status: "enabled",
    trigger: { type: "item-upgrade.succeeded", threshold: 1 }
  },
  {
    id: "achievement.item-upgrade.first-failure",
    category: "gear",
    title: "Іскра має власну думку",
    description: "уперше пережити невдалу спробу підсилення без втрати гідности в журналі.",
    hidden: false,
    lockedDescription: "уперше отримати невдалу спробу підсилення.",
    sortOrder: 83.8,
    status: "enabled",
    trigger: { type: "item-upgrade.failed", threshold: 1 }
  },
  {
    id: "achievement.item-upgrade.level-five",
    category: "gear",
    title: "Пʼять плюсів і жодної скромности",
    description: "довести манатку до +5 і дати молоту маленьку відпустку.",
    hidden: false,
    lockedDescription: "підсилити манатку до +5.",
    sortOrder: 83.9,
    status: "enabled",
    trigger: { type: "item-upgrade.level-5", threshold: 1 }
  },
  {
    id: "achievement.item.twenty-three-owned",
    category: "gear",
    title: "Торба відкрила малий архів",
    description: "мати 23 манатки в торбі й почути, як ремінь просить профспілку.",
    hidden: false,
    lockedDescription: "мати 23 манатки в торбі.",
    sortOrder: 84,
    status: "enabled",
    trigger: { type: "item.received", threshold: 23 },
    progressTarget: 23,
    cosmeticTitleGrantId: "cosmetic-title.twenty-three-mantok-archive"
  },
  {
    id: "achievement.item.forty-two-owned",
    category: "gear",
    title: "Сорок дві манатки відповіли",
    description: "мати 42 манатки в торбі й не питати, на яке саме питання вони відповіли.",
    hidden: false,
    lockedDescription: "мати 42 манатки в торбі.",
    sortOrder: 85,
    status: "enabled",
    trigger: { type: "item.received", threshold: 42 },
    progressTarget: 42,
    cosmeticTitleGrantId: "cosmetic-title.forty-two-mantok-answer"
  },
  {
    id: "achievement.item.ninety-three-owned",
    category: "gear",
    title: "Девʼяносто три докази торби",
    description: "мати 93 манатки в торбі й виглядати як пересувний склад пригод.",
    hidden: false,
    lockedDescription: "мати 93 манатки в торбі.",
    sortOrder: 86,
    status: "enabled",
    trigger: { type: "item.received", threshold: 93 },
    progressTarget: 93,
    cosmeticTitleGrantId: "cosmetic-title.ninety-three-mantok-evidence"
  },
  {
    id: "achievement.mantok.chest.first",
    category: "gear",
    title: "Скриня зробила вигляд, що так і треба",
    description: "уперше завершити переробку манаток у скрині.",
    hidden: false,
    lockedDescription: "уперше завершити переробку манаток у скрині.",
    sortOrder: 88,
    status: "enabled",
    trigger: { type: "mantok.chest.completed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-chest-recycler"
  },
  {
    id: "achievement.mantok.chest.thirteen",
    category: "gear",
    title: "Скриня просить журнал техогляду",
    description: "завершити 13 переробок манаток і лишити скриню з робочою підозрою.",
    hidden: false,
    lockedDescription: "завершити 13 переробок манаток у скрині.",
    sortOrder: 89,
    status: "enabled",
    trigger: { type: "mantok.chest.completed", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-chest-recycles"
  },
  {
    id: "achievement.mantok.sale.first",
    category: "gear",
    title: "Манчкін-скупник кивнув",
    description: "уперше продати манатку й не дивитися занадто довго на гаманець.",
    hidden: false,
    lockedDescription: "уперше продати манатку Манчкін-скупнику.",
    sortOrder: 90,
    status: "enabled",
    trigger: { type: "mantok.sale.completed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-mantok-sale"
  },
  {
    id: "achievement.mantok.sale.thirteen",
    category: "gear",
    title: "Скупник уже впізнає кроки",
    description: "продати манатки 13 разів і стати знайомим пунктом у нічному обліку.",
    hidden: false,
    lockedDescription: "продати манатки 13 разів.",
    sortOrder: 91,
    status: "enabled",
    trigger: { type: "mantok.sale.completed", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-mantok-sales"
  },
  {
    id: "achievement.level.barter.first",
    category: "weird",
    title: "Манчкін прийняв рівневу заявку",
    description: "уперше скористатися обміном Манчкіна й зробити вигляд, що це не магія бухгалтерії.",
    hidden: false,
    lockedDescription: "уперше скористатися обміном рівня в Манчкіна.",
    sortOrder: 100,
    status: "enabled",
    trigger: { type: "level.barter.completed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-level-barter"
  },
  {
    id: "achievement.level.barter.three",
    category: "weird",
    title: "Три рівневі квитанції",
    description: "тричі скористатися обміном Манчкіна й не сперечатися з дрібним шрифтом.",
    hidden: false,
    lockedDescription: "тричі скористатися обміном рівня в Манчкіна.",
    sortOrder: 101,
    status: "enabled",
    trigger: { type: "level.barter.completed", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-level-barter-receipts"
  },
  {
    id: "achievement.bard.performance.first",
    category: "weird",
    title: "Куплет вийшов на люди",
    description: "уперше виступити як бард і змусити Шинок перевірити акустику.",
    hidden: false,
    lockedDescription: "уперше виступити як бард.",
    sortOrder: 105,
    status: "enabled",
    trigger: { type: "bard.performance.completed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-bard-performance"
  },
  {
    id: "achievement.bard.performance.thirteen",
    category: "weird",
    title: "Тринадцять куплетів свідчать",
    description: "виступити як бард 13 разів і лишити Шинок у стані культурної обережности.",
    hidden: false,
    lockedDescription: "виступити як бард 13 разів.",
    sortOrder: 106,
    status: "enabled",
    trigger: { type: "bard.performance.completed", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-bard-performances"
  },
  {
    id: "achievement.priest.heal.first",
    category: "weird",
    title: "Мана замість бинта",
    description: "уперше полікувати жерцем поза боєм і не витратити жодного бинта на бюрократію.",
    hidden: false,
    lockedDescription: "уперше полікувати жерцем поза боєм.",
    sortOrder: 107,
    status: "enabled",
    trigger: { type: "priest.heal.completed", threshold: 1 }
  },
  {
    id: "achievement.priest.blessing.first",
    category: "weird",
    title: "Печатка суворої турботи",
    description: "уперше благословити когось жерцем так, щоб навіть пил став чемнішим.",
    hidden: false,
    lockedDescription: "уперше благословити жерцем поза боєм.",
    sortOrder: 108,
    status: "enabled",
    trigger: { type: "priest.blessing.completed", threshold: 1 }
  },
  {
    id: "achievement.rogue.pickpocket.first",
    category: "weird",
    title: "Кишеня не підписувала згоду",
    description: "уперше спробувати тиху кишеню як злодій і лишити протоколу дивні питання.",
    hidden: false,
    lockedDescription: "уперше спробувати тиху кишеню як злодій.",
    sortOrder: 109,
    status: "enabled",
    trigger: { type: "rogue.pickpocket.attempted", threshold: 1 }
  },
  {
    id: "achievement.rogue.pickpocket.success",
    category: "weird",
    title: "Монета змінила філософію",
    description: "уперше успішно обчистити кишеню так тихо, що золото саме переглянуло біографію.",
    hidden: false,
    lockedDescription: "уперше успішно обчистити кишеню.",
    sortOrder: 109.2,
    status: "enabled",
    trigger: { type: "rogue.pickpocket.success", threshold: 1 }
  },
  {
    id: "achievement.rogue.pickpocket.caught",
    category: "weird",
    title: "Лікоть мав аргументи",
    description: "уперше провалити тиху кишеню так голосно, що HP попросило прилягти.",
    hidden: false,
    lockedDescription: "уперше дуже невдало провалити тиху кишеню.",
    sortOrder: 109.4,
    status: "enabled",
    trigger: { type: "rogue.pickpocket.caught", threshold: 1 }
  },
  {
    id: "achievement.training.doppelganger.first",
    category: "combat",
    title: "Дзеркало вдарило першим",
    description: "уперше завершити тренування з Допельґанґером і не підписувати протокол споріднености.",
    hidden: false,
    lockedDescription: "уперше завершити тренування з Допельґанґером.",
    sortOrder: 110,
    status: "enabled",
    trigger: { type: "training.doppelganger.finished", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-doppelganger-training"
  },
  {
    id: "achievement.social.training-win-1",
    category: "combat",
    title: "Сам собі суперник",
    description: "перемогти Сумлінного Допельґанґера й не звинувачувати дзеркало в упередженості.",
    hidden: false,
    lockedDescription: "перемогти Сумлінного Допельґанґера.",
    sortOrder: 110.5,
    status: "enabled",
    trigger: { type: "training.doppelganger.won", threshold: 1 }
  },
  {
    id: "achievement.training.doppelganger.thirteen",
    category: "combat",
    title: "Допельґанґер просить відпустку",
    description: "завершити 13 тренувань із Допельґанґером і лишити дзеркало втомленим.",
    hidden: false,
    lockedDescription: "завершити 13 тренувань із Допельґанґером.",
    sortOrder: 111,
    status: "enabled",
    trigger: { type: "training.doppelganger.finished", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-doppelganger-trainings"
  },
  {
    id: "achievement.social.training-win-13",
    category: "combat",
    title: "Допельґанґер просить вихідний",
    description: "перемогти Сумлінного Допельґанґера 13 разів і дати дзеркалу привід на заяву.",
    hidden: false,
    lockedDescription: "перемогти Сумлінного Допельґанґера 13 разів.",
    sortOrder: 111.5,
    status: "enabled",
    trigger: { type: "training.doppelganger.won", threshold: 13 },
    progressTarget: 13
  },
  {
    id: "achievement.duel.quick.first",
    category: "combat",
    title: "Миттєва дуель не встигла моргнути",
    description: "уперше завершити миттєву дуель і зберегти обличчя в будь-якому стані.",
    hidden: false,
    lockedDescription: "уперше завершити миттєву дуель.",
    sortOrder: 115,
    status: "enabled",
    trigger: { type: "duel.quick.resolved", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-quick-duel"
  },
  {
    id: "achievement.social.duel-resolved",
    category: "combat",
    title: "Добровільна незручність",
    description: "завершити перший двобій з іншим пригодником і зберегти корчемну ввічливість.",
    hidden: false,
    lockedDescription: "завершити перший двобій з іншим пригодником.",
    sortOrder: 115.5,
    status: "enabled",
    trigger: { type: "duel.resolved", threshold: 1 }
  },
  {
    id: "achievement.social.duel-win",
    category: "combat",
    title: "Переміг знайомого, дружба триває",
    description: "виграти перший двобій і не оголошувати себе меблям чемпіоном.",
    hidden: false,
    lockedDescription: "виграти перший двобій.",
    sortOrder: 115.6,
    status: "enabled",
    trigger: { type: "duel.won", threshold: 1 }
  },
  {
    id: "achievement.duel.quick.thirteen",
    category: "combat",
    title: "Тринадцять швидких непорозумінь",
    description: "завершити 13 миттєвих дуелей і навчити рукавичку літати по графіку.",
    hidden: false,
    lockedDescription: "завершити 13 миттєвих дуелей.",
    sortOrder: 116,
    status: "enabled",
    trigger: { type: "duel.quick.resolved", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-quick-duels"
  },
  {
    id: "achievement.duel.turnbased.first",
    category: "combat",
    title: "Хід подумав і погодився",
    description: "уперше завершити покрокову дуель і пережити офіційне очікування.",
    hidden: false,
    lockedDescription: "уперше завершити покрокову дуель.",
    sortOrder: 117,
    status: "enabled",
    trigger: { type: "duel.turnbased.resolved", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-turnbased-duel"
  },
  {
    id: "achievement.social.duel-defend",
    category: "combat",
    title: "Не бити — теж хід",
    description: "уперше захиститися у покроковому двобої й зробити паузу офіційною.",
    hidden: false,
    lockedDescription: "уперше захиститися у покроковому двобої.",
    sortOrder: 117.5,
    status: "enabled",
    trigger: { type: "duel.turnbased.defend", threshold: 1 }
  },
  {
    id: "achievement.duel.turnbased.three",
    category: "combat",
    title: "Три ходи в чужу впевненість",
    description: "завершити 3 покрокові дуелі й не загубити чергу в кишені.",
    hidden: false,
    lockedDescription: "завершити 3 покрокові дуелі.",
    sortOrder: 118,
    status: "enabled",
    trigger: { type: "duel.turnbased.resolved", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-turnbased-duels"
  },
  {
    id: "achievement.barrel.raid.first",
    category: "weird",
    title: "Бочка видала перший акт",
    description: "уперше отримати результат Бочки й не питати, хто там веде облік.",
    hidden: false,
    lockedDescription: "уперше отримати результат Бочки.",
    sortOrder: 125,
    status: "enabled",
    trigger: { type: "barrel.raid.claimed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-barrel-claim"
  },
  {
    id: "achievement.barrel.raid.thirteen",
    category: "weird",
    title: "Бочка вже вітається",
    description: "отримати 13 результатів Бочки й не сперечатися з пінним архівом.",
    hidden: false,
    lockedDescription: "отримати 13 результатів Бочки.",
    sortOrder: 126,
    status: "enabled",
    trigger: { type: "barrel.raid.claimed", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-barrel-claims"
  },
  {
    id: "achievement.barrel.raid.first-loss",
    category: "weird",
    title: "Бочка внесла правки",
    description: "уперше програти Старшому Братові Бочки й отримати від Корчмаря позначку «пінна розвідка».",
    hidden: false,
    lockedDescription: "уперше програти Старшому Братові Бочки.",
    sortOrder: 126.5,
    status: "enabled",
    trigger: { type: "barrel.raid.lost", threshold: 1 }
  },
  {
    id: "achievement.barrel.raid.bandage-used",
    category: "weird",
    title: "Бочка дозволила медицину",
    description: "уперше використати медичну манатку проти Старшого Брата Бочки й не отримати письмової заборони.",
    hidden: false,
    lockedDescription: "уперше використати медичну манатку в рейді проти Старшого Брата Бочки.",
    sortOrder: 126.7,
    status: "enabled",
    trigger: { type: "barrel.raid.bandage-used", threshold: 1 }
  },
  {
    id: "achievement.korchma.round.first",
    category: "weird",
    title: "Перший кухоль за компанію",
    description: "уперше проставити пиво й лишити на столі соціяльний слід.",
    hidden: false,
    lockedDescription: "уперше проставити пиво.",
    sortOrder: 130,
    status: "enabled",
    trigger: { type: "korchma.round.purchased", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-korchma-round"
  },
  {
    id: "achievement.korchma.round.thirteen",
    category: "weird",
    title: "Тринадцять кухлів дипломатії",
    description: "проставити пиво 13 разів і стати окремим пунктом корчемної ввічливости.",
    hidden: false,
    lockedDescription: "проставити пиво 13 разів.",
    sortOrder: 131,
    status: "enabled",
    trigger: { type: "korchma.round.purchased", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-korchma-rounds"
  },
  {
    id: "achievement.tavern.game.first",
    category: "weird",
    title: "Перший стіл витримав",
    description: "уперше завершити гру за столом у Шинку й не отримати нічого, крім запису та погляду Корчмаря.",
    hidden: false,
    lockedDescription: "уперше завершити гру за столом у Шинку.",
    sortOrder: 132,
    status: "enabled",
    trigger: { type: "tavern.game.played", threshold: 1 }
  },
  {
    id: "achievement.tavern.game.win.first",
    category: "weird",
    title: "Стіл визнав переможця",
    description: "уперше виграти гру за столом і поводитися так, ніби фішки самі все підтвердять.",
    hidden: false,
    lockedDescription: "уперше виграти гру за столом.",
    sortOrder: 133,
    status: "enabled",
    trigger: { type: "tavern.game.won", threshold: 1 }
  },
  {
    id: "achievement.tavern.game.win.three",
    category: "weird",
    title: "Три партії глянули прихильно",
    description: "виграти 3 гри за столом і не називати це законом природи при свідках.",
    hidden: false,
    lockedDescription: "виграти 3 гри за столом.",
    sortOrder: 134,
    status: "enabled",
    trigger: { type: "tavern.game.won", threshold: 3 },
    progressTarget: 3
  },
  {
    id: "achievement.tavern.game.win.thirteen",
    category: "weird",
    title: "Тринадцять столів аплодували ніжками",
    description: "виграти 13 ігор за столом і лишити шинковій статистиці нервову усмішку.",
    hidden: false,
    lockedDescription: "виграти 13 ігор за столом.",
    sortOrder: 135,
    status: "enabled",
    trigger: { type: "tavern.game.won", threshold: 13 },
    progressTarget: 13
  },
  {
    id: "achievement.tavern.game.loss.first",
    category: "weird",
    title: "Стілець підтримав морально",
    description: "уперше програти гру за столом і зберегти гідність у приблизно вертикальному стані.",
    hidden: false,
    lockedDescription: "уперше програти гру за столом.",
    sortOrder: 136,
    status: "enabled",
    trigger: { type: "tavern.game.lost", threshold: 1 }
  },
  {
    id: "achievement.tavern.game.loss.three",
    category: "weird",
    title: "Три поразки без сварки з меблями",
    description: "програти 3 гри за столом і не подати офіційну скаргу на кості, фішки чи атмосферу.",
    hidden: false,
    lockedDescription: "програти 3 гри за столом.",
    sortOrder: 137,
    status: "enabled",
    trigger: { type: "tavern.game.lost", threshold: 3 },
    progressTarget: 3
  },
  {
    id: "achievement.tavern.game.draw.first",
    category: "weird",
    title: "Нічия вмостилася посередині",
    description: "уперше завершити гру за столом нічиєю й дати банку привід повернутися додому.",
    hidden: false,
    lockedDescription: "уперше завершити гру за столом нічиєю.",
    sortOrder: 138,
    status: "enabled",
    trigger: { type: "tavern.game.drawn", threshold: 1 }
  },
  {
    id: "achievement.tavern.game.loss.thirteen",
    category: "weird",
    title: "Тринадцять разів красиво не вийшло",
    description: "програти 13 ігор за столом і лишитися людиною, якій Корчмар усе ще дає стілець.",
    hidden: false,
    lockedDescription: "програти 13 ігор за столом.",
    sortOrder: 139,
    status: "enabled",
    trigger: { type: "tavern.game.lost", threshold: 13 },
    progressTarget: 13
  },
  {
    id: "achievement.item.gift.sent.first",
    category: "gear",
    title: "Манатка пішла в люди",
    description: "уперше подарувати манатку іншому пригоднику й не вимагати драматичного листа подяки.",
    hidden: false,
    lockedDescription: "уперше подарувати манатку іншому пригоднику.",
    sortOrder: 140,
    status: "enabled",
    trigger: { type: "item.gift.sent", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-mantok-gift-sent"
  },
  {
    id: "achievement.item.gift.sent.thirteen",
    category: "gear",
    title: "Дарувальник із журналом",
    description: "подарувати манатки 13 разів і змусити щедрість вести облік.",
    hidden: false,
    lockedDescription: "подарувати манатки 13 разів.",
    sortOrder: 141,
    status: "enabled",
    trigger: { type: "item.gift.sent", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-mantok-gifts-sent"
  },
  {
    id: "achievement.item.gift.received.first",
    category: "gear",
    title: "Подарунок має інвентарний голос",
    description: "уперше прийняти подаровану манатку й не питати, що вона про вас знає.",
    hidden: false,
    lockedDescription: "уперше прийняти подаровану манатку.",
    sortOrder: 142,
    status: "enabled",
    trigger: { type: "item.gift.received", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-mantok-gift-received"
  },
  {
    id: "achievement.shynok.drink.first",
    category: "weird",
    title: "Перший напій погодився всередину",
    description: "уперше випити напій у Шинку й дати організму офіційний привід здивуватися.",
    hidden: false,
    lockedDescription: "уперше випити напій у Шинку.",
    sortOrder: 150,
    status: "enabled",
    trigger: { type: "shynok.drink.activated", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-shynok-drink"
  },
  {
    id: "achievement.shynok.drink.four",
    category: "weird",
    title: "Чотири напої вже мають думку",
    description: "випити 4 шинкові напої й лишити стільцю право на занепокоєння.",
    hidden: false,
    lockedDescription: "випити 4 напої в Шинку.",
    sortOrder: 151,
    status: "enabled",
    trigger: { type: "shynok.drink.activated", threshold: 4 },
    progressTarget: 4,
    cosmeticTitleGrantId: "cosmetic-title.four-shynok-drinks"
  },
  {
    id: "achievement.passage.search.first",
    category: "weird",
    title: "Пил дав перші свідчення",
    description: "уперше завершити пошук у Низу й не довіряти знайденому камінцю.",
    hidden: false,
    lockedDescription: "уперше завершити пошук у Низу.",
    sortOrder: 160,
    status: "enabled",
    trigger: { type: "passage.search.completed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-nyz-search"
  },
  {
    id: "achievement.passage.search.thirteen",
    category: "weird",
    title: "Тринадцять порпань у відповідь",
    description: "завершити 13 пошуків у Низу й навчити пил впізнавати ваш почерк.",
    hidden: false,
    lockedDescription: "завершити 13 пошуків у Низу.",
    sortOrder: 161,
    status: "enabled",
    trigger: { type: "passage.search.completed", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-nyz-searches"
  },
  {
    id: "achievement.passage.search.monster.first",
    category: "combat",
    title: "Пошук знайшов зуби",
    description: "уперше завершити пошук так, щоб місцевий монстр образився особисто.",
    hidden: false,
    lockedDescription: "уперше натрапити на монстра під час пошуку в Низу.",
    sortOrder: 162,
    status: "enabled",
    trigger: { type: "passage.search.monster-attack", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-search-monster"
  },
  {
    id: "achievement.passage.search.all-current",
    category: "weird",
    title: "Усі теперішні закутки підозрюють",
    description: "обшукати всі нині доступні місця й проходи Низу, не оголошуючи, що це всі назавжди.",
    hidden: false,
    lockedDescription: "обшукати 5 доступних місць і проходів Низу.",
    sortOrder: 163,
    status: "enabled",
    trigger: { type: "passage.search.unique-nodes", threshold: 5 },
    progressTarget: 5,
    cosmeticTitleGrantId: "cosmetic-title.current-nyz-search-map"
  },
  {
    id: "achievement.hunt.contract.first",
    category: "combat",
    title: "Дошка полювання зробила позначку",
    description: "уперше закрити запис із дошки полювання й повернути папірець із доказами.",
    hidden: false,
    lockedDescription: "уперше закрити запис із дошки полювання.",
    sortOrder: 170,
    status: "enabled",
    trigger: { type: "hunt.contract.completed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-hunt-contract"
  },
  {
    id: "achievement.hunt.contract.thirteen",
    category: "combat",
    title: "Тринадцять оголошень знято",
    description: "закрити 13 записів із дошки полювання й навчити цвяхи вас поважати.",
    hidden: false,
    lockedDescription: "закрити 13 записів із дошки полювання.",
    sortOrder: 171,
    status: "enabled",
    trigger: { type: "hunt.contract.completed", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-hunt-contracts"
  },
  {
    id: "achievement.adventure.choice.first",
    category: "quests",
    title: "Три справи подивилися першими",
    description: "уперше розвʼязати одну зі справ на найближчий час і не образити решту дві.",
    hidden: false,
    lockedDescription: "уперше розвʼязати справу на найближчий час.",
    sortOrder: 175,
    status: "enabled",
    trigger: { type: "adventure.choice.completed", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-three-affairs"
  },
  {
    id: "achievement.adventure.choice.thirteen",
    category: "quests",
    title: "Тринадцять найближчих «ой»",
    description: "розвʼязати 13 справ на найближчий час і дати календарю привід нервувати.",
    hidden: false,
    lockedDescription: "розвʼязати 13 справ на найближчий час.",
    sortOrder: 176,
    status: "enabled",
    trigger: { type: "adventure.choice.completed", threshold: 13 },
    progressTarget: 13,
    cosmeticTitleGrantId: "cosmetic-title.thirteen-nearby-affairs"
  },
  {
    id: "achievement.adventure.choice.complication.first",
    category: "quests",
    title: "Справа покликала свідка з зубами",
    description: "уперше отримати ускладнення з монстром у справі на найближчий час.",
    hidden: false,
    lockedDescription: "уперше отримати ускладнення з монстром у справі на найближчий час.",
    sortOrder: 177,
    status: "enabled",
    trigger: { type: "adventure.choice.complication", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-affair-complication"
  },
  {
    id: "achievement.adventure.choice.complication.three",
    category: "quests",
    title: "Три справи вже кусаються",
    description: "тричі отримати монстрове ускладнення у справах і не подавати скаргу на жанр.",
    hidden: false,
    lockedDescription: "тричі отримати ускладнення з монстром у справах.",
    sortOrder: 178,
    status: "enabled",
    trigger: { type: "adventure.choice.complication", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-affair-complications"
  },
  {
    id: "achievement.combat.threat-escalation.first",
    category: "combat",
    title: "Низ додав свідків",
    description: "уперше дійти до ескалації бою, коли Низ вирішив, що одного монстра замало.",
    hidden: false,
    lockedDescription: "уперше дійти до бойової ескалації Низу.",
    sortOrder: 180,
    status: "enabled",
    trigger: { type: "combat.threat-escalated", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-nyz-escalation"
  },
  {
    id: "achievement.combat.threat-escalation.three",
    category: "combat",
    title: "Три протоколи натовпу",
    description: "тричі пережити ескалацію бою й лишити Низ із процедурним задоволенням.",
    hidden: false,
    lockedDescription: "тричі пережити бойову ескалацію Низу.",
    sortOrder: 181,
    status: "enabled",
    trigger: { type: "combat.threat-escalated", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-nyz-escalations"
  },
  {
    id: "achievement.combat.threat-pressure.first",
    category: "combat",
    title: "Натиск Низу підкрутив гайку",
    description: "уперше відчути тиск Низу, коли друга проблема прийшла вже з інструкцією.",
    hidden: false,
    lockedDescription: "уперше відчути тиск Низу в ескальованому бою.",
    sortOrder: 182,
    status: "enabled",
    trigger: { type: "combat.threat-pressure", threshold: 1 },
    cosmeticTitleGrantId: "cosmetic-title.first-nyz-pressure"
  },
  {
    id: "achievement.combat.threat-pressure.three",
    category: "combat",
    title: "Три натиски і жодної ввічливости",
    description: "тричі пережити тиск Низу й не погодитися, що це нормальна гостинність.",
    hidden: false,
    lockedDescription: "тричі пережити тиск Низу.",
    sortOrder: 183,
    status: "enabled",
    trigger: { type: "combat.threat-pressure", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.three-nyz-pressures"
  },
  {
    id: "achievement.combat.hard-passage-win",
    category: "combat",
    title: "Ліворуч було написано «не треба»",
    description: "перемогти після складного лівого проходу в Низі й не сперечатися з написом.",
    hidden: false,
    lockedDescription: "перемогти після складного лівого проходу в Низі.",
    sortOrder: 184,
    status: "enabled",
    trigger: { type: "combat.persistent.hard-win", threshold: 1 }
  },
  {
    id: "achievement.combat.adventure-origin-win",
    category: "combat",
    title: "Справу закрито кулаком",
    description: "перемогти у бою, до якого привела корчемна справа.",
    hidden: false,
    lockedDescription: "перемогти у бою, до якого привела корчемна справа.",
    sortOrder: 185,
    status: "enabled",
    trigger: { type: "combat.persistent.adventure-origin-win", threshold: 1 }
  },
  {
    id: "achievement.combat.yeger-origin-win",
    category: "combat",
    title: "Слід довів до синця",
    description: "перемогти неупокоєну ціль Єгеря й повернути слід із синцем.",
    hidden: false,
    lockedDescription: "перемогти неупокоєну ціль Єгеря.",
    sortOrder: 186,
    status: "enabled",
    trigger: { type: "combat.persistent.yeger-origin-win", threshold: 1 }
  },
  {
    id: "achievement.combat.low-hp-win",
    category: "combat",
    title: "На чесному слові й одному HP",
    description: "перемогти у старшому бою, маючи не більш як 10% HP.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 187,
    status: "enabled",
    trigger: { type: "combat.persistent.low-hp-win", threshold: 1 }
  },
  {
    id: "achievement.gear.zero-gold-item",
    category: "gear",
    title: "Золота нуль, зате доказ",
    description: "виграти старший бій без золота, але з манаткою.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 188,
    status: "enabled",
    trigger: { type: "combat.persistent.zero-gold-item-win", threshold: 1 }
  },
  {
    id: "achievement.gold.leet-balance",
    category: "weird",
    title: "1337 у кишені",
    description: "мати принаймні 1337 золота й змусити корчмарську бухгалтерію читати баланс як елітний шифр.",
    hidden: false,
    lockedDescription: "мати принаймні 1337 золота.",
    sortOrder: 189,
    status: "enabled",
    trigger: { type: "gold.balance", threshold: 1337 }
  },
  {
    id: "achievement.gold.over-nine-thousand",
    category: "weird",
    title: "Понад девʼять тисяч",
    description: "мати принаймні 9001 золота й почути, як корчмарський лічильник просить не міряти силу гаманця.",
    hidden: false,
    lockedDescription: "мати принаймні 9001 золота.",
    sortOrder: 190,
    status: "enabled",
    trigger: { type: "gold.balance", threshold: 9001 }
  },
  {
    id: "achievement.remort.first-memory",
    category: "weird",
    title: "Свічка памʼятає більше",
    description: "пройти перший реморт і лишити памʼять там, де Корчма її не дістане шваброю.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 900,
    status: "disabled",
    trigger: { type: "future" },
    cosmeticTitleGrantId: "cosmetic-title.first-remort-candle"
  },
  {
    id: "achievement.combat.critical-1",
    category: "combat",
    title: "Критичне непорозуміння",
    description: "завдати першого критичного удару у старшому бою.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 901,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.combat.critical-23",
    category: "combat",
    title: "Кістки мають особисту думку",
    description: "завдати 23 критичних удари у старших боях.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 902,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.combat.defend-1",
    category: "combat",
    title: "Щит — теж дієслово",
    description: "уперше захиститися у старшому бою.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 903,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.combat.defend-23",
    category: "combat",
    title: "Меблі корчми вже заздрять",
    description: "захиститися 23 рази у старших боях.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 904,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.presence.day-1",
    category: "weird",
    title: "Корчма ще стоїть",
    description: "проявити активність у грі в один київський день.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 905,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.presence.day-3",
    category: "weird",
    title: "Третій день без нормального сну",
    description: "проявити активність у 3 різні київські дні.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 906,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.presence.day-13",
    category: "weird",
    title: "Тринадцять днів у табелі",
    description: "проявити активність у 13 різних київських днів.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 907,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.oddity.failed-flee",
    category: "weird",
    title: "Втік, але залишився",
    description: "спробувати втекти й не втекти.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 908,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.oddity.three-defends",
    category: "weird",
    title: "Черепаха схвалила техніку",
    description: "захищатися три ходи поспіль в одному старшому бою.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 909,
    status: "disabled",
    trigger: { type: "future" }
  },
  {
    id: "achievement.oddity.unequipped-win",
    category: "weird",
    title: "Без штанів, але з планом",
    description: "перемогти у старшому бою без вдягнених манаток.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 910,
    status: "disabled",
    trigger: { type: "future" }
  }
] as const satisfies readonly AchievementDefinition[];

export function getAchievementDefinition(id: string): AchievementDefinition | null {
  return achievements.find((achievement) => achievement.id === id) ?? null;
}

export function getEnabledAchievements(): AchievementDefinition[] {
  return achievements.filter((achievement) => achievement.status === "enabled");
}

export function validateAchievementDefinitions(
  definitions: readonly AchievementDefinition[] = achievements
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const sortOrders = new Set<number>();
  const titleGrantIds = new Set<string>();

  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      errors.push(`Duplicate achievement id: ${definition.id}`);
    }
    ids.add(definition.id);

    if (sortOrders.has(definition.sortOrder)) {
      errors.push(`Duplicate achievement sort order: ${definition.sortOrder}`);
    }
    sortOrders.add(definition.sortOrder);

    if (!/^achievement\.[a-z0-9.-]+$/u.test(definition.id)) {
      errors.push(`Invalid achievement id: ${definition.id}`);
    }

    if (definition.hidden && definition.lockedDescription !== HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION) {
      errors.push(`Hidden achievement leaks locked description: ${definition.id}`);
    }

    if (definition.status === "enabled" && definition.trigger.type === "future") {
      errors.push(`Enabled achievement references an unshipped trigger: ${definition.id}`);
    }

    if (definition.cosmeticTitleGrantId) {
      if (!/^cosmetic-title\.[a-z0-9.-]+$/u.test(definition.cosmeticTitleGrantId)) {
        errors.push(`Invalid cosmetic title grant id: ${definition.cosmeticTitleGrantId}`);
      }
      if (titleGrantIds.has(definition.cosmeticTitleGrantId)) {
        errors.push(`Duplicate cosmetic title grant id: ${definition.cosmeticTitleGrantId}`);
      }
      titleGrantIds.add(definition.cosmeticTitleGrantId);
    }
  }

  const ordered = [...definitions].sort((left, right) => left.sortOrder - right.sortOrder);
  definitions.forEach((definition, index) => {
    if (definition.id !== ordered[index]?.id) {
      errors.push("Achievement definitions must be sorted by sortOrder.");
    }
  });

  return errors;
}

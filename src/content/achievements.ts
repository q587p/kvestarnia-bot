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
  "character.created",
  "level.reached",
  "combat.finished",
  "problem.quest.completed",
  "item.received",
  "equipment.item_equipped",
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
    raceId?: string;
    classId?: string;
    itemId?: string;
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
    id: "achievement.race.human-ish",
    category: "onboarding",
    title: "Анкета витримала людисько",
    description: "стати людиськом і довести, що практичність теж може бути підозрілою.",
    hidden: false,
    lockedDescription: "створити або згадати пригодника-людисько.",
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
    lockedDescription: "створити або згадати пригодника-гнома.",
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
    lockedDescription: "створити або згадати пригодника-ельфа.",
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
    lockedDescription: "створити або згадати пригодника-бісин.",
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
    lockedDescription: "створити або згадати пригодника-дрантогора.",
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
    lockedDescription: "створити або згадати пригодника-домовика.",
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
    lockedDescription: "створити або згадати пригодницю-сухопутну русалку.",
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
    lockedDescription: "створити або згадати пригодника-орка-інтелігента.",
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
    lockedDescription: "створити або згадати пригодника-мольфарську душу.",
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
    lockedDescription: "створити або згадати пригодника-воїна.",
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
    lockedDescription: "створити або згадати пригодника-мага.",
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
    lockedDescription: "створити або згадати пригодника-барда.",
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
    lockedDescription: "створити або згадати пригодника-злодія.",
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
    lockedDescription: "створити або згадати пригодника-жерця.",
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
    lockedDescription: "створити або згадати пригодника-вареник-манта.",
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
    lockedDescription: "створити або згадати пригодника-бюрокроманта.",
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
    lockedDescription: "створити або згадати пригодника-єгеря.",
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
    lockedDescription: "створити або згадати пригодника-козака-характерника.",
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
    id: "achievement.level.10",
    category: "level",
    title: "Десять рівнів і жодної підозри",
    description: "досягти 10 рівня так, ніби Корчмар не веде окрему теку.",
    hidden: false,
    lockedDescription: "досягти 10 рівня.",
    sortOrder: 35,
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
    id: "achievement.level.23",
    category: "level",
    title: "Двадцять три причини не питати",
    description: "досягти 23 рівня й дати літописцю новий привід нервово рахувати.",
    hidden: false,
    lockedDescription: "досягти 23 рівня.",
    sortOrder: 39,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 23 },
    progressTarget: 23,
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
    trigger: { type: "combat.finished", outcome: "won", threshold: 1 },
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
    id: "achievement.bard.performance",
    category: "weird",
    title: "Куплет бачив свідків",
    description: "дати виступ, після якого Шинок ще довго перевіряє акустику.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 910,
    status: "disabled",
    trigger: { type: "future" },
    cosmeticTitleGrantId: "cosmetic-title.bard-witness"
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
